import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { openExternal } from '../net/auth';
import { IS_ACTIVITY } from '../net/config';

export const AUTHOR = {
  name: 'Ryan Polasky',
  linkedin: 'https://www.linkedin.com/in/ryan-polasky',
  github: 'https://github.com/ryanpolasky',
  email: 'ryan@polasky.net',
};

const SITE = IS_ACTIVITY ? 'https://marralhinha.app' : '';
export const LEGAL = { rules: `${SITE}/how-to-play`, terms: `${SITE}/terms`, privacy: `${SITE}/privacy` };

export function ExternalLink({ href, children, className }) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

export function LegalLinks({ className = '' }) {
  return (
    <div className={`legal-links ${className}`}>
      <ExternalLink href={LEGAL.terms}>Terms of Service</ExternalLink>
      <span aria-hidden="true">·</span>
      <ExternalLink href={LEGAL.privacy}>Privacy Policy</ExternalLink>
    </div>
  );
}

export const Heart = ({ size = 14 }) => (
  <svg className="heart" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 21s-7.5-4.6-10-9.3C.3 8.4 2.1 4.5 5.9 4.1 8.2 3.9 10 5.2 12 7.4c2-2.2 3.8-3.5 6.1-3.3 3.8.4 5.6 4.3 3.9 7.6C19.5 16.4 12 21 12 21z" />
  </svg>
);

const LinkedIn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21h-4z"
    />
  </svg>
);

const GitHub = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.3 4.8 18.3 5.1 18.3 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"
    />
  </svg>
);

const Mail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
  </svg>
);

export function AboutModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal about" role="dialog" aria-label="About this game" onClick={(e) => e.stopPropagation()}>
        <div className="about-marbles" aria-hidden="true">
          {SEAT_COLORS.map((c, i) => (
            <span key={i} className="marble-dot" style={{ '--seat': c.main, '--seat-light': c.light, '--i': i }} />
          ))}
        </div>
        <h2>About this game</h2>
        <div className="about-body">
          <div className="about-story">
            <p>
              Hi, I'm <b>{AUTHOR.name}</b>! I played Marralhinha a ton with my mom, who was born in the Açores. It's the kind of game that turns a quiet evening
              into hours of lucky sixes, groans, and marbles getting sent back home.
            </p>
            <p>
              I built Marralhinha Online to eternalize the game we love and share it with everyone, whether you grew up playing it on Terceira or you're
              discovering it for the very first time.
            </p>
            <p className="about-dedication">
              <Heart /> For my mom :)
            </p>
          </div>
          <div className="about-contact">
            <div className="about-links">
              <ExternalLink className="btn ghost" href={AUTHOR.linkedin}>
                <LinkedIn /> LinkedIn
              </ExternalLink>
              <ExternalLink className="btn ghost" href={AUTHOR.github}>
                <GitHub /> GitHub
              </ExternalLink>
              <a className="btn ghost" href={`mailto:${AUTHOR.email}`}>
                <Mail /> Email
              </a>
            </div>
            <p className="muted small-text">
              Questions, bugs, or a house rule I got wrong? Write to me at <a href={`mailto:${AUTHOR.email}`}>{AUTHOR.email}</a>.
            </p>
          </div>
        </div>
        <button className="btn primary" onClick={onClose}>
          Thanks for playing!
        </button>
        <LegalLinks />
      </div>
    </div>,
    document.body
  );
}

export function Credit({ className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`credit ${className}`} onClick={() => setOpen(true)}>
        Made with <Heart /> by {AUTHOR.name}
      </button>
      {open && <AboutModal onClose={() => setOpen(false)} />}
    </>
  );
}
