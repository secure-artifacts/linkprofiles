# 后台放弃 Ant Design，改用 Tailwind + 无样式组件原语

ADR-0002 把后台钉死在 Ant Design 上，理由是「全局默认」而非「Ant Design 适合这个产品」。实际用起来暴露了代价：全是默认样式堆出来的界面，操作按钮不分主次、批量创建失败结果是一堆红字堆叠、数据分析图表是手搓 div（且已确认在数据稀疏时会渲染成无意义色块，见 22 号票）、编辑器毫无视觉层次——antd 给的是「组件齐全」，不是「站在使用者角度的便利性与美观」。这条约束不再成立，本 ADR 推翻 ADR-0002 中「admin 内一律 antd」这一条款（该 ADR 其余部分——公开页用 tailwind、破例范围以包为界——不受影响，继续有效）。

用 Open Design MCP 先出了一版高保真视觉稿定方向（技术工具型：冷灰绿中性色打底，苔绿点缀当前状态与主操作，4/8px 间距节奏，6px 控件圆角/10px 面板圆角，1px 边框为主、低阴影只用于浮层），确认方向后再选的技术栈。

## Considered Options

- **继续 antd，深度定制主题**：antd 的 token 定制能改配色，但改不动信息密度与交互细节（比如批量创建结果的逐行状态展示、图表这类根本不是 antd 组件能覆盖的东西）。放弃。
- **换一套开箱即用的组件库（Mantine/Chakra）**：组件更「现成」，但引入自己的一套 CSS 引擎，后台就有了第三套样式体系（tailwind 归 profile-ui，antd 归 admin，再加一个），与 ADR-0002「破例范围以包为界」的隔离精神冲突更大。放弃。
- **Tailwind + 无样式组件原语（选定）**：admin 本来就该有自己的一套 tailwind 配置，和 profile-ui 一样包级隔离、互不渗透；交互行为（键盘导航、无障碍属性、弹层定位）交给 Radix UI 这类无样式原语兜底，视觉完全自己掌控，正好承接 Open Design 出的稿子。

## Consequences

- `packages/admin` 新增 tailwind 配置（`@tailwindcss/vite`），只存在于本包，不向 `packages/profile-ui` 渗透，延续 ADR-0002 的隔离原则。
- 依赖变化：移除 `antd`、`dayjs`；新增 `tailwindcss`、`@tailwindcss/vite`、一组 `@radix-ui/react-*`（dialog/select/switch/checkbox/slider/tooltip）、`lucide-react`（图标）、`recharts`（数据分析真图表）。
- `packages/admin/src/ui/` 是本包自己的组件原语集合（Button/Input/Dialog/Select/Switch/Checkbox/Slider/Tag/Tooltip/Alert/Spinner/Segmented/useToast/useConfirm），API 形状照抄 antd 对应组件的调用习惯（如 `useConfirm()` 对应 `Modal.confirm`），迁移时业务逻辑不用重写，只换 UI 层。
- `packages/admin` 与 `packages/profile-ui` 各自的 tailwind 实例仍然靠 iframe 隔离（后台实时预览用的那台手机），不因为 admin 也用了 tailwind 就能合并成一份，两边的 token 体系不同，见 ADR-0004。
- 全局 `~/.claude/CLAUDE.md` 的「前端 UI 默认 Ant Design」规则本身留了「项目 CLAUDE.md 另有约定」的口子，这次在 `link-profile/CLAUDE.md` 里正式用这个口子，不改用户的全局个人配置。
