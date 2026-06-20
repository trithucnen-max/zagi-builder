# Zagi
*Website giới thiệu*:  https://zagi.app/

<p>
  <strong>🌐 Language:</strong>
  &nbsp;🇻🇳 <strong>Tiếng Việt</strong>
  &nbsp;|&nbsp;
  🇬🇧 <a href="./README.en.md">English</a>
</p>


---

> Phần mềm desktop quản lý Zalo & Facebook cá nhân Đa tài khoản tích hợp CRM, ERP, POS, Workflow và AI Assistant giúp đội nhóm bán hàng, chăm sóc khách hàng và marketing trên Zalo và Facebook vận hành tập trung trong một ứng dụng duy nhất.

[![Version](https://img.shields.io/github/v/release/babyvibe/deplao-builder?label=version&color=22c55e)](https://github.com/babyvibe/deplao-builder/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/babyvibe/deplao-builder/total?color=22c55e&label=downloads)](https://github.com/babyvibe/deplao-builder/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-3b82f6)](#-runtime-requirements)
[![Electron](https://img.shields.io/badge/Electron-41-47848f?logo=electron&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](#)
[![SQLite](https://img.shields.io/badge/SQLite-local--first-003b57?logo=sqlite&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](#)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](#giấy-phép)
[![Support](https://img.shields.io/badge/support-GitHub_Issues-0ea5e9)](https://github.com/babyvibe/deplao-builder/issues)


<p align="center">
  <a href="#-tải-xuống">📥 Tải xuống</a> &nbsp;|&nbsp;
  <a href="#-công-nghệ-ngôn-ngữ-sử-dụng">🛠️ Công nghệ</a> &nbsp;|&nbsp;
  <a href="#cài-đặt">📦 Cài đặt</a> &nbsp;|&nbsp;
  <a href="#-các-nhóm-tính-năng-chính">✨ Tính năng</a> &nbsp;|&nbsp;
  <a href="#-bảo-mật-dữ-liệu">🔒 Bảo mật</a> &nbsp;|&nbsp;
  <a href="#-giấy-phép">📝 MIT</a> &nbsp;|&nbsp;
  <a href="#-liên-hệ">📞 Liên hệ</a>
</p>

---

## ⬇️ Tải xuống

<table>
<tr>
<td align="center" width="50%">

<a href="https://github.com/babyvibe/deplao-builder/releases/latest/download/Zagi-Setup-27.1.0.exe">
<img src="https://img.shields.io/badge/🪟_Windows_10/11-v27.1.0-0078d4?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows" />
</a>

<big><strong>Zagi-Setup-27.1.0.exe</strong></big>

</td>
<td align="center" width="50%">

<a href="https://github.com/babyvibe/deplao-builder/releases/latest/download/Zagi-27.1.0-arm64.dmg">
<img src="https://img.shields.io/badge/🍎_macOS_M1+-v27.1.0-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS Apple Silicon" />
</a>

<big><strong>Zagi-27.1.0-arm64.dmg</strong></big>

</td>
</tr>
<tr>
<td align="center" width="50%">

<a href="https://github.com/babyvibe/deplao-builder/releases/latest/download/Zagi-27.1.0.AppImage">
<img src="https://img.shields.io/badge/🐧_Ubuntu_Linux-v27.1.0-e95420?style=for-the-badge&logo=ubuntu&logoColor=white" alt="Download Ubuntu" />
</a>

<big><strong>Zagi-27.1.0.AppImage</strong></big><br>
<big>chạy mọi distro — <code>chmod +x</code> là dùng được</big>

</td>
<td align="center" width="50%">

<a href="https://github.com/babyvibe/deplao-builder/releases/latest/download/Zagi-27.1.0.dmg">
<img src="https://img.shields.io/badge/🍎_macOS_Intel-v27.1.0-555555?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS Intel" />
</a>

<big><strong>Zagi-27.1.0.dmg</strong></big>

</td>
</tr>
</table>

<p align="center">
👉 <strong><a href="https://github.com/babyvibe/deplao-builder/releases">Xem tất cả phiên bản</a></strong>
</p>

<details>
<summary>⚠️ Lưu ý khi mở file cài đặt (bị chặn bởi Windows / macOS / Linux)</summary>

Do Zagi chưa được ký chứng chỉ (code signing) - nói thẳng ra là nghèo, nên hệ điều hành có thể hiển thị cảnh báo khi mở file. Bạn có thể làm theo hướng dẫn dưới đây:

---

### 🪟 Windows (.exe)

Khi mở file `.exe`, Windows có thể hiển thị cảnh báo **"Windows protected your PC"**:

👉 Cách xử lý:
1. Nhấn **More info**
2. Chọn **Run anyway**

---

### 🍎 macOS (.dmg)

Khi mở file `.dmg`, macOS có thể báo **"cannot be opened because it is from an unidentified developer"**

👉 Cách xử lý:

**Cách 1:**
- Chuột phải vào file → chọn **Open**
- Nhấn **Open** lần nữa

**Cách 2 (nếu vẫn bị chặn):**
1. Vào **System Settings → Privacy & Security**
2. Kéo xuống phần Security
3. Nhấn **Open Anyway**

---

### 🐧 Ubuntu Linux (.AppImage)

Sau khi tải file `.AppImage`:

```bash
chmod +x Zagi-*.AppImage
./Zagi-*.AppImage
```

> Nếu gặp lỗi "FUSE: fuse2 not available", cài `libfuse2`:
> ```bash
> sudo apt install libfuse2
> ```

Hoặc cài bản `.deb`:
```bash
sudo dpkg -i Zagi_*_amd64.deb
```

</details>

<p align="center">
  <img src="./assets/deplao-overview-map.svg" alt="Sơ đồ trực quan mô tả Zagi là workspace desktop tập trung cho bán hàng và chăm sóc khách hàng trên Zalo" width="960" />
</p>

## 🛠️ Công nghệ & ngôn ngữ sử dụng

Zagi hiện được xây dựng trên các công nghệ chính sau:

- **Thư viện chính:** zca-js & fbchat-v2
- **AI Gateway:** 9router
- **Ngôn ngữ:** TypeScript, JavaScript, SQL, HTML, CSS
- **Ứng dụng desktop:** Electron, React, Vite
- **Giao diện:** Tailwind CSS, PostCSS, React Router
- **Lưu trữ dữ liệu cục bộ:** SQLite qua `better-sqlite3`
- **State & UI chuyên biệt:** Zustand, React Flow, Recharts, Quill
- **Backend dịch vụ:** Node.js + Express
- **Tích hợp & automation:** Axios, Google APIs / Google Sheets, node-cron, Discord.js, Telegram Bot API, OpenAI API, v.v.

---


## Cài đặt

<details open>
<summary>🛠️ Tự build từ source</summary>

### Yêu cầu

- Windows 10/11, macOS (Apple Silicon), hoặc Ubuntu 20.04+
- Node.js 18+ khuyến nghị
- npm 9+

### Cài đặt

```powershell
npm install --legacy-peer-deps
```

### Chạy development

```powershell
npm run dev
```

### Build app

```powershell
npm run production
```

### Dữ liệu cục bộ

- Dữ liệu app dùng SQLite cục bộ
- Có thể đổi thư mục lưu trữ trong phần `Cài đặt`

</details>

## 🗺️ Sơ đồ kiến trúc & luồng hoạt động

---

### 1️⃣ Luồng Build

```mermaid
flowchart LR
    subgraph SRC["📁 Source Code"]
        E("⚡ electron/\n*.ts")
        S("🔧 services/\n*.ts")
        R("🎨 src/ui/\n*.tsx")
    end

    subgraph COMPILE["🔨 Compile"]
        TSC("tsc\ntsconfig.electron")
        VITE("vite build\n+ Tailwind CSS")
    end

    subgraph OUT["📦 Output"]
        DE("dist-electron/\nmain · services · ipc")
        D("dist/\nindex.html · assets")
    end

    subgraph PKG["🚀 Đóng gói"]
        EB(("electron\nbuilder"))
        WIN("🪟 Windows\n.exe / dir")
        MAC("🍎 macOS\n.dmg arm64")
        LIN("🐧 Linux\n.AppImage · .deb")
    end

    E & S --> TSC --> DE
    R --> VITE --> D
    DE & D --> EB --> WIN & MAC & LIN
```

---

### 2️⃣ Kiến trúc Runtime

```mermaid
mindmap
  root((🖥️ Zagi))
    ⚙️ Main Process
      📡 IPC Handlers
        login · zalo · crm
        workflow · erp · sync
        facebook · relay · file
      🔧 Services
        DatabaseService
        WorkspaceManager
        WorkflowEngine
        CRMQueueService
        HttpConnectionManager
        FileStorageService
        AIAssistantService
    🎨 Renderer
      ⚛️ React Pages
        Dashboard
        Chat & Inbox
        CRM & Campaign
        Workflow Editor
        POS & Tích hợp
        ERP · Settings
      🗃️ Zustand State
        accountStore
        chatStore
        workspaceStore
        employeeStore
    📱 Giao thức Zalo
      zca-js
        QR Login
        Cookie Session
        WebSocket realtime
    🌐 External APIs
      OpenAI · Google Sheets
      Telegram · Discord
      KiotViet · Haravan · Sapo
      GHN · GHTK
```

---

### 3️⃣ Mô hình Boss ↔ Nhân viên

```mermaid
flowchart TB
    subgraph BOSS["🖥️ Máy BOSS — Local Workspace"]
        BZ("📱 Zalo / FB\nAccounts")
        BSV("🔧 Services\nCRM · ERP · AI · Workflow")
        BSD[("🗄️ SQLite DB\n+ Media Files")]
        BRL("🔁 Relay Server\nExpress + WebSocket :9900")
    end

    subgraph NET["🌐 Kết nối"]
        LAN("🏠 LAN\n192.168.x.x:9900")
        WAN("🌍 Tunnel / VPN\ntruy cập từ xa")
    end

    subgraph EMP["💻 Nhân Viên — Remote Workspace"]
        EA("📲 Zagi App\nEmployee Mode")
        EP("🔐 Permission Filter\nerp · crm · workflow · ...")
        EU("👁️ UI\nchỉ thấy TK được gán")
    end

    BZ --> BSV
    BSV <--> BSD
    BSV --> BRL
    BRL <-->|HTTP + WS| LAN & WAN
    LAN <-->|IPC relay| EA
    WAN <-->|IPC relay| EA
    EA --> EP --> EU
    EP -.->|forward request| BRL
```

> Nhân viên vẫn có **workspace riêng** (DB, media) trên máy. Do Zalo chỉ cho phép 1 kết nối cùng lúc, mọi request Zalo được **relay về Boss** để xử lý theo quyền đã cấp.

---

### 4️⃣ Đa tài khoản & Lưu trữ

```mermaid
flowchart LR
    subgraph ACCS["👤 Tài khoản"]
        Z1("Zalo #1\nzca-js")
        Z2("Zalo #2\nzca-js")
        ZN("Zalo #N\nzca-js")
        FB("Facebook\nGraph API")
    end

    subgraph STORE["💾 Lưu trữ cục bộ"]
        DB[("🗄️ SQLite\nzagi-tool.db\nmessages · contacts\ncrm · workflow · erp")]
        MED("📁 FileStorage\n~/media/\nảnh · video · file")
        ES("🔑 electron-store\ncookies · tokens\nsettings")
    end

    subgraph WS["🗂️ Workspace Manager"]
        WA("🏠 Local WS\nDefault")
        WB("🌐 Remote WS\nBoss")
        WC("⚙️ Custom WS\npath tuỳ chỉnh")
    end

    Z1 & Z2 & ZN & FB -->|"tin nhắn · danh bạ"| DB
    Z1 & Z2 & ZN & FB -->|"ảnh · video · file"| MED
    ES -->|"cookie session"| Z1 & Z2 & ZN
    DB & ES <-->|"path resolve\nswitch workspace"| WS
    WA & WB & WC -.-|"mỗi WS = DB riêng"| DB
```

> Mỗi **Workspace** có DB + media folder độc lập — đổi hoặc di chuyển sang ổ đĩa khác không mất dữ liệu.

---


## 🚀 Zagi là gì?


Nếu nhìn nhanh, có thể hiểu Zagi là:

- **trung tâm vận hành Zalo**: nhiều tài khoản, inbox tập trung, trả lời nhanh
- **lớp quản lý khách hàng**: CRM, nhãn, lịch sử tương tác, campaign
- **lớp tự động hóa**: workflow, AI (bao gồm trợ lý viết nội dung chiến dịch), trigger và action chạy nền
- **lớp kết nối kinh doanh**: POS, vận chuyển, API và công cụ ngoài
- **lớp quản trị nội bộ**: báo cáo, ERP, phân quyền, workspace nhân viên


## ✨ Điểm nổi bật

- 👤 **Đa tài khoản Zalo** — đăng nhập không giới hạn tài khoản, chuyển đổi qua lại nhanh
- 💬 **Hộp thư tập trung** — chế độ gộp tài khoản giúp gom và xử lý hội thoại từ nhiều tài khoản trong một giao diện duy nhất
- 👥 **CRM & Campaign** — quản lý liên hệ, nhãn, ghi chú nội bộ, chăm sóc khách cũ. Quét thành viên nhóm ẩn, nhóm chưa tham gia để tìm khách mới.
- ⚙️ **Workflow tự động hóa** — kéo-thả Trigger → Node → Action hoặc dùng AI tạo quy trình, chạy nền 24/7 không cần code
- 🤖 **AI Assistant** — hỗ trợ gợi ý câu trả lời, chat trực tiếp trong hội thoại. Phân loại tin nhắn, trả lời khách hàng 24/7. Tích hợp trực tiếp trợ lý viết nội dung chiến dịch CRM.
- 🔗 **Tích hợp ngoài** — POS, vận chuyển, thanh toán, Google Sheets, Telegram, Discord, Email, HTTP Request... Kết hợp sử dụng khi chat hoặc workflow
- 📈 **Báo cáo & phân tích** — theo dõi tin nhắn, liên hệ, nhãn, nhân viên, chiến dịch, workflow, AI.
- 🗂️ **ERP nội bộ** — task, lịch làm việc, notes và phối hợp vận hành nội bộ ngay trong cùng hệ thống
- 🧑‍💼 **Workspace boss ↔ nhân viên** — kết nối qua **LAN hoặc WAN** (Cloudflare Tunnel), phân quyền chi tiết và theo dõi hiệu suất từng nhân viên
- 🔒 **Proxy per-account** — gán Proxy riêng cho từng tài khoản Zalo trước khi đăng nhập
- 🔐 **Dữ liệu lưu cục bộ** — ưu tiên quyền kiểm soát dữ liệu và bảo mật trên máy người dùng


### Xem nhanh giao diện Zagi

Các màn hình dưới đây được sắp theo luồng sử dụng thực tế: từ dashboard → chat → CRM → workflow → POS / báo cáo / ERP.

<table>
  <tr>
    <td>
      <img src="./assets/dashboard.png" alt="Dashboard quản lý đa tài khoản Zalo trong Zagi" width="360" />
      <br />
      <sub><strong>Dashboard đa tài khoản</strong></sub>
    </td>
    <td>
      <img src="./assets/chat.png" alt="Giao diện chat tập trung trong Zagi" width="360" />
      <br />
      <sub><strong>Chat tập trung tích hợp AI gợi ý trả lời</strong></sub>
    </td>
    <td>
      <img src="./assets/crm.png" alt="Màn hình CRM và quản lý liên hệ trong Zagi" width="360" />
      <br />
      <sub><strong>CRM & liên hệ</strong></sub>
    </td>
  </tr>
  <tr>
    <td>
      <img src="./assets/scan-members-group.png" alt="Quét thành viên nhóm Zalo trong Zagi" width="360" />
      <br />
      <sub><strong>Quét thành viên nhóm</strong></sub>
    </td>
    <td>
      <img src="./assets/campaign.png" alt="Chiến dịch gửi tin hàng loạt trong Zagi" width="360" />
      <br />
      <sub><strong>Chiến dịch gửi tin hàng loạt</strong></sub>
    </td>
    <td>
      <img src="./assets/workflow.png" alt="Trình thiết kế workflow kéo thả trong Zagi" width="360" />
      <br />
      <sub><strong>Workflow editor</strong></sub>
    </td>
  </tr>
  <tr>
    <td>
      <img src="./assets/detail-workflow.png" alt="Chi tiết cấu hình workflow trong Zagi" width="360" />
      <br />
      <sub><strong>Chi tiết workflow</strong></sub>
    </td>
    <td>
      <img src="./assets/workflow-ai.png" alt="Workflow kết hợp AI trong Zagi" width="360" />
      <br />
      <sub><strong>Ra lệnh tạo Workflow bằng AI</strong></sub>
    </td>
    <td>
      <img src="./assets/pos.png" alt="Tích hợp POS và bán hàng trong Zagi" width="360" />
      <br />
      <sub><strong>Tích hợp POS, VC, Thanh toán</strong></sub>
    </td>
  </tr>
  <tr>
    <td>
      <img src="./assets/report.jpg" alt="Báo cáo và phân tích hiệu suất trong Zagi" width="360" />
      <br />
      <sub><strong>Báo cáo & phân tích</strong></sub>
    </td>
    <td>
      <img src="./assets/report-employee.png" alt="Báo cáo hiệu suất nhân viên trong Zagi" width="360" />
      <br />
      <sub><strong>Báo cáo nhân viên</strong></sub>
    </td>
    <td>
      <img src="./assets/erp.png" alt="ERP nội bộ và phối hợp vận hành trong Zagi" width="360" />
      <br />
      <sub><strong>ERP nội bộ</strong></sub>
    </td>
  </tr>
</table>

## 🎯 Phù hợp với ai?

Zagi phù hợp cho:

- shop online và đội ngũ chốt đơn qua Zalo
- doanh nghiệp SME cần nhiều nhân viên xử lý inbox cùng lúc
- marketing agency hoặc freelancer quản lý nhiều tài khoản khách hàng
- spa, phòng khám, giáo dục, F&B và các mô hình cần chăm sóc khách hàng định kỳ
- đội nhóm muốn kết hợp chat, CRM, workflow, AI và ERP trong một desktop app duy nhất

## 🧩 Các nhóm tính năng chính

### 1) Quản lý đa tài khoản & inbox tập trung
- đăng nhập nhiều tài khoản Zalo bằng QR Code, Facebook bằng tài khoản hoặc cookie
- dashboard quản lý tài khoản trực quan
- gộp nhiều tài khoản vào một inbox hợp nhất
- tìm kiếm theo tên, biệt danh, số điện thoại
- lọc nhanh theo chưa đọc, chưa trả lời, nhãn và trạng thái hội thoại
- **proxy per-account**: gán Proxy riêng cho từng tài khoản Zalo

### 2) Chat đầy đủ tính năng
- gửi tin nhắn văn bản, ảnh, video, file
- emoji, sticker, reply, tag thành viên
- poll, ghi chú nhóm, nhắc nhở, gửi danh thiếp
- quick messages để lưu mẫu tin và gọi nhanh bằng từ khóa
- ghim tin nhắn không giới hạn, quản lý media và file đính kèm

### 3) CRM & chăm sóc khách hàng
- đồng bộ bạn bè, thành viên nhóm và hồ sơ liên hệ
- lưu số điện thoại, giới tính, ngày sinh, ghi chú nội bộ
- tạo và quản lý nhãn Zalo hai chiều
- lọc liên hệ theo nhiều tiêu chí để chăm sóc đúng nhóm khách hàng
- tạo campaign gửi tin, kết bạn, mời vào nhóm với tiến độ realtime

### 4) Workflow tự động hóa
- workflow kéo-thả không cần code
- tích hợp trợ lý AI tạo node và workflow bằng câu lệnh (xem mục 7)
- hỗ trợ trigger từ tin nhắn, nhãn, react, lịch cron, sự kiện nhóm...
- action gửi tin, gửi ảnh/file, tìm user, quản lý nhóm, mute, forward, recall...
- tích hợp logic, Google Sheets, AI, Telegram, Discord, Email, Notion và HTTP Request
- có lịch sử chạy để kiểm tra và debug dễ dàng

### 5) Tích hợp phục vụ bán hàng
- POS: KiotViet, Haravan, Sapo, Nhanh.vn, Pancake POS
- vận chuyển: GHN, GHTK
- AI Assistant gợi ý trả lời, hỏi đáp trực tiếp trong hội thoại (xem mục 7)
- dễ kết hợp thành quy trình bán hàng và chăm sóc khách hàng khép kín

### 6) Báo cáo, ERP và nhân viên
- báo cáo tin nhắn, liên hệ, chiến dịch, workflow, AI, nhân viên
- ERP nội bộ gồm Task, Calendar, Notes
- mô hình boss ↔ nhân viên và phân quyền module
- hỗ trợ theo dõi hiệu suất làm việc theo từng người và từng giai đoạn

### 7) 🤖 Trợ lý AI (AI Assistant)
- gợi ý trả lời thông minh trong hội thoại Zalo và Facebook
- hỏi đáp trực tiếp với AI ngay trong khung chat
- tạo workflow tự động bằng câu lệnh tiếng Việt mà không cần kéo-thả
- dùng node AI trong workflow để xây dựng chatbot trả lời tự động 24/7
- hỗ trợ đa nền tảng AI: OpenAI, Claude, Gemini và 9router (AI gateway local)

## 🔒 Bảo mật & dữ liệu

Zagi ưu tiên kiến trúc chạy cục bộ trên máy người dùng:

- tất cả dữ liệu tin nhắn, danh bạ, CRM, cài đặt và media được lưu trên máy
- đăng nhập bằng QR Code, không yêu cầu lưu mật khẩu Zalo, Cookie được mã hóa lưu trên máy
- người dùng có thể đổi thư mục lưu trữ dữ liệu sang ổ đĩa khác khi cần
- phù hợp với đội nhóm muốn kiểm soát dữ liệu nội bộ chặt chẽ hơn

## 💻 Yêu cầu vận hành

- kết nối Internet 24/7 ổn định để đồng bộ hội thoại và automation
- nên để app hoạt động liên tục nếu dùng workflow hoặc vận hành đội nhóm


---------------------------------------------------------------------------------------------------------------------------------------------

## 📋 Changelog

<details>
<summary><strong>v27.1.0</strong> — 2026-06-20 · <em>Phiên bản hiện tại</em></summary>

### 🚀 Nâng cấp nổi bật

- 🎨 Cải tiến toàn bộ giao diện CRM — danh sách liên hệ, bộ lọc và quản lý nhãn được thiết kế lại
- ⚡ Tối ưu hiệu suất render danh sách liên hệ lớn (>10,000 contacts)
- 🤖 Cải thiện AI Assistant — độ chính xác gợi ý trả lời tốt hơn

### ✨ Tính năng mới

- **CRM nâng cao**: Bộ lọc liên hệ đa tiêu chí với giao diện sidebar mới
- **Bulk actions**: Chọn nhiều liên hệ và thực hiện hành động hàng loạt
- **Export nâng cao**: Xuất dữ liệu CRM ra Excel với format chuẩn

### ⚡ Cải thiện

- Tăng tốc tải danh sách liên hệ 3x so với phiên bản trước
- Cải thiện bộ nhớ khi làm việc với nhiều tài khoản đồng thời
- UI responsive tốt hơn trên màn hình nhỏ

### 🐛 Sửa lỗi

- Sửa lỗi tìm kiếm liên hệ không trả kết quả khi nhập số điện thoại có dấu cách
- Sửa lỗi nhãn không cập nhật realtime khi thay đổi từ màn hình chat

</details>

<details>
<summary><strong>v26.6.4</strong> — 2026-06-20</summary>

### 🚀 Nâng cấp nổi bật

- 👤 Tự động refresh avatar Zalo khi khởi động
- ✏️ Facebook E2EE hỗ trợ xem lịch sử chỉnh sửa tin nhắn
- 📞 Gợi ý gửi danh thiếp Zalo từ số điện thoại trong khung chat
- 🖼️ Danh thiếp Zalo hỗ trợ kết bạn nhanh
- 🚫 Facebook hiển thị đúng thông báo hệ thống
- ℹ️ Tự động lấy tên và avatar khi mở hội thoại mới
- 👤 Boss - nhân viên tải dữ liệu, gửi tin nhắn tối ưu hơn

### ⚡ Cải thiện

- Tự động fetch thông tin người dùng trên Zalo & Facebook
- Cải thiện trải nghiệm danh thiếp Zalo
- Tối ưu đồng bộ alias và danh bạ
- Hiển thị admin message Facebook dưới dạng thông báo hệ thống
- Tăng tốc tải dữ liệu khi mở hội thoại từ deep link

### 🐛 Sửa lỗi

- Sửa một số trường hợp avatar và tên người dùng không cập nhật
- Sửa lỗi hiển thị "Unknown" ở hội thoại mới
- Sửa các vấn đề liên quan đến đồng bộ alias và dữ liệu hội thoại

</details>

<details>
<summary><strong>v26.6.3</strong> — 2026-06-17</summary>

### 🚀 Nâng cấp nổi bật

- 🐧 Hỗ trợ Ubuntu/Linux (.AppImage + .deb) với CI/CD build tự động
- 📡 Facebook ổn định hơn với cơ chế tự động reconnect khi mất kết nối
- 🤖 Workflow Zalo & Facebook hỗ trợ gửi tin nhắn đến nhiều hội thoại cùng lúc
- 📹 Xem video Facebook trực tiếp trong khung chat
- 📤 Zalo nhân viên tự động upload ảnh, video và voice lên boss trước khi proxy

### ⚡ Cải thiện

- Facebook tự động reconnect khi mất kết nối
- Thêm timeout guard 15 giây, tránh treo giao diện khi gửi tin nhắn
- Tối ưu cơ chế gửi tin nhắn Facebook (E2EE Bridge, MQTT, REST fallback)
- Workflow Facebook hỗ trợ gửi text và ảnh đến nhiều hội thoại
- Workflow Zalo hỗ trợ gửi tin nhắn, ảnh và file đến nhiều hội thoại
- Phát hiện và cảnh báo workflow bị loop (cycle)

### 🐛 Sửa lỗi

- Sửa lỗi gửi tin nhắn Facebook 1:1 trong một số trường hợp E2EE
- Sửa lỗi timeout kết nối E2EE Bridge quá lâu
- Sửa lỗi hiển thị video giữa Facebook và Zalo

</details>

<details>
<summary><strong>v26.6.2</strong> — 2026-06-16</summary>

### ✨ Tính năng mới

- 🔐 Đăng nhập Facebook bằng tài khoản + mật khẩu + 2FA (không cần lấy cookie thủ công)
- 🔔 Thông báo riêng cho từng tài khoản (âm thanh và thông báo góc màn hình)
- 🤖 AI Assistant hỗ trợ OpenRouter

### ⚡ Cải thiện

- Kết nối Facebook ổn định hơn — giảm tình trạng mất kết nối

### 🐛 Sửa lỗi

- Sửa lỗi một số model AI Free trên 9Router không thể kết nối
- Sửa lỗi node Chuyển tiếp Zalo không chuyển tiếp được tin nhắn và hình ảnh
- Sửa lỗi tài khoản đã xoá vẫn còn kết nối ngầm
- Sửa lỗi kết nối Sapo

</details>

<details>
<summary><strong>v26.6.1</strong> — 2026-06-14</summary>

### 🐛 HOT Fixes

- Sửa lỗi production build không đóng gói E2EE Bridge Binary
- Script production tự động build E2EE Bridge trước khi đóng gói ứng dụng

</details>

<details>
<summary><strong>v26.6.0</strong> — 2026-06-14</summary>

### 🚀 Highlights

- 🤖 Tích hợp Facebook Messenger E2EE (đọc/gửi tin nhắn mã hoá đầu cuối)
- 📊 CRM Quét dữ liệu Facebook (nhóm, fanpage, bài viết, thành viên, bình luận)
- ⚡ Workflow Facebook với nhiều Trigger & Action
- 🤖 Tích hợp 9Router AI Gateway

</details>

<details>
<summary><strong>v26.4.8</strong> — 2026-06-07</summary>

### 🚀 Cải thiện

- Kết nối Boss ↔ Nhân viên ổn định hơn — tự động phát hiện mất kết nối ngầm và khôi phục
- Fallback qua LAN khi WAN/tunnel gặp sự cố
- Đồng bộ realtime nhãn, ghim tin, tin nhắn nhanh, chiến dịch CRM và ghi chú liên hệ

### 🐛 Sửa lỗi

- Sửa lỗi workflow không thực thi đúng khi trigger là "Lời mời kết bạn"
- Sửa lỗi tin nhắn ghim không đồng bộ giữa boss và nhân viên

</details>

<details>
<summary><strong>v26.4.5 → v26.4.7</strong> — 2026-06-04 đến 06-06</summary>

### ✨ Tính năng nổi bật trong giai đoạn này

- 🔒 Khoá màn hình (Ctrl+Shift+L) với Recovery Key
- ☑️ Chọn nhiều tin nhắn và chuyển tiếp hàng loạt
- 🖼️ Tự động sửa ảnh lỗi (trắng, 0 byte)
- Chiến dịch CRM: mode chọn đối tượng theo UID
- Tự động refresh alias nền mỗi 24 giờ
- Health check workspace từ xa mỗi 60 giây

</details>

<details>
<summary><strong>v26.4.0 → v26.4.4</strong> — 2026-05-20 đến 06-01</summary>

### 🎉 Ra mắt chính thức Zagi

Phiên bản đầu tiên với đầy đủ tính năng:
- Đa tài khoản Zalo & inbox hợp nhất
- CRM, Campaign, Workflow automation
- AI Assistant (OpenAI, Claude, Gemini, 9Router)
- POS, vận chuyển, tích hợp ngoài
- ERP nội bộ & mô hình Boss ↔ Nhân viên
- Báo cáo & phân tích toàn diện

</details>

👉 **[Xem toàn bộ releases trên GitHub](https://github.com/babyvibe/deplao-builder/releases)**

---------------------------------------------------------------------------------------------------------------------------------------------

## 📣 Liên hệ

- Báo lỗi, góp ý hoặc cần hỗ trợ: 👉 [Tạo issue tại đây](https://github.com/babyvibe/deplao-builder/issues)

## 🙏 Lời cảm ơn

Zagi xin gửi lời cảm ơn đến dự án:  
👉 https://github.com/RFS-ADRENO/zca-js
👉 https://github.com/m008v/fbchat-v2
Nhờ những đóng góp và nền tảng từ dự án này 💙

---

## 📝 Giấy phép

Dự án được phân phối dưới giấy phép **MIT**.  
Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

---

