import { existsSync } from 'node:fs';
import path from 'node:path';
import staticPlugin from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * 后台 SPA 的静态资源。
 *
 * 地址是 `/_admin`，系统路径统一带 `_` 前缀（ADR-0003）。构建产物不存在时
 * 整个插件跳过 —— 只跑接口与公开页的开发场景不该因此启动失败，后台在
 * `vite dev` 里另开一个端口。
 */
export async function adminAppRoutes(app: FastifyInstance) {
  const root = path.resolve(process.env.ADMIN_DIST ?? 'packages/admin/dist');
  if (!existsSync(path.join(root, 'index.html'))) {
    app.log.warn({ root }, '后台构建产物不存在，/_admin 未挂载');
    return;
  }

  await app.register(staticPlugin, {
    root,
    prefix: '/_admin/',
    // 上传目录那个 static 实例用的是 decorateReply: false，
    // 所以 sendFile 由这里来装，SPA 回退要用到它。
    decorateReply: true,
  });

  // SPA 的前端路由：不是文件的路径一律回 index.html。
  // preview.html 是第二个真实入口，由上面的静态中间件直接命中。
  for (const url of ['/_admin', '/_admin/']) {
    app.get(url, (_req, reply) => reply.sendFile('index.html', root));
  }
}
