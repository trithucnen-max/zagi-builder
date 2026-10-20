#!/bin/bash
# ==============================================================================
# Script ký số chính thức Apple Developer ID cho Zagi Native Rust
# Nhà phát triển: BASAN CORPORATION (Team ID: JFT5TLZ3HK)
# ==============================================================================

set -e

IDENTITY="Developer ID Application: BASAN CORPORATION (JFT5TLZ3HK)"

echo "========================================================"
echo "   KÝ SỐ CHÍNH THỨC BASAN CORPORATION CHO ZAGI RUST"
echo "   Identity: $IDENTITY"
echo "========================================================"

# 1. Kiểm tra chứng chỉ có tồn tại trong Keychain không
if ! security find-identity -p codesigning -v | grep -q "JFT5TLZ3HK"; then
    echo "❌ Lỗi: Không tìm thấy chứng chỉ BASAN CORPORATION trong Keychain!"
    exit 1
fi

echo "✅ Đã tìm thấy chứng chỉ BASAN CORPORATION trong Keychain."

# 2. Biên dịch bản release mới nhất
echo "📦 Đang biên dịch bản release..."
cargo build --release

# 3. Ký số binary zagi CLI
echo "✍️  Đang ký số target/release/zagi..."
codesign --force --options runtime --timestamp --sign "$IDENTITY" target/release/zagi

# 4. Ký số binary zagi-desktop
echo "✍️  Đang ký số target/release/zagi-desktop..."
codesign --force --options runtime --timestamp --sign "$IDENTITY" target/release/zagi-desktop

# 5. Xác minh chữ ký
echo "🔍 Xác minh chữ ký số:"
codesign -dvvv target/release/zagi
codesign -dvvv target/release/zagi-desktop

echo "========================================================"
echo "🎉 KÝ SỐ THÀNH CÔNG CHO PHIÊN BẢN v5.0.0 (BETA)!"
echo "   Tổ chức: BASAN CORPORATION"
echo "   Team ID: JFT5TLZ3HK"
echo "========================================================"
