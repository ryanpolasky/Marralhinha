import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { socket, request } from './net/socket';
import { api, post, setToken } from './net/api';
import { bootstrapAuth, startDiscordLogin, logout } from './net/auth';
import { IS_ACTIVITY } from './net/config';
import { unlockAudio, sfx } from './game/sound';
import { startMusic } from './game/music';
import { CURRENCY } from './game/catalog';
import { ROLL_REVEAL_MS, startPendingFor } from './game/moves';
import Home from './components/Home';
import Lobby from './components/Lobby';
import Game from './components/Game';
import AccountBar from './components/AccountBar';
import Shop from './components/Shop';
import Locker from './components/Locker';
import Admin from './components/Admin';

const Scene = lazy(() => import('./three/Scene'));

const ROOM_KEY = 'marralhinha:room';
const NO_NAMES = [null, null, null, null];

const base = { zone: 'base' };
const track = (idx) => ({ zone: 'track', idx });
const home = (slot) => ({ zone: 'home', slot });
const DEMO_BOARD = {
  active: [0, 1, 2, 3],
  marbles: [
    [track(5), track(13), base, base, base],
    [track(27), home(4), track(20), base, base],
    [{ zone: 'center' }, track(44), track(36), base, base],
    [track(58), track(52), home(4), home(3), base],
  ],
  lastMove: null,
  lastRoll: null,
  turn: null,
};
const DEMO_SKINS = [null, { marble: 'marble.galaxy', dice: 'dice.gold' }, { marble: 'marble.gold' }, { marble: 'marble.lava' }];

class SceneBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div className="scene-error">Your browser couldn't start the 3D board. Try enabling hardware acceleration or another browser.</div>;
    return this.props.children;
  }
}

function useRollPending(lastRoll) {
  const [pendingT, setPendingT] = useState(null);
  const seen = useRef(lastRoll?.t);
  const t = lastRoll?.t;
  useEffect(() => {
    if (!t || t === seen.current) return undefined;
    seen.current = t;
    setPendingT(t);
    const timer = setTimeout(() => setPendingT((p) => (p === t ? null : p)), ROLL_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [t]);
  return pendingT !== null && pendingT === t;
}

// True while the "who starts" intro plays for a freshly started game
function useStartPending(game) {
  const remaining = startPendingFor(game);
  const pickT = game?.pick?.t;
  const [, tick] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => tick((n) => n + 1), remaining + 20);
    return () => clearTimeout(timer);
  }, [remaining, pickT]);
  return remaining > 0;
}

const storedRoom = () => {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
};
const urlCode = () => (new URLSearchParams(window.location.search).get('room') || '').toUpperCase();
const setUrl = (code) => {
  if (IS_ACTIVITY) return;
  window.history.replaceState(null, '', code ? `?room=${code}` : window.location.pathname);
};

