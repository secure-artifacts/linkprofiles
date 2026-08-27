# 21：登录密码错时提示语不对

**构建内容：** 密码输错登录失败，用户看到的提示要说得通——「账号或密码不对」，不是暗示他曾经登录过又掉线的「登录已过期」。

**阻塞项：** 无（可立即开始）

**状态：** ready-for-agent

- [ ] 登录页密码输错提交后，弹出的错误提示是「账号或密码不对」
- [ ] 已登录状态下会话真正过期（改密码、手动删 cookie 等）时，提示仍然是「未登录或登录已过期」，两种场景不能混用同一句话
- [ ] 其余走 401 的场景（未登录访问受保护接口）行为不变，不因这次改动引入回归

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。

## Comments

**发现记录（2026-08-27 浏览器全量走查 · Batch B）**

- `packages/admin/src/api/client.ts:55`：`request()` 对所有 `res.status === 401` 无条件 `throw new UnauthorizedError(payload)`，`UnauthorizedError` 的 message 硬编码成 `'未登录或登录已过期'`（同文件 22-27 行），完全不看 `payload` 内容。
- `describe()` 函数（63-92 行）其实已经写好了 `case 'invalid_credentials': return '账号或密码不对'` 这条精确映射（79 行），但 401 分支在 `describe()` 被调用之前就短路 return 了——这条正确文案是死代码，永远不可能被触发。
- 服务端登录失败返回的正是 `401 {error:'invalid_credentials'}`（`packages/server/src/routes/auth.ts:39,73`），路径完全对得上，只是客户端在 401 这一层把所有语义压扁成了一种。
- 复现：登录页故意输错密码提交，看到「未登录或登录已过期」。截图 `qa-screenshots/batch-b/01-login-wrong-password.webp`。
- 建议方向：`request()` 里对 401 不要一律走 `UnauthorizedError`——先看 `payload.error === 'invalid_credentials'`，是的话走 `describe()` 拿到「账号或密码不对」抛普通 `ApiError`（不触发全局跳登录页的逻辑，因为本来就在登录页上）；其余 401 维持现状抛 `UnauthorizedError`。
