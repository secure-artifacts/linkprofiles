# 部署手册

从 GitHub 拉代码到服务器，`docker compose up -d --build` 起服务。编译在 Docker 多阶段构建里完成，
**服务器不装 Node、pnpm，不手工编译，不手工跑数据库迁移**。

日常运行、监控与故障处理见 [operations.md](./operations.md)。

配置的唯一事实源是仓库文件本身，本文只引用不复制：

| 文件 | 内容 |
| --- | --- |
| `Dockerfile` | 镜像构建 |
| `docker-compose.yml` | 服务编排、固定网段 |
| `.env.example` | 环境变量清单与逐条说明 |

> **本系统不做备份。** 数据只存在于宿主机的 docker 卷里，没有副本。这直接决定了回滚能做到什么程度，
> 见第 7 节；完整风险清单见 operations.md 第 8 节。

---

## 1. 目标状态

```
              ┌─────────────────────────────────────────┐
   公网 :443  │ Nginx（宿主机）                          │
  ───────────▶│  TLS · client_max_body_size · 限速       │
              │  X-Forwarded-For / -Proto / -Host        │
              └────────────────┬────────────────────────┘
                               │ 127.0.0.1:3000（只绑回环）
              ┌────────────────▼────────────────────────┐
              │ app 容器                                 │
              │  Fastify · 公开页直出 · 后台 SPA · 埋点    │
              │  启动时自动执行数据库迁移                  │
              └────────────────┬────────────────────────┘
                               │ 172.28.0.0/24（网段固定）
              ┌────────────────▼────────────────────────┐
              │ postgres 容器                            │
              └─────────────────────────────────────────┘

具名卷：pgdata（数据库） · uploads（用户上传的图片与视频）
```

只有 Nginx 对外。app 端口绑在 `127.0.0.1`，外部无法直连。

### 职责边界

| 谁 | 做什么 |
| --- | --- |
| 开发 | 推代码到 GitHub；**每个待部署版本打 tag** |
| 运维 | 服务器与网络（第 2 节）· 部署与升级（4、6）· 反代与 TLS（5）· 监控（operations.md） |
| 没人需要做 | 装 Node / pnpm、手工编译、手工跑迁移、装 ffmpeg |

**部署一律按 tag，不按分支 HEAD。** 分支会动，tag 不会；出问题时「线上到底是哪个版本」必须有确定答案。

---

## 2. 前置条件

### 软件与权限

Docker Engine ≥ 24 · Docker Compose v2 插件（`docker compose`）· git · Nginx ≥ 1.25.1（低版本见 5.1）

```bash
docker info >/dev/null && echo "docker 可用"      # 报权限错就把用户加进 docker 组后重新登录
docker compose version
nginx -v
```

### 出网

构建在服务器上进行，以下四类目标都要能访问：

| 目标 | 用途 | 必需 |
| --- | --- | --- |
| GitHub（`github.com`，HTTPS 443 或 SSH 22） | 拉源码 | 是 |
| Docker Hub（`registry-1.docker.io`、`auth.docker.io`、`production.cloudflare.docker.com`） | 拉 `node:22-bookworm-slim`、`postgres:18-alpine` | 是 |
| npm registry（`registry.npmjs.org`） | 装依赖 | 是 |
| MaxMind（`download.maxmind.com`） | GeoIP 库更新 | 否 |

> 这张表说的是**本节这条流程**：服务器自己拉源码、自己构建。另有一条产物分发的路子，服务器不再
> 需要访问 GitHub、也不再在本机编译，见第 9 节。要注意的是构建只是挪到了 GitLab runner 上，
> npm registry 与 Docker Hub 那两项要求原样还在，只是换了台机器。

### 资源

内存 ≥ 4 GB（构建阶段跑 vite build 与 tsc）· 磁盘 ≥ 15 GB。容量构成与增长估算见 operations.md 第 2 节。

### 网段

compose 固定使用 `172.28.0.0/24`，网关 `172.28.0.1`。与宿主机现有网段冲突时，改
`docker-compose.yml` 的 `networks.default.ipam`，**并同步改 `.env` 的 `TRUST_PROXY`**，两者必须一致。

```bash
ip route | grep -E '172\.28\.'      # 有输出说明冲突，得换个网段
```

