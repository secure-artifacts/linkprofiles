# Link Profile 部署产物

**这个仓库是机器写的，不要在这里改代码。** 源码在 GitHub，每次 `pnpm deployToGitlab` 会把构建产物
重新推一遍，下面列出的路径会被整个覆盖。

改代码请去源仓库，改完重新跑一次部署命令。

**运维请直接看 [运维部署手册.md](运维部署手册.md)** —— 从零部署与每次升级的完整步骤都在那里，
不需要读下面这些。

## 里面是什么

| 路径 | 说明 |
| --- | --- |
| `dist/` | 服务端打包产物。workspace 里的几个包已经打进去了，不需要单独安装 |
| `public/_admin/` | 后台静态站点 |
| `fonts/` | 自托管字体 |
| `drizzle/` | 迁移 SQL，应用启动时自动执行 |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`packages/*/package.json` | 依赖清单。锁的是整棵依赖树，同一个提交任何时候构建出来都一样 |
| `Dockerfile` | 不编译，只装依赖再拷产物 |
| `deploy-manifest.json` | 这一版是什么：版本号、源仓库 sha、打包时间与打包人 |
| `deploy.sh` | 服务器上的部署脚本：首次部署、升级、回滚都用它，失败即停，只在健康检查通过后记录版本 |

没有源码，也没有 sourcemap。要看栈请拿 `deploy-manifest.json` 里的 `commit` 在源仓库重新构建，
产物是一样的。

## 哪些文件不会被覆盖

`.gitlab-ci.yml` 与 `docker-compose.yml` 只在**第一次**写入模板，之后随便改，部署命令不会碰。
其余你自己加的文件（k8s 清单、compose override、CI include 等）也都保留。

## 部署与回滚

每个提交就是一次发布，消息形如 `deploy: v1.1.0 (github abc1234)`。

回滚 = 挑一个旧提交重新触发流水线。**但要先确认这两版之间有没有新的迁移**：

```bash
git diff --stat <旧提交>..<当前> -- drizzle/
```

有输出就意味着上线时执行过新的迁移。迁移是单向的，没有 down 脚本也没有自动备份，
这种情况下回滚拿不回旧的数据结构，只能从备份恢复。这条限制与源仓库
`docs/deployment.md` 第 7 节讲的是同一件事。

另外，迁移随应用启动执行且没有分布式锁，**必须先停旧再起新**，不能双实例并存。

## 仓库会长大

每次部署差不多 2 MB，其中后台静态资源带内容哈希，每次构建都是全新文件，delta 压不动。
周更一年两三百兆。嫌大就截断历史，这里的历史没有考古价值：

```bash
git checkout --orphan fresh && git commit -m "deploy: 重建历史" && git push -f
```
