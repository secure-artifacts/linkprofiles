# 18：构建产物与格式检查不打架

**构建内容：** 跑完一次 `pnpm build` 之后，`pnpm run format:check` 仍然通过，`git status` 仍然干净。现在跑一次构建就会弄脏工作区并让格式检查失败，导致 CI 里「先构建再检查」这个再自然不过的顺序必然红。

**阻塞项：** 无（可立即开始）

**状态：** ready-for-agent

- [ ] `pnpm build` 之后 `pnpm run format:check` 通过
- [ ] `pnpm build` 之后 `git status --short` 无输出（生成产物与仓库内已提交的版本逐字节一致）
- [ ] 上述两条在干净 clone 上从 `pnpm install` 开始可复现
- [ ] `packages/profile-ui/src/generated/` 下产物的实际内容不发生变化，只有格式可以变

---

规格见 [../spec.md](../spec.md)。术语以 [CONTEXT.md](../../../CONTEXT.md) 为准，架构决策见 [docs/adr/](../../../docs/adr/)。

## Comments

**发现记录（2026-08-27 验收走查）**

- `scripts/build-icons.mjs` 与 `scripts/build-css.mjs` 直接输出 `JSON.stringify` 的结果：双引号、键带引号、不换行。而仓库里已提交的 `generated/css.ts` 与 `generated/icons.ts` 是 prettier 风格：单引号、键不带引号、按宽度折行。说明当初是人手跑完生成脚本后又跑了一次 `prettier --write` 才提交的。
- 因此 `pnpm build` → `pnpm format:check` 必然失败，`icons.ts` 差 117 行、`css.ts` 差 3 行，**但 CSS 文本与图标 path 数据逐字节相同**，纯粹是引号与折行的差异。
- 两条可行路径：生成脚本自己走一遍 prettier 再落盘；或把 `generated/` 加进 `.prettierignore` 并让脚本输出保持稳定。前者让产物可读，后者更省事——选哪个取决于是否有人需要读这两个文件的 diff。
