# 02：个人页最小可访问

**构建内容：** 访客拿到一个 `域名/{short_name}` 地址就能看到这个人的页面：显示名、简介、头像位都在。地址写错则得到明确的 404，而不是空白或报错页。

**阻塞项：** 01 工程骨架与测试底座

**状态：** ready-for-human

- [x] 访问已存在用户的 short_name，返回服务端直出的完整 HTML，显示名与简介正确渲染
- [x] 页面不做 hydration：响应中不包含 React runtime，客户端脚本仅为埋点预留的一小段
- [x] 访问不存在的 short_name 返回 404
- [x] short_name 大小写不敏感：不同大小写指向同一个页面
- [x] 以 Classic 布局与 Dawn 主题渲染，缺少头像素材时以主题渐变填充该区域
- [x] 关键 CSS 内联进文档头，头像位标记为高优先级加载

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。

## Comments

**实现记录（2026-08-27）**

- 直出走 `renderToStaticMarkup` 而非 `renderToString`：后者会带上 hydration 标记。公开页零 hydration，响应里没有任何 `<script src>`，测试直接断言这一点。
- 关键 CSS：`profile-ui/src/styles.css` 经 tailwind 4 编译（ADR-0002 的破例范围以包为界），产物由 `scripts/build-css.mjs` 固化成 `src/generated/css.ts` 提交进仓库。这样 server（tsup 打成单文件，运行时没有可靠的包目录可读）与 admin 的 iframe 预览都能当普通模块 import 同一份样式，无需构建。改了 styles.css 要重跑 `pnpm --filter @link-profile/profile-ui build:css`。当前 10.5 KB，gzip 3.2 KB。
- 字体按设计稿用 Bricolage Grotesque，但以 `media="print"` + `onload` 异步加载并留 noscript 兜底，不阻塞首屏。
- short_name 入库前已强制小写，所以大小写不敏感只需查询前压一次，索引照常命中，不需要 SQL 里 lower()。
- 下划线开头的路径不查库直接 404，系统路径不会被个人页路由劫持（ADR-0003）。
- 缺素材时 `.av-empty` 用当前主题的渐变填充，形状与占比仍由布局决定，不回落到其他布局。
- 已在 375px 视口人工核对 Classic + Dawn 的渲染结果，与设计稿一致。
