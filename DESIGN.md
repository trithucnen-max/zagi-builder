# Zagi Design System Specification

## Visual Direction
Zagi UI adheres to a sleek, dark-first enterprise desktop application aesthetic (inspired by Linear and Raycast). Utilitarian, uncluttered, high-contrast, with zero visual slop and no default purple gradients.

---

## Token Architecture

### Colors
- **Background Root**: `#0f172a` (Slate-900)
- **Background Sidebar / Surfaces**: `#1e293b` (Slate-800 / gray-850)
- **Surface Elevation**: `#334155` (Slate-700)
- **Borders & Dividers**: `rgba(255, 255, 255, 0.08)` to `#374151` (Gray-700)
- **Text Primary**: `#f8fafc` (Slate-50)
- **Text Secondary**: `#94a3b8` (Slate-400)
- **Accent Active**: `#3b82f6` (Blue-500) / `#60a5fa` (Blue-400)
- **Success / Online**: `#10b981` (Emerald-500)
- **Warning / Jitter**: `#f59e0b` (Amber-500)
- **Destructive / Revoke**: `#ef4444` (Rose-500)

### Typography
- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Sizes**:
  - `text-xs`: 11px - 12px (Labels, badges, timestamps)
  - `text-sm`: 13px - 14px (Body text, button labels, table cells)
  - `text-base`: 15px - 16px (Section headers, dialog titles)
  - `text-lg`: 18px (Page titles)

### Component Patterns
- **Buttons**:
  - Primary: `bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3.5 py-1.5 font-medium shadow-sm transition-colors`
  - Secondary/Outline: `border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-lg px-3 py-1.5 font-medium transition-colors`
  - Danger: `text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-md p-1.5 transition-colors`
- **Cards & Containers**:
  - `bg-gray-900/60 border border-gray-700/60 rounded-xl p-4 shadow-sm`
- **Badges**:
  - Active: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-xs font-medium`
  - Revoked: `bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full text-xs font-medium`
  - Scope: `bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-md text-xs font-mono`
