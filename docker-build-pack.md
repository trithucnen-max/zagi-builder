# Kế hoạch triển khai Docker Build Environment (Option A)

Kế hoạch này chi tiết hóa cách thiết lập một môi trường build cô lập sử dụng Docker để đóng gói ứng dụng Zagi thành các bộ cài đặt (Windows `.exe`, Linux `.deb`/`.AppImage`) mà không cần cài đặt Node.js, Go hay Wine trực tiếp trên hệ điều hành host.

## Project Type
- **DESKTOP (Electron + React)**
- **CI/CD Build Environment**

---

## User Review Required

> [!IMPORTANT]
> **Giới hạn của môi trường Docker Linux (electron-builder):**
> 1. **macOS Target:** Không thể đóng gói và ký số (code signing) file cài đặt macOS (`.dmg`, `.zip`) từ Docker chạy trên Linux. Yêu cầu bắt buộc phải dùng máy macOS thật. Môi trường Docker này sẽ chỉ dùng để build cho Windows và Linux.
> 2. **Native Module Compilation:** Ứng dụng Zagi sử dụng native module `better-sqlite3` và phần bridge E2EE viết bằng Go. Do đó, Docker image dùng để build bắt buộc phải cài đặt đủ:
>    - Node.js (cùng phiên bản target, khuyến nghị Node 22)
>    - Go Compiler (phiên bản >= 1.24 như quy định trong script build)
>    - GCC, G++, Make, Python3 (để rebuild `better-sqlite3` qua `node-gyp`)
>    - Wine (để đóng gói bản cài đặt Windows `.exe` từ môi trường Linux)

---

## Open Questions

> [!NOTE]
> 1. Bạn muốn chạy Docker build này trực tiếp ở máy local của bạn (macOS) hay chạy trên một máy chủ CI/CD (ví dụ: GitHub Actions tự host, GitLab Runner, VPS Linux)?
> 2. Có cần hỗ trợ ký số (Code Signing) cho bản cài đặt Windows trong quá trình build Docker không? (Nếu có, cần cấu hình thêm các biến môi trường để truyền chứng chỉ ký số vào).

---

## Tech Stack & Rationale

1. **Docker Base Image:** `electronuserland/builder:20-wine` hoặc `node:22-bullseye` làm nền tảng.
   - *Lý do:* `electronuserland/builder` là Docker image chính thức và tối ưu nhất cho `electron-builder`. Nó đã cài sẵn Wine và các thư viện hệ thống cần thiết để đóng gói cho Windows từ Linux. Chúng ta chỉ cần cài đặt thêm Go compiler vào image này.
2. **Go SDK (>= 1.24):** Cần thiết để build bridge E2EE (Go) thông qua lệnh `go build`.
3. **Cross-compilation Environment:** Cấu hình biến môi trường `GOOS` và `GOARCH` để Go biên dịch ra đúng định dạng binary cho từng nền tảng trước khi `electron-builder` đóng gói.

---

## File Structure Proposed

```bash
deplao/
├── docker/
│   └── Dockerfile.build        # Dockerfile chứa môi trường build (Node, Go, Wine, GCC)
├── scripts/
│   └── build-bridge-e2ee.js   # [MODIFY] Cập nhật để hỗ trợ tham số TARGET_OS khi cross-compile
├── docker-build.sh            # Script Shell chạy trên máy host để kích hoạt Docker container build
└── docker-build-pack.md       # File kế hoạch này
```

---

## Task Breakdown

### Phase 1: Analysis & Script Customization (Go Bridge Cross-compile)

