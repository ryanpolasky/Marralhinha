import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { beamHum, fanfare, labBed, loadSample, playClip, sfx, stopFlashbang, ufoBed } from '../game/sound';
import { muteMusic, unduckMusic } from '../game/music';
import { FLASH, UFO, UFO_SCRIPT, liveStunt, rockyTiming, stuntClock } from '../game/stunts';

const SONG = 'gonna-fly-now';
const WHITE_S = FLASH.white + FLASH.fade;
const GRADES = ['ufo-night', 'ufo-lab', 'ufo-sitcom'];

function ufoBeats(s, { at, span, setUfo }) {
  const grade = (from, to, name) =>
    span(from, to, () => document.body.classList.add(name), () => document.body.classList.remove(name));
  const bed = (from, to, start) => {
    let stop = null;
    span(from, to, () => (stop = start()), () => stop?.());
  };
  const stamp = (from, to, lines) => {
    let delay = 0;
    const typed = lines.map((text) => {
      const line = { text, delay, duration: text.length * 0.065 };
      at(from + delay, () => sfx.typewriter(text.length));
      delay += line.duration + 0.16;
      return line;
    });
    span(from, to, () => setUfo((u) => ({
      ...u,
      stamp: { key: `${s.id}:${from}`, lines: typed, elapsed: Math.max(0, stuntClock(s) - from) },
    })), () => setUfo((u) => (u?.stamp?.key === `${s.id}:${from}` ? { ...u, stamp: null } : u)));
  };
  const dream = (cut) => {
    const from = cut - 1;
    at(from, sfx.dream);
    span(from, cut + 0.8,
      () => document.body.classList.add('ufo-dream'),
      () => document.body.classList.remove('ufo-dream'));
  };

  span(0, UFO.end, () => {
    muteMusic();
    setUfo({ id: s.id, stamp: null, chyron: null, line: null });
    document.body.classList.add('stunt-ufo');
  }, () => {
    document.body.classList.remove('stunt-ufo', 'ufo-dream', ...GRADES);
    setUfo((u) => (u?.id === s.id ? null : u));
    unduckMusic(1500);
  });

  grade(0, UFO.toLab, 'ufo-night');
  bed(0, UFO.toLab, () => ufoBed());
  stamp(0.5, UFO.lift, ['TERCEIRA, AÇORES', '23:47']);
  at(UFO.arrive, sfx.ufoArrive);
  at(UFO.lock - 0.4, sfx.servo);
  bed(UFO.beam, UFO.aboard + 0.1, () => beamHum({ seconds: UFO.aboard - UFO.beam }));
  at(UFO.aboard - 0.05, sfx.slurp);
  at(UFO.aboard + 0.2, sfx.hatch);

  grade(UFO.toLab, UFO.kitchen, 'ufo-lab');
  bed(UFO.toLab, UFO.kitchen, () => labBed({ seconds: UFO.kitchen - UFO.toLab }));
  dream(UFO.kitchen);

  grade(UFO.kitchen, UFO.lab2, 'ufo-sitcom');
  span(UFO.kitchen + 0.2, UFO.kitchen + 3.6, () => setUfo((u) => ({ ...u, chyron: { title: 'Tulsa, Oklahoma', sub: '2009' } })), () => setUfo((u) => (u ? { ...u, chyron: null } : u)));
  [0, 0.5, 1.0].forEach((d) => at(UFO.tick + d, sfx.clockTick));
  at(UFO.ding, sfx.toasterDing);
  at(UFO.ding + 0.12, sfx.alienScream);
  at(UFO.ding + 0.55, sfx.thud);
  [0, 0.17, 0.34].forEach((d) => at(UFO.pew + d, sfx.pew));
  at(UFO.pew + 0.55, sfx.sizzle);
  at(UFO.ding + 1.06, sfx.clack);
  at(UFO.ding + 1.29, sfx.clack);
  dream(UFO.lab2);

  grade(UFO.lab2, UFO.board2, 'ufo-lab');
  bed(UFO.lab2, UFO.board2, () => labBed({ seconds: UFO.board2 - UFO.lab2 }));
  at(UFO.lab2 + 0.15, sfx.alienLaugh);
  at(UFO.poke1, () => sfx.boing(0));
  at(UFO.poke2, () => sfx.boing(1));
  at(UFO.poke3, () => sfx.boing(2));
  at(UFO.button, sfx.bigButton);
  at(UFO.button + 0.2, sfx.klaxon);
  at(UFO.drop, sfx.trapdoor);

  at(UFO.board2, sfx.cutThunk);
  grade(UFO.board2, UFO.fade, 'ufo-night');
  bed(UFO.board2, UFO.fade, () => ufoBed({ vol: 0.6 }));
  at(UFO.eject, sfx.ptoo);
  at(UFO.land, () => {
    sfx.thud();
    sfx.land();
  });
  at(UFO.leave, sfx.ufoZoom);
  stamp(UFO.stamp, UFO.end - 0.1, ['SUBJECT RETURNED.', 'MEMORY: WIPED.']);

  UFO_SCRIPT.forEach((line) => {
    at(line.at, () => sfx.alienVoice(line.who, line.text));
    span(line.at, line.until,
      () => setUfo((u) => (u?.id === s.id ? { ...u, line } : u)),
      () => setUfo((u) => (u?.id === s.id && u.line === line ? { ...u, line: null } : u)));
  });
}

