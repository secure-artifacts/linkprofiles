# 公开页零 hydration 直出，并与后台实时预览共享同一套组件

需求要求用户编辑资料时实时看到移动端效果。若公开页用模板引擎渲染、后台预览另用 React 实现，五种布局 × 六套主题就存在两份实现，必然漂移，预览与真实页面对不上。因此公开页改用 React 组件经 `renderToString` 由 Fastify 直出，后台预览把同一批组件挂进 iframe，用 `postMessage` 灌入未保存的草稿状态。

## Considered Options

- **预览直接 iframe 加载真实页面 URL**：同样零漂移且不必换模板引擎，但每次编辑要 debounce 重新请求，做不到真正实时，改一个字闪一下。
- **两套实现**：被排除，漂移不可接受。

## Consequences

- 引入 React 只是替换模板引擎，**公开页仍不做 hydration**：服务端输出纯 HTML，客户端只有一小段原生 JS 负责点击埋点，浏览器不下载也不解析 React runtime，移动端 LCP 不受影响。
- iframe 不是为了省事，而是同时解决两件事：真实的 375px 移动端视口，以及 tailwind preflight 与 Ant Design reset 的样式隔离（见 ADR-0002）。
- 公开页组件必须保持无浏览器专有依赖，才能同时跑在服务端 `renderToString` 和后台预览两处。
