# AGENTS.md — Zagi Project

## OpenWiki Documentation

Project này có documentation agent-friendly trong `openwiki/`. Đọc trước khi bắt đầu làm việc:

- **[openwiki/README.md](./openwiki/README.md)** — project overview, tech stack, workspace model
- **[openwiki/patterns.md](./openwiki/patterns.md)** — ⚠️ conventions, known bugs, anti-patterns (ĐỌC TRƯỚC)
- **[openwiki/architecture.md](./openwiki/architecture.md)** — system design, Boss/Nhân viên architecture
- **[openwiki/services.md](./openwiki/services.md)** — service layer reference với gotchas
- **[openwiki/data-flow.md](./openwiki/data-flow.md)** — luồng event Zalo → workflow → action
- **[openwiki/ipc.md](./openwiki/ipc.md)** — IPC channels đầy đủ với params
- **[openwiki/ui.md](./openwiki/ui.md)** — Zustand stores, components, patterns
- **[openwiki/database.md](./openwiki/database.md)** — schema, query patterns, gotchas

Khi nghi ngờ về cách hoạt động của bất kỳ thứ gì, kiểm tra openwiki/ trước khi đọc source code.
