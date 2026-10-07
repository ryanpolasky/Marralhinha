import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Coins, Nameplate, TagBadges } from './Economy';
import { IS_ACTIVITY } from '../net/config';
import { ChestIcon, GiftIcon, Hanger, Mail, Shield, Trophy, DiscordMark as DiscordLogo } from './Icons';
import { SettingsButton } from './Settings';

// Screens pad their top by the bar's real bottom edge, so a wrapped or resized bar never covers a panel
function useBarHeight(ref) {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return undefined;
    const root = document.documentElement.style;
    const measure = () => root.setProperty('--bar-h', `${Math.ceil(bar.getBoundingClientRect().bottom)}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      root.removeProperty('--bar-h');
    };
  }, [ref]);
}

const PHONE = '(max-width: 620px)';

function useFold(ref, signature, max) {
  const [hidden, setHidden] = useState(0);
  const [tick, setTick] = useState(0);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || hidden >= max || !window.matchMedia?.(PHONE).matches) return;
    const kids = [...bar.children].filter((k) => k.offsetParent);
    const first = kids[0]?.getBoundingClientRect();
    const wrapped = first && kids.some((k) => k.getBoundingClientRect().top > first.bottom - 1);
    if (wrapped || bar.scrollWidth > bar.clientWidth + 1) setHidden((h) => h + 1);
  }, [ref, hidden, max, signature, tick]);
  useLayoutEffect(() => {
    setHidden(0);
  }, [signature, tick]);
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return hidden;
}

const Dots = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2.2" />
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="19" cy="12" r="2.2" />
  </svg>
);

function OverflowMenu({ items, alert }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="bar-more" ref={ref}>
      <button type="button" className={`bar-btn more-btn${alert ? ' alert' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="More" aria-expanded={open} title="More">
        <Dots />
      </button>
      {open && (
        <div className="bar-more-menu" role="menu">
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitem" className={`bar-more-item${it.ready ? ' ready' : ''}`} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon}
              <span>{it.label}</span>
              {it.count > 0 && <span className="mail-count inline">{it.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountBar({ account, discordEnabled, onShop, onLocker, onProfile, onDaily, onDiscord, onSignOut, onAdmin, onBoards, onReport, onMail }) {
  const ref = useRef(null);
  useBarHeight(ref);
  const daily = account?.daily;
  const mailCount = account?.replies?.length || 0;
  const items = account
    ? [
        daily && { key: 'daily', label: daily.available ? 'Daily' : `Day ${daily.streak}`, icon: <GiftIcon />, onClick: onDaily, disabled: !daily.available, ready: daily.available, title: daily.available ? `Claim ${daily.reward} (day ${daily.streak})` : 'Come back tomorrow', className: `bar-btn daily${daily.available ? ' ready' : ''}` },
        { key: 'shop', label: 'Shop', icon: <ChestIcon />, onClick: onShop, className: 'bar-btn shop' },
        { key: 'locker', label: 'Locker', icon: <Hanger />, onClick: onLocker, className: 'bar-btn locker' },
        onBoards && { key: 'boards', label: 'Boards', icon: <Trophy />, onClick: onBoards, title: 'Leaderboards', className: 'bar-btn boards' },
        mailCount > 0 && onMail && { key: 'mail', label: 'Mail', icon: <Mail />, onClick: onMail, count: mailCount, title: `${mailCount} repl${mailCount === 1 ? 'y' : 'ies'} from Ryan`, className: 'bar-btn mail has-mail' },
        account.admin && { key: 'admin', label: 'Admin', icon: <Shield />, onClick: onAdmin, title: 'Manage players and tags', className: 'bar-btn admin-btn' },
      ].filter(Boolean)
    : [];
  const signature = `${items.map((i) => i.key + i.label).join()}|${account?.name}|${account?.discordLinked}|${discordEnabled}`;
  const hidden = useFold(ref, signature, items.length);
  if (!account) return null;
  const pct = Math.min(100, (account.into / account.need) * 100);
  const folded = items.slice(0, hidden);
  const shown = items.slice(hidden);
  return (
    <div className="account-bar" ref={ref}>
      <Nameplate plate={account.equipped.nameplate} className="account-plate">
        <button type="button" className="account-profile-btn" onClick={onProfile} title="View your profile and stats" aria-label="View your profile and stats">
          <span className="level-badge">{account.level}</span>
          <span className="account-info">
            <span className="account-name-row">
              <span className="account-name">{account.name}</span>
              <TagBadges tags={account.tags} small />
            </span>
            <span className="xp-bar" title={`${account.into} / ${account.need} XP`}>
              <span style={{ width: `${pct}%` }} />
            </span>
          </span>
        </button>
        {account.discordLinked && !IS_ACTIVITY && (
          <button className="discord-linked" onClick={onSignOut} title="Signed in with Discord. Click to sign out.">
            <DiscordLogo />
          </button>
        )}
      </Nameplate>

      {!IS_ACTIVITY && discordEnabled && !account.discordLinked && (
        <button className="discord-signin" onClick={onDiscord} title="Save your progress to your Discord account">
          <DiscordLogo />
          <span>Sign in with Discord</span>
        </button>
      )}

      <Coins amount={account.coins} className="coins-pill" />

      <div className="account-actions">
        {folded.length > 0 && <OverflowMenu items={folded} alert={folded.some((i) => i.ready || i.count > 0)} />}
        {shown.map((it) => (
          <button key={it.key} className={it.className} onClick={it.onClick} disabled={it.disabled} title={it.title}>
            {it.icon}
            <span>{it.label}</span>
            {it.count > 0 && <span className="mail-count">{it.count}</span>}
          </button>
        ))}
        <SettingsButton className="bar-btn settings-btn" onReport={onReport} />
      </div>
    </div>
  );
}
