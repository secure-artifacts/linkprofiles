# 公开页破例使用 tailwind，后台仍严格用 Ant Design

全局约定是「前端 UI 默认 Ant Design，禁止自造 CSS / tailwind」。但公开页是面向社媒流量的 C 端落地页，需要渐变背景、自定义按钮形状与描边、多种布局与主题的自由排版，而 Ant Design 是后台组件库，做不出这类视觉。因此**仅公开页渲染层**破例使用 tailwind，后台管理界面继续严格使用 Ant Design。

## Consequences

- 破例范围以包为界：`packages/profile-ui`（公开页组件，见 ADR-0004）内用 tailwind，`packages/admin` 内一律 antd，不得互相渗透。tailwind 配置只存在于 `packages/profile-ui`。
- 两套 CSS reset（tailwind preflight 与 antd 自带）必须靠 iframe 隔离，见 ADR-0004。
- 本项目用 antd 6.x，而 antd 6 已放弃 Less 作为一等主题方案，因此后台不使用工作区其他项目惯用的 less，改用 design token 与 CSS 变量。
