import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Dev-only test bridge; neither real Staging nor Production loads this code.
if (import.meta.env.DEV && import.meta.env.VITE_E2E_EMULATORS === '1') {
  void import('./e2e/bridge').then((module) => module.installE2eBridge());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