### GitHub 访问

公开仓库可以直接通过 HTTPS 只读拉取；自动部署也可以配置只读 Deploy Key。

用只读 **Deploy Key**，不要把 token 写进 URL——那会进 shell history，并被 git 明文写进 `.git/config`。

```bash
git ls-remote https://github.com/secure-artifacts/linkprofiles.git HEAD
```

---

## 3. 上线前必须完成

第一版交接文档送审时运维列出的阻断问题，整改记录见
`.scratch/deploy-hardening/issues/01-运维审核阻断项整改.md`。接手前确认：

- [ ] 该票的门禁行是绿的
- [ ] `Dockerfile` 里有 `pnpm deploy` 与 `chown -R node:node /app/uploads`
- [ ] `docker-compose.yml` 的 `ports` 绑 `127.0.0.1`，且有固定网段
- [ ] `packages/server/src/app.ts` 有 `trustProxy`
- [ ] 该票「遗留」一节列的各项已知悉

---

## 4. 首次部署

> 这是服务器直连 GitHub 自己构建的路子。用内网 GitLab 分发产物见第 9 节。

```bash
# 1. 拉代码，切到要部署的 tag
sudo install -d -o "$USER" -g "$(id -gn)" /srv/link-profile
git clone https://github.com/secure-artifacts/linkprofiles.git /srv/link-profile
cd /srv/link-profile
git fetch --tags
git tag -l | tail -5                          # 挑要部署的版本
git switch --detach v1.0.0                    # 换成实际 tag
git describe --tags > .deployed-version        # 记录线上版本

# 2. 配置
cp .env.example .env
chmod 600 .env
openssl rand -hex 32                          # 生成 POSTGRES_PASSWORD，填进 .env
vi .env                                       # 逐条按注释填

# 3. 构建并启动
docker compose up -d --build

# 4. 确认
docker compose ps                             # 两个服务都应 healthy
curl --fail-with-body -sS --max-time 10 http://127.0.0.1:3000/_api/health
# 期望：{"status":"ok","database":"ok"}
docker compose logs app | head -20            # 应看到迁移与超管初始化
```

冷构建实测 31 秒（本机，依赖全部现拉），服务器耗时主要取决于到 npm 与 Docker Hub 的网络。

数据库迁移由应用启动时自动执行。超级管理员按 `.env` 里的账号密码创建，**幂等**——库里已有超管则整段跳过，
改 `.env` 不会重置线上密码。

配好反代（第 5 节）后访问 `https://<域名>/_admin/` 登录，**立即在后台改一次密码**。

### 关于 `TRUST_PROXY`

`.env.example` 里已经填好 `172.28.0.1`，与 compose 固定网段的网关一致，通常不用改。

网段之所以写死，是因为 `docker compose down` 会删掉默认网络，重建时 Docker 会另分一段，网关随之改变，
而 `.env` 里还是旧地址——升级后访客 IP 会**静默**记成网关地址，没有任何报错。

只有在第 2 节的网段冲突检查发现冲突、改了 `ipam` 时，才需要同步改这里。改完按 operations.md 第 6 节验收。

---

## 5. 反向代理

应用只监听 HTTP，TLS 由运维接管——这是设计约定，不是缺失。

### 5.1 版本

`http2 on;` 需 Nginx ≥ 1.25.1。`nginx -v` 确认；低于该版本改用 `listen 443 ssl http2;`（旧写法，
1.25.1 起废弃但仍可用）。

### 5.2 配置

```nginx
# 登录接口限速。应用侧暂无 rate limit，这层是目前唯一的兜底
limit_req_zone $binary_remote_addr zone=lp_login:10m rate=6r/m;

server {
    listen 80;
    server_name links.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name links.example.com;

    ssl_certificate     /etc/ssl/certs/links.example.com.pem;
    ssl_certificate_key /etc/ssl/private/links.example.com.key;

    # 图片上限 12 MB，multipart 编码后还会涨；默认 1m 会让上传直接 413
    client_max_body_size 16m;

    location = /_api/auth/login {
        limit_req zone=lp_login burst=3 nodelay;
        limit_req_status 429;
        include /etc/nginx/snippets/link-profile-proxy.conf;
    }

    location / {
        include /etc/nginx/snippets/link-profile-proxy.conf;
    }
}
```

