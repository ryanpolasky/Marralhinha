import React, { useLayoutEffect, useRef, useState } from 'react';

// Wellspring src/art.ts, 3×5 glyphs.
export const WELL_FONT = {'%':'101001010100101',',':'000000000010100',A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110','/':'001001010100100','+':'000010111010000','-':'000000111000000','.':'000000000000010',':':'000010000010000','!':'010010010000010',"'":'010010000000000','>':'100010001010100','<':'001010100010001'};

export function bitmapName(name, maxWidth = Infinity, pixel = 3) {
  const text = (name || 'Player').toUpperCase();
  if ([...text].some((ch) => ch !== ' ' && !WELL_FONT[ch])) return null;
  const columns = Math.max(1, Math.floor((maxWidth + pixel) / (4 * pixel)));
  const fitted = text.length <= columns ? text : columns > 3 ? text.slice(0, columns - 3) + '...' : '.'.repeat(columns);
  const width = fitted.length * 4 - 1;
  const pixels = [...fitted].flatMap((ch, i) => [...(WELL_FONT[ch] || '')].flatMap((bit, j) => bit === '1' ? [`<path d="M${i * 4 + j % 3} ${Math.floor(j / 3)}h1v1h-1z"/>`] : [])).join('');
  return { text: fitted, width: width * pixel, src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="5" viewBox="0 0 ${width} 5" shape-rendering="crispEdges"><g fill="#f4efe6">${pixels}</g></svg>`)}` };
}

export default function WellspringName({ name, pixel = 3 }) {
  const ref = useRef();
  const [width, setWidth] = useState(Infinity);
  const text = name || 'Player';
  useLayoutEffect(() => {
    const measure = () => { if (ref.current?.clientWidth > 0) setWidth(ref.current.clientWidth); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [text]);
  const bitmap = bitmapName(text, width, pixel);
  return <span ref={ref} className="wellspring-name" title={text} style={{ width: (text.toUpperCase().length * 4 - 1) * pixel }}>
    {bitmap ? <img src={bitmap.src} width={bitmap.width} height={5 * pixel} alt={text} draggable={false} /> : text}
  </span>;
}
