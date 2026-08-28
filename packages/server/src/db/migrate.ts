import type { Sql } from 'postgres';
import postgres from 'postgres';
import { loadEnv } from '../env.js';
import { migrationsDir, readMigrations } from './migrations.js';

const APPLIED_TABLE = '__migrations';

/**
 * 把尚未执行的迁移灌进当前连接所指的 schema，并记录已执行的文件名。
 * 幂等：重复执行不会重放已应用的迁移。
 */
export interface ApplyMigrationsOptions {
  /**
   * 只跑到这个迁移为止（含）。
   *
   * 生产与测试都不传，跑全部。留这个口子是为了让迁移本身可测：先跑到上一版、
   * 灌一批旧形状的数据、再跑目标迁移，才测得到「存量数据被正确搬运」——
   * 而测试库总是从空 schema 一次跑完，那些自校验永远是 0 行对 0 行。
   */
  upTo?: string;
}

export async function applyMigrations(
  sql: Sql,
  dir = migrationsDir(),
  options: ApplyMigrationsOptions = {},
): Promise<string[]> {
  await sql.unsafe(
    `create table if not exists "${APPLIED_TABLE}" (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const already = new Set(
    (await sql.unsafe(`select name from "${APPLIED_TABLE}"`)).map((r) => r['name'] as string),
  );

  const applied: string[] = [];
  for (const migration of await readMigrations(dir)) {
    if (already.has(migration.name)) continue;
    if (options.upTo && migration.name > options.upTo) break;
    await sql.begin(async (tx) => {
      for (const statement of migration.statements) {
        await tx.unsafe(statement);
      }
      await tx.unsafe(`insert into "${APPLIED_TABLE}" (name) values ($1)`, [migration.name]);
    });
    applied.push(migration.name);
  }
  return applied;
}

async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const applied = await applyMigrations(sql);
    console.log(applied.length ? `已执行迁移：\n  ${applied.join('\n  ')}` : '没有待执行的迁移');
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
