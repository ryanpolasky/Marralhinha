import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateSettings, useSettings } from '../game/settings';
import { sfx } from '../game/sound';
import { Close, Gear, SoundOn, SoundOff, MusicNote, MusicOff } from './Icons';

const STEP = 0.05;

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

export function SettingsModal({ onClose }) {
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
          <AutoRollToggle />
          <label className="switch-row" title="Show arrows other players drop on the board">
            <input type="checkbox" checked={settings.showPings} onChange={(e) => updateSettings({ showPings: e.target.checked })} />
            <span className="switch" aria-hidden="true" />
            <span className="switch-text">
              Show pings
              <span className="switch-sub">
                Point at a spot and press <kbd>H</kbd> (or <kbd>G</kbd> for danger); right-click or long-press also works. In 2v2 pings go to your partner, hold <kbd>Shift</kbd> to ping everyone. Your own pings always show.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>,
    document.body
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

export function SettingsButton({ className = 'icon-btn', label = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} aria-label="Settings" title="Settings">
        <Gear />
        {label && <span>Settings</span>}
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}
