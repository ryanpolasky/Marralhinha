import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { fanfare, loadSample, playClip, sfx, stopFlashbang } from '../game/sound';
import { muteMusic, unduckMusic } from '../game/music';
import { FLASH, liveStunt, rockyTiming, stuntClock } from '../game/stunts';

const SONG = 'gonna-fly-now';
const WHITE_S = FLASH.white + FLASH.fade;

// The HUD half of the one-marble bits: the flashbang whiteout and ringing, and Rocky's score, grade, letterbox and title
export function StuntOverlay({ stunts = [], names = [], onCut }) {
  const [white, setWhite] = useState(null);
  const [cine, setCine] = useState(null);
  const [caption, setCaption] = useState(null);
  const live = useRef(new Map());
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    loadSample(SONG);
    loadSample('flashbang');
    const all = live.current;
    return () => {
      all.forEach((stop) => stop());
      all.clear();
    };
  }, []);

  useEffect(() => {
    const begin = (s) => {
      const timers = [];
      const undo = [];
      const t0 = stuntClock(s);
      const at = (sec, fn) => sec >= t0 - 0.25 && timers.push(setTimeout(fn, Math.max(0, (sec - t0) * 1000)));
      const span = (from, to, on, off) => {
        if (t0 >= to) return;
        let state = 0;
        const start = () => {
          state = 1;
          on();
        };
        const end = () => {
          if (state !== 1) return;
          state = 2;
          off();
        };
        if (t0 >= from) start();
        else timers.push(setTimeout(start, (from - t0) * 1000));
        if (Number.isFinite(to)) timers.push(setTimeout(end, (to - t0) * 1000));
        undo.push(end);
      };
      if (s.kind === 'flash') {
        at(FLASH.pin, sfx.pin);
        at(FLASH.toss, sfx.toss);
        at(FLASH.land, sfx.tink);
        at(FLASH.bounce, () => sfx.tink(0.5));
        at(FLASH.bang, () => {
          sfx.flashbang({ hold: FLASH.white, fade: FLASH.fade });
          setWhite(s.id);
        });
        span(FLASH.bang, FLASH.bang + WHITE_S, () => {
          muteMusic();
          document.body.classList.add('stunt-flashed');
        }, () => {
          stopFlashbang();
          document.body.classList.remove('stunt-flashed');
          unduckMusic(2500);
          setWhite((w) => (w === s.id ? null : w));
        });
      } else {
        const time = rockyTiming(s.path.length);
        const who = namesRef.current[s.seat] || SEAT_COLORS[s.seat].name;
        let stopSong = null;
        let dead = false;
        span(0, Infinity, () => {
          muteMusic();
          setCine(s.id);
          document.body.classList.add('stunt-rocky');
          playClip(SONG, { vol: 0.9, offset: () => stuntClock(s), fallback: (ac) => (stuntClock(s) < time.celebrate ? fanfare(ac) : null) }).then((stop) => {
            if (dead) stop?.(0.2);
            else stopSong = stop;
          });
        }, () => {
          dead = true;
          stopSong?.(1.5);
          stopSong = null;
          document.body.classList.remove('stunt-rocky');
          setCine((c) => (c === s.id ? null : c));
          unduckMusic(1500);
        });
        at(time.celebrate, sfx.cheer);
        span(time.celebrate + 0.4, Infinity, () => setCaption({ key: s.id, title: who, sub: 'went the distance' }), () => setCaption((c) => (c?.key === s.id ? null : c)));
      }
      return () => {
        timers.forEach(clearTimeout);
        undo.forEach((off) => off());
      };
    };
    const ids = new Set(stunts.map((s) => s.id));
    stunts.forEach((s) => {
      if (!live.current.has(s.id) && !s.cut) live.current.set(s.id, begin(s));
      if (s.cut && live.current.has(s.id)) {
        live.current.get(s.id)();
        live.current.set(s.id, () => {});
      }
    });
    live.current.forEach((stop, id) => {
      if (ids.has(id)) return;
      stop();
      live.current.delete(id);
    });
  }, [stunts]);

  const running = liveStunt(stunts);
  return createPortal(
    <div className={`hit-overlay stunt-overlay${cine ? ' cine' : ''}`}>
      {onCut && running && (
        <button className="btn tiny hit-undo" onClick={() => onCut(running.id)}>
          Cut the bit
        </button>
      )}
      <div className="hit-bar top" />
      <div className="hit-bar bottom" />
      {caption && (
        <div key={caption.key} className="hit-caption rocky">
          <b>{caption.title}</b>
          <span>{caption.sub}</span>
        </div>
      )}
      {white && <div key={white} className="stunt-white" />}
    </div>,
    document.body
  );
}
