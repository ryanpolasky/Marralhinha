import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { loadSample, setRain, sfx } from '../game/sound';
import { muteMusic, unduckMusic } from '../game/music';
import { HIT, LINE_MAX, downMarbles, hitClock, liveHits, marbleLabel, pickShot } from '../game/hits';
import { fx } from '../three/fx';

export const BITS = [{ key: 'hit', name: 'The hit', desc: 'One marble pulls a gun on another. Grim music cut, letterbox, a cinematic orbit, then Undo walks it off.' }];

// The HUD half of the dev hit: music cut, the grim grade, letterbox, muzzle flash, captions and the rewind on undo
export function HitOverlay({ hits = [], names = [], onUndo }) {
  const [grim, setGrim] = useState([]);
  const [flash, setFlash] = useState(0);
  const [caption, setCaption] = useState(null);
  const [rewind, setRewind] = useState(0);
  const seen = useRef(new Set());
  const timers = useRef(new Map());
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    loadSample('gunshot');
    const all = timers.current;
    const seenHits = seen.current;
    // Forget what we've played too, or StrictMode's remount clears the beats and never reschedules them
    return () => {
      all.forEach((list) => list.forEach(clearTimeout));
      all.clear();
      seenHits.clear();
    };
  }, []);

  // The grade, rain and silence hold for as long as any hit is live
  const on = grim.length > 0;
  useEffect(() => {
    if (!on) return undefined;
    document.body.classList.add('hit-grim');
    muteMusic();
    setRain(true);
    return () => {
      document.body.classList.remove('hit-grim');
      setRain(false);
      unduckMusic();
    };
  }, [on]);

  useEffect(() => {
    const later = (id, ms, fn) => {
      const list = timers.current.get(id) || [];
      list.push(setTimeout(fn, Math.max(0, ms)));
      timers.current.set(id, list);
    };
    const play = (hit) => {
      const t = hitClock(hit);
      const at = (sec, fn) => sec >= t - 0.25 && later(hit.id, (sec - t) * 1000, fn);
      const victim = namesRef.current[hit.victim] || SEAT_COLORS[hit.victim].name;
      const rip = { key: hit.id, kind: 'rip', title: 'Rest in peace', sub: `${victim}'s marble. Gone too soon.` };
      setGrim((g) => [...g, hit.id]);
      at(0, sfx.scratch);
      at(HIT.gun, sfx.cock);
      if (hit.before) at(HIT.say, sfx.pop);
      if (hit.after) at(HIT.quip, sfx.pop);
      at(HIT.shot, () => {
        sfx.gunshot();
        setFlash((n) => n + 1);
      });
      at(HIT.shot + HIT.knock, sfx.land);
      if (t > HIT.rip) setCaption(rip);
      else at(HIT.rip, () => setCaption(rip));
    };
    const undo = (hit) => {
      (timers.current.get(hit.id) || []).forEach(clearTimeout);
      timers.current.delete(hit.id);
      setGrim((g) => g.filter((id) => id !== hit.id));
      sfx.rewind();
      setRewind((n) => n + 1);
      const key = `${hit.id}:undo`;
      setCaption({ key, kind: 'jk', title: 'jk', sub: 'It was just a flesh wound' });
      later(key, 3300, () => setCaption((c) => (c?.key === key ? { ...c, leaving: true } : c)));
      later(key, 3900, () => setCaption((c) => (c?.key === key ? null : c)));
    };
    hits.forEach((hit) => {
      if (!seen.current.has(hit.id)) {
        seen.current.add(hit.id);
        if (!hit.undone) play(hit);
      }
      const undoKey = `${hit.id}:undo`;
      if (hit.undone && !seen.current.has(undoKey)) {
        seen.current.add(undoKey);
        if ((hit.undoneAge || 0) < 2000) undo(hit);
      }
    });
  }, [hits]);

  const last = liveHits(hits).at(-1);
  return createPortal(
    <div className={`hit-overlay${on ? ' grim' : ''}`}>
      {onUndo && last && (
        <button className="btn tiny hit-undo" onClick={() => onUndo(last.id)}>
          Undo the hit
        </button>
      )}
      <div className="hit-shade" aria-hidden="true" />
      <div className="hit-bar top" />
      <div className="hit-bar bottom" />
      {flash > 0 && <div key={`flash-${flash}`} className="hit-flash" />}
      {rewind > 0 && (
        <div key={`rewind-${rewind}`} className="hit-rewind">
          <span>◂◂ REWIND</span>
        </div>
      )}
      {caption && (
        <div key={caption.key} className={`hit-caption ${caption.kind}${caption.leaving ? ' leaving' : ''}`}>
          <b>{caption.title}</b>
          <span>{caption.sub}</span>
        </div>
      )}
    </div>,
    document.body
  );
}

// Two clicks straight on the board, shooter then victim; Escape bails out
export function useMarblePick(game, onDone, onCancel) {
  const [step, setStep] = useState(null);
  const latest = useRef({ game, onDone, onCancel });
  latest.current = { game, onDone, onCancel };
  useEffect(() => {
    if (!step) return undefined;
    const skip = [...downMarbles(latest.current.game)];
    fx.emit('pickmode', step.by ? { skip, notSeat: step.by.seat } : { skip });
    fx.emit('aim', step.by ? { by: step.by } : null);
    const off = fx.on((type, spot) => {
      if (type !== 'picked') return;
      if (!step.by) return setStep({ by: spot });
      setStep(null);
      return latest.current.onDone({ by: step.by.seat, byMarble: step.by.marble, victim: spot.seat, victimMarble: spot.marble });
    });
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setStep(null);
      fx.emit('aim', null);
      latest.current.onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
      fx.emit('pickmode', null);
    };
  }, [step]);
  const cancel = () => {
    setStep(null);
    fx.emit('aim', null);
  };
  return [step, () => setStep({ by: null }), cancel];
}

