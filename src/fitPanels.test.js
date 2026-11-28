import { startPanelFit } from './fitPanels';

test('scrollable short-landscape panels keep their size while other panels scale to fit', () => {
  const { matchMedia, ResizeObserver, MutationObserver } = window;
  const requests = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => requests.push(callback));
  const query = { matches: true, addEventListener: jest.fn() };
  window.matchMedia = () => query;
  window.ResizeObserver = class {
    observe() {}
  };
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '400px';
  Object.defineProperty(modal, 'scrollHeight', { value: 600 });
  Object.defineProperty(backdrop, 'clientHeight', { value: 320 });
  backdrop.style.padding = '10px';
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  window.MutationObserver = class {
    observe() {}
  };
  const addEventListener = jest.spyOn(window, 'addEventListener');
  try {
    startPanelFit();
    requests.shift()();
    expect(modal.style.zoom).toBe('0.5');

    modal.style.setProperty('--panel-fit', 'scroll');
    query.addEventListener.mock.calls[0][1]();
    requests.shift()();
    expect(modal.style.zoom).toBe('');

    modal.style.removeProperty('--panel-fit');
    query.addEventListener.mock.calls[0][1]();
    requests.shift()();
    expect(modal.style.zoom).toBe('0.5');
  } finally {
    const resize = addEventListener.mock.calls.find(([type]) => type === 'resize');
    if (resize) window.removeEventListener(...resize);
    addEventListener.mockRestore();
    window.requestAnimationFrame.mockRestore();
    window.matchMedia = matchMedia;
    window.ResizeObserver = ResizeObserver;
    window.MutationObserver = MutationObserver;
    backdrop.remove();
  }
});
