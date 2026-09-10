# Link Profile 部署产物

**交接入口：[运维部署手册.md](运维部署手册.md)。** 第一次部署从第 1 步开始；日常升级看第 4 步，回滚看第 5 步。

这是编译好的部署产物，不是源码仓库。开发负责发布到 GitLab，运维按手册在服务器上执行 `./deploy.sh`。
GitLab 出现新提交不等于服务器已上线；当前附带的 CI 模板不执行实际部署。

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

排障时，把版本信息和应用日志交给开发，具体命令见手册第 3 步和「找谁」。不要上传 `.env` 或私钥。

## 哪些文件不会被覆盖

服务器上的 `.env`、`geoip/`、`docker-compose.override.yml` 和 `.deployed-commit` 不归 Git 管理，升级时保留。
现场网段调整写入 `docker-compose.override.yml`，不要直接修改 `docker-compose.yml`。

开发的产物发布命令只在第一次写入 `.gitlab-ci.yml` 与 `docker-compose.yml`；
但服务器上的部署脚本会还原 Git 跟踪的文件，不能把现场修改直接放在这些文件里。

## 部署与回滚

日常升级，在服务器部署目录执行：

```bash
cd /srv/link-profile
./deploy.sh
```

脚本完成构建、先停旧再起新、健康检查和版本记录。任何一步失败都停止，重复部署同一版本也会短暂停机。
带数据库迁移时先与开发确认；没有自动备份和迁移回退脚本，不要自行回滚带迁移的版本。
