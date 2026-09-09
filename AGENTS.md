# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo (no git remote). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## 发版与更新日志

每发一版，下面三处一起改，漏一处 `packages/admin/src/changelog/entries.test.ts` 会红：

- 仓库根的 `CHANGELOG.md` —— 给读代码的人看的完整记录。
- `packages/admin/src/changelog/entries.ts` —— 后台的「更新日志」页面读的就是它，入口在右上角账号菜单。
- 根 `package.json` 的 `version` —— 与上面两处的最新版本号一致。

写法约定：

- 正文统一简体中文，不进译文目录。页面外壳跟随界面语言，正文不翻译，理由写在 `entries.ts` 顶部。
- 面向运营写，不是 commit 列表：说清「现在能做什么」和「哪里变了」，不写实现细节与文件名。
- 有数据库迁移就在「升级提示」里点名迁移区间，并链到对应的迁移手册。
- 术语按 `CONTEXT.md` 的术语表，别漂到同义词。
