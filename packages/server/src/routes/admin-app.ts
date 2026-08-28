import { existsSync } from 'node:fs';
import path from 'node:path';
import staticPlugin from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * 后台 SPA 的静态资源。
 *
 * 地址是 `/_admin`，系统路径统一带 `_` 前缀（ADR-0003）。构建产物不存在时
 * 不挂载静态中间件 —— 只跑接口与公开页的开发场景不该因此启动失败，后台在
 * `vite dev` 里另开一个端口。
 */
export async function adminAppRoutes(app: FastifyInstance) {
  const root = path.resolve(process.env.ADMIN_DIST ?? 'packages/admin/dist');
  if (!existsSync(path.join(root, 'index.html'))) {
    app.log.warn({ root }, '后台构建产物不存在，/_admin 未挂载');

    // 挂一组只会解释原因的路由。这个分支最容易命中的时机是「服务恰好在
    // `pnpm build` 清空 dist 的那一刻启动」，而检查只在启动时做一次 ——
    // 什么都不挂的话，后台此后会一直静默 404，看上去像路由配错了。
    const explain = (_req: unknown, reply: FastifyReply) =>
      reply.code(503).send({
        error: 'admin_not_built',
        message: `后台构建产物不存在：${root}。先跑 pnpm --filter @link-profile/admin build，再重启服务。`,
      });
    app.get('/_admin', explain);
    app.get('/_admin/*', explain);
    return;
  }

  // 回退处理器必须限定在 `/_admin` 前缀的封装作用域里，否则它会变成全站的
  // notFoundHandler，把公开页的 404（墓碑地址、不存在的 short_name）也吃掉。
  await app.register(
    async (scope) => {
      await scope.register(staticPlugin, {
        root,
        prefix: '/',
        // 上传目录那个 static 实例用的是 decorateReply: false，
        // 所以 sendFile 由这里来装，SPA 回退要用到它。
        decorateReply: true,
      });

      // SPA 的前端路由：/_admin/users 这类深链在磁盘上没有对应文件，
      // 直接访问或刷新时要回 index.html 才进得到前端路由。
      // preview.html 是第二个真实入口，由上面的静态中间件直接命中。
      scope.setNotFoundHandler((req, reply) => {
        // 带扩展名的请求是找资源不是找页面。回 HTML 会让浏览器把
        // 一份 index.html 当 JS 解析，报语法错误而不是干净的 404。
        if (path.extname(req.url.split('?')[0] ?? '')) {
          return reply.code(404).send({ error: 'not_found' });
        }
        return reply.sendFile('index.html', root);
      });
    },
    { prefix: '/_admin' },
  );

  // 前缀本身不带斜杠时不落在上面的作用域里（`sendFile` 也只装在那个作用域），
  // 补一条重定向把它送进去
  app.get('/_admin', (_req, reply) => reply.redirect('/_admin/'));
}