const App = () => {
  const [account, setAccount] = useState(null);
  const [authError, setAuthError] = useState('');
  const [config, setConfig] = useState({ discord: false });
  const [name, setName] = useState('');
  const [session, setSession] = useState(null);
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [modal, setModal] = useState(null);
  const sessionRef = useRef(null);
  const instanceRef = useRef(null);

  const notify = useCallback((text, tone = 'bad') => setToast({ text, tone, id: Math.random() }), []);

  const saveSession = useCallback((next) => {
    sessionRef.current = next;
    setSession(next);
    try {
      if (next) localStorage.setItem(ROOM_KEY, next.code);
      else localStorage.removeItem(ROOM_KEY);
    } catch {}
    if (next) setUrl(next.code);
    else setRoom(null);
  }, []);

  const enter = useCallback((res) => saveSession({ code: res.code, playerId: res.playerId }), [saveSession]);

  useEffect(() => {
    let cancelled = false;
    const resume = async () => {
      try {
        if (IS_ACTIVITY && instanceRef.current) return enter(await request('room:joinInstance', { instanceId: instanceRef.current }));
        const invite = urlCode();
        const saved = sessionRef.current?.code || storedRoom();
        const code = invite ? (saved === invite ? invite : null) : saved;
        if (code) enter(await request('room:join', { code }));
      } catch (err) {
        if (!IS_ACTIVITY) saveSession(null);
        notify(err.message);
      }
      return undefined;
    };
    const onConnect = () => {
      setConnected(true);
      resume();
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = async (err) => {
      if (err.message !== 'unauthorized' || cancelled) return;
      setToken(null);
      try {
        const res = await bootstrapAuth(name);
        setAccount(res.profile);
        socket.connect();
      } catch (e) {
        setAuthError(e.message);
      }
    };
    const onReaction = (reaction) => {
      const id = `${reaction.t}-${reaction.seat}-${Math.random()}`;
      setReactions((list) => [...list.filter((r) => r.seat !== reaction.seat), { ...reaction, id }]);
      sfx.pop();
      setTimeout(() => setReactions((list) => list.filter((r) => r.id !== id)), reaction.text ? 4500 : 2600);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:state', setRoom);
    socket.on('room:reaction', onReaction);
    socket.on('account:update', setAccount);

    bootstrapAuth()
      .then(({ profile, notice, instanceId }) => {
        if (cancelled) return;
        instanceRef.current = instanceId || null;
        setAccount(profile);
        setName(profile.name);
        if (notice) notify(notice, 'good');
        socket.connect();
      })
      .catch((err) => !cancelled && setAuthError(err.message));
    if (!IS_ACTIVITY) api('/config').then(setConfig).catch(() => {});

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:state', setRoom);
      socket.off('room:reaction', onReaction);
      socket.off('account:update', setAccount);
      socket.disconnect();
    };
  }, [enter, saveSession, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      startMusic();
    };
    const onDown = (e) => {
      unlock();
      const button = e.target.closest?.('button');
      if (button && !button.disabled) sfx.click();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ensureName = async () => {
    const clean = name.trim();
    if (clean && account && clean !== account.name) setAccount((await post('/me/name', { name: clean })).profile);
  };

  const onAction = useCallback((event, payload) => request(event, payload).catch((err) => notify(err.message)), [notify]);

  const equip = useCallback(
    async (slot, item) => {
      try {
        setAccount((await post('/me/equip', { slot, item })).profile);
        sfx.pop();
      } catch (err) {
        notify(err.message);
      }
    },
    [notify]
  );

  const claimDaily = async () => {
    try {
      const res = await post('/daily');
      setAccount(res.profile);
      sfx.coins();
      notify(`+${res.reward} ${CURRENCY}! Day ${res.streak} streak${res.streak > 1 ? ', keep it going' : ''}`, 'good');
    } catch (err) {
      notify(err.message);
    }
  };

  const leave = () => {
    if (room?.game && room.game.phase !== 'over' && !window.confirm('Leave this game? A bot will take over your seat and you forfeit the rewards.')) return;
    request('room:leave').catch(() => {});
    saveSession(null);
    setUrl(null);
  };

  const inRoom = !!(session && room && room.code === session.code);
  const mySeat = inRoom ? room.seats.findIndex((p) => p && p.id === session.playerId) : -1;
  const game = inRoom ? room.game : null;
  const rollPending = useRollPending(game?.lastRoll);
  const startPending = useStartPending(game);
  // The table wears the starter's board once a game is on; before that everyone previews their own
  const tableBoard = game && game.boardSeat !== null ? room.seats[game.boardSeat]?.cosmetics?.board : null;
  const boardSkinId = tableBoard || account?.equipped.board;

  const sceneProps = useMemo(() => {
    if (!inRoom) {
      const cosmetics = DEMO_SKINS.map((skin, s) => (s === 0 ? account?.equipped : skin));
      return { mode: 'idle', board: DEMO_BOARD, names: NO_NAMES, viewSeat: 0, cosmetics };
    }
    const names = room.seats.map((p) => p?.name ?? null);
    const cosmetics = room.seats.map((p) => p?.cosmetics || null);
    const viewSeat = Math.max(mySeat, 0);
    if (!room.game) {
      const active = [0, 1, 2, 3].filter((s) => room.seats[s]);
      const marbles = [0, 1, 2, 3].map((s) => (room.seats[s] ? Array.from({ length: 5 }, () => base) : []));
      return { mode: 'lobby', board: { active, marbles, lastMove: null, lastRoll: null, turn: null }, names, viewSeat, cosmetics };
    }
    const g = room.game;
    const myTurn = g.turn === mySeat && g.phase !== 'over';
    return {
      mode: 'game',
      board: rollPending ? { ...g, turn: g.lastRoll.seat } : startPending ? { ...g, turn: null } : g,
      names,
      viewSeat,
      cosmetics,
      moves: myTurn && g.phase === 'move' && !rollPending ? g.legalMoves : undefined,
      canRoll: myTurn && g.phase === 'roll' && !rollPending && !startPending,
    };
  }, [inRoom, room, mySeat, account?.equipped, rollPending, startPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const [resetKey, setResetKey] = useState(0);
  const sceneRoll = useCallback(() => onAction('game:roll'), [onAction]);
  const sceneMove = useCallback(
    (moveId) => {
      sfx.click();
      onAction('game:move', { moveId });
    },
    [onAction]
  );

  const accountBar = (
    <AccountBar
      account={account}
      discordEnabled={config.discord}
      onShop={() => setModal('shop')}
      onLocker={() => setModal('locker')}
      onAdmin={() => setModal('admin')}
      onDaily={claimDaily}
      onDiscord={() => startDiscordLogin().catch((err) => notify(err.message))}
      onSignOut={async () => {
        if (!window.confirm('Sign out of Discord? Your progress stays saved to your Discord account for next time.')) return;
        await logout();
        localStorage.removeItem(ROOM_KEY);
        window.location.assign(window.location.pathname);
      }}
    />
  );

  let screen;
  if (authError) {
    screen = (
      <div className="screen">
        <div className="panel boot">
          <h2>Couldn't sign you in</h2>
          <p className="muted">{authError}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  } else if (!account || (IS_ACTIVITY && !inRoom)) {
    screen = (
      <div className="screen">
        <div className="boot-spinner">
          <span className="marble-dot" />
          <span>{account ? 'Joining your friends…' : 'Warming up the marbles…'}</span>
        </div>
      </div>
    );
  } else if (!inRoom) {
    screen = (
      <Home
        name={name}
        onNameChange={setName}
        initialCode={urlCode()}
        busy={busy || !connected}
        onCreate={() =>
          run(async () => {
            await ensureName();
            enter(await request('room:create'));
          })
        }
        onQuickPlay={() =>
          run(async () => {
            await ensureName();
            enter(await request('room:create'));
            for (const seat of [1, 2, 3]) await request('lobby:addBot', { seat });
            await request('game:start');
          })
        }
        onJoin={(code) =>
          run(async () => {
            await ensureName();
            enter(await request('room:join', { code }));
          })
        }
      />
    );
  } else if (!game) {
    screen = <Lobby room={room} playerId={session.playerId} onAction={onAction} onLeave={IS_ACTIVITY ? null : leave} />;
  } else {
    screen = (
      <Game
        room={room}
        playerId={session.playerId}
        reactions={reactions}
        rollPending={rollPending}
        startPending={startPending}
        onAction={onAction}
        onLeave={IS_ACTIVITY ? null : leave}
        onResetView={() => setResetKey((k) => k + 1)}
        onShop={() => setModal('shop')}
        coins={account.coins}
      />
    );
  }

  return (
    <div className={`app mode-${sceneProps.mode}`}>
      <div className="scene-layer">
        <SceneBoundary>
          <Suspense fallback={null}>
            <Scene {...sceneProps} boardSkinId={boardSkinId} onRoll={sceneRoll} onMove={sceneMove} resetKey={resetKey} />
          </Suspense>
        </SceneBoundary>
      </div>
      <div className="vignette" />
      {account && !game && accountBar}
      {account && !connected && <div className="banner">Connecting to the game server…</div>}
      {toast && (
        <div key={toast.id} className={`toast ${toast.tone}`} role="alert" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
      {screen}
      {modal === 'shop' && account && <Shop account={account} onClose={() => setModal(null)} onProfile={setAccount} onEquip={equip} notify={notify} />}
      {modal === 'locker' && account && <Locker account={account} onClose={() => setModal(null)} onEquip={equip} onShop={() => setModal('shop')} />}
      {modal === 'admin' && account?.admin && <Admin account={account} onClose={() => setModal(null)} notify={notify} />}
    </div>
  );
};

export default App;
