import React, { useEffect, useRef, useState } from 'react';
import { Alert, Check } from './Icons';

export const TOAST_MS = 4200;
const OUT_MS = 260;

// Bottom-center notification. Owns its lifecycle: springs in, counts down on the
// life bar (hover pauses it), then plays the outro and reports back via onDone(id).
export default function Toast({ toast, inline = false, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(() => onDone?.(toast.id), OUT_MS);
    return () => clearTimeout(t);
  }, [leaving, onDone, toast.id]);

  useEffect(() => {
    if (leaving) return undefined;
    if (paused) {
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
      return undefined;
    }
    startedAt.current = Date.now();
    const t = setTimeout(() => setLeaving(true), remaining.current);
    return () => clearTimeout(t);
  }, [paused, leaving]);

  const Icon = toast.tone === 'good' ? Check : Alert;
  return (
    <div
      className={`toast ${toast.tone}${leaving ? ' leaving' : ''}${paused ? ' paused' : ''}${inline ? ' inline' : ''}`}
      style={{ '--life': `${TOAST_MS}ms` }}
      role="alert"
      onClick={() => setLeaving(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      title="Click to dismiss"
    >
      <span className="toast-icon">
        <Icon size={17} />
      </span>
      <span className="toast-text">{toast.text}</span>
      <i className="toast-life" aria-hidden="true" />
    </div>
  );
}
