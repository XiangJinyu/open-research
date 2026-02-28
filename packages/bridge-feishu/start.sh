#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 加载 .env（如果存在）
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

PORT="${RESEARCH_PORT:-4096}"
SERVER_URL="http://127.0.0.1:$PORT"

# 本地地址不走代理
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="127.0.0.1,localhost"

# 检查 research serve 是否已在运行
if lsof -i ":$PORT" -sTCP:LISTEN -t &>/dev/null; then
  echo "[start] research serve already running on port $PORT"
else
  echo "[start] starting research serve on port $PORT..."
  research serve --port "$PORT" &
  SERVE_PID=$!

  # 等待 server 就绪（最多 15 秒）
  for i in $(seq 1 15); do
    if curl -sf "$SERVER_URL/health" &>/dev/null; then
      echo "[start] research serve ready"
      break
    fi
    sleep 1
    if [ "$i" -eq 15 ]; then
      echo "[start] ERROR: research serve did not start in time"
      kill "$SERVE_PID" 2>/dev/null
      exit 1
    fi
  done
fi

echo "[start] starting bridge-feishu..."
exec bun run "$SCRIPT_DIR/src/index.ts"
