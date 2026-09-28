import React from 'react';

const Icon = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Close = () => (
  <Icon size={18}>
    <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.6" />
  </Icon>
);

export const Hanger = () => (
  <Icon>
    <path d="M9.6 6.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8v.7" />
    <path d="M12 11.3l8.6 5.3c1 .6.6 2.2-.6 2.2H4c-1.2 0-1.6-1.6-.6-2.2L12 11.3z" />
  </Icon>
);

export const GiftIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 7.5C10.6 4.2 7 3.5 6.3 5.6c-.6 1.8 2.6 2.4 5.7 1.9zM12 7.5c1.4-3.3 5-4 5.7-1.9.6 1.8-2.6 2.4-5.7 1.9z" fill="#ffd166" stroke="#b8860b" strokeWidth="1.1" strokeLinejoin="round" />
    <rect x="4.5" y="11" width="15" height="9.5" rx="1.6" fill="#ff5a6e" />
    <rect x="3.5" y="7.6" width="17" height="4.4" rx="1.4" fill="#ff7d8c" />
    <rect x="10.6" y="7.6" width="2.8" height="12.9" fill="#ffd166" />
    <rect x="4.5" y="12" width="15" height="1.4" fill="#000" opacity="0.14" />
  </svg>
);

export const ChestIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.5 11V9.2C3.5 6.3 5.7 4.5 8.5 4.5h7c2.8 0 5 1.8 5 4.7V11z" fill="#9a5a26" />
    <path d="M3.5 11h17v8.2c0 .7-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.6-1.3-1.3z" fill="#c07a3c" />
    <rect x="3.5" y="10.2" width="17" height="1.9" fill="#ffd166" />
    <path d="M7.4 4.8v15.7M16.6 4.8v15.7" stroke="#ffd166" strokeWidth="1.5" />
    <rect x="10.2" y="9.4" width="3.6" height="4.6" rx="1" fill="#ffe8a3" stroke="#b8860b" strokeWidth="0.9" />
    <circle cx="12" cy="11.4" r="0.8" fill="#6b3f18" />
  </svg>
);

export const SoundOn = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </Icon>
);

export const SoundOff = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </Icon>
);

export const Help = () => (
  <Icon>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 4" />
    <path d="M12 17.5h.01" />
  </Icon>
);

export const Camera = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Icon>
);

export const Exit = () => (
  <Icon>
    <path d="M15 4h4v16h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Icon>
);

export const Copy = () => (
  <Icon size={18}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h9" />
  </Icon>
);

export const Chat = () => (
  <Icon>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" />
  </Icon>
);

export const DieIcon = ({ size = 26 }) => (
  <Icon size={size}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
);