// The HUD half of the one-marble bits: the flashbang whiteout and ringing, Rocky's grade and title, and the close encounter
export function StuntOverlay({ stunts = [], names = [], onCut }) {
  const [white, setWhite] = useState(null);
  const [cine, setCine] = useState(null);
  const [caption, setCaption] = useState(null);
  const [ufo, setUfo] = useState(null);
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
          if (state === 2) return;
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
      } else if (s.kind === 'ufo') {
        span(0, UFO.fade, () => setCine(s.id), () => setCine((c) => (c === s.id ? null : c)));
        ufoBeats(s, {
          at,
          span,
          setUfo,
        });
      } else if (s.kind === 'rocky') {
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
    live.current.forEach((stop, id) => {
      if (ids.has(id)) return;
      stop();
      live.current.delete(id);
    });
    stunts.forEach((s) => {
      if (!live.current.has(s.id) && !s.cut) live.current.set(s.id, begin(s));
      if (s.cut && live.current.has(s.id)) {
        live.current.get(s.id)();
        live.current.set(s.id, () => {});
        if (s.kind === 'dice' && (s.cutAge || 0) < 2000) sfx.rewind?.();
      }
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
      {ufo && <div className="ufo-grade" aria-hidden="true" />}
      <div className="hit-bar top" />
      <div className="hit-bar bottom" />
      {caption && (
        <div key={caption.key} className="hit-caption rocky">
          <b>{caption.title}</b>
          <span>{caption.sub}</span>
        </div>
      )}
      {ufo?.stamp && (
        <div key={ufo.stamp.key} className="ufo-stamp" role="status">
          {ufo.stamp.lines.map((line) => (
            <span key={line.text} style={{
              '--n': line.text.length,
              '--duration': `${line.duration}s`,
              '--delay': `${line.delay - ufo.stamp.elapsed}s`,
            }}>
              {line.text}
            </span>
          ))}
        </div>
      )}
      {ufo?.chyron && (
        <div className="ufo-chyron">
          <b>{ufo.chyron.title}</b>
          <span>{ufo.chyron.sub}</span>
        </div>
      )}
      {ufo?.line && (
        <div key={`${ufo.id}:${ufo.line.at}`} className={`ufo-dialogue speaker-${ufo.line.who}`} role="status">
          <b>{ufo.line.who === 0 ? 'Zorp' : 'Klarg'}</b>
          <span>{ufo.line.text}</span>
        </div>
      )}
      {white && <div key={white} className="stunt-white" />}
    </div>,
    document.body
  );
}
