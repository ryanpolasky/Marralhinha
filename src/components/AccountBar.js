import React from 'react';
import { Coins, Nameplate, TagBadges } from './Economy';
import { IS_ACTIVITY } from '../net/config';
import { ChestIcon, GiftIcon, Hanger, Shield } from './Icons';
import { SettingsButton } from './Settings';

const DiscordLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M19.6 5.3A17.6 17.6 0 0 0 15.3 4l-.5 1.1a16.3 16.3 0 0 0-4.9 0L9.4 4a17.5 17.5 0 0 0-4.4 1.3C2.3 9.4 1.5 13.4 1.9 17.3a17.8 17.8 0 0 0 5.4 2.7l1.1-1.8a11.5 11.5 0 0 1-1.8-.9l.4-.3a12.6 12.6 0 0 0 10.8 0l.4.3c-.6.3-1.2.6-1.8.9l1.1 1.8a17.7 17.7 0 0 0 5.4-2.7c.5-4.5-.8-8.5-3.3-12zM8.7 14.9c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2zm6.6 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2z"
    />
  </svg>
);

export default function AccountBar({ account, discordEnabled, onShop, onLocker, onDaily, onDiscord, onSignOut, onAdmin }) {
  if (!account) return null;
  const daily = account.daily;
  const pct = Math.min(100, (account.into / account.need) * 100);
  return (
    <div className="account-bar">
      <Nameplate plate={account.equipped.nameplate} className="account-plate">
        <span className="level-badge" title={`Level ${account.level}`}>
          {account.level}
        </span>
        <span className="account-info">
          <span className="account-name-row">
            <span className="account-name">{account.name}</span>
            <TagBadges tags={account.tags} small />
          </span>
          <span className="xp-bar" title={`${account.into} / ${account.need} XP`}>
            <span style={{ width: `${pct}%` }} />
          </span>
        </span>
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
        {account.admin && (
          <button className="bar-btn admin-btn" onClick={onAdmin} title="Manage players and tags">
            <Shield />
            <span>Admin</span>
          </button>
        )}
        <SettingsButton className="bar-btn settings-btn" />
      </div>
    </div>
  );
}
