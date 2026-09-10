# syntax=docker/dockerfile:1
#
# 产物仓库的镜像。由 `pnpm deployToGitlab` 从 deploy/templates/Dockerfile 复制而来，
# 每次部署都会被覆盖 —— 要改请改源仓库里的模板。
#
# 与源仓库那份的区别：这里不编译，dist 与 public 已经打好放在旁边，第一段只装依赖。

# ---------- 依赖 ----------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /app

# 只拷清单，装依赖这一层才能被缓存住
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/

# pnpm-workspace.yaml 里的 allowBuilds 决定 argon2 与 sharp 能不能编译出二进制。
# 少了它安装照样成功，但第一次有人登录时才崩。
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# pnpm 的 node_modules 是软链布局，软链里的相对路径按它原本的深度算，
# 直接 COPY 到别的深度会整片断链。deploy 把生产依赖展平成一份独立目录。
RUN pnpm --filter @link-profile/server deploy --prod --legacy /deploy

# ---------- 运行 ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /deploy/node_modules ./node_modules
COPY dist ./dist
COPY fonts ./fonts
COPY public ./public
COPY drizzle ./drizzle
COPY deploy-manifest.json ./

# 迁移 SQL 与后台静态资源的位置
ENV MIGRATIONS_DIR=/app/drizzle
ENV ADMIN_DIST=/app/public/_admin
ENV UPLOADS_DIR=/app/uploads
ENV FONT_DIR=/app/fonts

# 空卷首次挂载会继承镜像里该路径的属主，不预先 chown 则 node 用户写不进去
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# 只监听 HTTP，TLS 与反向代理交由运维
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
