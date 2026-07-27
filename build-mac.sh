#!/bin/bash

# Ngăn script chạy tiếp nếu gặp lỗi
set -e

# Nạp biến môi trường từ .env.local nếu có
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Thiết lập các biến môi trường cho việc ký số và kiểm duyệt macOS
export APPLE_ID="${APPLE_ID:-basancorp@gmail.com}"
export APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-}"
export APPLE_TEAM_ID="${APPLE_TEAM_ID:-JFT5TLZ3HK}"

echo "========================================================"
echo "   ĐANG KHỞI CHẠY BUILD & SIGN ZAGI MAC CỤC BỘ"
echo "   Apple ID: $APPLE_ID"
echo "   Team ID : $APPLE_TEAM_ID"
echo "========================================================"

# Chạy quy trình build cho macOS
npm run build:mac
