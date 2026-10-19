import React, { useEffect, useRef, useState } from 'react';

// 'change' fires once when the OS colour picker closes; onChange fires per drag tick
export default function HexInput({ value, onCommit, ...rest }) {
  const [pending, setPending] = useState(value);
  const ref = useRef(null);
  useEffect(() => setPending(value), [value]);
  useEffect(() => {
    const el = ref.current;
    const commit = () => {
      setPending(el.value);
      if (el.value !== value) onCommit?.(el.value);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [value, onCommit]);
  return <input ref={ref} type="color" value={pending} onChange={(e) => setPending(e.target.value)} {...rest} />;
}
