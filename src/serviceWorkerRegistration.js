import { IS_ACTIVITY } from './net/config';

export function register(onUpdate) {
  if (process.env.NODE_ENV !== 'production' || IS_ACTIVITY || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      const announce = () => registration.waiting && navigator.serviceWorker.controller && onUpdate(registration);
      announce();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => worker.state === 'installed' && announce());
      });
    } catch {}
  });
}

export function applyUpdate(registration) {
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
