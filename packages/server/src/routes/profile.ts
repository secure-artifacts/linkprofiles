import type { FastifyInstance } from 'fastify';
import { sanitizeSource } from '@link-profile/shared';
import { findProfileByShortName } from '../profiles/repository.js';
import { readSettings } from '../settings/repository.js';
import { renderNotFoundDocument, renderProfileDocument } from '../render/document.js';
import { publicOrigin } from '../render/origin.js';
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

      // 脏值在门口就丢掉，不进数据库也不进透传出去的地址
      const source = sanitizeSource(req.query.src);
      const { sourcePassthroughDefault } = await readSettings(app.db);

      const profile = await findProfileByShortName(app.db, shortName, {
        source,
        passthroughDefault: sourcePassthroughDefault,
      });
      if (!profile) {
        return reply.code(404).type('text/html; charset=utf-8').send(renderNotFoundDocument());
      }

      // 社媒 og 爬虫必然抓取且永不点击，算进去会让点击率的分母虚高。
      // 识别为爬虫就直接不写记录，页面与 og 标签照常返回。
      if (!isCrawler(req)) {
        await recordPageView(app, profile.id, req, source);
      }

      // 预览图取头像或头图；缺失时回落到与主题一致的占位图，
      // 转发出去仍然是一张成型的卡片而不是一行光秃秃的地址。
      const origin = publicOrigin(req);
      const preview =
        profile.view.video?.poster ??
        profile.view.avatar?.src ??
        `/_static/og/${profile.view.theme}.png`;

      return reply
        .code(200)
        .type('text/html; charset=utf-8')
        .send(
          renderProfileDocument({
            profile: profile.view,
            canonicalUrl: `${origin}/${profile.shortName}`,
            previewImageUrl: preview.startsWith('http') ? preview : `${origin}${preview}`,
          }),
        );
    },
  );
}
