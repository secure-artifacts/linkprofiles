# link-profile

个人链接聚合页。社媒平台的简介栏只允许放一条链接，导致本应流向 WhatsApp、Messenger 的线索流失。本项目提供一个可自定义的公开页面，把多个渠道收拢到一条链接背后，并统计哪些渠道真正带来了线索。

**本项目不是短链服务**，不提供长 URL 压缩。「短链接」为全项目禁用词。

## 文档

| 文件 | 内容 |
| --- | --- |
| [CONTEXT.md](./CONTEXT.md) | 领域术语表。所有文档与代码以此为准 |
| [docs/requirements.md](./docs/requirements.md) | 功能需求定稿 |
| [docs/adr/](./docs/adr/) | 六条架构决策记录 |
| [docs/design/public-page.html](./docs/design/public-page.html) | 公开页设计稿，五种布局 × 六套主题 |
| [.scratch/link-profile-v1/](./.scratch/link-profile-v1/) | 规格与十七张实施票 |

`.scratch/` 是本仓库的 issue tracker，约定见 [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md)。

## 技术栈

pnpm workspace 四包：`shared`（drizzle schema 与纯函数）、`profile-ui`（公开页组件）、`server`（Fastify）、`admin`（React 后台）。数据库 PostgreSQL + Drizzle ORM，部署走 Docker。

## 状态

尚未开始编码。实施从 `.scratch/link-profile-v1/issues/01-scaffold.md` 起，按票内声明的阻塞关系推进。
