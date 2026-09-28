import React, { useEffect, useRef } from 'react';
import { SEAT_COLORS } from '../game/geometry';

const COLORS = [...SEAT_COLORS.map((c) => c.main), '#ffffff', '#ffd166'];

export default function Confetti({ duration = 5000 }) {
  const ref = useRef();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.width;
    const burst = (x, n) =>
      Array.from({ length: n }, () => ({
        x,
        y: canvas.height * 0.55,
        vx: (Math.random() - 0.5) * 22 * dpr + (x < W() / 2 ? 8 : -8) * dpr,
        vy: -(14 + Math.random() * 16) * dpr,
        size: (6 + Math.random() * 8) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() > 0.3 ? 'rect' : 'circle',
      }));
    let pieces = [...burst(0, 90), ...burst(W(), 90)];
    const start = performance.now();
    let frame;
    let lastBurst = start;

    const tick = (now) => {
      if (now - lastBurst > 900 && now - start < duration - 1500) {
        lastBurst = now;
        pieces.push(...burst(Math.random() * W(), 50));
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.vy += 0.45 * dpr;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      pieces = pieces.filter((p) => p.y < canvas.height + 40);
      if (now - start < duration || pieces.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [duration]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
