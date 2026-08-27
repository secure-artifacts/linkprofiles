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
}

export function createDb({ url, searchPath, max = 10 }: CreateDbOptions) {
  const client = postgres(url, {
    max,
    ...(searchPath ? { connection: { search_path: searchPath } } : {}),
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client };
}
