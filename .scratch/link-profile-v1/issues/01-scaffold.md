# 01：工程骨架与测试底座

**构建内容：** 把仓库从零变成一个能跑、能测、能部署的空壳。跑一条命令即可拉起应用与数据库，访问健康检查得到正常响应；跑测试命令能看到第一个经 HTTP 接缝的测试通过，并且它真的连上了数据库而非被 mock 掉。

**阻塞项：** 无（可立即开始）

**状态：** ready-for-agent

- [ ] pnpm workspace 立起四个包：shared、profile-ui、server、admin，依赖方向单一且无循环
- [ ] docker-compose 一条命令拉起应用与 PostgreSQL；应用只监听 HTTP，不涉及 TLS
- [ ] drizzle 迁移工具链可用：能生成迁移、能执行迁移、能回到干净状态
- [ ] 测试底座就位：经 Fastify 进程内注入发请求，每个测试文件使用独立 schema，跑完自动 drop
- [ ] 存在一个健康检查接口，其测试经 HTTP 接缝通过，并断言数据库连接可用
- [ ] typecheck 与格式化命令可用且通过

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。
