import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import type { Db } from './db/client.js';
import { IMAGE_MAX_BYTES } from '@link-profile/shared';
import { uploadsDir, UPLOADS_URL_PREFIX } from './media/storage.js';
import { createGeoLookup, type GeoLookup } from './tracking/geo.js';
import { authPlugin } from './auth/plugin.js';
import { adminAppRoutes } from './routes/admin-app.js';
import { adminRoutes } from './routes/admins.js';
import { analyticsRoutes } from './routes/analytics.js';
import { authRoutes } from './routes/auth.js';
import { bulkUserRoutes } from './routes/bulk-users.js';
import { healthRoutes } from './routes/health.js';
import { mediaRoutes } from './routes/media.js';
import { ogImageRoutes } from './routes/og-image.js';
import { profileContentRoutes } from './routes/profile-content.js';
import { profileRoutes } from './routes/profile.js';
import { settingsRoutes } from './routes/settings.js';
import { trackRoutes } from './routes/track.js';
import { userRoutes } from './routes/users.js';

export interface AppDeps {
  db: Db;
  sql: Sql;
  /** 地域解析。测试注入一个假的，生产用 GeoLite2 离线库。 */
  geo?: GeoLookup;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    sql: Sql;
    geo: GeoLookup;
  }
}

/**
 * 组装应用但不监听端口。测试经 `app.inject()` 走这里，
 * 完整穿过插件、hook、鉴权与序列化 —— 这是规格里的主接缝。
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    /**
     * 反向代理的源地址，逗号分隔的 IP / CIDR。不配则一律不信任 X-Forwarded-*。
     *
     * 值依部署环境而定，写死任何一个都会错：应用在容器里，看到的源地址是 Docker
     * 网桥网关（Linux 上通常 172.17.0.1，Docker Desktop 上是 192.168.65.1），
     * 既不是 loopback，也未必落在 172.16.0.0/12 里。实测 `loopback` 与 hop-count
     * 写法都不生效，只有显式写出实际网关才行。查法与验收命令见 docs/deployment.md。
     */
    trustProxy: process.env.TRUST_PROXY || false,
  });

  app.decorate('db', deps.db);
  app.decorate('sql', deps.sql);
  app.decorate('geo', deps.geo ?? createGeoLookup());

  await app.register(multipart, {
    // 图片上限最宽松，视频的 10 MB 由 shared 里的规则单独卡，好给出说明原因的错误。
    limits: { fileSize: IMAGE_MAX_BYTES, files: 2 },
  });

  // 用户上传的媒体。系统路径带 `_` 前缀，见 ADR-0003。
  await app.register(staticPlugin, {
    root: uploadsDir(),
    prefix: `${UPLOADS_URL_PREFIX}/`,
    decorateReply: false,
    // 文件名带随机 id，内容不会原地变，可以长缓存
    maxAge: '365d',
    immutable: true,
  });

  await app.register(authPlugin);

  // 所有系统路径带 `_` 前缀，根命名空间让给 short_name。见 ADR-0003。
  await app.register(healthRoutes, { prefix: '/_api' });
  await app.register(authRoutes, { prefix: '/_api' });
  await app.register(adminRoutes, { prefix: '/_api' });
  await app.register(bulkUserRoutes, { prefix: '/_api' });
  await app.register(userRoutes, { prefix: '/_api' });
  await app.register(profileContentRoutes, { prefix: '/_api' });
  await app.register(mediaRoutes, { prefix: '/_api' });
  await app.register(trackRoutes, { prefix: '/_api' });
  await app.register(settingsRoutes, { prefix: '/_api' });
  await app.register(analyticsRoutes, { prefix: '/_api' });
  await app.register(ogImageRoutes, { prefix: '/_static' });
  await app.register(adminAppRoutes);

  // 个人页占据根路径，必须最后注册。
  await app.register(profileRoutes);

  return app;
}