export function AimBanner({ step, seats, onCancel }) {
  const by = step.by;
  return createPortal(
    <div className="hit-aim-banner" role="status" style={by ? { '--seat': SEAT_COLORS[by.seat].main } : undefined}>
      <b>{by ? 'Now click the victim' : "Click the shooter's marble"}</b>
      <span>{by ? `${seats[by.seat]?.name || SEAT_COLORS[by.seat].name} is armed. Pick anyone else's marble.` : 'Any marble on the board. Esc to cancel.'}</span>
      <button className="btn tiny ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>,
    document.body
  );
}

export function HitTab({ game, seats, mySeat, initial, onRepick, onShoot, onUnshoot }) {
  const live = game.active.filter((s) => seats[s]);
  const [by, setBy] = useState(() => initial?.by ?? (live.includes(mySeat) ? mySeat : live[0]));
  const [victim, setVictim] = useState(() => initial?.victim ?? live.find((s) => s !== by));
  // Exact marbles the dev picked; null falls back to the closest pair
  const [byMarble, setByMarble] = useState(initial?.byMarble ?? null);
  const [victimMarble, setVictimMarble] = useState(initial?.victimMarble ?? null);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const down = downMarbles(game);
  const auto = victim != null && victim !== by ? pickShot(game, by, victim) : null;
  const shot = auto && { ...auto, byMarble: byMarble ?? auto.byMarble, victimMarble: victimMarble ?? auto.victimMarble };
  const ready = shot && !down.has(`${by}:${shot.byMarble}`) && !down.has(`${victim}:${shot.victimMarble}`);
  const name = (s) => seats[s]?.name || SEAT_COLORS[s].name;

  useEffect(() => {
    fx.emit('aim', shot ? { by: { seat: shot.by, marble: shot.byMarble }, victim: { seat: shot.victim, marble: shot.victimMarble } } : null);
  }, [shot?.by, shot?.byMarble, shot?.victim, shot?.victimMarble]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadSample('gunshot');
    return () => fx.emit('aim', null);
  }, []);

  const pickBy = (s) => {
    setBy(s);
    setByMarble(null);
    if (s === victim) {
      setVictim(live.find((v) => v !== s));
      setVictimMarble(null);
    }
  };
  const pickVictim = (s) => {
    setVictim(s);
    setVictimMarble(null);
  };
  const row = (label, seat, pick, skip, marble, pickMarble) => (
    <div className="hit-pick">
      <b>{label}</b>
      <div className="hit-seats">
        {live.map((s) => (
          <button key={s} className={`hit-seat${seat === s ? ' on' : ''}`} style={{ '--seat': SEAT_COLORS[s].main }} disabled={s === skip} aria-pressed={seat === s} onClick={() => pick(s)}>
            {name(s)}
          </button>
        ))}
      </div>
      {seat != null && seat !== skip && (
        <div className="hit-marbles" style={{ '--seat': SEAT_COLORS[seat].main }}>
          {game.marbles[seat].map((_, m) => (
            <button key={m} className={`hit-marble${marble === m ? ' on' : ''}`} disabled={down.has(`${seat}:${m}`)} aria-pressed={marble === m} onClick={() => pickMarble(m)}>
              <span className="hit-marble-dot" />
              {marbleLabel(game, seat, m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="hit-tab">
      <button className="btn tiny secondary hit-repick" onClick={onRepick}>
        Pick marbles on the board
      </button>
      {row('Shooter', by, pickBy, null, shot?.byMarble, setByMarble)}
      {row('Victim', victim, pickVictim, by, shot?.victimMarble, setVictimMarble)}
      <label className="hit-pick">
        <b>Before the shot</b>
        <input className="hit-line" value={before} maxLength={LINE_MAX} placeholder="Say hello to my little friend" onChange={(e) => setBefore(e.target.value)} />
      </label>
      <label className="hit-pick">
        <b>After the shot</b>
        <input className="hit-line" value={after} maxLength={LINE_MAX} placeholder="He had it coming" onChange={(e) => setAfter(e.target.value)} />
      </label>
      <button className="btn danger" disabled={!ready} onClick={() => onShoot({ ...shot, before: before.trim() || null, after: after.trim() || null })}>
        Pull the trigger
      </button>
      <p className="hit-note">Just for show. Nothing on the board actually changes, and Undo walks it off. The rings on the board show who's lined up.</p>
      {liveHits(game.hits).length > 0 && (
        <div className="hit-list">
          {liveHits(game.hits).map((h) => (
            <div key={h.id} className="hit-row">
              <span>
                <b style={{ color: SEAT_COLORS[h.by].main }}>{name(h.by)}</b> shot <b style={{ color: SEAT_COLORS[h.victim].main }}>{name(h.victim)}</b>
              </span>
              <button className="btn tiny ghost" onClick={() => onUnshoot(h.id)}>
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
