const PANELS = '.screen > .panel, .modal-backdrop > .modal';
const SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 540px)';
const MIN_ZOOM = 0.28;

// Rotated phones shrink menus to fit the screen instead of scrolling them
export function startPanelFit() {
  if (typeof window === 'undefined' || !window.ResizeObserver || !window.matchMedia) return;
  const mq = window.matchMedia(SHORT_LANDSCAPE);
  const clear = (el) => {
    el.style.zoom = '';
    el.style.width = '';
    el.style.maxHeight = '';
    delete el.dataset.fitW;
  };
  const fit = (el, reset) => {
    if (reset || !mq.matches) clear(el);
    if (!mq.matches) return;
    const zoom = parseFloat(el.style.zoom) || 1;
    if (!el.dataset.fitW) el.dataset.fitW = getComputedStyle(el).width;
    const modal = el.classList.contains('modal');
    const natural = (modal ? Math.max(el.scrollHeight, el.offsetHeight) : el.offsetHeight) || 1;
    const box = el.parentElement;
    const css = box && getComputedStyle(box);
    const avail = (box?.clientHeight || window.innerHeight) - (css ? parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) : 24);
    const next = Math.max(MIN_ZOOM, Math.min(1, avail / natural));
    if (next === 1) return clear(el);
    if (Math.abs(next - zoom) > 0.01) el.style.zoom = String(next);
    el.style.width = el.dataset.fitW;
    if (modal) el.style.maxHeight = `${avail / next}px`;
  };
  const seen = new WeakSet();
  const ro = new ResizeObserver(() => queue(false));
  let queued = false;
  let reset = false;
  const scan = () => {
    const fresh = reset;
    queued = false;
    reset = false;
    document.querySelectorAll(PANELS).forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el);
        ro.observe(el);
      }
      fit(el, fresh);
    });
  };
  function queue(again) {
    reset = reset || again;
    if (!queued) {
      queued = true;
      requestAnimationFrame(scan);
    }
  }
  new MutationObserver(() => queue(false)).observe(document.body, { childList: true, subtree: true });
  mq.addEventListener?.('change', () => queue(true));
  window.addEventListener('resize', () => queue(true));
  queue(false);
}
