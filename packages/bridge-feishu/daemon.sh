#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 安装 pm2（如果没有）
if ! command -v pm2 &>/dev/null; then
  echo "[daemon] pm2 未安装，正在安装..."
  bun install -g pm2
fi

# 如果已有同名进程在跑，先停掉
pm2 delete research-serve 2>/dev/null || true
pm2 delete bridge-feishu  2>/dev/null || true

echo "[daemon] 启动进程..."
pm2 start ecosystem.config.cjs

echo ""
echo "[daemon] 常用命令："
echo "  pm2 logs bridge-feishu    # 查看飞书 bridge 日志"
echo "  pm2 logs research-serve   # 查看 server 日志"
echo "  pm2 status                # 查看运行状态"
echo "  pm2 restart all           # 重启所有"
echo "  pm2 stop all              # 停止所有"
echo ""
echo "[daemon] 设置开机自启（可选）："
echo "  pm2 save && pm2 startup"
