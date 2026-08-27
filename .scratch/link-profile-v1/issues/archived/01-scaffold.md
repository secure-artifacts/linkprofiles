# 01：工程骨架与测试底座

**构建内容：** 把仓库从零变成一个能跑、能测、能部署的空壳。跑一条命令即可拉起应用与数据库，访问健康检查得到正常响应；跑测试命令能看到第一个经 HTTP 接缝的测试通过，并且它真的连上了数据库而非被 mock 掉。

**阻塞项：** 无（可立即开始）

**状态：** ready-for-human

- [x] pnpm workspace 立起四个包：shared、profile-ui、server、admin，依赖方向单一且无循环
- [x] docker-compose 一条命令拉起应用与 PostgreSQL；应用只监听 HTTP，不涉及 TLS
- [x] drizzle 迁移工具链可用：能生成迁移、能执行迁移、能回到干净状态
- [x] 测试底座就位：经 Fastify 进程内注入发请求，每个测试文件使用独立 schema，跑完自动 drop
- [x] 存在一个健康检查接口，其测试经 HTTP 接缝通过，并断言数据库连接可用
- [x] typecheck 与格式化命令可用且通过

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。

## Comments

**实现记录（2026-08-27）**

- 四个包：`shared`（drizzle schema + 共享类型/纯函数）、`profile-ui`、`server`、`admin`。shared 与 profile-ui 以 TypeScript 源码导出，不单独构建；server 用 tsup 打包时内联它们，admin 由 vite 直接解析。依赖方向单一，无循环。
- 迁移 SQL 放仓库根 `drizzle/`：schema 定义归 shared，但迁移是部署产物，由 server 执行、由测试底座灌进临时 schema。`MIGRATIONS_DIR` 可覆盖位置。
- drizzle-kit 会把类型与外键目标硬编码成 `"public"."role"`，迁移就只能落在 public 上。`readMigrations` 统一去掉这个限定，落点交给连接的 search_path 决定——生产的 search_path 就是 public，行为不变，测试才能一文件一 schema。生产与测试共用同一份 SQL，不分叉。
- 测试底座 `packages/server/test/helpers/context.ts`：建 schema → 灌迁移 → 把连接钉上去 → 建 app → 跑完 drop schema cascade。经 `app.inject()` 发请求，不开端口不走网络。

**未能验证的部分：** 开发机没有安装 docker，`docker-compose.yml` / `docker-compose.test.yml` / `Dockerfile` 已按验收标准写出但**没有实际执行过**。测试改用本机 PostgreSQL 18，经 `TEST_DATABASE_URL` 指向；每文件独立 schema 的机制与 compose 里的测试库完全一致，换库不需要改代码。首次在有 docker 的机器上需要复核这三个文件。
