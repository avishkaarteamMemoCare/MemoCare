/**
 * Light/dark theme selection.
 *
 * The choice lives in localStorage so it survives reloads and is applied to
 * <html data-theme="…">, which is what the dark token overrides in
 * styles/tokens.css key off. Until the user picks one, the operating system
 * preference is used.
 */
const STORAGE_KEY = 'memocare-theme';
const THEMES = ['light', 'dark'];

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getTheme() {
  if (typeof document !== 'undefined') {
    const current = document.documentElement.getAttribute('data-theme');
    if (THEMES.includes(current)) return current;
  }
  return getStoredTheme() || getSystemTheme();
}

export function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'light';
  document.documentElement.setAttribute('data-theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#12111C' : '#1F1D57');
  return next;
}

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'light';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode — the theme still applies for this visit */
  }
  return applyTheme(next);
}

/** Called once before React renders, so the first paint is already themed. */
export function initTheme() {
  return applyTheme(getTheme());
}
