import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { removeCustomColor, saveCustomColor, updateSettings, useSettings } from '../game/settings';
import { sfx } from '../game/sound';
import { SEAT_COLORS } from '../game/geometry';
import { Bug, Close, Gear, SoundOn, SoundOff, MusicNote, MusicOff, DiscordMark } from './Icons';
import { DISCORD_INVITE, ExternalLink } from './About';
import { IS_ACTIVITY } from '../net/config';
import { COLOR_BY_ID, COLOR_PALETTE, rawTripletFromHex } from '../game/colors';
import HexInput from './HexInput';

const STEP = 0.05;
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

function VolumeSlider({ label, value, onChange, onRelease, icons: [On, Off], hint }) {
  const percent = Math.round(value * 100);
  const lastOn = useRef(value > 0 ? value : 0.6);
  if (value > 0) lastOn.current = value;
  const muted = value <= 0;
  const set = (next) => onChange(Math.min(1, Math.max(0, Math.round(next / STEP) * STEP)));
  const toggle = () => {
    set(muted ? lastOn.current : 0);
    if (muted) onRelease?.();
  };
  return (
    <div className={`setting volume${muted ? ' muted-setting' : ''}`} style={{ '--pct': value }}>
      <div className="setting-head">
        <span className="setting-label">{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
        <span className="slider-value">{muted ? 'Off' : `${percent}%`}</span>
      </div>
      <div className="slider-row">
        <button type="button" className={`slider-mute${muted ? ' on' : ''}`} onClick={toggle} aria-pressed={muted} aria-label={muted ? `Unmute ${label.toLowerCase()}` : `Mute ${label.toLowerCase()}`} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <Off /> : <On />}
        </button>
        <div className="slider">
          <div className="slider-track" aria-hidden="true">
            <div className="slider-fill" />
            <div className="slider-ticks" />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={percent}
            onChange={(e) => set(Number(e.target.value) / 100)}
            onPointerUp={onRelease}
            onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key) && onRelease?.()}
            aria-label={`${label} volume`}
            aria-valuetext={muted ? 'Off' : `${percent}%`}
          />
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ onClose, onReport, account, onPainterColor }) {
  const settings = useSettings();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal settings-modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="settings-group">
          <h3>Audio</h3>
          <VolumeSlider label="Sounds" value={settings.sound} icons={[SoundOn, SoundOff]} onChange={(sound) => updateSettings({ sound })} onRelease={() => sfx.pop()} />
          <VolumeSlider label="Music" hint="soft background loop" value={settings.music} icons={[MusicNote, MusicOff]} onChange={(music) => updateSettings({ music })} />
        </div>
        <div className="settings-group">
          <h3>Gameplay</h3>
          {onPainterColor && (account?.tags?.includes('painter') || account?.tags?.includes('dev')) ? <PainterColor saved={account.painterColor} onPick={onPainterColor} /> : <FavoriteColor />}
          <AutoRollToggle />
          <label className="switch-row" title="Show arrows other players drop on the board">
            <input type="checkbox" checked={settings.showPings} onChange={(e) => updateSettings({ showPings: e.target.checked })} />
            <span className="switch" aria-hidden="true" />
            <span className="switch-text">
              Show pings
              {FINE_POINTER ? (
                <span className="switch-sub">
                  Point at a spot and press <kbd>H</kbd> (or <kbd>G</kbd> for danger); right-click or long-press also works. In 2v2 pings go to your partner, hold <kbd>Shift</kbd> to ping everyone. Your own pings always show.
                </span>
              ) : (
                <span className="switch-sub">Long-press a spot on the board to drop a ping. Your own pings always show.</span>
              )}
            </span>
          </label>
        </div>
        {(onReport || !IS_ACTIVITY) && (
          <div className="settings-group">
            <h3>Support</h3>
            {onReport && (
              <button className="btn secondary block" onClick={() => { onClose(); onReport(); }}>
                <Bug /> Report & ideas
              </button>
            )}
            {!IS_ACTIVITY && (
              <ExternalLink className="btn secondary block" href={DISCORD_INVITE}>
                <DiscordMark /> Join the official Discord
              </ExternalLink>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Which colour you'd like to sit at: used for quick play, new rooms, and joining rooms when it's free
function FavoriteColor() {
  const { favoriteSeat } = useSettings();
  const options = [...SEAT_COLORS.map((c, seat) => ({ seat, ...c })), { seat: null, name: 'Any' }];
  return (
    <div className="setting favorite-color">
      <div className="setting-head">
        <span className="setting-label">Favourite colour</span>
        <span className="setting-hint">you get it whenever the seat is free</span>
      </div>
      <div className="favorite-options" role="radiogroup" aria-label="Favourite colour">
        {options.map((o) => (
          <button
            key={o.name}
            type="button"
            role="radio"
            aria-checked={favoriteSeat === o.seat}
            className={`favorite-option${favoriteSeat === o.seat ? ' on' : ''}${o.seat === null ? ' any' : ''}`}
            style={o.seat === null ? undefined : { '--seat': o.main, '--seat-light': o.light }}
            onClick={() => updateSettings({ favoriteSeat: o.seat })}
            title={o.name}
          >
            {o.seat !== null && <span className="marble-dot mini" />}
            <span>{o.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const CLASSIC_IDS = ['red', 'blue', 'yellow', 'green'];

function PainterColor({ saved, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { painterCustoms = [], favoriteSeat } = useSettings();
  const hex = saved?.startsWith('#');
  const seatId = favoriteSeat === null ? null : CLASSIC_IDS[favoriteSeat];
  const current = saved ? (hex ? rawTripletFromHex(saved) : COLOR_BY_ID[saved]) : seatId ? COLOR_BY_ID[seatId] : null;
  const on = (spec) => (saved || seatId || '').toLowerCase() === spec.toLowerCase();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const choose = (spec) => {
    setOpen(false);
    const seat = CLASSIC_IDS.indexOf(spec);
    updateSettings({ favoriteSeat: seat < 0 ? null : seat });
    if (spec === null ? saved : saved?.toLowerCase() !== spec.toLowerCase()) onPick(spec);
  };
  const swatch = (spec, sw, label) => (
    <button key={spec} type="button" role="radio" aria-checked={on(spec)} className={`seat-swatch${on(spec) ? ' on' : ''}`} style={{ '--sw': sw.main, '--sw-light': sw.light, '--sw-dark': sw.dark }} title={label} aria-label={label} onClick={() => choose(spec)} />
  );
  return (
    <div className="setting painter-color" ref={ref}>
      <div className="setting-head">
        <span className="setting-label">Favourite colour</span>
        <button type="button" className="paint-select" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {current && <span className="marble-dot mini" style={{ '--seat': current.main, '--seat-light': current.light }} />}
          {current ? (hex ? saved.toUpperCase() : current.name) : 'Any'}
          <span className="paint-select-caret" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="paint-select-menu" role="radiogroup" aria-label="Favourite colour">
          <div className="paint-grid">{COLOR_PALETTE.map((sw) => swatch(sw.id, sw, sw.name))}</div>
          {painterCustoms.length > 0 && <div className="paint-grid paint-saved">{painterCustoms.map((h) => swatch(h, rawTripletFromHex(h), `Saved ${h.toUpperCase()}`))}</div>}
          <div className="paint-pop-foot">
            <button type="button" className={`paint-chip${current ? '' : ' on'}`} disabled={!current} onClick={() => choose(null)}>
              Any
            </button>
            <label className={`paint-chip hex${hex ? ' on' : ''}`} title="Pick any colour">
              <span className="marble-dot mini" style={hex ? { '--seat': current.main, '--seat-light': current.light } : undefined} />
              Custom
              <HexInput
                value={current?.main || '#8a5cf6'}
                onCommit={(value) => {
                  saveCustomColor(value);
                  choose(value.toLowerCase());
                }}
                aria-label="Custom Painter colour"
              />
            </label>
            {hex && painterCustoms.includes(saved.toLowerCase()) && (
              <button type="button" className="paint-chip forget" title={`Remove ${saved.toUpperCase()} from saved colours`} onClick={() => removeCustomColor(saved)}>
                <span className="marble-dot mini" style={{ '--seat': current.main, '--seat-light': current.light }} />
                Forget
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AutoRollToggle() {
  const { autoRoll } = useSettings();
  return (
    <label className="switch-row" title="Roll automatically when it's your turn">
      <input type="checkbox" checked={autoRoll} onChange={(e) => updateSettings({ autoRoll: e.target.checked })} />
      <span className="switch" aria-hidden="true" />
      <span className="switch-text">
        Auto-roll
        <span className="switch-sub">Roll the dice automatically when it's your turn. You still pick the marble.</span>
      </span>
    </label>
  );
}

export function SettingsButton({ className = 'icon-btn', label = false, onReport, account, onPainterColor }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} aria-label="Settings" title="Settings">
        <Gear />
        {label && <span>Settings</span>}
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} onReport={onReport} account={account} onPainterColor={onPainterColor} />}
    </>
  );
}
