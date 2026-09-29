import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

let show = null;

// In-app replacement for window.confirm/prompt. Resolves true when confirmed, false when cancelled.
// Options: { title, message, body, confirm = 'OK', cancel = 'Cancel' (null hides it), tone: 'danger' }
export function ask(options) {
  return new Promise((resolve) => {
    if (show) show({ ...options, resolve });
    else resolve(window.confirm([options.title, options.message].filter(Boolean).join('\n\n')));
  });
}

export function DialogHost() {
  const [dialog, setDialog] = useState(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    show = setDialog;
    return () => {
      show = null;
    };
  }, []);

  const close = useCallback(
    (value) => {
      dialog?.resolve(value);
      setDialog(null);
    },
    [dialog]
  );

  useEffect(() => {
    if (!dialog) return undefined;
    const previous = document.activeElement;
    if (!dialog.body) confirmRef.current?.focus();
    // Capture phase + stopImmediatePropagation so Escape closes only this dialog, not the modal underneath
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [dialog, close]);

  if (!dialog) return null;
  const { title, message, body, confirm = 'OK', cancel = 'Cancel', tone } = dialog;
  return createPortal(
    <div className="modal-backdrop dialog-backdrop" onClick={() => close(false)}>
      <div className="panel modal dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="dialog-title">{title}</h2>
        {message && <p className="dialog-message">{message}</p>}
        {body}
        <div className="dialog-actions">
          {cancel !== null && (
            <button className="btn ghost" onClick={() => close(false)}>
              {cancel}
            </button>
          )}
          <button ref={confirmRef} className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`} onClick={() => close(true)}>
            {confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
