# syntax=docker/dockerfile:1

# ---------- 构建 ----------
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/profile-ui/package.json packages/profile-ui/
COPY packages/server/package.json packages/server/
COPY packages/admin/package.json packages/admin/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @link-profile/server build \
 && pnpm --filter @link-profile/admin build

# pnpm 的 node_modules 是软链布局，软链里的相对路径按它原本的深度算，
# 直接 COPY 到别的深度会整片断链。deploy 把生产依赖展平成一份独立目录。
RUN pnpm --filter @link-profile/server deploy --prod --legacy /deploy

# ---------- 运行 ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/packages/admin/dist ./public/_admin
COPY --from=build /app/drizzle ./drizzle

# 迁移 SQL 与后台静态资源的位置
ENV MIGRATIONS_DIR=/app/drizzle
ENV ADMIN_DIST=/app/public/_admin
ENV UPLOADS_DIR=/app/uploads

# 空卷首次挂载会继承镜像里该路径的属主，不预先 chown 则 node 用户写不进去
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# 只监听 HTTP，TLS 与反向代理交由运维
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
