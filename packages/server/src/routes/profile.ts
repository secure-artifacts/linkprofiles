import type { FastifyInstance } from 'fastify';
import { findProfileByShortName } from '../profiles/repository.js';
import { renderNotFoundDocument, renderProfileDocument } from '../render/document.js';
import { recordPageView } from '../tracking/record.js';
import { isCrawler } from '../tracking/visitor.js';

/**
 * 个人页占据根命名空间 `域名/{short_name}`。系统路径一律带 `_` 前缀，
 * 因此这里遇到下划线开头的路径直接 404，不去查库。见 ADR-0003。
 */
export async function profileRoutes(app: FastifyInstance) {
  app.get<{ Params: { shortName: string }; Querystring: { src?: string } }>(
    '/:shortName',
    async (req, reply) => {
      const { shortName } = req.params;

      if (shortName.startsWith('_')) {
        return reply.code(404).type('text/html; charset=utf-8').send(renderNotFoundDocument());
      }

      const profile = await findProfileByShortName(app.db, shortName);
      if (!profile) {
        return reply.code(404).type('text/html; charset=utf-8').send(renderNotFoundDocument());
      }

      // 社媒 og 爬虫必然抓取且永不点击，算进去会让点击率的分母虚高。
      // 识别为爬虫就直接不写记录，页面与 og 标签照常返回。
      if (!isCrawler(req)) {
        await recordPageView(app, profile.id, req, req.query.src);
      }

      return reply
        .code(200)
        .type('text/html; charset=utf-8')
        .send(renderProfileDocument({ profile: profile.view }));
    },
  );
}
