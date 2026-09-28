import React from 'react';

const Icon = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
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
