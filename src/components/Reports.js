import React, { useEffect, useState } from 'react';
import { api, post } from '../net/api';
import { CURRENCY, BOXES, ITEMS } from '../game/catalog';
import { sfx } from '../game/sound';
import { Coin, TagBadge } from './Economy';
import { Bug, Close } from './Icons';
import { ago } from './Stats';

export const KIND_LABEL = { bug: 'Bug report', idea: 'Feature idea' };

// Human-readable label for a resolution gift
export const giftLabel = (gift) => {
  if (!gift) return null;
  if (gift.type === 'coins') return `${Number(gift.amount).toLocaleString()} ${CURRENCY}`;
  if (gift.type === 'box') return BOXES.find((b) => b.id === gift.box)?.name || 'a chest';
  if (gift.type === 'item') return ITEMS[gift.item]?.name || 'a cosmetic';
  return null;
};

export const StatusPill = ({ status }) => <span className={`report-status ${status}`}>{status}</span>;

// "Report a bug / suggest a feature" — the player's own reports show underneath with their status
export function ReportModal({ onClose, notify, reports }) {
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [mine, setMine] = useState(reports || null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (reports) return undefined;
    let cancelled = false;
    api('/reports')
      .then((res) => !cancelled && setMine(res.reports))
      .catch(() => !cancelled && setMine([]));
    return () => {
      cancelled = true;
    };
  }, [reports]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || text.trim().length < 5) return;
    setBusy(true);
    try {
      const res = await post('/reports', { kind, text });
      setMine((list) => [res.report, ...(list || [])]);
      setText('');
      sfx.pop();
      notify('Thanks! Your report is in the pile.', 'good');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal report-modal" role="dialog" aria-modal="true" aria-label="Report a bug or suggest a feature" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <Bug /> Report & ideas
          </h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

        <form className="report-form" onSubmit={submit}>
          <div className="report-kinds" role="radiogroup" aria-label="Report type">
            {[
              ['bug', 'Found a bug'],
              ['idea', 'Suggest a feature'],
            ].map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={kind === key} className={`report-kind${kind === key ? ' on' : ''}`} onClick={() => setKind(key)}>
                {label}
              </button>
            ))}
          </div>
          <textarea
            className="admin-input grow report-text"
            value={text}
            maxLength={600}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'bug' ? 'What happened? What were you doing when it went wrong?' : 'What would make the game better? (Cosmetic ideas welcome!)'}
            aria-label={kind === 'bug' ? 'Describe the bug' : 'Describe your idea'}
          />
          <div className="report-form-foot">
            <span className="muted small-text">Ryan can reply here - you'll see it next time you log in.</span>
            <button className="btn primary" type="submit" disabled={busy || text.trim().length < 5}>
              Send
            </button>
          </div>
        </form>

        {mine?.length > 0 && (
          <>
            <h3 className="profile-section">Your reports</h3>
            <div className="report-list ideas-reports">
              {mine.map((r) => (
                <div key={r.id} className={`report ${r.status}`}>
                  <div className="report-head">
                    <span className={`report-kind-tag ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                    <StatusPill status={r.status} />
                    <span className="muted small-text">{ago(r.createdAt)}</span>
                  </div>
                  <p className="report-text-view">{r.text}</p>
                  {r.response && <p className="report-response">“{r.response}”</p>}
                  {r.gift && <p className="report-gift muted small-text">Gift attached: {giftLabel(r.gift)}{r.claimed ? ' · claimed' : ''}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The "you've got mail" modal: dev replies to your reports, with claim buttons for attached gifts
export function RepliesModal({ replies: incoming, onClose, onClaim }) {
  // Snapshot the pile on open: claimed reports drop out of the profile, but the "Claimed!" line should stay
  const [replies] = useState(incoming);
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (r) => {
    if (busy) return;
    setBusy(r.id);
    try {
      if (r.gift) {
        const res = await post(`/reports/${r.id}/claim`);
        const got = res.result?.item ? ITEMS[res.result.item]?.name : giftLabel(r.gift);
        setResults((m) => ({ ...m, [r.id]: res.result?.duplicate ? `${got} (dupe — refunded ${res.result.refund} ${CURRENCY})` : `Claimed ${got}!` }));
        sfx.coins();
        onClaim?.(res.profile);
      } else {
        await post(`/reports/${r.id}/seen`);
        setResults((m) => ({ ...m, [r.id]: 'ok' }));
      }
    } catch (err) {
      setResults((m) => ({ ...m, [r.id]: err.message }));
    } finally {
      setBusy(null);
    }
  };

  const remaining = replies.filter((r) => !results[r.id]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal report-modal" role="dialog" aria-modal="true" aria-label="Replies to your reports" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>You've got mail!</h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <p className="muted">The devs answered {replies.length === 1 ? 'your report' : `${replies.length} of your reports`}:</p>

        <div className="report-list">
          {replies.map((r) => {
            const done = results[r.id];
            return (
              <div key={r.id} className={`report resolved${done ? ' done' : ''}`}>
                <div className="report-head">
                  <span className={`report-kind-tag ${r.kind}`}>{KIND_LABEL[r.kind]}</span>
                  <TagBadge tag="dev" small title="Replied by a Dev" />
                  <span className="muted small-text">{ago(r.resolvedAt || r.createdAt)}</span>
                </div>
                <p className="report-text-view muted">{r.text}</p>
                {r.response && <p className="report-response big">{r.response}</p>}
                {done ? (
                  <p className="report-gift-result">{done === 'ok' ? 'Marked as read' : done}</p>
                ) : (
                  <button className={`btn ${r.gift ? 'primary' : 'secondary'}`} disabled={busy === r.id} onClick={() => act(r)}>
                    {r.gift ? (
                      <>
                        <Coin size={16} /> Claim {giftLabel(r.gift)}
                      </>
                    ) : (
                      'Got it, thanks!'
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!remaining.length && (
          <button className="btn primary block" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
