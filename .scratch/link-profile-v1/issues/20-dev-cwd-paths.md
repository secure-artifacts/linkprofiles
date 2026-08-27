# 20：上传目录与后台产物路径在 dev 下解析错位

**构建内容：** `pnpm dev` 起来的服务能找到上传目录和后台构建产物，不再在启动日志里报两条「路径不存在」的警告。现在这两个路径都按进程 cwd 解析，而 dev 的 cwd 是 `packages/server/`，于是一个指向不存在的目录，另一个拼出了双层嵌套的荒唐路径。

**阻塞项：** 无（可立即开始）

**状态：** ready-for-agent

- [ ] `pnpm dev` 启动日志中不再出现 uploads 与后台产物的路径警告
- [ ] 媒体上传在 dev 下可用，文件落到仓库根的 `uploads/`
- [ ] 环境变量 `UPLOADS_DIR` 与 `ADMIN_DIST` 的覆盖能力保持不变，Docker 运行时行为不受影响
- [ ] 路径解析不依赖启动时的 cwd

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。

## Comments

**发现记录（2026-08-27 验收走查）**

- `media/storage.ts:8` 是 `path.resolve(process.env.UPLOADS_DIR ?? 'uploads')`，`routes/admin-app.ts:14` 是 `path.resolve(process.env.ADMIN_DIST ?? 'packages/admin/dist')`。两处默认值都相对 cwd。
- dev 的 cwd 是 `packages/server/`，于是解析成 `packages/server/uploads`（不存在）和 `packages/server/packages/admin/dist`（双层嵌套，永远不可能存在）。启动日志里对应两条 warn。
- Docker 里 `UPLOADS_DIR` 与 `ADMIN_DIST` 都显式配了，所以生产不受影响——**这是纯 dev 问题**，和 3b27559 修掉的 `MIGRATIONS_DIR` 是同一类：默认值相对 cwd，而 cwd 取决于谁来启动。
- 那次修 `MIGRATIONS_DIR` 走的是在 dev 脚本里显式设环境变量。这里可以照做，也可以借机把三处统一成一个不依赖 cwd 的解析方式——后者能一次性根除这类问题，但改动面比前者大。
