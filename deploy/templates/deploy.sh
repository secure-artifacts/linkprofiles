#!/usr/bin/env bash
# 部署到当前服务器。首次部署、升级、回滚都用它：
#
#   ./deploy.sh                 部署到 origin/master 最新
#   ./deploy.sh <提交 id>        部署到指定提交（回滚就是这个）
#   ./deploy.sh --yes            带迁移也不再询问，给自动化用
#
# 任何一步失败立刻停下，绝不把没跑起来的版本记成「实际在跑」。
# 这个文件每次发版会被覆盖，要改请改源仓库 deploy/templates/deploy.sh。
set -euo pipefail

cd "$(dirname "$0")"

TARGET=origin/master
YES=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    -*) echo "未知参数：$arg" >&2; exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done

RECORD=.deployed-commit
IMAGE=link-profile:local
HEALTH_TIMEOUT=180

say() { printf '\n▸ %s\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

[ -f .env ] || die ".env 不存在。先照手册 2.2 从 .env.example 复制并填好。"

say "拉取远端"
git fetch --quiet origin
NEW=$(git rev-parse --verify "$TARGET^{commit}" 2>/dev/null) || die "找不到 $TARGET"

# ---------- 迁移判断：拿实际在跑的版本比，而不是本地检出的 ----------
if [ -f "$RECORD" ]; then
  CUR=$(cat "$RECORD")
  say "当前在跑 ${CUR:0:7}，目标 ${NEW:0:7}"
  echo "本次改动："
  git log --oneline "$CUR..$NEW" | sed 's/^/    /' || true
  if [ "$CUR" = "$NEW" ]; then
    echo "目标与部署记录一致，重新部署。"
  elif git merge-base --is-ancestor "$NEW" "$CUR"; then
    echo "（这是回滚：目标比当前旧）"
    MIG=$(git diff --name-only "$NEW..$CUR" -- drizzle/ || true)
    if [ -n "$MIG" ]; then
      die "当前版本相对目标多了这些迁移，数据库结构已经改过，回不去了：\n$MIG\n找开发出修复版本。"
    fi
  else
    MIG=$(git diff --name-only "$CUR..$NEW" -- drizzle/ || true)
    if [ -n "$MIG" ]; then
      printf '\n⚠ 这一版带数据库迁移，上线后无法回退（无 down 脚本、无自动备份）：\n'
      printf '%s\n' "$MIG" | sed 's/^/    /'
      if [ "$YES" -ne 1 ]; then
        [ -t 0 ] || die "带迁移的升级需要确认，非交互环境请加 --yes。"
        read -r -p "确认继续？[y/N] " ans
        [ "$ans" = "y" ] || { echo "已取消，什么都没动。"; exit 0; }
      fi
    fi
  fi
else
  say "没有 ${RECORD}，按首次部署处理"
fi

# ---------- 检出并构建。这一步失败旧容器还在跑 ----------
say "检出 ${NEW:0:7}"
git reset --quiet --hard "$NEW"

say "构建镜像（失败不影响线上）"
docker build -t "$IMAGE" .

# ---------- 切换。从这里开始网站会短暂中断 ----------
say "停旧起新"
docker compose down
docker compose up -d

# ---------- 等到真的健康，不是等到进程启动 ----------
say "等待应用健康（最多 ${HEALTH_TIMEOUT}s）"
APP=$(docker compose ps -q app)
[ -n "$APP" ] || die "app 容器没创建出来，看：docker compose logs app"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo unknown)
  running=$(docker inspect --format '{{.State.Running}}' "$APP" 2>/dev/null || echo false)
  [ "$status" = "healthy" ] && break
  if [ "$running" != "true" ]; then
    docker compose logs --tail=40 app || true
    die "app 容器退出了。线上目前是停的，先看上面的日志。修不好想回退：./deploy.sh <上一个提交>（前提是这一版没带迁移）。"
  fi
  [ "$(date +%s)" -lt "$deadline" ] || {
    docker compose logs --tail=40 app || true
    die "等了 ${HEALTH_TIMEOUT}s 仍未健康（状态：${status}）。线上目前是停的，先看上面的日志。"
  }
  sleep 3
done

PORT=$(docker compose port app 3000 | sed 's/.*://')
say "健康检查"
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${PORT}/_api/health" \
  || die "健康接口返回错误状态。线上目前是停的，看：docker compose logs app"
echo

# ---------- 全部通过，才记为实际在跑 ----------
echo "$NEW" > "$RECORD"
printf '\n✓ 已部署 %s\n' "$(git log -1 --format='%h %s' "$NEW")"