`/etc/nginx/snippets/link-profile-proxy.conf`：

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;

# 视频头像靠 206 分段请求拖动，缓冲会破坏它
proxy_buffering off;
```

```bash
nginx -t && systemctl reload nginx
```

### 5.3 要点

- 三个 `X-Forwarded-*` 一个都不能少，且必须与应用侧 `TRUST_PROXY` 配套才生效
- **应用端口只绑 `127.0.0.1`**。这是防伪造的真正边界：能直连就能伪造 `X-Forwarded-For`
- 全站 HTTPS。`NODE_ENV=production` 时 session cookie 带 `Secure`，走 HTTP 登不上
- `/_static/uploads/` 带 `Cache-Control: max-age=365d, immutable`，可放心缓存

---

## 6. 升级

> **先判断这次升级可不可逆，再决定要不要做。** 见下面第 1 步——带新迁移的版本上线后无法回滚。

> **必须先停旧再起新，不能双实例并存。** 迁移随应用启动执行且没有分布式锁，两个实例同时启动会并发跑 DDL。

```bash
cd /srv/link-profile

# 1. 看新版本带了什么。这一步决定这次升级是否可逆
git fetch --tags
NEW=v1.1.0                                    # 换成要部署的 tag
CUR=$(cat .deployed-version)
git log --oneline "$CUR..$NEW"
git diff --stat "$CUR..$NEW" -- drizzle/
#   ↑ 有输出 = 带新迁移 = 上线后不可回滚（第 7 节）。确认业务方接受再继续

# 2. 记录当前版本，供回滚用（写进部署目录，不要放 /tmp——重启就没了）
cp .deployed-version .deployed-version.prev

# 3. 切到新版本并先构建。构建失败时旧容器还在跑，服务不受影响
git switch --detach "$NEW"
docker compose build

# 4. 构建成功后再切换，停机窗口只有这两条命令的时间（实测约 20 秒）
docker compose down
docker compose up -d
git describe --tags > .deployed-version

# 5. 确认
docker compose ps
curl --fail-with-body -sS --max-time 10 http://127.0.0.1:3000/_api/health
docker compose logs app | head -20
```

第 4 步的 `down` 不带 `-v`。带上会删掉数据卷，在没有备份的前提下不可恢复。

---

## 7. 回滚

**能不能回滚，取决于这个版本有没有带数据库迁移。**

### 没有新迁移：可以回滚

```bash
cd /srv/link-profile
git switch --detach "$(cat .deployed-version.prev)"
docker compose build && docker compose down && docker compose up -d
git describe --tags > .deployed-version
```

### 带了新迁移：无法回滚

两个原因叠加，没有绕过的办法：

1. **迁移只前进**。`applyMigrations` 没有 down 脚本，新增的列、删除的列、改掉的约束都无法自动撤销。
2. **没有备份**。通常这时的出路是「还原到升级前的数据库快照」，但本系统没有任何副本可还原。

即使把代码切回旧 tag 也没用：旧代码对着已经被新迁移改过的表结构跑，行为不可预期，且 app 启动时
还会再次执行那些迁移。

**唯一出路是前滚**：让开发出一个修复版本，重新走第 6 节的升级流程。

因此第 6 节第 1 步的判断不是走过场——一旦 `git diff -- drizzle/` 有输出，这次升级就是单向的，
上线前要和业务方确认能接受。

### 已知局限

基础镜像用的是可变 tag（`node:22-bookworm-slim`、`postgres:18-alpine`），重建旧提交**不保证**拿到
当初那个镜像。要严格可复现需按 digest 固定，见整改票「遗留」。

---

## 8. 验收清单

- [ ] `docker compose ps` 两个服务均 `healthy`
- [ ] `ss -lntp | grep :3000` 只监听 `127.0.0.1`
- [ ] `curl --fail-with-body -sS --max-time 10 https://<域名>/_api/health` 返回 `{"status":"ok",...}`
- [ ] `nginx -t` 通过；`https://<域名>/_admin/` 可打开并登录
- [ ] 已改超管初始密码；`.env` 权限 600
- [ ] `.deployed-version` 内容与实际部署的 tag 一致
- [ ] 上传一张接近 12 MB 的图不报 413，公开页能看到
- [ ] 建一个测试账号，`https://<域名>/<short_name>` 可访问
- [ ] 分享该地址，卡片里域名与协议正确（验 `PUBLIC_ORIGIN`）
- [ ] **`TRUST_PROXY` 验收**：从外网访问一次公开页，然后查埋点表——
      IP 必须是公网地址；出现 `172.x` / `192.168.x` 说明配错了
      ```bash
      docker compose exec -T postgres psql -U linkprofile -d link_profile \
        -tAc 'select ip_truncated, country from page_views order by occurred_at desc limit 5'
      ```
