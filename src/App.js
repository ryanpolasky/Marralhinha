import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { socket, request } from './net/socket';
import { api, post, setToken } from './net/api';
import { bootstrapAuth, startDiscordLogin, logout, onPreviewMode } from './net/auth';
import { IS_ACTIVITY } from './net/config';
import { unlockAudio, sfx } from './game/sound';
import { getSettings } from './game/settings';
import PingMenu from './components/PingMenu';
import Toast from './components/Toast';
import { startMusic } from './game/music';
import { CURRENCY } from './game/catalog';
import { warmBoardSkin } from './game/skinWarm';
import { quality } from './three/quality';
import { PING_LIFE_MS, START_WHEEL_SPIN_MS, coveringTurn } from './game/moves';
import { useHandoff, useRollPending, useStartPending } from './game/pending';
import BOARDS from './shared/boards.json';
import Home from './components/Home';
import Lobby from './components/Lobby';
import LocalLobby from './components/LocalLobby';
import { LocalRoom, loadLocal, savedGameExists } from './local/LocalRoom';
import { applyUpdate } from './serviceWorkerRegistration';
import { useWakeLock } from './game/wakeLock';
import Game from './components/Game';
import AccountBar from './components/AccountBar';
import Shop from './components/Shop';
import Locker from './components/Locker';
import Admin from './components/Admin';
import Profile from './components/Profile';
import PlayerCard from './components/PlayerCard';
import Leaderboard from './components/Leaderboard';
import { ReportModal, RepliesModal } from './components/Reports';
import { DialogHost, ask } from './components/Dialog';

const Scene = lazy(() => import('./three/Scene'));

const ROOM_KEY = 'marralhinha:room';
const NO_NAMES = [null, null, null, null];
const NO_PINGS = [];

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

// The starter's board is part of the wheel's reveal: keep your own board until the wheel lands
function useBoardRevealed(game) {
  const pick = game?.pick;
  const wait = pick?.reason === 'wheel' ? START_WHEEL_SPIN_MS - (Date.now() - pick.t) : 0;
  const [, tick] = useState(0);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => tick((n) => n + 1), wait + 20);
    return () => clearTimeout(timer);
  }, [wait > 0, pick?.t]); // eslint-disable-line react-hooks/exhaustive-deps
  return wait <= 0;
}

