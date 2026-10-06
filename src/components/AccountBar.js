import React, { useLayoutEffect, useRef } from 'react';
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

export default function AccountBar({ account, discordEnabled, onShop, onLocker, onProfile, onDaily, onDiscord, onSignOut, onAdmin, onBoards, onReport, onMail }) {
  const ref = useRef(null);
  useBarHeight(ref);
  if (!account) return null;
  const daily = account.daily;
  const pct = Math.min(100, (account.into / account.need) * 100);
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
        {daily && (
          <button className={`bar-btn daily${daily.available ? ' ready' : ''}`} onClick={onDaily} disabled={!daily.available} title={daily.available ? `Claim ${daily.reward} (day ${daily.streak})` : 'Come back tomorrow'}>
            <GiftIcon />
            <span>{daily.available ? 'Daily' : `Day ${daily.streak}`}</span>
          </button>
        )}
        <button className="bar-btn shop" onClick={onShop}>
          <ChestIcon />
          <span>Shop</span>
        </button>
        <button className="bar-btn locker" onClick={onLocker}>
          <Hanger />
          <span>Locker</span>
        </button>
        {onBoards && (
          <button className="bar-btn boards" onClick={onBoards} title="Leaderboards">
            <Trophy />
            <span>Boards</span>
          </button>
        )}
        {account.replies?.length > 0 && onMail && (
          <button className="bar-btn mail has-mail" onClick={onMail} title={`${account.replies.length} repl${account.replies.length === 1 ? 'y' : 'ies'} from Ryan`}>
            <Mail />
            <span>Mail</span>
            <span className="mail-count">{account.replies.length}</span>
          </button>
        )}
        {account.admin && (
          <button className="bar-btn admin-btn" onClick={onAdmin} title="Manage players and tags">
            <Shield />
            <span>Admin</span>
          </button>
        )}
        <SettingsButton className="bar-btn settings-btn" onReport={onReport} />
      </div>
    </div>
  );
}
