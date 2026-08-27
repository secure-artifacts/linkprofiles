# 08：五种布局

**构建内容：** 用户可以在五种排版之间切换，为自己的素材挑一个最合适的。哪种都不会因为没传图就变成空白页。

**阻塞项：** 07 个人页内容编辑

**状态：** ready-for-human

- [x] Classic、Hero、Banner、Cutout、Shape 五种布局全部可用，后台可切换并持久化
- [x] 布局只决定头像与头图区域的形状和占比，不决定配色
- [x] 缺少头图素材时该区域以当前主题的渐变填充，**不回落到其他布局**
- [x] 五种布局在 375px 宽度下均不出现横向滚动，桌面端向上适配
- [x] 新账号默认使用 Classic
- [x] 组件位于 profile-ui 包内，供服务端直出与后台预览共用

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。

## Comments

**实现记录（2026-08-27）**

- 五种布局的组件与样式都在 `packages/profile-ui`，服务端直出与后台预览 import 的是同一份，不存在第二套实现。切换走 `PATCH /_api/users/:id/profile { layout }`，不认识的值在接口层就拒绝。
- 社媒图标在哪一层渲染因布局而异（依据设计稿）：Classic / Banner / Cutout 在头部内，Hero / Shape 在头部之下。这条差异在 `ProfilePage` 里是一张表，不是散在各布局里的 if。
- **空状态改了一处**：Cutout 缺人像时原来会画出一个带硬边框的方块，贴着右边缘看着像错位。已改成顶部收圆弧、去掉描边，读起来是一个待填的人像轮廓。Hero 与 Banner 的整块头图位同样不描边——只有 Classic / Shape 那种「一小块头像」才留那圈环。
- 人工核对：五种布局逐个在 375px 视口下截图，`document.documentElement.scrollWidth` 均为 375，无横向滚动；缺素材时都保持各自的形状与占比，没有一种回落成别的布局。
