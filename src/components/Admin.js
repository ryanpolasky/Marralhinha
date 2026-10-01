import React, { useEffect, useMemo, useState } from 'react';
import { api, post } from '../net/api';
import { CURRENCY, BOXES, DROPPABLE, ITEMS, SLOTS, SLOT_KEYS, TAGS, TAG_KEYS, rarityOf } from '../game/catalog';
import { sfx } from '../game/sound';
import { Coin, Coins, TagBadges } from './Economy';
import { Close, Search, DiscordMark, Bug } from './Icons';
import { giftLabel, KIND_LABEL, StatusPill } from './Reports';
import { SEAT_COLORS } from '../game/geometry';
import BOARDS from '../shared/boards.json';

const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const dur = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

const LinkBadge = ({ user }) =>
  user.discordLinked ? (
    <span className="badge link-badge discord" title="Signed in with Discord">
      <DiscordMark size={12} /> Discord
    </span>
  ) : (
    <span className="badge link-badge guest" title="Guest account, lives in one browser">
      guest
    </span>
  );

const PHASE_LABEL = { playing: 'Playing', lobby: 'Lobby', over: 'Results' };

// Every room with a human in it, refreshed while the panel is open; Spectate drops you in as a watcher
function ActiveGames({ currentCode, onSpectate, notify }) {
  const [rooms, setRooms] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api('/admin/rooms')
        .then((res) => !cancelled && setRooms(res.rooms))
        .catch((err) => !cancelled && notify(err.message));
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [notify]);

  return (
    <div className="admin-games">
      <h4>
        Active games <span className="muted">{rooms ? rooms.length : '…'}</span>
      </h4>
      {rooms && rooms.length === 0 && <div className="muted small-text">Nobody's playing right now.</div>}
      <div className="admin-games-list">
        {(rooms || []).map((r) => (
          <div key={r.code} className={`admin-game phase-${r.phase}`}>
            <div className="admin-game-head">
              <span className="room-pill">{r.code}</span>
              <span className={`admin-game-phase is-${r.phase}`}>{PHASE_LABEL[r.phase]}</span>
              {r.activity && <span className="badge">Discord</span>}
              {r.teams && <span className="badge">2v2</span>}
              {r.variant && <span className="badge">{BOARDS[r.variant]?.label || r.variant}</span>}
              <span className="muted small-text">
                {r.spectators ? `${r.spectators} watching · ` : ''}
                {r.startedAt ? `${dur(r.startedAt)} · ` : ''}
                {ago(r.lastActive)}
              </span>
            </div>
            <div className="admin-game-players">
              {r.players.map((p) => (
                <span key={p.seat} className={`admin-game-player${p.away ? ' away' : ''}`} style={{ '--seat': SEAT_COLORS[p.seat].main }}>
                  <span className="admin-game-dot" />
                  {p.name}
                  {p.isBot && <span className="muted"> (bot)</span>}
                  {r.phase !== 'lobby' && <span className="muted"> {p.home}/{BOARDS[r.variant]?.marbles || 5}</span>}
                </span>
              ))}
            </div>
            {r.code === currentCode ? (
              <span className="muted small-text">You're here</span>
            ) : (
              <button className="btn tiny secondary" onClick={() => onSpectate(r.code)}>
                Spectate
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UserEditor({ user, me, onChange, notify }) {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(500);
  const [item, setItem] = useState(DROPPABLE[0].id);
  const [name, setName] = useState(user.name);
  const isMe = user.id === me.id;

  useEffect(() => setName(user.name), [user.id, user.name]);

  const act = async (path, body, okMessage) => {
    setBusy(true);
    try {
      const res = await post(`/admin/users/${encodeURIComponent(user.id)}${path}`, body);
      onChange(res.user);
      sfx.pop();
      if (okMessage) notify(okMessage, 'good');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = (tag) => {
    const stored = user.tags.filter((t) => !TAGS[t]?.auto);
    const next = stored.includes(tag) ? stored.filter((t) => t !== tag) : [...stored, tag];
    act('/tags', { tags: next }, `${user.name} ${user.tags.includes(tag) ? 'lost' : 'got'} the ${TAGS[tag].label} tag`);
  };

  const grouped = useMemo(() => SLOT_KEYS.map((slot) => [slot, DROPPABLE.filter((i) => i.slot === slot)]), []);

  return (
    <div className="admin-editor">
      <div className="admin-editor-head">
        <div>
          <div className="admin-user-name">
            {user.name} <TagBadges tags={user.tags} small />
            <LinkBadge user={user} />
            {isMe && <span className="badge">you</span>}
          </div>
          <div className="muted small-text">
            id <code>{user.id}</code> · Lv {user.level} · {user.stats.games} games, {user.stats.wins} wins · {user.items} items · seen {ago(user.lastSeen)}
          </div>
        </div>
        <Coins amount={user.coins} className="coins-pill" />
      </div>

      <div className="admin-section">
        <h4>Tags</h4>
        <div className="tag-toggles">
          {TAG_KEYS.filter((tag) => !TAGS[tag].auto).map((tag) => {
            const on = user.tags.includes(tag);
            const locked = isMe && on && TAGS[tag].admin;
            return (
              <button key={tag} className={`tag-toggle${on ? ' on' : ''}`} style={{ '--tag': TAGS[tag].color }} disabled={busy || locked} onClick={() => toggleTag(tag)} title={locked ? "You can't remove your own admin tag" : TAGS[tag].blurb}>
                <span className="tag-toggle-dot" />
                {TAGS[tag].label}
                {TAGS[tag].admin && <span className="tag-toggle-note">admin</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-section">
        <h4>{CURRENCY}</h4>
        <div className="admin-row-inline">
          <input type="number" className="admin-input" value={amount} min={-1000000} max={1000000} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Amount" />
          <button className="btn secondary" disabled={busy || !amount} onClick={() => act('/coins', { delta: amount }, `${amount > 0 ? '+' : ''}${amount} ${CURRENCY} for ${user.name}`)}>
            <Coin size={16} /> Give {amount}
          </button>
          <button className="btn ghost" disabled={busy || !amount} onClick={() => act('/coins', { delta: -Math.abs(amount) })}>
            Take {Math.abs(amount)}
          </button>
        </div>
      </div>

      <div className="admin-section">
        <h4>Give an item</h4>
        <div className="admin-row-inline">
          <select className="admin-input grow" value={item} onChange={(e) => setItem(e.target.value)} aria-label="Item">
            {grouped.map(([slot, items]) => (
              <optgroup key={slot} label={SLOTS[slot].label}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({rarityOf(i).label})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="btn secondary" disabled={busy} onClick={() => act('/items', { item }, `${ITEMS[item].name} given to ${user.name}`)}>
            Give
          </button>
        </div>
        <p className="muted small-text">Dev and Beta cosmetics come with the tag, so hand those out with the toggles above.</p>
      </div>

      <div className="admin-section">
        <h4>Rename</h4>
        <form
          className="admin-row-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== user.name) act('/name', { name }, 'Renamed');
          }}
        >
          <input className="admin-input grow" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} aria-label="New name" />
          <button className="btn secondary" type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>
            Rename
          </button>
        </form>
      </div>
    </div>
  );
}

// A single report in the admin queue: the text, a reply box and an optional thank-you gift
function ReportEditor({ report, onDone, notify }) {
  const [response, setResponse] = useState(report.response || '');
  const [giftType, setGiftType] = useState(report.gift?.type || '');
  const [giftAmount, setGiftAmount] = useState(report.gift?.amount || 250);
  const [giftItem, setGiftItem] = useState(report.gift?.item || DROPPABLE[0].id);
  const [giftBox, setGiftBox] = useState(report.gift?.box || BOXES[0].id);
  const [busy, setBusy] = useState(false);
  const grouped = useMemo(() => SLOT_KEYS.map((slot) => [slot, DROPPABLE.filter((i) => i.slot === slot)]), []);

  useEffect(() => {
    setResponse(report.response || '');
    setGiftType(report.gift?.type || '');
    if (report.gift?.amount) setGiftAmount(report.gift.amount);
    if (report.gift?.item) setGiftItem(report.gift.item);
    if (report.gift?.box) setGiftBox(report.gift.box);
  }, [report.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const gift =
    giftType === 'coins' ? { type: 'coins', amount: giftAmount } : giftType === 'box' ? { type: 'box', box: giftBox } : giftType === 'item' ? { type: 'item', item: giftItem } : null;

  const resolve = async () => {
    setBusy(true);
    try {
      const res = await post(`/admin/reports/${report.id}/resolve`, { response, gift });
      sfx.pop();
      notify(`Resolved${gift ? ` with ${giftLabel(gift)}` : ''} — ${report.userName || 'the player'} sees it next login`, 'good');
      onDone(res.report);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      const res = await post(`/admin/reports/${report.id}/reopen`);
      onDone(res.report);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-editor">
      <div className="admin-editor-head">
        <div>
          <div className="admin-user-name">
            <span className={`report-kind-tag ${report.kind}`}>{KIND_LABEL[report.kind]}</span>
            <StatusPill status={report.status} />
            {report.claimed && <span className="badge">gift claimed</span>}
          </div>
          <div className="muted small-text">
            from <b>{report.userName || 'a deleted account'}</b> · {ago(report.createdAt)}
            {report.resolvedAt ? ` · resolved ${ago(report.resolvedAt)}` : ''}
          </div>
        </div>
      </div>

      <p className="report-text-view big">{report.text}</p>

      <div className="admin-section">
        <h4>Reply <span className="muted">(they see this next time they log in)</span></h4>
        <textarea
          className="admin-input grow report-text"
          rows={3}
          maxLength={600}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Thanks for reporting! Fixed in the next update…"
          aria-label="Reply to the player"
        />
      </div>

      <div className="admin-section">
        <h4>Thank-you gift</h4>
        <div className="admin-row-inline">
          <select className="admin-input" value={giftType} onChange={(e) => setGiftType(e.target.value)} aria-label="Gift type">
            <option value="">No gift</option>
            <option value="coins">{CURRENCY}</option>
            <option value="box">Chest</option>
            <option value="item">Cosmetic</option>
          </select>
          {giftType === 'coins' && <input type="number" className="admin-input" min={1} max={100000} value={giftAmount} onChange={(e) => setGiftAmount(Number(e.target.value))} aria-label="Coin amount" />}
          {giftType === 'box' && (
            <select className="admin-input" value={giftBox} onChange={(e) => setGiftBox(e.target.value)} aria-label="Chest">
              {BOXES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {giftType === 'item' && (
            <select className="admin-input grow" value={giftItem} onChange={(e) => setGiftItem(e.target.value)} aria-label="Cosmetic">
              {grouped.map(([slot, items]) => (
                <optgroup key={slot} label={SLOTS[slot].label}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({rarityOf(i).label})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="admin-row-inline">
        <button className="btn primary" disabled={busy} onClick={resolve}>
          {report.status === 'resolved' ? 'Update resolution' : 'Resolve & send'}
        </button>
        {report.status === 'resolved' && (
          <button className="btn ghost" disabled={busy} onClick={reopen}>
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

// The bug/idea queue: open reports first, optionally the resolved history
function ReportList({ notify }) {
  const [all, setAll] = useState(false);
  const [reports, setReports] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = (include = all) =>
    api(`/admin/reports${include ? '?all=1' : ''}`)
      .then((res) => setReports(res.reports))
      .catch((err) => notify(err.message));

  useEffect(() => {
    let cancelled = false;
    api(`/admin/reports${all ? '?all=1' : ''}`)
      .then((res) => !cancelled && setReports(res.reports))
      .catch((err) => !cancelled && notify(err.message));
    return () => {
      cancelled = true;
    };
  }, [all, notify]);

  const onDone = (report) => {
    setReports((list) => (list || []).map((r) => (r.id === report.id ? report : r)).filter((r) => all || r.status === 'open'));
    setSelected(report);
    load();
  };

  const current = selected && (reports || []).find((r) => r.id === selected.id);

  return (
    <div className="admin-body">
      <div className="admin-list">
        <label className="switch-row compact">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span className="switch-text">Show resolved too</span>
        </label>
        {(reports || []).length === 0 && <div className="muted center admin-empty">No {all ? '' : 'open '}reports. The mailbox is empty!</div>}
        {(reports || []).map((r) => (
          <button key={r.id} className={`admin-row${current?.id === r.id ? ' active' : ''}`} onClick={() => setSelected(r)}>
            <span className="admin-row-name">
              <span className={`report-kind-tag ${r.kind}`}>{r.kind === 'bug' ? <Bug size={13} /> : '💡'} {KIND_LABEL[r.kind]}</span>
              <StatusPill status={r.status} />
            </span>
            <span className="admin-row-meta">
              {r.userName || 'deleted'} · {ago(r.createdAt)}
              {r.gift && !r.claimed ? ' · gift waiting' : ''}
            </span>
            <span className="admin-row-text">{r.text.length > 90 ? `${r.text.slice(0, 90)}…` : r.text}</span>
          </button>
        ))}
      </div>
      {current ? <ReportEditor report={current} onDone={onDone} notify={notify} /> : <div className="admin-editor muted center admin-empty">Pick a report to reply or attach a thank-you gift.</div>}
    </div>
  );
}

export default function Admin({ account, onClose, notify, currentCode, onSpectate }) {
  const [tab, setTab] = useState('players');
  const [query, setQuery] = useState('');
  const [guests, setGuests] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api(`/admin/users?q=${encodeURIComponent(query)}&guests=${guests ? 1 : 0}`)
        .then((res) => !cancelled && setResult(res))
        .catch((err) => !cancelled && notify(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, guests, notify]);

  const users = result?.users || [];
  const current = selected && (users.find((u) => u.id === selected.id) || selected);
  const onChange = (user) => {
    setSelected(user);
    setResult((r) => r && { ...r, users: r.users.map((u) => (u.id === user.id ? user : u)) });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Admin">
        <div className="modal-head">
          <h2>Admin</h2>
          <div className="admin-tabs" role="tablist">
            {[
              ['players', 'Players'],
              ['reports', 'Reports'],
              ['games', 'Games'],
            ].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`board-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          <span className="muted">{result && tab === 'players' ? `${(result.total - result.throwaway).toLocaleString()} players · ${result.throwaway.toLocaleString()} drive-by guests` : ''}</span>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

        {tab === 'games' && <ActiveGames currentCode={currentCode} onSpectate={onSpectate} notify={notify} />}

        {tab === 'reports' && <ReportList notify={notify} />}

        {tab === 'players' && (
          <>
            <label className="admin-search">
              <Search />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, account id or Discord id…" autoFocus aria-label="Search players" />
              <button type="button" className={`btn tiny ${query === '#tagged' ? 'secondary' : 'ghost'}`} onClick={() => setQuery(query === '#tagged' ? '' : '#tagged')}>
                Tagged
              </button>
              <button type="button" className={`btn tiny ${guests ? 'secondary' : 'ghost'}`} onClick={() => setGuests((g) => !g)} title="Include guest accounts that never played (every fresh browser makes one)">
                Guests
              </button>
            </label>

            <div className="admin-body">
              <div className={`admin-list${loading ? ' loading' : ''}`}>
                {users.length === 0 && !loading && <div className="muted center admin-empty">No players match.{!guests && ' Drive-by guests are hidden; hit Guests to include them.'}</div>}
                {users.map((u) => (
                  <button key={u.id} className={`admin-row${current?.id === u.id ? ' active' : ''}`} onClick={() => setSelected(u)}>
                    <span className="admin-row-name">
                      {u.discordLinked ? <DiscordMark size={14} className="admin-row-discord" /> : <span className="admin-row-guest" aria-label="Guest" title="Guest account" />}
                      {u.name}
                      <TagBadges tags={u.tags} small />
                    </span>
                    <span className="admin-row-meta">
                      Lv {u.level} · <Coin size={12} /> {u.coins.toLocaleString()} · {ago(u.lastSeen)}
                    </span>
                  </button>
                ))}
              </div>
              {current ? <UserEditor user={current} me={account} onChange={onChange} notify={notify} /> : <div className="admin-editor muted center admin-empty">Pick a player to manage their tags, {CURRENCY} and items.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