- [ ] 登录接口限速生效：连续 10 次错误登录后返回 429
- [ ] `docker compose restart app` 后日志显示 `bootstrap: "already-exists"`，不重复创建超管
- [ ] 服务器重启后容器自动拉起
- [ ] 运维已知悉：**无备份**，且**带迁移的版本无法回滚**（第 7 节）

---

## 9. 内网 GitLab 产物分发

第 4 节到第 7 节讲的是「服务器直连 GitHub 拉源码、自己构建」。这一节是另一条并行的路，两条都能用。

**为什么有这条路**：外包开发者进不了公司内网的 GitLab，只能往 GitHub 提交，所以源码留在 GitHub；
而要上服务器的东西得进内网。中间这一步由源仓库里的 `pnpm deployToGitlab` 完成——它在内网人员的
机器上构建，把跑得起来所需的文件作为**一个提交**推到内网 GitLab，那边的 CI 接手部署。

### 两条路的差别

| | 第 4 节：服务器直连 GitHub | 本节：内网 GitLab 产物分发 |
| --- | --- | --- |
| 服务器要出网到 | GitHub、Docker Hub、npm | Docker Hub、npm（或内网镜像源） |
| 谁来编译 | 服务器 | 执行部署命令的那台机器 |
| 服务器上有什么 | 整份源码 | 只有镜像 |
| 上线操作 | 在服务器上敲命令 | 推一个提交，CI 接手 |

服务器少掉 GitHub 一项，也不再需要 4 GB 内存来跑 vite 与 tsc。**但这不等于能离线部署**：
镜像构建挪到了 GitLab runner 上，那台机器仍然要能装依赖、拉基础镜像。

### 一次性准备：绑定 gitlab remote

部署命令只认一个名叫 `gitlab` 的 git remote。地址与凭据都只存在于**执行部署那台机器的本地 git
配置**里，仓库中一个字都没有，所以外包开发者拉到的代码里也没有——他们跑部署命令会停在
「没有 gitlab remote」那一步。

#### 第 1 步：在内网 GitLab 上建产物仓库

**新建一个空仓库**，例如 `group/link-profile-deploy`。注意几点：

- 它**不是**源码仓库的镜像或 fork，两者没有任何血缘关系，也不要做镜像同步。
- 建的时候**不要勾选** README、.gitignore、LICENSE 这类初始化文件。第一次部署会把产物完整写进去，
  预置文件只会变成第一次提交里的一堆冲突。真勾了也不致命，脚本会覆盖受管文件，但没必要。
- 仓库可见性按内网规矩来。里面有编译产物与依赖清单，没有源码。

#### 第 2 步：确认自己推得上去

推荐 SSH。**不要把 token 写进 remote 地址**——它会进 shell 历史，还会被 git 明文写进
`.git/config`，第 3 节的整改记录里专门记过这条。

```bash
# 没有 key 就先生成一把，已有可跳过
ssh-keygen -t ed25519 -C "link-profile deploy"

# 公钥贴到 GitLab：右上角头像 → Preferences → SSH Keys
cat ~/.ssh/id_ed25519.pub

# 验通
ssh -T git@your-gitlab
```

自签证书或非标端口的内网 GitLab，地址形如 `ssh://git@your-gitlab:2222/group/link-profile-deploy.git`，
具体端口问运维。

#### 第 3 步：加 remote

在**源码仓库**的目录下执行（不是在产物仓库里）：

```bash
cd /path/to/linkprofiles
git remote add gitlab git@your-gitlab:group/link-profile-deploy.git
```

地址从 GitLab 项目页的 **Clone → Clone with SSH** 直接复制，别手打。

