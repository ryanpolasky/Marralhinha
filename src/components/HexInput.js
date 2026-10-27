import React, { useEffect, useRef, useState } from 'react';

// 'change' fires once when the OS colour picker closes; onChange fires per drag tick
export default function HexInput({ value, onCommit, ...rest }) {
  const [pending, setPending] = useState(value);
  const ref = useRef(null);
  const live = useRef({});
  live.current = { value, onCommit, pending };
  const sent = useRef(null);
  useEffect(() => setPending(value), [value]);
  useEffect(() => {
    const el = ref.current;
    const commit = (v) => {
      const { value: base, onCommit: fn } = live.current;
      if (!v || v.toLowerCase() === base?.toLowerCase() || v === sent.current) return;
      sent.current = v;
      fn?.(v);
    };
    const onChange = () => {
      setPending(el.value);
      commit(el.value);
    };
    el.addEventListener('change', onChange);
    return () => {
      el.removeEventListener('change', onChange);
      commit(live.current.pending);
    };
  }, []);
  return <input ref={ref} type="color" value={pending} onChange={(e) => setPending(e.target.value)} {...rest} />;
}
