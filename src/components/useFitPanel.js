import { useLayoutEffect, useRef } from 'react';

export default function useFitPanel(active, contentKey, { maxWidth = 880, reserveBar = false, bottom = 20 } = {}) {
  const screenRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const screen = screenRef.current;
    const panel = panelRef.current;
    if (!screen || !panel) return undefined;
    let frame;
    const measure = () => {
      const bar = reserveBar ? document.querySelector('.account-bar') : null;
      const top = reserveBar ? Math.max(72, Math.ceil(bar?.getBoundingClientRect().bottom || 64) + 8) : 20;
      const foot = reserveBar && window.innerWidth <= 560 ? Math.max(72, bottom) : bottom;
      screen.style.paddingTop = `${top}px`;
      screen.style.paddingBottom = `${foot}px`;
      const style = getComputedStyle(screen);
      const width = Math.max(1, window.innerWidth - (parseFloat(style.paddingLeft) || 14) - (parseFloat(style.paddingRight) || 14));
      const height = Math.max(1, window.innerHeight - top - foot - 6);
      panel.style.zoom = '1';
      panel.style.width = `${Math.min(maxWidth, width)}px`;
      let scale = Math.min(1, height / Math.max(1, panel.scrollHeight));
      panel.style.width = `${Math.min(maxWidth, width / scale)}px`;
      scale = Math.min(1, height / Math.max(1, panel.scrollHeight));
      panel.style.width = `${Math.min(maxWidth, width / scale)}px`;
      panel.style.zoom = String(scale);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(panel);
    if (reserveBar) {
      const bar = document.querySelector('.account-bar');
      if (bar) observer?.observe(bar);
    }
    return () => { window.removeEventListener('resize', schedule); observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [active, contentKey, maxWidth, reserveBar, bottom]);

  return [screenRef, panelRef];
}
