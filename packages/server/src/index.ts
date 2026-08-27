import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { applyMigrations } from './db/migrate.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const { db, client } = createDb({ url: env.DATABASE_URL });

await applyMigrations(client);

const app = await buildApp({ db, sql: client });

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
