import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 620px), (max-height: 500px) and (orientation: landscape)';
// Landscape phones and tablets get the two-column results card the Discord Activity uses. Tablets are
// spotted by touch, or by their squarer 4:3-ish shape so iPads with a trackpad count but 16:9 laptops don't
export const WIDE_RESULTS_QUERY = [
  '(orientation: landscape) and (max-height: 500px)',
  '(orientation: landscape) and (any-pointer: coarse) and (min-width: 900px)',
  '(orientation: landscape) and (min-width: 900px) and (max-width: 1366px) and (max-aspect-ratio: 3/2)',
].join(', ');

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