#### Task 1.1: Cập nhật script build Go bridge để hỗ trợ Cross-compilation
- **Agent:** `devops-engineer`
- **Skills:** `clean-code`, `javascript`
- **Priority:** P0
- **Dependencies:** None
- **INPUT:** [build-bridge-e2ee.js](file:///Users/kimtrungduong/Downloads/deplao/scripts/build-bridge-e2ee.js)
- **OUTPUT:** File `scripts/build-bridge-e2ee.js` được chỉnh sửa để chấp nhận biến môi trường `TARGET_OS` và `TARGET_ARCH`. Nếu các biến này được định nghĩa, nó sẽ đặt tên file output là `.exe` (đối với windows) hoặc binary không đuôi (đối với linux) và truyền đúng `GOOS` / `GOARCH` vào câu lệnh `go build`.
- **VERIFY:** 
  Chạy thử nghiệm trên máy local:
  ```bash
  TARGET_OS=windows TARGET_ARCH=amd64 node scripts/build-bridge-e2ee.js
  ```
  Kiểm tra xem thư mục `src/bridge-e2ee/build/` có tạo ra file `fbchat-bridge-e2ee.exe` hay không.

---

### Phase 2: Docker Environment Setup

#### Task 2.1: Tạo Dockerfile cho môi trường Build
- **Agent:** `devops-engineer`
- **Skills:** `bash-linux`
- **Priority:** P1
- **Dependencies:** Task 1.1
- **INPUT:** Yêu cầu cài đặt Node.js 22 + Go >= 1.24 + Wine + gcc/g++.
- **OUTPUT:** File [Dockerfile.build](file:///Users/kimtrungduong/Downloads/deplao/docker/Dockerfile.build) mới.
- **VERIFY:**
  Tạo thư mục `docker` và build thử image:
  ```bash
  docker build -t zagi-builder -f docker/Dockerfile.build .
  ```
  Kiểm tra xem các công cụ đã cài đặt thành công trong image chưa:
  ```bash
  docker run --rm zagi-builder node -v
  docker run --rm zagi-builder go version
  docker run --rm zagi-builder wine --version
  ```

---

### Phase 3: Integration & Automation Script

#### Task 3.1: Tạo shell script docker-build.sh điều phối
- **Agent:** `devops-engineer`
- **Skills:** `bash-linux`
- **Priority:** P1
- **Dependencies:** Task 2.1
- **INPUT:** Quy trình build thủ công các nền tảng.
- **OUTPUT:** File `docker-build.sh` ở thư mục gốc.
- **VERIFY:** Chạy thử `./docker-build.sh` trên máy host. Script này sẽ thực hiện các bước sau trong container:
  1. Chạy `npm ci --legacy-peer-deps` để cài node_modules.
  2. Biên dịch Go bridge cho Windows: `TARGET_OS=windows node scripts/build-bridge-e2ee.js`.
  3. Đóng gói app Windows: `npx electron-builder --win --x64 --publish never`.
  4. Biên dịch Go bridge cho Linux: `TARGET_OS=linux node scripts/build-bridge-e2ee.js`.
  5. Đóng gói app Linux: `npx electron-builder --linux --x64 --publish never`.
  Kiểm tra xem các file kết quả cuối cùng có xuất hiện ở thư mục `dist-electron-build/` trên máy host hay không.

---

## Phase X: Verification Checklist

### Automated & Manual Verification Steps

#### 1. Kiểm tra build thành công
Chạy script tự động hóa và đảm bảo không có lỗi biên dịch nào xảy ra:
```bash
chmod +x docker-build.sh
./docker-build.sh
```

#### 2. Kiểm tra tính toàn vẹn của sản phẩm build (Output verification)
Kiểm tra thư mục `dist-electron-build/` xem có chứa:
- [ ] File cài đặt Windows: `Zagi-Setup-*.exe`
- [ ] File cài đặt Linux Debian: `zagi_*_amd64.deb`
- [ ] File chạy nhanh Linux: `Zagi-*.AppImage`

#### 3. Chạy thử nghiệm sản phẩm cài đặt trên máy ảo hoặc máy vật lý tương ứng
- [ ] Cài đặt file `.exe` trên máy Windows để đảm bảo ứng dụng khởi động và chạy được tính năng E2EE bridge (Go) hoạt động bình thường.
- [ ] Chạy file `.AppImage` trên máy Linux (Ubuntu) để kiểm tra tính tương thích.

---

## ✅ PHASE X COMPLETE
- Build: ⏳ Waiting
- Date: 2026-06-26
