import React, { useEffect, useMemo, useState } from 'react';
import { api, post } from '../net/api';
import { CURRENCY, DROPPABLE, ITEMS, SLOTS, SLOT_KEYS, TAGS, TAG_KEYS, rarityOf } from '../game/catalog';
import { sfx } from '../game/sound';
import { Coin, Coins, TagBadges } from './Economy';
import { Close, Search, DiscordMark } from './Icons';

const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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

export default function Admin({ account, onClose, notify }) {
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
          <span className="muted">{result ? `${(result.total - result.throwaway).toLocaleString()} players · ${result.throwaway.toLocaleString()} drive-by guests` : ''}</span>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

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
      </div>
    </div>
  );
}
