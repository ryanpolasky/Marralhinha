import React, { useEffect, useState } from 'react';
import { ask } from './Dialog';

let deferred = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

const standalone = () => typeof window !== 'undefined' && (!!window.navigator.standalone || !!window.matchMedia?.('(display-mode: standalone)').matches);
const appleDevice = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const steps = (
  <ol className="install-steps">
    <li>Tap the Share button in Safari's toolbar.</li>
    <li>Choose "Add to Home Screen".</li>
    <li>Tap Add. Marralhinha opens full screen and pass &amp; play works offline.</li>
  </ol>
);

export default function InstallButton({ className = 'btn link' }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  if (standalone()) return null;
  if (deferred) {
    return (
      <button
        type="button"
        className={className}
        onClick={async () => {
          const prompt = deferred;
          deferred = null;
          prompt.prompt();
          await prompt.userChoice.catch(() => {});
          tick((n) => n + 1);
        }}
      >
        Install app
      </button>
    );
  }
  if (appleDevice()) {
    return (
      <button type="button" className={className} onClick={() => ask({ title: 'Add to Home Screen', body: steps, confirm: 'Got it', cancel: null })}>
        Install app
      </button>
    );
  }
  return null;
}
