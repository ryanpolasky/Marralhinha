import { useEffect } from 'react';

export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.hidden || lock) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
        if (cancelled) lock.release();
      } catch {}
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
