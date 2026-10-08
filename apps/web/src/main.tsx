import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameProvider } from './store';
import { getLang, loadLang, useLang } from './i18n';
import './styles.css';

const Admin = lazy(() => import('./admin/Admin'));
const adminRoute = /^\/admin\/?$/.test(location.pathname);

// French players: the catalog first (its own chunk), so nothing flashes in English.
void loadLang(getLang()).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {adminRoute ? (
        <Suspense fallback={<p>Loading dashboard…</p>}>
          <Admin />
        </Suspense>
      ) : (
        <GameProvider>
          <Localised />
        </GameProvider>
      )}
    </StrictMode>,
  ),
);

/** Re-mount the screens when the language changes so every string re-renders. */
function Localised() {
  const lang = useLang();
  return <App key={lang} />;
}

document.documentElement.lang = getLang();

// Netlify adds a feedback toolbar to deploy previews (addresses with "--").
// On a phone it sits over the game's bottom tabs and swallows taps, so the
// game removes it; the live site never has it.
if (location.hostname.includes('--')) {
  const strip = () =>
    document.querySelectorAll('[data-netlify-deploy-id]').forEach((el) => el.remove());
  new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
  strip();
}

// Offline digest and fast reloads on slow networks (production only; dev uses Vite HMR).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
