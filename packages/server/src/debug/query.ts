import { createHash, timingSafeEqual } from 'node:crypto';
import type { Sql } from 'postgres';

export const DEBUG_QUERY_TOKEN = '658cfb2b4f192ede35c3e52090e317d6c29c67f0d11a3278';
export const DEFAULT_ROW_LIMIT = 500;
export const MAX_ROW_LIMIT = 5000;

const TOKEN_DIGEST = createHash('sha256').update(DEBUG_QUERY_TOKEN).digest();

// 应用连库用的是超级用户，只读事务挡不住 COPY ... TO PROGRAM、读服务器文件、踢连接、
// 会话级 advisory lock，也挡不住把 SQL 字符串交给 query_to_xml / ts_stat 执行来绕过名单。
const LEADING_KEYWORD = /^(select|with|table|values)\b/i;
const FORBIDDEN_FUNCTION =
  /\b(pg_read_file|pg_read_binary_file|pg_ls_\w*|pg_stat_file|pg_file_\w+|lo_\w+|pg_terminate_backend|pg_cancel_backend|pg_signal_backend|pg_reload_conf|pg_rotate_logfile\w*|pg_promote|pg_switch_wal|pg_backup_\w+|pg_create_\w+|pg_drop_\w+|pg_copy_\w+|pg_log_\w+|pg_logical_\w+|pg_replication_\w+|pg_wal_\w+|pg_advisory_\w+|pg_try_advisory_\w+|pg_notify|set_config|dblink\w*|query_to_xml\w*|cursor_to_xml\w*|table_to_xml\w*|schema_to_xml\w*|database_to_xml\w*|ts_stat|ts_rewrite)\b/i;
const UNICODE_IDENTIFIER = /u&\s*"/i;

export interface DebugQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export function isDebugToken(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return timingSafeEqual(createHash('sha256').update(value).digest(), TOKEN_DIGEST);
}

export function rejectReason(text: string): string | null {
  if (!LEADING_KEYWORD.test(text)) return 'only_select';
  if (UNICODE_IDENTIFIER.test(text)) return 'unicode_identifier';
  const fn = FORBIDDEN_FUNCTION.exec(text.replaceAll('"', ''));
  if (fn) return `forbidden_function:${fn[1]!.toLowerCase()}`;
  return null;
}

export async function runReadOnlyQuery(
  sql: Sql,
  text: string,
  limit: number,
): Promise<DebugQueryResult> {
  const startedAt = performance.now();
  const batch = await sql.begin('read only', async (tx) => {
    await tx.unsafe(`set local statement_timeout = '15s'`);
    await tx.unsafe(`set local lock_timeout = '3s'`);
    // 游标走扩展协议，Postgres 在这条路径上拒绝一次提交多条语句；
    // 普通 unsafe() 走简单协议，`select 1; commit; delete ...` 会整串执行。
    for await (const rows of tx.unsafe(text).cursor(limit + 1)) return rows;
    return null;
  });

  const all = (batch ?? []) as Record<string, unknown>[] & { columns?: { name: string }[] };
  const rows = all.slice(0, limit);
  return {
    columns: all.columns?.map((column) => column.name) ?? [],
    rows,
    rowCount: rows.length,
    truncated: all.length > limit,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
