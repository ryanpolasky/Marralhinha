import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateSettings, useSettings } from '../game/settings';
import { isMuted, setMuted, sfx } from '../game/sound';
import { Close, Gear } from './Icons';

function VolumeSlider({ label, value, onChange, onRelease, hint }) {
  const percent = Math.round(value * 100);
  return (
    <label className="setting">
      <span className="setting-label">
        {label}
        {hint && <span className="muted small-text"> {hint}</span>}
      </span>
      <div className="slider-row">
        <input
          type="range"
          min="0"
          max="100"
          value={percent}
          style={{ '--fill': `${percent}%` }}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          onPointerUp={onRelease}
          onKeyUp={onRelease}
          aria-label={`${label} volume`}
        />
        <span className="slider-value">{percent}%</span>
      </div>
    </label>
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
          <VolumeSlider label="Music" hint="(coming soon)" value={settings.music} onChange={(music) => updateSettings({ music })} />
          <VolumeSlider
            label="Sounds"
            value={settings.sound}
            onChange={(sound) => {
              if (sound > 0 && isMuted()) setMuted(false);
              updateSettings({ sound });
            }}
            onRelease={() => sfx.pop()}
          />
        </div>
        <div className="settings-group">
          <h3>Gameplay</h3>
          <AutoRollToggle />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AutoRollToggle({ compact = false }) {
  const { autoRoll } = useSettings();
  return (
    <label className={`switch-row${compact ? ' compact' : ''}`} title="Roll automatically when it's your turn">
      <input type="checkbox" checked={autoRoll} onChange={(e) => updateSettings({ autoRoll: e.target.checked })} />
      <span className="switch" aria-hidden="true" />
      <span>{compact ? 'Auto-roll' : 'Auto-roll when it becomes my turn'}</span>
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
