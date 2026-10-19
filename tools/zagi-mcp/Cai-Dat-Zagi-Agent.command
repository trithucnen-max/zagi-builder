#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "=================================================="
echo "  KHOI TAO & DONG BO ZAGI MCP CHO HERMES & AI     "
echo "=================================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "[!] Loi: Khong tim thay Node.js tren may tinh."
    echo "    Vui long cai dat Node.js tai https://nodejs.org/"
    read -p "Nhan Enter de thoat..."
    exit 1
fi

node ./zagi-mcp/scripts/setup-agent.js "Hermes Master Agent ($(whoami))"

echo ""
echo "Da hoan tat cai dat! Ban co the dong cua so nay."
read -p "Nhan Enter de thoat..."
