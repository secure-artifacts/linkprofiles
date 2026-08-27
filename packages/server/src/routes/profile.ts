import type { FastifyInstance } from 'fastify';
import { findProfileByShortName } from '../profiles/repository.js';
import { renderNotFoundDocument, renderProfileDocument } from '../render/document.js';

/**
 * 个人页占据根命名空间 `域名/{short_name}`。系统路径一律带 `_` 前缀，
 * 因此这里遇到下划线开头的路径直接 404，不去查库。见 ADR-0003。
 */
export async function profileRoutes(app: FastifyInstance) {
  app.get<{ Params: { shortName: string } }>('/:shortName', async (req, reply) => {
    const { shortName } = req.params;

    if (shortName.startsWith('_')) {
      return reply.code(404).type('text/html; charset=utf-8').send(renderNotFoundDocument());
    }

    const profile = await findProfileByShortName(app.db, shortName);
    if (!profile) {
      return reply.code(404).type('text/html; charset=utf-8').send(renderNotFoundDocument());
    }

    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .send(renderProfileDocument({ profile: profile.view }));
  });
}
