import React, { useLayoutEffect, useRef, useState } from 'react';

// Text that would get cut off gently scrolls to its end, pauses, and scrolls back instead of showing "…"
export default function Marquee({ className = '', children }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (outer.current && inner.current) setShift(Math.max(0, Math.ceil(inner.current.scrollWidth - outer.current.clientWidth)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(outer.current);
    observer.observe(inner.current);
    return () => observer.disconnect();
  }, [children]);

  const scrolling = shift > 1;
  return (
    <span
      ref={outer}
      className={`marquee ${className}${scrolling ? ' scrolling' : ''}`}
      // Roughly constant reading speed: longer overflow, longer loop
      style={scrolling ? { '--shift': `-${shift + 6}px`, '--dur': `${Math.max(5, 3 + shift / 18)}s` } : undefined}
    >
      <span ref={inner} className="marquee-inner">
        {children}
      </span>
    </span>
  );
}
