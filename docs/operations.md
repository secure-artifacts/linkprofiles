# 运维手册

日常运行、监控与故障处理。部署与升级见 [deployment.md](./deployment.md)。

以下命令都在部署目录（`/srv/link-profile`）下执行。

> **本系统当前不做备份。** 数据库与上传文件只存在于宿主机的 docker 卷里，没有任何副本。
> 宿主机磁盘损坏、卷被误删、`docker compose down -v` 执行错，数据即永久丢失。
> 由此带来的回滚限制见 [deployment.md 第 7 节](./deployment.md#7-回滚)，风险清单见第 7 节。

---

## 1. 监控与告警

### healthcheck 不会自动重启容器

`docker-compose.yml` 里 app 有 healthcheck，但它**只提供状态可见性与 `depends_on` 判据**。
`restart: unless-stopped` 针对的是容器进程退出，healthcheck 报 unhealthy **不触发重启**。

自动拉起需要额外手段，二选一：

**外部探针**（推荐，顺带覆盖 Nginx 与 TLS）：从站外定时请求 `https://<域名>/_api/health`，
非 200 或连续超时就告警。

**autoheal 容器**（要容器内自愈时）：

```yaml
  autoheal:
    image: willfarrell/autoheal
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```

并给 app 加 `labels: [autoheal=true]`。注意它需要 docker socket，等于给该容器宿主机 root 权限，
按你们的安全策略决定用不用。

### 告警项

| 项 | 阈值 |
| --- | --- |
| `/_api/health` | 连续 3 次非 200 |
| `uploads` 卷使用率 | > 80%（**没有备份，写满即服务不可用且无退路**） |
| 磁盘总使用率 | > 85% |
| 容器 restart 次数 | 短时间内上升 |
| 证书有效期 | < 14 天 |

### 健康检查语义

`GET /_api/health`：

- `{"status":"ok","database":"ok"}` — 正常
- HTTP **503** `{"status":"error","database":"unreachable"}` — 数据库连不上

用 `curl --fail-with-body -sS --max-time 10`。`curl -s` 遇到 503 仍然退出 0，脚本里会漏判。

### 日志

pino JSON 输出到 stdout，compose 已配 json-file 轮转（`max-size: 10m`、`max-file: 5`），
两个服务合计上限约 100 MB。

```bash
docker compose logs -f app
docker compose logs app | grep '"level":50'     # 只看 error
```

接 ELK / Loki 直接采 Docker 日志驱动。

---

## 2. 容量规划

没有备份要占的空间，但**卷只增不减**，需要盯着。

| 项 | 占用 |
| --- | --- |
| 运行镜像 | 448 MB |
| 构建缓存（多阶段，含 devDependencies） | 2–3 GB，`docker builder prune` 可清 |
| 基础镜像（node、postgres、alpine） | 约 500 MB |
| postgres 数据 | 埋点明细保留 6 个月后聚合进日汇总并删除，稳态后平缓 |
| uploads | 见下式 |

uploads 估算，每个账号：

```
头像 640px（avif + webp + 缩略图）   ≈ 0.15 MB
背景 1440px（avif + webp + 缩略图）  ≈ 0.5 MB
视频头像（可选，上限 10 MB）

单账号 ≈ 0.65 MB + 视频账号占比 × 10 MB
```

1000 个账号、其中 10% 用视频头像 ≈ `1000 × 0.65 MB + 100 × 10 MB` ≈ **1.6 GB**。

15 GB 起步够用，按账号增长复核。**没有配额机制**，单个账号也拦不住反复换素材（旧文件在换素材时删除，
删账号时整目录清理）。

```bash
docker system df -v | grep -E 'uploads|pgdata'
docker builder prune          # 清构建缓存
```

---

## 3. 日常巡检

| 频率 | 事项 |
| --- | --- |
| 每周 | `uploads` 卷与磁盘水位；`docker builder prune` |
| 每周二 | GeoLite2 库更新（若启用），见第 5 节 |
| 按证书周期 | TLS 续期后 `nginx -t && systemctl reload nginx` |

---

## 4. 故障速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建卡在拉依赖 | 出网受限 | 核对 deployment.md 第 2 节四类目标；有内网源则配 npm registry |
| 构建 OOM / 进程被杀 | 内存不足 | ≥ 4 GB，或加 swap |
| 容器起来就退，`ERR_MODULE_NOT_FOUND` | 镜像依赖不完整 | 确认 `Dockerfile` 里有 `pnpm deploy` 那步 |
| 日志 `迁移目录不存在` | `drizzle/` 没进镜像 | 查 `.dockerignore` 是否误伤 |
| `/_admin/` 返回 503 `admin_not_built` | 后台构建产物缺失 | 看构建日志 admin build 是否成功 |
| 填对密码也登不进 | cookie 带 `Secure`，走了 HTTP | 确认全站 HTTPS |
| 上传报错 / 存不下 | uploads 属主不对，或磁盘满 | `docker compose exec app ls -ld /app/uploads` 应为 `node node`；`df -h` |
| 上传大图 413 | 反代请求体上限太小 | Nginx `client_max_body_size` ≥ 16m |
| **埋点 IP 全是内网地址** | `TRUST_PROXY` 与网关不一致 | 见第 6 节 |
| 分析页地域全空 | 没配 GeoLite2，或 IP 是内网地址 | 分别核对，见第 5、6 节 |
| 分享卡片域名/协议不对 | `PUBLIC_ORIGIN` 没配或配错 | 改 `.env` 后 `docker compose up -d` |
| 视频头像不播 / 拖动卡 | 反代缓冲了 206 分段响应 | Nginx 加 `proxy_buffering off` |
| 日志 `bootstrap: "skipped"` | 库里没超管且没给 `SUPERADMIN_*` | 补环境变量重启 |
| 日志 `bootstrap: "already-exists"` | 正常。改 `.env` 不会重置线上密码 | 忘密码见第 7 节 |

---

## 5. GeoIP

可选。不配时地域维度为空，其余埋点照常写入，服务正常启动。

1. 在 <https://www.maxmind.com/en/geolite2/signup> 注册拿 license key
2. 下载 `GeoLite2-City.mmdb` 放到宿主机，如 `/srv/link-profile/geoip/`
3. `.env` 设 `GEOLITE2_HOST_DIR=/srv/link-profile/geoip`、
   `GEOLITE2_CITY_PATH=/app/geoip/GeoLite2-City.mmdb`
4. 取消 `docker-compose.yml` 里那条 geoip volume 的注释
5. `docker compose up -d`

MaxMind 每周二更新。配 `geoipupdate` 定时任务，**更新后要重启 app 容器**——库文件在进程生命周期内
只打开一次。

---

## 6. 排查埋点 IP

访客 IP 取自 `req.ip`，由 Fastify 按 `TRUST_PROXY` 校验来源可信后再解析 `X-Forwarded-For`。
配错不报错，只会让 IP 全部记成内网网关地址。

```bash
docker compose exec -T postgres psql -U linkprofile -d link_profile \
  -tAc 'select ip_truncated, country, city from page_views order by occurred_at desc limit 10'
```

出现 `172.x` / `192.168.x` / `10.x` 就是配错了。`TRUST_PROXY` 必须等于 compose 网络的网关：

```bash
# 从运行中的容器取网络名，不要按目录名拼 —— 项目名可被覆盖
NET=$(docker inspect "$(docker compose ps -q app)" \
  -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker network inspect "$NET" -f '{{(index .IPAM.Config 0).Gateway}}'
```

正常应输出 `172.28.0.1`，与 `docker-compose.yml` 的 `networks.default.ipam` 和 `.env` 的
`TRUST_PROXY` 三处一致。不一致就对齐后 `docker compose up -d`。

`loopback` 与 hop-count 数字写法**都不生效**，必须写实际网关地址或包含它的 CIDR。

另外确认 Nginx 确实传了 `X-Forwarded-For`（deployment.md 第 5 节），两边配套才有效。

---

## 7. 应急流程

### 超管忘记密码

后台无自助找回（无邮件服务）。

```bash
cd /srv/link-profile

# 1. 查出实际的超管账号，不要假定是 admin
docker compose exec -T postgres psql -U linkprofile -d link_profile \
  -tAc "select account from users where role = 'superadmin'"

ACCOUNT=<上一步查到的账号>

# 2. 读入新密码。走 stdin 传给容器，不进 shell history，也不出现在 ps 的命令行里
read -rsp '新密码: ' NEWPASS; echo
HASH=$(printf '%s' "$NEWPASS" | docker compose exec -T app node -e "
  let s = '';
  process.stdin.on('data', d => s += d).on('end', () => {
    import('argon2')
      .then(a => a.default.hash(s, { type: a.default.argon2id }))
      .then(h => console.log(h));
  });
" | tr -d '\r')

# 3. 写库
docker compose exec -T postgres psql -U linkprofile -d link_profile \
  -c "update users set password_hash = '$HASH' where account = '$ACCOUNT' and role = 'superadmin'"

# 4. 清掉该账号的既有会话。这一步不能省 ——
#    直接改库不触发应用里的会话清理，旧 cookie 改密后仍然有效
docker compose exec -T postgres psql -U linkprofile -d link_profile \
  -c "delete from sessions where user_id = (select id from users where account = '$ACCOUNT')"

unset NEWPASS HASH
```

验证：旧密码返回 401，新密码返回 200。

### 数据库连不上

```bash
docker compose ps                       # postgres 是否 healthy
docker compose logs postgres | tail -50
docker compose exec postgres pg_isready -U linkprofile -d link_profile
df -h                                   # 磁盘满会让 postgres 拒绝写入
```

app 会返回 503 但不退出，数据库恢复后自动恢复服务，不需要重启 app。

### 需要紧急下线

```bash
docker compose stop app                 # 只停应用，数据卷不动
```

Nginx 会返回 502。要给访客一个像样的页面就在 Nginx 配 `error_page 502`。

> **永远不要用 `docker compose down -v`。** `-v` 会删除具名卷，在没有备份的前提下
> 等于一次性抹掉全部用户数据与上传文件，不可恢复。停服务用 `stop`，重建用不带 `-v` 的 `down`。

---

## 8. 已知限制

| 限制 | 说明 |
| --- | --- |
| **无备份** | 数据只存在于宿主机 docker 卷，没有任何副本。磁盘损坏、误删卷、`down -v` 都会永久丢失数据 |
| **带迁移的版本无法回滚** | 迁移只前进、没有 down 脚本，又没有备份可还原。见 deployment.md 第 7 节 |
| 单副本 | 迁移随启动执行且无 advisory lock；`uploads` 是本地卷，多实例不共享 |
| 服务器须出网 | 构建在服务器上做，隔离内网用不了 |
| 上传落本地磁盘 | 无对象存储抽象，迁服务器必须一并搬卷 |
| 无存储配额 | 单账号可反复上传，没有总量限制 |
| 登录无限速 | 应用侧暂无，只能靠 Nginx 兜底（deployment.md 5.2） |
| 基础镜像可变 tag | 重建旧提交不保证拿到同一镜像 |
| 埋点清理是进程内定时器 | 每 24 小时一次，随进程启停；幂等，重启无数据风险 |
| 数据库单点 | 无主从、无 PITR |
| 无邮件服务 | 忘记密码只能走第 7 节 |
| 视频不转码 | 只做格式/大小/时长校验后原样落盘，镜像不需要 ffmpeg |