// Favourite colour from Settings, sent whenever we take a seat so the server can give it to us if it's free
const favorite = () => getSettings().favoriteSeat;

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
  const [localView, setLocalView] = useState(null);
  const localRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [pings, setPings] = useState([]);
  const [pingMenu, setPingMenu] = useState(null);
  const [preview, setPreview] = useState(false);
  // Team chat arrives on its own channel (never in the shared room state), tagged with the room it belongs to
  const [teamLog, setTeamLog] = useState({ code: null, entries: [] });
  const mySeatRef = useRef(-1);
  const [modal, setModal] = useState(null);
  // The player card being peeked at (right-clicked nameplates, end-screen rows, leaderboard rows)
  const [peek, setPeek] = useState(null);
  const mailShown = useRef(false);
  const sessionRef = useRef(null);
  const instanceRef = useRef(null);

  const notify = useCallback((text, tone = 'bad') => setToast({ text, tone, id: Math.random() }), []);
  const dismissToast = useCallback((id) => setToast((t) => (t && t.id === id ? null : t)), []);

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
    let unPreview = () => {};
    const resume = async () => {
      try {
        if (IS_ACTIVITY && instanceRef.current) return enter(await request('room:joinInstance', { instanceId: instanceRef.current, prefer: favorite() }));
        const invite = urlCode();
        const saved = sessionRef.current?.code || storedRoom();
        // No saved room on this device? Pick up wherever this account is already seated (e.g. on another device)
        const code = invite ? (saved === invite ? invite : null) : saved || (await request('room:current')).code;
        if (code) {
          try {
            enter(await request('room:join', { code, prefer: favorite() }));
          } catch (err) {
            // Rooms live in server memory, so a missing saved room almost always means it closed or the server restarted
            if (/not found/i.test(err.message) && code === saved) throw new Error(`Room ${code} has closed (the game server may have restarted). Start a new one!`);
            throw err;
          }
        }
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
    const onRoomLeft = ({ code, reason }) => {
      if (sessionRef.current?.code !== code) return;
      saveSession(null);
      setUrl(null);
      if (reason) notify(reason, 'good');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:state', setRoom);
    socket.on('room:reaction', onReaction);
    // Newest two pings per sender; your own always show, others respect the "Show pings" setting
    const onPing = (ping) => {
      const mine = ping.seat !== null && ping.seat === mySeatRef.current;
      if (!mine && !getSettings().showPings) return;
      const sender = (p) => (p.seat === null ? `dev:${p.name}` : p.seat);
      setPings((list) => {
        const fromSender = list.filter((p) => sender(p) === sender(ping));
        const drop = fromSender.length >= 2 ? fromSender[0].id : null;
        return [...list.filter((p) => p.id !== drop), ping];
      });
      sfx.ping(ping.type, ping.scope === 'team');
      setTimeout(() => setPings((list) => list.filter((p) => p.id !== ping.id)), PING_LIFE_MS + 200);
    };
    const onTeamChat = (entry) => setTeamLog((log) => ({ ...log, entries: [...log.entries, entry].slice(-60) }));
    const onTeamLog = ({ code, entries }) => setTeamLog({ code, entries });
    const onLuckyChange = (message) => notify(message, 'good');
    const onHost = ({ id, name }) => {
      const mine = id === sessionRef.current?.playerId;
      notify(mine ? "You're the host now. Start when ready." : `${name} is the host now`, 'good');
      (mine ? sfx.turn : sfx.pop)();
    };
    const onRematchVote = ({ id, name, on, fired }) => {
      if (id === sessionRef.current?.playerId || fired) return;
      notify(on ? `${name} wants a rematch` : `${name} backed out of the rematch`, 'good');
      sfx.pop();
    };
    const onTableEnded = ({ id, name }) => {
      setPings([]);
      setReactions([]);
      setTeamLog({ code: null, entries: [] });
      notify(id === sessionRef.current?.playerId ? 'You ended the game. Back to lobby.' : `${name} ended the game. Back to lobby.`, 'good');
      sfx.pop();
    };
    socket.on('room:ping', onPing);
    socket.on('room:teamChat', onTeamChat);
    socket.on('room:teamLog', onTeamLog);
    socket.on('room:left', onRoomLeft);
    socket.on('room:host', onHost);
    socket.on('room:rematch', onRematchVote);
    socket.on('room:tableEnded', onTableEnded);
    socket.on('account:update', setAccount);
    socket.on('luckiest:change', onLuckyChange);

    bootstrapAuth()
      .then(({ profile, notice, instanceId }) => {
        if (cancelled) return;
        instanceRef.current = instanceId || null;
        setAccount(profile);
        setName(profile.name);
        if (notice) notify(notice, 'good');
        unPreview = onPreviewMode(setPreview);
        socket.connect();
      })
      .catch((err) => !cancelled && setAuthError(err.message));
    if (!IS_ACTIVITY) api('/config').then(setConfig).catch(() => {});

    return () => {
      cancelled = true;
      unPreview();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:state', setRoom);
      socket.off('room:reaction', onReaction);
      socket.off('room:left', onRoomLeft);
      socket.off('room:host', onHost);
      socket.off('room:rematch', onRematchVote);
      socket.off('room:tableEnded', onTableEnded);
      socket.off('room:ping', onPing);
      socket.off('room:teamChat', onTeamChat);
      socket.off('room:teamLog', onTeamLog);
      socket.off('account:update', setAccount);
      socket.off('luckiest:change', onLuckyChange);
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
    // pointerdown isn't a user activation everywhere (e.g. iOS Safari), so click/touchend/keydown also unlock
    const gestures = ['click', 'touchend', 'keydown'];
    window.addEventListener('pointerdown', onDown);
    gestures.forEach((type) => window.addEventListener(type, unlock));
    return () => {
      window.removeEventListener('pointerdown', onDown);
      gestures.forEach((type) => window.removeEventListener(type, unlock));
    };
  }, []);

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

  // Same cleanup the server does, so we never re-send a name it already normalized
  const cleanName = name.replace(/\s+/g, ' ').trim();

  const ensureName = async () => {
    if (cleanName && account && cleanName !== account.name) setAccount((await post('/me/name', { name: cleanName })).profile);
  };

  // Save name edits on their own once typing pauses, instead of only when a room gets created
  useEffect(() => {
    if (!cleanName || !account || cleanName === account.name) return undefined;
    const t = setTimeout(() => {
      post('/me/name', { name: cleanName })
        .then((res) => setAccount(res.profile))
        .catch((err) => notify(err.message));
    }, 900);
    return () => clearTimeout(t);
  }, [cleanName, account?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAction = useCallback(
    (event, payload) => {
      if (localRef.current) {
        try {
          return Promise.resolve(localRef.current.action(event, payload));
        } catch (err) {
          notify(err.message);
          return Promise.reject(err);
        }
      }
      return request(event, payload).catch((err) => notify(err.message));
    },
    [notify]
  );

  const openLocal = useCallback(
    (resume = false) => {
      localRef.current?.dispose();
      const saved = loadLocal();
      const local = new LocalRoom(resume ? saved : saved && { ...saved, game: null });
      local.setSkin(account?.equipped || null);
      local.subscribe(setLocalView);
      localRef.current = local;
      setLocalView(local.view());
      setUrl(null);
    },
    [account?.equipped]
  );

  const closeLocal = useCallback(() => {
    localRef.current?.dispose();
    localRef.current = null;
    setLocalView(null);
    setViewOverride(null);
  }, []);

  useEffect(() => {
    const wake = () => !document.hidden && localRef.current?.resume();
    document.addEventListener('visibilitychange', wake);
    return () => document.removeEventListener('visibilitychange', wake);
  }, []);

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

  // Dev replies to your reports pop once per session, on first profile load
  useEffect(() => {
    if (account?.replies?.length && !mailShown.current) {
      mailShown.current = true;
      setModal('replies');
    }
  }, [account?.replies?.length]);

  const view = localView || room;
  const sess = localView ? { code: localView.code, playerId: localView.activePlayerId } : session;
  const inRoom = !!(sess && view && view.code === sess.code);
  const mySeat = inRoom ? view.seats.findIndex((p) => p && p.id === sess.playerId) : -1;
  mySeatRef.current = mySeat;
  useWakeLock(!!localView?.game && localView.game.phase !== 'over');

  useEffect(() => {
    if (!localRef.current) return;
    localRef.current.setSkin(account?.equipped || null);
    setLocalView(localRef.current.view());
  }, [account?.equipped]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('local') || IS_ACTIVITY) return;
    window.history.replaceState(null, '', window.location.pathname);
    openLocal(savedGameExists());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [swUpdate, setSwUpdate] = useState(null);
  useEffect(() => {
    const on = (e) => setSwUpdate(e.detail);
    window.addEventListener('sw-update', on);
    return () => window.removeEventListener('sw-update', on);
  }, []);
  useEffect(() => {
    if (!swUpdate || inRoom) return;
    setSwUpdate(null);
    ask({ title: 'Update ready', message: 'A new version of Marralhinha is ready. Reload to get it.', confirm: 'Reload', cancel: 'Later' }).then((ok) => ok && applyUpdate(swUpdate));
  }, [swUpdate, inRoom]);

  const leave = async () => {
    if (localView) {
      if (localView.game && localView.game.phase !== 'over') {
        const ok = await ask({ title: 'Leave this game?', message: 'Your game is saved on this device. Pick it back up from the home screen.', confirm: 'Leave game', cancel: 'Keep playing' });
        if (!ok) return;
      } else localRef.current?.action('local:menu');
      closeLocal();
      return;
    }
    // With another device still in the room, leaving here just hands control to that device
    const onlyDevice = (view?.seats[mySeat]?.devices ?? 1) <= 1;
    if (mySeat >= 0 && onlyDevice && view?.game && view.game.phase !== 'over') {
      const ok = await ask({ title: 'Leave this game?', message: 'A bot will take over your seat and you forfeit the rewards.', confirm: 'Leave game', cancel: 'Keep playing', tone: 'danger' });
      if (!ok) return;
    }
    request('room:leave').catch(() => {});
    saveSession(null);
    setUrl(null);
  };

  const game = inRoom ? view.game : null;
  // Clicking a nameplate in-game swings the board round to that player's side; cleared per game
  const [viewOverride, setViewOverride] = useState(null);
  const gameKey = game ? `${view.code}:${game.pick?.t}` : null;
  useEffect(() => setViewOverride(null), [gameKey]);

  useEffect(() => {
    document.body.classList.toggle('preview', preview);
    return () => document.body.classList.remove('preview');
  }, [preview]);
  const [rollPending, stuck] = useRollPending(game?.lastRoll, !!localView);
  const handoff = useHandoff(game, view?.seats, !!localView);
  const held = rollPending || stuck || handoff;
  const heldView = useRef(0);
  const [startPending, dismissStart] = useStartPending(game);
  // The server chooses one board for everyone once a game starts; before that everyone previews their own
  const boardRevealed = useBoardRevealed(game);
  // A Dev's mid-game pick wins over the starter's board
  const tableBoard = game?.boardOverride || (game && game.boardSeat !== null && boardRevealed ? view.seats[game.boardSeat]?.cosmetics?.board : null);
  const boardSkinId = tableBoard || account?.equipped?.board;
  // Build the starter's board while the wheel spins (after the camera has settled) so the reveal swaps instead of hitching
  const pendingBoard = game && !boardRevealed && game.boardSeat !== null ? view.seats[game.boardSeat]?.cosmetics?.board : null;
  useEffect(() => {
    if (!pendingBoard) return undefined;
    const t = setTimeout(() => warmBoardSkin(pendingBoard), 1600);
    return () => clearTimeout(t);
  }, [pendingBoard]);

  const sceneProps = useMemo(() => {
    if (!inRoom) {
      const cosmetics = DEMO_SKINS.map((skin, s) => (s === 0 ? account?.equipped : skin));
      return { mode: 'idle', board: DEMO_BOARD, names: NO_NAMES, viewSeat: 0, cosmetics };
    }
    const names = view.seats.map((p) => p?.name ?? null);
    const cosmetics = view.seats.map((p) => p?.cosmetics || null);
    const locked = !!(view.local && view.table);
    const viewSeat = locked ? 0 : Math.max(mySeat, 0);
    if (!view.game) {
      const active = [0, 1, 2, 3].filter((s) => view.seats[s]);
      const spec = BOARDS[view.variant] || BOARDS.classic;
      const marbles = [0, 1, 2, 3].map((s) => (view.seats[s] ? Array.from({ length: spec.marbles }, () => base) : []));
      return { mode: 'lobby', board: { variant: spec.id, active, marbles, lastMove: null, lastRoll: null, turn: null }, names, viewSeat, cosmetics };
    }
    const g = view.game;
    const myTurn = (g.turn === mySeat || coveringTurn(g, view.seats, mySeat)) && g.phase !== 'over';
    if (!(view.local && held)) heldView.current = locked ? 0 : (viewOverride ?? viewSeat);
    return {
      mode: 'game',
      board: held ? { ...g, turn: g.lastRoll.seat } : startPending ? { ...g, turn: null } : g,
      names,
      viewSeat: heldView.current,
      lockCamera: locked,
      cosmetics,
      moves: myTurn && g.phase === 'move' && !held ? g.legalMoves : undefined,
      canRoll: myTurn && g.phase === 'roll' && !held && !startPending,
    };
  }, [inRoom, view, mySeat, account?.equipped, held, startPending, viewOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const [resetKey, setResetKey] = useState(0);
  // True while the camera is panned/zoomed/orbited away from the default view (pulses the reset button)
  const [cameraOff, setCameraOff] = useState(false);
  const sceneRoll = useCallback(() => onAction('game:roll'), [onAction]);
  const sceneMove = useCallback(
    (moveId) => {
      sfx.click();
      onAction('game:move', { moveId });
    },
    [onAction]
  );
  // Seated players can ping; spectators only if they're Dev (the server enforces this too)
  const canPing = !!game && !localView && (mySeat >= 0 || !!account?.admin);
  const teamMode = game?.mode === 'teams' && mySeat >= 0;
  const sendPing = useCallback((ping) => onAction('game:ping', ping), [onAction]);
  const myTeamLog = inRoom && teamLog.code === view.code && game ? teamLog.entries.filter((e) => e.t >= (game.pick?.t || 0)) : [];

  const accountBar = (
    <AccountBar
      account={account}
      discordEnabled={config.discord}
      onShop={() => setModal('shop')}
      onLocker={() => setModal('locker')}
      onProfile={() => setModal('profile')}
      onAdmin={() => setModal('admin')}
      onBoards={() => setModal('boards')}
      onMail={account?.replies?.length ? () => setModal('replies') : undefined}
      onDaily={claimDaily}
      onReport={() => setModal('report')}
      onDiscord={() => startDiscordLogin().catch((err) => notify(err.message))}
      onSignOut={async () => {
        const ok = await ask({ title: 'Sign out of Discord?', message: 'Your progress stays saved to your Discord account for next time.', confirm: 'Sign out' });
        if (!ok) return;
        await logout();
        localStorage.removeItem(ROOM_KEY);
        window.location.assign(window.location.pathname);
      }}
    />
  );

  let screen;
  if (localView && !localView.game) {
    screen = <LocalLobby room={localView} onAction={onAction} onBack={closeLocal} />;
  } else if (authError && !localView) {
    screen = (
      <div className="screen">
        <div className="panel boot">
          <h2>Couldn't sign you in</h2>
          <p className="muted">{authError}</p>
          <div className="boot-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button className="btn secondary" onClick={() => openLocal(savedGameExists())}>
              {savedGameExists() ? "Resume your pass & play game" : "Play pass & play offline"}
            </button>
          </div>
        </div>
      </div>
    );
  } else if (!localView && (!account || (IS_ACTIVITY && !inRoom))) {
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
            enter(await request('room:create', { prefer: favorite() }));
          })
        }
        onQuickPlay={() =>
          run(async () => {
            await ensureName();
            enter(await request('room:quickPlay', { prefer: favorite() }));
          })
        }
        onReport={() => setModal('report')}
        onLocal={() => openLocal(false)}
        onResume={savedGameExists() ? () => openLocal(true) : undefined}
        onJoin={(code) =>
          run(async () => {
            await ensureName();
            enter(await request('room:join', { code, prefer: favorite() }));
          })
        }
      />
    );
  } else if (!game) {
    screen = <Lobby room={view} playerId={sess.playerId} isAdmin={account.admin} onAction={onAction} onLeave={IS_ACTIVITY ? null : leave} onReport={() => setModal('report')} />;
  } else {
    screen = (
      <Game
        room={view}
        playerId={sess.playerId}
        reactions={reactions}
        teamLog={myTeamLog}
        isAdmin={!!account?.admin}
        rollPending={rollPending}
        stuck={stuck}
        handoff={handoff}
        startPending={startPending}
        onDismissStart={dismissStart}
        onAction={onAction}
        onLeave={IS_ACTIVITY ? null : leave}
        cameraOff={cameraOff}
        onResetView={() => {
          setViewOverride(null);
          setResetKey((k) => k + 1);
        }}
        viewSeat={viewOverride ?? Math.max(mySeat, 0)}
        onViewSeat={(seat) => {
          setViewOverride(seat === Math.max(mySeat, 0) ? null : seat);
          setResetKey((k) => k + 1);
        }}
        onShop={() => setModal('shop')}
        onReport={() => setModal('report')}
        onPlayerStats={(p) => p?.userId && setPeek(p)}
        coins={account?.coins ?? 0}
      />
    );
  }

  return (
    <div className={`app mode-${sceneProps.mode}${quality.glass ? '' : ' flat-glass'}`}>
      <div className="scene-layer">
        <SceneBoundary>
          <Suspense fallback={<div className="scene-loading" aria-hidden="true" />}>
            <Scene
              {...sceneProps}
              preview={preview}
              mySeat={inRoom ? mySeat : -1}
              boardSkinId={boardSkinId}
              onRoll={sceneRoll}
              onMove={sceneMove}
              resetKey={resetKey}
              pings={game ? pings : NO_PINGS}
              teams={game?.mode === 'teams'}
              canPing={canPing}
              onPing={sendPing}
              onPingMenu={setPingMenu}
              onCameraOffView={setCameraOff}
            />
          </Suspense>
        </SceneBoundary>
      </div>
      <div className="vignette" />
      {account && !game && !localView && accountBar}
      {account && !connected && !localView && <div className="banner">Connecting to the game server…</div>}
      {toast && <Toast key={toast.id} toast={toast} onDone={dismissToast} />}
      {screen}
      {modal === 'shop' && account && <Shop account={account} onClose={() => setModal(null)} onProfile={setAccount} onEquip={equip} notify={notify} />}
      {modal === 'locker' && account && <Locker account={account} onClose={() => setModal(null)} onEquip={equip} onShop={() => setModal('shop')} />}
      {modal === 'admin' && account?.admin && (
        <Admin
          account={account}
          onClose={() => setModal(null)}
          notify={notify}
          currentCode={inRoom ? room.code : null}
          onSpectate={(code) =>
            run(async () => {
              enter(await request('room:join', { code, spectate: true }));
              setModal(null);
            })
          }
        />
      )}
      {modal === 'profile' && account && <Profile account={account} onClose={() => setModal(null)} onLocker={() => setModal('locker')} onReport={() => setModal('report')} />}
      {modal === 'boards' && account && <Leaderboard meId={account.id} onClose={() => setModal(null)} onPlayer={(u) => setPeek({ ...u, userId: u.id })} />}
      {modal === 'report' && account && <ReportModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'replies' && account && <RepliesModal replies={account.replies || []} onClose={() => setModal(null)} onClaim={setAccount} />}
      {peek && <PlayerCard userId={peek.userId} hint={peek} onClose={() => setPeek(null)} />}
      {pingMenu && canPing && (
        <PingMenu
          menu={pingMenu}
          teams={teamMode}
          onClose={() => setPingMenu(null)}
          onPick={(type, scope) => {
            sendPing({ x: pingMenu.x, z: pingMenu.z, type, scope });
            setPingMenu(null);
          }}
        />
      )}
      <DialogHost />
    </div>
  );
};

export default App;
