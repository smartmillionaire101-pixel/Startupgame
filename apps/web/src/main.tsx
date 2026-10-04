import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameProvider } from './store';
import { getLang, useLang } from './i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <Localised />
    </GameProvider>
  </StrictMode>,
);

/** Re-mount the screens when the language changes so every string re-renders. */
function Localised() {
  const lang = useLang();
  return <App key={lang} />;
}

document.documentElement.lang = getLang();

// Offline digest and fast reloads on slow networks (production only; dev uses Vite HMR).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
