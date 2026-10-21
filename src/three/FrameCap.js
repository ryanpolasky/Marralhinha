import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

// ProMotion screens fire rAF at 120Hz; render at most `fps` (30 on phones) and not at all while paused
export default function FrameCap({ paused = false, fps = 60 }) {
  const frameMs = 1000 / fps;
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
      due = Math.max(due + frameMs, now + frameMs - 4);
      time.current += Math.min(Math.max(now - last, 0), 100) / 1000;
      last = now;
      advance(time.current);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance, paused, size, frameMs]);
  return null;
}
