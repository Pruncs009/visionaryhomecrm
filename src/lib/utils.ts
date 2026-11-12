// shadcn/ui class merger (clsx + tailwind-merge equivalent).
export { cn } from 'cn';

export function formatCurrency(value: number, options: { compact?: boolean } = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: options.compact && Math.abs(value) >= 1000 ? 1 : 0,
    notation: options.compact ? 'compact' : 'standard',
  }).format(value);
}

/**
 * Only allow same-site relative paths as redirect targets.
 * Blocks open redirects like ?next=https://evil.com or ?next=//evil.com.
 */
export function safeRedirectPath(path: string | null | undefined, fallback = '/dashboard') {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return fallback;
  }
  return path;
}
