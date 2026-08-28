# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` in this repo (no git remote). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## 前端 UI 选型（覆盖全局默认）

`packages/admin` 不用 Ant Design——全局 `~/.claude/CLAUDE.md` 的「前端 UI 默认 Ant Design」规则在本项目不适用于后台。后台用 Tailwind CSS + Radix UI 无样式原语，组件封装在 `packages/admin/src/ui/`，直接复用，不要重新引入 antd 或另起一套组件库。理由与取舍见 `docs/adr/0007-后台放弃-antd-改用-tailwind-与无样式组件.md`。

`packages/profile-ui`（公开页）继续按 ADR-0002 使用 tailwind，两个包的 tailwind 配置各自独立、不得互相渗透。
