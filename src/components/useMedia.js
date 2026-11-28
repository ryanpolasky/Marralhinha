import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 620px), (max-height: 500px) and (orientation: landscape)';
export const TABLET_HUD_QUERY = '(pointer: coarse) and (min-width: 621px) and (max-width: 1366px) and (orientation: portrait)';
export const TABLET_PLATES_QUERY = '(pointer: coarse) and (min-width: 621px) and (max-width: 1200px) and (orientation: portrait)';
// Roomy screens get the two-column results card the Discord Activity uses; phones and narrow windows stay stacked
export const WIDE_RESULTS_QUERY = '(orientation: landscape) and (max-height: 500px), (min-width: 900px)';

export default function useMedia(query) {
  const [match, setMatch] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return match;
}
