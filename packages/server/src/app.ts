import Fastify, { type FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import type { Db } from './db/client.js';
import { authPlugin } from './auth/plugin.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { profileRoutes } from './routes/profile.js';

export interface AppDeps {
  db: Db;
  sql: Sql;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    sql: Sql;
  }
}

/**
 * 组装应用但不监听端口。测试经 `app.inject()` 走这里，
 * 完整穿过插件、hook、鉴权与序列化 —— 这是规格里的主接缝。
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
  });

  app.decorate('db', deps.db);
  app.decorate('sql', deps.sql);

  await app.register(authPlugin);

  // 所有系统路径带 `_` 前缀，根命名空间让给 short_name。见 ADR-0003。
  await app.register(healthRoutes, { prefix: '/_api' });
  await app.register(authRoutes, { prefix: '/_api' });

  // 个人页占据根路径，必须最后注册。
  await app.register(profileRoutes);

  return app;
}
