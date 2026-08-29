# Link Profile

开源、自托管的个人链接聚合与联系转化分析系统。用一个公开页面承载 WhatsApp、Messenger、Instagram、短信、电话和自定义链接，并统计哪些来源真正带来了联系点击。

当前开源版本：**v1.0.0** · 许可证：**AGPL-3.0-only**

本项目专注于个人页聚合与转化分析，不提供 URL 压缩服务。

## 主要功能

- 四种页面布局、十五套主题、自托管字体和多款液态玻璃配色。
- 头像、Banner、背景图独立上传与浏览器裁切，支持头像短视频。
- WhatsApp、Messenger、Instagram 私信、短信、电话、Email 及常见海外平台。
- 联系方式格式验证、WhatsApp/短信预设消息和移动端 Messenger 智能唤起。
- 多账号与角色权限、多个个人页、页面复制、缩略预览和来源推广链接。
- 账号 → 个人页 → 单页的三级分析，以及来源、国家、设备、时间、联系方式交叉分析。
- 每页独立 API Key，可供 CRM 或自动化程序局部更新联系方式。
- PostgreSQL、Docker Compose、自动迁移、健康检查和本地 GeoIP 数据库支持。

## 快速部署

前置要求：Docker Engine 24+、Docker Compose v2、Git；生产环境还需要 Nginx 或其他 HTTPS 反向代理。

```bash
git clone https://github.com/secure-artifacts/linkprofiles.git
cd linkprofiles
cp .env.example .env
chmod 600 .env
# 按 .env 内注释填写数据库密码、超级管理员密码、公开域名与 TRUST_PROXY
docker compose up -d --build
docker compose ps
curl --fail-with-body http://127.0.0.1:3000/_api/health
```

预期健康响应：

```json
{"status":"ok","database":"ok"}
```

应用端口只绑定宿主机回环地址。生产环境应由反向代理提供 HTTPS，并把 `/_admin/` 与公开个人页转发到应用。完整首次部署、升级、备份与回滚说明见 [部署手册](docs/deployment.md)和[运维手册](docs/operations.md)。

国家和城市分析是可选能力：把兼容 MaxMind 格式的城市 MMDB 放进 `.env` 中 `GEOLITE2_HOST_DIR` 指定的目录。缺少数据库时应用仍能运行，但国家和城市显示为未知。

## 本地开发

需要 Node.js 22+、pnpm 11+ 和 PostgreSQL。

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

质量检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 文档

- [2026-08-30 整体更新说明](CHANGELOG.md)
- [开源版本与授权声明](OPEN_SOURCE.md)
- [第三方许可声明](THIRD_PARTY_NOTICES.md)
- [联系方式更新 API](docs/external-contact-api.md)

| 文件 | 内容 |
| --- | --- |
| [CONTEXT.md](./CONTEXT.md) | 领域术语表。所有文档与代码以此为准 |
| [docs/requirements.md](./docs/requirements.md) | 功能需求定稿 |
| [docs/adr/](./docs/adr/) | 架构决策记录 |
| [docs/design/public-page.html](./docs/design/public-page.html) | 公开页早期设计稿（现实现已演进为四种布局 × 十五套主题） |
| [docs/deployment.md](./docs/deployment.md) | 部署手册：前置条件、首次部署、升级、回滚 |
| [docs/operations.md](./docs/operations.md) | 运维手册：监控、容量、故障处理、应急流程 |
| [.scratch/link-profile-v1/](./.scratch/link-profile-v1/) | 规格与十七张实施票 |

`.scratch/` 是本仓库的 issue tracker，约定见 [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md)。

## 技术栈

pnpm workspace 四包：`shared`（drizzle schema 与纯函数）、`profile-ui`（公开页组件）、`server`（Fastify）、`admin`（React 后台）。数据库 PostgreSQL + Drizzle ORM，部署走 Docker。

## 开源许可

除另有标注的第三方内容外，本项目按 [GNU Affero General Public License v3.0 only](LICENSE) 开源，SPDX 标识为 `AGPL-3.0-only`。

允许使用、修改、分发和商业运营；如果修改后通过网络向用户提供服务，需要按 AGPL 向这些用户提供对应源代码。通俗说明及授权边界见 [OPEN_SOURCE.md](OPEN_SOURCE.md)，第三方字体与地图数据见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。许可证摘要不替代 `LICENSE` 正文。

## 状态

v1.0.0 是首个可部署的公开版本，包含个人页编辑、多账号与权限管理、联系方式更新 API、三级数据分析和 Docker 部署配置。最近一次整体更新见 [CHANGELOG.md](./CHANGELOG.md)。
