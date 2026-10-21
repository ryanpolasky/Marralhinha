import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

const WAKE_MS = 1500;

// ProMotion screens fire rAF at 120Hz; render at most `fps` (30 on phones), and while paused only briefly after `wake` changes
export default function FrameCap({ paused = false, fps = 60, wake = null }) {
  const frameMs = 1000 / fps;
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);
  const time = useRef(0);
  const woke = useRef(wake);
  useEffect(() => {
    const burst = paused && woke.current !== wake;
    woke.current = wake;
    if (paused && !burst) {
      advance(time.current);
      return undefined;
    }
    const until = burst ? performance.now() + WAKE_MS : Infinity;
    let frame;
    let last = performance.now();
    let due = 0;
    const tick = (now) => {
      if (now > until) return;
      frame = requestAnimationFrame(tick);
      if (now < due) return;
      due = Math.max(due + frameMs, now + frameMs - 4);
      time.current += Math.min(Math.max(now - last, 0), 100) / 1000;
      last = now;
      advance(time.current);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance, paused, size, frameMs, wake]);
  return null;
}
