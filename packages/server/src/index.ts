import { buildApp } from './app.js';
import { bootstrapSuperadmin } from './auth/bootstrap.js';
import { createDb } from './db/client.js';
import { applyMigrations } from './db/migrate.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const { db, client } = createDb({ url: env.DATABASE_URL });

await applyMigrations(client);

const bootstrap = await bootstrapSuperadmin(db, {
  account: env.SUPERADMIN_ACCOUNT,
  password: env.SUPERADMIN_PASSWORD,
});

const app = await buildApp({ db, sql: client });
app.log.info({ bootstrap }, '超级管理员初始化');

// 只监听 HTTP。TLS 与反向代理交由运维，见 requirements 六。
await app.listen({ host: env.HOST, port: env.PORT });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => client.end())
      .then(() => process.exit(0));
  });
}
