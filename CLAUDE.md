# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo (no git remote). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/`。改任何一块之前先读 `CONTEXT.md` 的术语表，输出里用它定义的词，不要漂到「_避免使用_」列出的同义词。See `docs/agents/domain.md`.

术语禁令：全仓库（代码、注释、文档、commit）不得出现「短链接」，本项目不提供 URL 压缩服务。

## 常用命令

Node 22+、pnpm 11（`packageManager` 钉在 pnpm@11.15.0，走 corepack）。

```bash
pnpm install
pnpm dev          # 只起 server（tsx watch），公开页 + /_admin 都由它提供
pnpm build        # 四个包依次构建
pnpm typecheck    # 四个包 tsc --noEmit
pnpm test         # vitest run，需要一个真实 Postgres
pnpm format       # prettier，仓库唯一的格式门禁（无 eslint）
pnpm db:generate  # 改了 shared/src/schema 后生成迁移 SQL 到 drizzle/
pnpm db:migrate   # 手动灌迁移；server 启动时也会自动跑一遍
```

后台单独热更：`pnpm --filter @link-profile/admin dev`（vite 5173，`/_api` 代理到 `localhost:3000`）。只改后台时用它，改 SSR 或接口仍要看 `pnpm dev`。

### 跑测试

测试真连 Postgres，不 mock ORM。先起测试库：

```bash
docker compose -f docker-compose.test.yml up -d   # 55432，tmpfs，不持久化
TEST_DATABASE_URL=postgres://linkprofile:linkprofile@localhost:55432/link_profile_test pnpm test
```

单文件 / 单用例：

```bash
pnpm vitest run packages/server/test/analytics.test.ts
pnpm vitest run packages/server/test/analytics.test.ts -t '来源排行'
```

每个测试文件在库里开一个随机 schema、灌全部迁移、跑完 drop（`packages/server/test/helpers/context.ts`），所以文件之间可并行，也不需要在用例里清理数据。测试通过 `app.inject()` 走完整 Fastify 管线，这是规格验收的主接缝——新增接口的测试写在这一层，别绕过去直接调 service。

### 本地开发的三个坑

代码里没有 dotenv，`.env` 不会被自动加载。`pnpm dev` / `pnpm db:migrate` 前要自己 `set -a; . ./.env; set +a`。

`pnpm dev` 的 cwd 是 `packages/server`，而 `FONT_DIR`、`UPLOADS_DIR`、`MIGRATIONS_DIR` 的默认值是相对仓库根写的。不覆盖的话：根脚本 `db:migrate` 报「迁移目录不存在」，字体路由第一次被请求时进程直接 ENOENT 退出。本地开发补三个绝对路径：

```bash
MIGRATIONS_DIR="$PWD/drizzle" pnpm db:migrate
FONT_DIR="$PWD/packages/server/assets/fonts" UPLOADS_DIR="$PWD/uploads" pnpm dev
```

`packages/profile-ui/src/generated/` 里 `css.ts` / `icons.ts` 是提交进仓库的产物，`profile.css` / `themes.css` 不是。改了 `themes.ts`、`styles.css` 或图标清单后必须重跑生成，否则 SSR 与后台预览会各拿一份旧样式：

```bash
pnpm --filter @link-profile/profile-ui build     # = build:icons + build:css + tsc
```

## 架构

pnpm workspace 四个包，依赖是单向的：`shared` ← `profile-ui` ← `server` / `admin`。

- **`shared`** —— drizzle schema（`src/schema/`，一张表一个文件）与纯函数：联系方式校验、社媒地址拼装、埋点归一化、分析聚合。它是唯一没有 IO 的包，业务规则优先往这里放，server 与 admin 共用同一份判断。
- **`profile-ui`** —— 公开页的 React 组件、十五套主题令牌与生成的 CSS。server 用它 SSR，admin 用它在 iframe 里渲染实时预览。**它必须能在没有浏览器 API 的环境下渲染**。
- **`server`** —— Fastify。既是 API，也是公开页的渲染器，还负责把 `admin` 的构建产物当静态站点挂出去。
- **`admin`** —— React 19 + React Router + Tailwind + Radix，构建成静态资源交给 server。

### 路由命名空间

根路径整个让给 `short_name`（`域名/{short_name}` 就是用户的个人页），所以全部系统路径带 `_` 前缀：`/_api`、`/_admin`、`/_static`（字体、OG 图与用户上传的媒体都挂在它下面）。`app.ts` 里 `profileRoutes` **必须最后注册**，它是兜底。见 ADR-0003。

对外的联系方式更新 API 挂在 `/_api/v1`（每个个人页一把 API Key），与后台自用的 `/_api` 分开，改动前看 `docs/external-contact-api.md`。

### 公开页渲染

`render/document.tsx` 用 `renderToStaticMarkup` 而不是 `renderToString`——公开页零 hydration，不发 React 运行时，交互靠 `render/client-script.ts` 里的一小段原生脚本。要加交互先想清楚能不能用它做，别引入客户端框架。关键 CSS 内联进 `<head>`，来源是 `profile-ui` 生成的 CSS 模块。见 ADR-0004。

### 数据库

schema 定义在 `shared/src/schema/`，迁移 SQL 产物在**仓库根的 `drizzle/`**（不在 server 包里）——它同时被 server 启动流程、测试底座和 Docker 镜像消费。改 schema 的流程是：改 `shared/src/schema/*.ts` → `pnpm db:generate` → 检查生成的 SQL → 提交两者。手写迁移只在生成器表达不了时才做，且要配一个 `packages/server/test/migration-*.test.ts` 验证数据搬迁。

账号（登录主体）与个人页（对外资产）是两张表，一个账号可以有多个个人页；四个标识字段（账号 / 用户名称 / short_name / 显示名）互不兼任，读 `CONTEXT.md` 后再动。见 ADR-0008。

删除是唯一不可逆的操作：short_name 进墓碑表永不再分配、媒体从磁盘删除，只给管理员。改地址与改账号都只留变更流水，旧值会被释放。

### 埋点与分析

点击不做去重（ADR-0006），线索是点击的子集，由条目上的 `is_lead` 决定。分析分三层：无筛选总览 → 账号汇总 → 单个个人页，上层指标必须等于下层之和，加新指标时先确认这个恒等式还成立。见 ADR-0015。超过六个月的明细由 `analytics/schedule.ts` 聚合进日汇总后删除。

## 前端 UI 选型（覆盖全局默认）

`packages/admin` 不用 Ant Design——全局 `~/.claude/CLAUDE.md` 的「前端 UI 默认 Ant Design」规则在本项目不适用于后台。后台用 Tailwind CSS + Radix UI 无样式原语，组件封装在 `packages/admin/src/ui/`，直接复用，不要重新引入 antd 或另起一套组件库。理由与取舍见 `docs/adr/0007-后台放弃-antd-改用-tailwind-与无样式组件.md`。

`packages/profile-ui`（公开页）继续按 ADR-0002 使用 tailwind，两个包的 tailwind 配置各自独立、不得互相渗透。
