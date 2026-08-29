import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const FILE_NAME = 'bricolage-grotesque-latin-wght-normal.woff2';

/** 自托管展示字体，避免公开页把访客 IP 暴露给第三方字体服务。 */
export async function fontRoutes(app: FastifyInstance) {
  const root = path.resolve(process.env.FONT_DIR ?? 'packages/server/assets/fonts');
  const font = readFile(path.join(root, FILE_NAME));

  app.get(`/fonts/${FILE_NAME}`, async (_req, reply) =>
    reply
      .type('font/woff2')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(await font),
  );
}
