import type { CSSProperties } from 'react';

/** Page background chosen in Settings → Change theme (saved per browser in a cookie). */
export const BG_COOKIE = 'crm_bg';
/** The app shell element whose CSS variables carry the chosen background. */
export const APP_SHELL_ID = 'app-shell';
export const DEFAULT_BG = '#ffffff';

export const BG_PRESETS: { name: string; color: string }[] = [
  { name: 'White (default)', color: DEFAULT_BG },
  { name: 'Light gray', color: '#f3f4f6' },
  { name: 'Cream', color: '#fdf8ee' },
  { name: 'Light yellow', color: '#fff4dc' },
  { name: 'Light teal', color: '#e6f7f8' },
  { name: 'Light blue', color: '#eaf2fb' },
  { name: 'Mint', color: '#eaf7ef' },
  { name: 'Lavender', color: '#f2eefa' },
  { name: 'Blush', color: '#fcefef' },
  { name: 'Dark', color: '#1f2933' },
];

export function normalizeBg(value: string | null | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : DEFAULT_BG;
}

/** True when white text reads better than dark text on this color. */
export function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
}

/**
 * Theme for the app shell: the background color, and dark mode (the "dark"
 * class) when the color is dark, so panels, fields and text turn dark too.
 */
export function shellTheme(hex: string): { style: CSSProperties; dark: boolean } {
  const bg = normalizeBg(hex);
  if (bg === DEFAULT_BG) return { style: {}, dark: false };
  return { style: { '--background': bg } as CSSProperties, dark: isDark(bg) };
}
