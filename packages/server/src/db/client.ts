import * as schema from '@link-profile/shared/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Db = ReturnType<typeof createDb>['db'];

export interface CreateDbOptions {
  url: string;
  /**
   * 把连接钉在指定 schema 上。测试用它给每个测试文件一个独立 schema，
   * 生产留空即走默认的 `public`。
   */
  searchPath?: string;
  max?: number;
  /** 测试里用来吞掉 truncate / drop cascade 之类的 NOTICE。 */
  onnotice?: (notice: unknown) => void;
}

export function createDb({ url, searchPath, max = 10, onnotice }: CreateDbOptions) {
  const client = postgres(url, {
    max,
    ...(onnotice ? { onnotice } : {}),
    ...(searchPath ? { connection: { search_path: searchPath } } : {}),
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client };
}
