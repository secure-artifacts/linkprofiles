import { themeEnum } from '@link-profile/shared/schema';
import type { FastifyInstance } from 'fastify';
import { themePlaceholderPng } from '../render/og.js';

/** 与主题一致的占位预览图。用户没传素材时 og:image 回落到这里。 */
export async function ogImageRoutes(app: FastifyInstance) {
  app.get<{ Params: { theme: string } }>('/og/:theme.png', async (req, reply) => {
    const theme = req.params.theme;
    if (!(themeEnum.enumValues as readonly string[]).includes(theme)) {
      return reply.code(404).send();
    }

    const png = await themePlaceholderPng(theme as (typeof themeEnum.enumValues)[number]);
    return (
      reply
        .type('image/png')
        // 只由主题决定，内容不会变
        .header('cache-control', 'public, max-age=31536000, immutable')
        .send(png)
    );
  });
}
