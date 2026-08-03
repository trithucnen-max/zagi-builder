// tailwind.config.js — ZAGI DESKTOP v27.2.9
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand & Primary
        'blue-primary': '#0068FF',
        'blue-hover': '#005AE0',
        'blue-active': '#0052CC',
        'blue-bubble-dark': '#0A5BE0',
        'blue-light': '#E5F0FF',
        'blue-light-dark': '#1A3B66',
        'navy-secondary': '#0A3064',
        'navy-dark': '#072247',
        'blue-700': '#1D4ED8',
        'blue-600': '#2563EB',
        'sidebar': 'var(--color-sidebar)',
        'sidebar-hover': 'var(--color-sidebar-hover)',
        'zalo-blue-dark': '#0052CC',
        // Semantic
        success: '#16A34A', 'success-dark': '#22C55E',
        'success-bg': '#F0FDF4', 'success-bg-dark': '#052E16',
        warning: '#D97706', 'warning-dark': '#F59E0B',
        'warning-bg': '#FFFBEB', 'warning-bg-dark': '#451A03',
        danger: '#DC2626', 'danger-dark': '#F87171',
        'danger-bg': '#FEF2F2', 'danger-bg-dark': '#450A0A',
        info: '#0068FF', 'info-dark': '#3B82F6',
        'info-bg': '#EFF6FF', 'info-bg-dark': '#172554',
        // Surface & Background
        'app-light': '#F4F5F7', 'app-dark': '#111827',
        'surface-light': '#FFFFFF', 'surface-dark': '#1F2937',
        'gray-850': '#1b2333', 'gray-750': '#2a3447',
        'recipient-light': '#FFFFFF', 'recipient-dark': '#374151',
        // Border
        'border-base-light': '#E5E7EB', 'border-base-dark': '#374151',
        'border-subtle-light': '#F1F2F4', 'border-subtle-dark': '#2D3748',
        // Text
        'text-primary-light': '#0F172A', 'text-primary-dark': '#F9FAFB',
        'text-secondary-light': '#475569', 'text-secondary-dark': '#9CA3AF',
        'snippet-light': '#5B6B7B', 'snippet-dark': '#8899A6',
        'text-disabled-light': '#94A3B8', 'text-disabled-dark': '#6B7280',
        // Interaction
        'hover-row-light': '#F1F2F4', 'hover-row-dark': '#2D3748',
        'active-conv-light': '#E5F0FF', 'active-conv-dark': '#1A3B66',
        'ai-popup-bg-light': '#EFF6FF', 'ai-popup-border-light': '#BFDBFE',
        'ai-popup-bg-dark': '#172554', 'ai-popup-border-dark': '#1E3A8A',
        // Icon chức năng
        'icon-inactive-bg-light': '#E5E7EB', 'icon-inactive-bg-dark': '#374151',
        'icon-inactive-fg-light': '#64748B', 'icon-inactive-fg-dark': '#9CA3AF',
        // Pill biến động
        'pill-bg-light': '#EFF6FF', 'pill-fg-light': '#2563EB',
        'pill-bg-dark': '#172554', 'pill-fg-dark': '#93C5FD',
        // Brand Tiles
        'brand-kiotviet': '#F15A24', 'brand-haravan': '#2563EB',
        'brand-sapo': '#10B981', 'brand-pancake': '#3B82F6',
        'brand-nhanh': '#E11D48', 'brand-ghn': '#F97316',
        'brand-ghtk': '#15803D', 'brand-sepay': '#EF4444',
        'brand-openai': '#10A37F', 'brand-gemini': '#3B82F6',
        'brand-claude': '#C15F3C', 'brand-deepseek': '#0284C7',
        'brand-grok': '#0F172A', 'brand-openrouter': '#0068FF',
      },
      borderRadius: { sm: '6px', md: '8px', lg: '12px' },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 8px rgba(0,0,0,0.08)',
        lg: '0 10px 24px rgba(0,0,0,0.12)',
      },
      transitionDuration: { fast: '150ms', base: '200ms' },
      transitionTimingFunction: { standard: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      zIndex: {
        dropdown: '1000', sticky: '1100', 'modal-overlay': '1200',
        modal: '1300', toast: '1400', tooltip: '1500',
      },
      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px',
        6: '24px', 8: '32px', 10: '40px', 12: '48px',
      },
      width: {
        'sidebar-nav': '64px', 'sidebar-project': '240px', 'chat-list': '320px',
      },
      fontFamily: {
        system: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
                 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      fontSize: {
        title: ['15px', '1.4'], body: ['14px', '1.5'],
        snippet: ['13px', '1.4'], caption: ['12px', '1.4'],
      },
    },
  },
  plugins: [],
};
