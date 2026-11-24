import SplashScreen from './SplashScreen';
import { useSplashGate } from './useSplashGate';

/**
 * Sits above the whole app (from main.jsx) and overlays the splash:
 *  - once when the site is freshly opened
 *  - again after signing in (LoginPage / SignupPage) — over the dashboard
 *  - again after the user logs out (AppShell) — over the login page
 */
export default function SplashScreenHost({ children }) {
  const { showSplash, splashKey } = useSplashGate();
  return (
    <>
      {children}
      {showSplash && <SplashScreen key={splashKey} />}
    </>
  );
}
