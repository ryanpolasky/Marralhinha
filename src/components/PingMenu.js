import React, { useEffect } from 'react';

// Right-click / long-press menu on the board: pick what kind of ping, and in 2v2 who hears it
export default function PingMenu({ menu, teams, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options = teams
    ? [
        ['look', 'team', 'Ping my team'],
        ['look', 'all', 'Ping everyone'],
        ['danger', 'team', 'Warn my team'],
        ['danger', 'all', 'Warn everyone'],
      ]
    : [
        ['look', 'all', 'Ping here'],
        ['danger', 'all', 'Warn: careful here'],
      ];
  const left = Math.min(menu.screenX, window.innerWidth - 190);
  const top = Math.min(menu.screenY, window.innerHeight - options.length * 44 - 20);

  return (
    <div
      className="ping-menu-backdrop"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="ping-menu" role="menu" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        {options.map(([type, scope, label]) => (
          <button key={`${type}-${scope}`} role="menuitem" className={`ping-option ${type}`} onClick={() => onPick(type, scope)}>
            <span className="ping-option-dot" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
