import { useEffect, useState } from 'react';

/**
 * How long the splash stays on screen. Kept in sync with the fade-out delay in
 * splash.css (`animation: splash-fade-out 0.4s ease 2s both`).
 */
export const SPLASH_MS = 2400;

/**
 * Controls when the MemoCare splash is shown.
 *  - On page load (fresh open of the site): exactly once per browser-tab session,
 *    sessionStorage guards repeats from hot reloads etc.
 *  - Right after signing in: LoginPage / SignupPage dispatch
 *    `memocare:splash-replay` once the session is ready, so the splash covers
 *    the switch to the dashboard for its full duration.
 *  - After logout: AppShell dispatches the same event before clearing the
 *    session, so the splash covers the switch back to the login page.
 */
export function useSplashGate() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('memocare:splash-seen'));
  // Bumped on every replay: a splash that is already on screen restarts its
  // full timer (and its CSS animation) instead of vanishing early.
  const [splashKey, setSplashKey] = useState(0);

  useEffect(() => {
    if (!showSplash) return undefined;
    sessionStorage.setItem('memocare:splash-seen', '1');
    const t = setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => clearTimeout(t);
  }, [showSplash, splashKey]);

  useEffect(() => {
    const replay = () => {
      sessionStorage.removeItem('memocare:splash-seen');
      setShowSplash(true);
      setSplashKey((k) => k + 1);
    };
    window.addEventListener('memocare:splash-replay', replay);
    return () => window.removeEventListener('memocare:splash-replay', replay);
  }, []);

  return { showSplash, splashKey };
}
