import React, { useState } from 'react';
import { SEAT_COLORS } from '../game/geometry';
import { randomNickname } from '../game/fun';
import RulesButton from './Rules';
import { DieIcon } from './Icons';
import { Credit } from './About';

export function Logo() {
  return (
    <h1 className="logo" aria-label="Marralhinha">
      {'Marralhinha'.split('').map((ch, i) => (
        <span key={i} style={{ '--c': SEAT_COLORS[i % 4].main, '--d': `${i * 0.07}s` }}>
          {ch}
        </span>
      ))}
    </h1>
  );
}

const PRONUNCIATION_HINT = 'IPA /mɐʁɐˈʎiɲɐ/. Stress on "LEEN". The "rr" is a throaty sound, like a soft French R (an "h" is a good stand-in), "lh" sounds like the "lli" in million, and "nh" like the "ny" in canyon.';

function sayIt() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === 'pt-PT') || voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
  const utterance = new SpeechSynthesisUtterance(voice ? 'Marralhinha' : 'mah hah LEEN yah');
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = 0.85;
  synth.speak(utterance);
}

const SpeakerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export function Pronunciation() {
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const content = (
    <>
      {canSpeak && <SpeakerIcon />}
      <span>
        say it like <b>mah-hah-LEEN-yah</b>
      </span>
    </>
  );
  return canSpeak ? (
    <button type="button" className="pronounce" onClick={sayIt} title={PRONUNCIATION_HINT} aria-label="Hear how to pronounce Marralhinha">
      {content}
    </button>
  ) : (
    <span className="pronounce" title={PRONUNCIATION_HINT}>
      {content}
    </span>
  );
}

export default function Home({ name, onNameChange, initialCode, busy, onCreate, onQuickPlay, onJoin }) {
  const [code, setCode] = useState(initialCode || '');
  const [spin, setSpin] = useState(0);
  const nameOk = name.trim().length > 0;

  return (
    <div className="screen">
      <div className="panel home">
        <div className="logo-wrap">
          <div className="logo-marbles" aria-hidden="true">
            {SEAT_COLORS.map((c, i) => (
              <span key={i} className="marble-dot" style={{ '--seat': c.main, '--seat-light': c.light, '--i': i }} />
            ))}
          </div>
          <Logo />
        </div>
        <Pronunciation />
        <p className="tagline">The marble game from Terceira, Açores</p>

        <label className="field">
          <span>Your name</span>
          <div className="name-row">
            <input value={name} maxLength={16} placeholder="Enter a nickname" onChange={(e) => onNameChange(e.target.value)} autoFocus />
            <button
              type="button"
              className="dice-btn"
              title="Random nickname"
              aria-label="Random nickname"
              style={{ '--spin': `${spin * 360}deg` }}
              onClick={() => {
                setSpin((s) => s + 1);
                onNameChange(randomNickname());
              }}
            >
              <DieIcon size={24} />
            </button>
          </div>
        </label>

        <button className="btn primary big block play-btn" disabled={!nameOk || busy} onClick={onQuickPlay}>
          Quick play vs bots
        </button>
        <button className="btn secondary block" disabled={!nameOk || busy} onClick={onCreate}>
          Create a room for friends
        </button>

        <div className="divider">
          <span>got a code?</span>
        </div>

        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            onJoin(code);
          }}
        >
          <input
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            aria-label="Room code"
          />
          <button className="btn secondary" type="submit" disabled={!nameOk || code.length !== 4 || busy}>
            Join
          </button>
        </form>

        {!nameOk && <p className="hint">Pick a name (or roll one) to start playing</p>}
        <div className="home-footer">
          <RulesButton className="btn link" />
          <Credit />
        </div>
      </div>
    </div>
  );
}
