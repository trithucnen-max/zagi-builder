#!/bin/bash

# Ngăn script chạy tiếp nếu gặp lỗi
set -e

# Thiết lập các biến môi trường cho việc ký số và kiểm duyệt macOS
export APPLE_ID="basancorp@gmail.com"
export APPLE_APP_SPECIFIC_PASSWORD="nbwb-itqw-jozo-skxb"
export APPLE_TEAM_ID="JFT5TLZ3HK"

echo "========================================================"
echo "   ĐANG KHỞI CHẠY BUILD & SIGN ZAGI MAC CỤC BỘ"
echo "   Apple ID: $APPLE_ID"
echo "   Team ID : $APPLE_TEAM_ID"
echo "========================================================"

# Chạy quy trình build cho macOS
npm run build:mac