#### 第 4 步：验证

```bash
git remote -v                   # 应当看到 origin 与 gitlab 两个，地址不同
git ls-remote gitlab            # 能连上就有输出；空仓库输出为空但不报错，也算通过
```

第二条报 `Permission denied (publickey)` 就是第 2 步的 key 没配好；报 `Could not resolve hostname`
就是不在内网或域名不对。

配好之后跑一次部署命令，它会自己再查一遍：remote 存不存在、是不是与 `origin` 同址、是不是指到了
github.com。这三条任何一条不对都会直接停下，不会误推。

#### 换地址、删掉、多台机器

```bash
git remote set-url gitlab git@your-gitlab:group/新地址.git   # 换
git remote remove gitlab                                      # 删
```

每台要执行部署的机器都得各自配一遍，这个配置不会跟着 git 仓库走。

#### 一句话版本

```bash
git remote add gitlab <从 GitLab 复制的 SSH 地址> && git ls-remote gitlab && pnpm deployToGitlab
```

### 每次部署

```bash
pnpm deployToGitlab
```

它会依次做：查 remote（顺带挡住写成 github.com 的手滑）→ 查工作区干净、HEAD 已推到 origin →
装依赖 → **类型检查** → 版本号一致性 → 构建 → 再查一次工作区干净 → 核对产物的依赖清单 → 冒烟 →
拉取产物仓库当前状态 → 覆盖受管文件 → 列出改动等你确认 → 提交并推送。

类型检查这一步不能省：`pnpm build` 是 tsup 加 vite，两者都不做类型检查。

确认那一步会明确告诉你**这一版带不带新迁移**。带了就意味着上线后回不去，判断依据与第 7 节一致。

可用的开关：

| 开关 | 用途 |
| --- | --- |
| `--branch <名字>` | 推到指定分支，默认取远端的默认分支 |
| `--yes` | 跳过确认，给自动化用 |
| `--allow-unpushed` | HEAD 还没推到 GitHub 时放行（紧急修复） |
| `--adopt` | 目标分支有内容但不像产物仓库时，确认就是要用它 |
| `--force` | 丢弃远端历史，以孤儿提交重建。目标仓库里原本是源码时必须用它，否则那些不在受管清单里的文件会一直留着 |
| `--reseed` | 把只写一次的文件按模板重写。远端那份本来就是错的时候用，例如它是从旧源码仓库带过来的 |

### 产物仓库里有什么

只有跑起来需要的东西：`dist/`、`public/_admin/`、`fonts/`、`drizzle/*.sql`、依赖清单
（`package.json` 与 `pnpm-lock.yaml` 等）、`Dockerfile`、`deploy-manifest.json`。

**没有源码，也没有 sourcemap**。sourcemap 里嵌着完整的 TypeScript，带过去等于把源码推进内网仓库。
要看生产栈就拿 `deploy-manifest.json` 里的 `commit` 在源仓库重新构建，产物是一样的。

`drizzle/meta/` 也不带——那是 drizzle-kit 生成迁移时用的快照，运行时只读 `*.sql`。

依赖清单带的是整份 `pnpm-lock.yaml` 而不是一张钉死版本的依赖表：钉死直接依赖锁不住传递依赖，
同一个提交隔一周构建出来就不是同一个镜像。`pnpm-workspace.yaml` 也必须带，它里面的 `allowBuilds`
决定 `argon2` 与 `sharp` 能不能编译出二进制——漏了它镜像照样构建成功，第一次有人登录时才崩。

`.gitlab-ci.yml` 与 `docker-compose.yml` 只在**第一次**写入模板，之后随便改，部署命令不会碰。
其余你自己往产物仓库里加的文件也都保留。

### 回滚

挑一个旧的部署提交重新触发流水线。**先确认这两版之间有没有新迁移**：

```bash
git diff --stat <旧提交>..<当前> -- drizzle/
```

有输出就回不去——迁移单向、无 down 脚本、无自动备份，与第 7 节讲的是同一件事。

### 仓库会长大

每次约 2 MB，后台静态资源带内容哈希、每次都是全新文件，delta 压不动。周更一年两三百兆。
嫌大就截断历史，产物仓库的历史没有考古价值。
