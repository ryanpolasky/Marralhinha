import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

const FRAME_MS = 1000 / 60;

// ProMotion screens fire rAF at 120Hz; render at most 60 and not at all while paused
export default function FrameCap({ paused = false }) {
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);
  const time = useRef(0);
  useEffect(() => {
    if (paused) {
      advance(time.current);
      return undefined;
    }
    let frame;
    let last = performance.now();
    let due = 0;
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (now < due) return;
      due = Math.max(due + FRAME_MS, now + FRAME_MS - 4);
      time.current += Math.min(Math.max(now - last, 0), 100) / 1000;
      last = now;
      advance(time.current);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance, paused, size]);
  return null;
}
