# 公开页零 hydration 直出，并与后台实时预览共享同一套组件

需求要求用户编辑资料时实时看到移动端效果。若公开页用模板引擎渲染、后台预览另用 React 实现，多种布局 × 多套主题就存在两份实现，必然漂移，预览与真实页面对不上。因此公开页改用 React 组件经 `renderToString` 由 Fastify 直出，后台预览把同一批组件挂进 iframe，用 `postMessage` 灌入未保存的草稿状态。

## Considered Options

- **预览直接 iframe 加载真实页面 URL**：同样零漂移且不必换模板引擎，但每次编辑要 debounce 重新请求，做不到真正实时，改一个字闪一下。
- **两套实现**：被排除，漂移不可接受。

## Consequences

- 引入 React 只是替换模板引擎，**公开页仍不做 hydration**：服务端输出纯 HTML，客户端只有一小段原生 JS，浏览器不下载也不解析 React runtime，移动端 LCP 不受影响。

  这段原生 JS 后来长到四件事：视频延迟播放、点击埋点、简介打字机、视频头像的静音切换。**边界没变**——禁的始终是 React hydration 与 React runtime，不是所有客户端 JS。判据是「浏览器要不要重新执行一遍组件树」，四件事都不需要：它们操作的是 SSR 已经画好的 DOM。静音按钮的两枚图标就是这么处理的——都渲染出来，显示哪一枚交给 CSS 按 `aria-pressed` 选，脚本只翻属性，不碰 innerHTML。

  代价是这段脚本里的顺序变成了一条纪律：**点击埋点必须最先注册**，它是线索统计的唯一来源；后面每件装饰性的事各自 `try` 起来，谁抛异常都不许连累已经装好的东西。`profile-page.test.ts` 里有两条测试专门守这个顺序。
- iframe 不是为了省事，而是同时解决两件事：真实的 375px 移动端视口，以及 tailwind preflight 与 Ant Design reset 的样式隔离（见 ADR-0002）。
- 公开页组件必须保持无浏览器专有依赖，才能同时跑在服务端 `renderToString` 和后台预览两处。
