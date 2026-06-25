import React from 'react';

interface BrandLogoProps {
  type: string;
  className?: string;
}

export function getBrandColorClass(type: string): string {
  switch (type.toLowerCase()) {
    case 'kiotviet': return 'text-orange-500';
    case 'haravan': return 'text-indigo-500';
    case 'sapo': return 'text-emerald-500';
    case 'nhanh': return 'text-rose-500';
    case 'pancake': return 'text-amber-500';
    case 'ghn': return 'text-orange-600';
    case 'ghtk': return 'text-green-600';
    case 'casso': return 'text-blue-500';
    case 'sepay': return 'text-blue-600';
    case 'openai': return 'text-green-600';
    case 'gemini': return 'text-blue-500';
    case 'claude': return 'text-amber-600';
    case 'deepseek': return 'text-sky-500'; // Tuân thủ quy tắc cấm màu tím (Purple Ban)
    case 'grok': return 'text-orange-600';
    case 'openrouter': return 'text-indigo-600';
    case 'ai': return 'text-amber-600';
    case 'pos': return 'text-orange-500';
    case 'payment': return 'text-green-600';
    case 'shipping': return 'text-red-500';
    default: return 'text-gray-500';
  }
}

export default function BrandLogo({ type, className = 'w-6 h-6' }: BrandLogoProps) {
  const brandColorClass = getBrandColorClass(type);
  className = className.includes('text-') ? className : `${className} ${brandColorClass}`;

  switch (type.toLowerCase()) {
    case 'kiotviet':
    case 'pos':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/>
          <circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      );
    case 'haravan':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      );
    case 'sapo':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          <path d="M2 12h20"/>
        </svg>
      );
    case 'nhanh':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      );
    case 'pancake':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 17c0 2 4.5 3 10 3s10-1 10-3"/>
          <path d="M2 12c0 2 4.5 3 10 3s10-1 10-3"/>
          <ellipse cx="12" cy="7" rx="10" ry="3"/>
          <path d="M12 4v3"/>
        </svg>
      );
    case 'ghn':
    case 'shipping':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      );
    case 'ghtk':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13"/>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
          <circle cx="5.5" cy="18.5" r="2.5"/>
          <circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
      );
    case 'casso':
    case 'payment':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      );
    case 'sepay':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2c-2.5 0-3 4-3 6 0 1 .5 2 1.5 3-.5.5-1 1-1.5 2a8 8 0 0 0 6 9 8 8 0 0 0 6-9c-.5-1-1-1.5-1.5-2 1-1 1.5-2 1.5-3 0-2-.5-6-3-6z"/>
          <path d="M9 8h6"/>
        </svg>
      );
    case 'openai':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5-2.5-1-6 1.5-7.5s6-1 7.5 1.5m0 0l-4.5 2.5m4.5-2.5l2.5 4.5m-2.5-4.5c2.5-1.5 6-1 7.5 1.5s1 6-1.5 7.5-6 1-7.5-1.5m0 0l4.5-2.5m-4.5 2.5L10 12m2.5 4.5c-1.5 2.5-5 3-7.5 1.5s-3-5-.5-7.5M10 12l2.5 4.5" />
        </svg>
      );
    case 'gemini':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2c0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10 5.5 0 10-4.5 10-10z" fill="currentColor"/>
        </svg>
      );
    case 'claude':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M3 12h18M5.5 5.5l13 13M5.5 18.5l13-13"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
      );
    case 'deepseek':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="M12 6v12M12 12c-3 0-4-2-4-4M12 12c3 0 4 2 4 4"/>
        </svg>
      );
    case 'grok':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20L20 4M4 4l5 5M15 15l5 5"/>
        </svg>
      );
    case 'openrouter':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 3 21 3 21 8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/>
          <line x1="4" y1="4" x2="21" y2="21"/>
        </svg>
      );
    case 'ai':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2"/>
          <circle cx="12" cy="5" r="2"/>
          <path d="M12 7v4"/>
          <line x1="8" y1="16" x2="8" y2="16"/>
          <line x1="16" y1="16" x2="16" y2="16"/>
        </svg>
      );
    default:
      return (
        <span className={className}>🔌</span>
      );
  }
}
