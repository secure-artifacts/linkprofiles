import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/** 迁移 SQL 目录。默认相对进程 cwd，Docker 里由 `MIGRATIONS_DIR` 指到 /app/drizzle。 */
export function migrationsDir(): string {
  return path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');
}

export interface Migration {
  name: string;
  statements: string[];
}

/**
 * drizzle-kit 把类型与外键目标硬编码成 `"public"."role"` 这样的限定名，
 * 会让迁移只能落在 public 上。去掉限定后由连接的 search_path 决定落点，
 * 测试底座才能给每个文件一个独立 schema；生产的 search_path 就是 public，
 * 行为不变。生产与测试共用同一份 SQL，不分叉。
 */
function unqualifyPublicSchema(sql: string): string {
  return sql.replaceAll('"public".', '');
}

/**
 * 按文件名顺序读出迁移，并拆成单条语句。
 * drizzle-kit 用 `--> statement-breakpoint` 分隔语句，postgres.js 的扩展协议
 * 一次只接受一条，所以必须在这里拆开。
 */
export async function readMigrations(dir = migrationsDir()): Promise<Migration[]> {
  // 目录缺失若吞成空数组，会静默跳过全部建表，直到第一条查询才炸在无关的位置。
  const entries = await readdir(dir).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      throw new Error(`迁移目录不存在：${dir}（可用 MIGRATIONS_DIR 指定）`, { cause: err });
    }
    throw err;
  });
  const files = entries.filter((f) => f.endsWith('.sql')).sort();

  return Promise.all(
    files.map(async (name) => {
      const raw = unqualifyPublicSchema(await readFile(path.join(dir, name), 'utf8'));
      const statements = raw
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { name, statements };
    }),
  );
}
