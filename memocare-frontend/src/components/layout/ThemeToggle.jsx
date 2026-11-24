import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getStoredTheme, getTheme, setTheme } from '../../theme';

/** Sits beside the profile menu: switches the whole app between light and dark. */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);

  // Follow the operating system only while the user has not chosen a theme.
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => {
      if (getStoredTheme()) return;
      setThemeState(applyTheme(event.matches ? 'dark' : 'light'));
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const isDark = theme === 'dark';
  const nextLabel = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setThemeState(setTheme(isDark ? 'light' : 'dark'))}
      aria-label={`Switch to ${nextLabel} theme`}
      title={`Switch to ${nextLabel} theme`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="theme-toggle-label">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
