# Overhaul plan (branch `overhaul`)

Scope agreed on 2026-09-28. In order:

1. **Blitz mode** — 3 marbles, 10-cell arms (40-cell track), 3 home slots, ~60% rewards
2. **Public tables + Quick Match** — find humans without a code, "N playing now"
3. **Leaderboards** — weekly + all-time, from stats we already store
4. **Table cosmetic slot** — the felt under the board, decoupled from the board skin
5. **Capture FX + trail cosmetic slots**
6. **Extras** — match history, colorblind mode

Explicitly out of scope: bot work, quests/achievements, i18n, pass-and-play, seasons/ranked, house rules beyond Blitz.

Every step ends with `npm run test:server` and `CI=true npm test -- --watchAll=false` green, one short-subject commit per logical chunk.

---

## 1. Blitz mode

### Why the geometry has to change
Today the ring is hardcoded in two mirrored places that the code itself warns must stay in sync:

- `server/game/rules.js:4-16` — `TRACK_LEN=64, ARM=16, MARBLES=5, HOME_LEN=5, LAST_TRACK=62`, and the corner helpers `entryIdx = seat*ARM+2`, `exitCorner = seat*ARM+56`, `entryCorners = [8,24,40]`.
- `src/game/geometry.js:12-39` — `BOTTOM_ARM` (16 cells), `RING` (64), `HOME` (5 slots at rows 7..3), `BASE_OFFSETS` (5 positions), `INNER_CORNERS=[8,24,40,56]`, `entryIdx/tipIdx` with literal 16/64.

A shorter track means a new arm shape, new corner offsets, fewer home holes, fewer base holes, a smaller extruded board mesh. Rather than a second copy of everything, introduce one **board spec** object both sides derive from.

### 1.1 Shared spec (`src/shared/boards.js`, CommonJS so the server can `require` it)

```js
const BOARDS = {
  classic: { id: 'classic', label: 'Classic', arm: 16, marbles: 5, home: 5,
             // cell offsets within one arm, relative to the seat's tip (index seat*arm)
             entry: 2, exit: 56 /* = 4*arm - 8 */, corners: [8, 24, 40], armShape: CLASSIC_ARM,
             halfWidth: 2.75, halfLength: 8.75, homeRows: [7,6,5,4,3], baseCenter: 5.8, baseOffsets: [...5],
             dieSpot: [8.7, 4.3], dieThrowFrom: [15, 9] },
  blitz:   { id: 'blitz', label: 'Blitz', arm: 10, marbles: 3, home: 3,
             entry: 2, exit: 34 /* 4*arm - 6 */, corners: [5, 15, 25], armShape: BLITZ_ARM,
             halfWidth: 1.75, halfLength: 5.75, homeRows: [4,3,2], baseCenter: 3.9, baseOffsets: [[-1.1,0],[0,0],[1.1,0]] ... },
};
```

Derived, per spec: `trackLen = 4*arm`, `lastTrack = trackLen - 2`. Keep `entry: 2` on both so the "turn into home at your own tip" rule (`stepPath`, `rules.js:103-118`) stays identical: a marble enters at `tip+2`, laps, and at progress `lastTrack` (= the cell just before the tip) it turns into the home column.

**Blitz arm shape (10 cells).** Classic `BOTTOM_ARM` is: tip row `[8,0]`, `[8,1]`, `[8,2]`, then 6 up the side, corner `[2,2]`, 5 along, `[2,8]`, `[1,8]`. Blitz keeps the silhouette with shorter runs:

```
[5,0],[5,1],[5,2],        // tip + 2 (entry at index 2)
[4,2],[3,2],              // up the side
[2,2],                    // shortcut corner  (index 5)
[2,3],[2,4],              // along
[2,5],[1,5],              // hand-off to the next arm
```

`rotate()` is unchanged. Shortcut corners are then at `5, 15, 25` (the `[2,2]` corner of each arm ahead of you) and the exit corner is `34` (previous arm's corner, i.e. `4*arm - 6`). Sanity-check by asserting `RING` has no duplicate cells and every arm's last cell is adjacent to the next arm's first. Tune the numbers in a quick script before touching the mesh; the ones above are a starting point, not gospel.

The board cross in `Board.js:55-57` becomes `W = halfWidth, L = halfLength`; the home strip in `buildHomeStripGeometry` (`Board.js:73-78`) and the dish (`buildDishGeometry`) take rows/offsets from the spec. `DISH_R` shrinks to ~1.6 for three base holes in a row (or keep a triangle of 3 with `DISH_R` 2.0, taste call).

### 1.2 Rules engine (`server/game/rules.js`)

- Module-level constants become spec lookups. Cheapest path: every exported helper takes the spec via the state — `state.board = 'blitz'` and a private `specOf(state)`. Helpers currently called with `(seat)` (`entryIdx`, `exitCorner`, `entryCorners`, `progressOf`, `idxOf`) gain a leading `spec` param; there are ~12 call sites (`rules.js`, `bot.js`, `rooms.js`, tests).
- `createGame(seats, { board = 'classic', ... })` sets `state.board`, `state.spec = { arm, marbles, home, trackLen, lastTrack, entry, exit, corners }` (send the numbers down so the client never has to guess) and builds `marbles` with `spec.marbles`.
- `stepPath`, `computeLegalMoves`, `isFinished` read `spec.lastTrack` / `spec.home` instead of constants. `isFinished` already uses `.every`, so 3 vs 5 is free.
- Keep the old exports (`TRACK_LEN`, `LAST_TRACK`, …) pointing at classic so nothing else breaks during the migration, then delete once all consumers are spec-aware.

### 1.3 Bot (`server/game/bot.js`)
`CENTER_VALUE = 48` and `effectiveProgress` use `LAST_TRACK`; scale by spec: `centerValue = Math.round(spec.trackLen * 0.75)`. `threatAt` uses `TRACK_LEN` for wrap-around distance — pass spec. No behavior change for classic.

### 1.4 Rooms (`server/rooms.js`)
- `this.board = 'classic'` on the Room, `setBoardMode(userId, id)` guarded by `requireHost` + `requireLobby` + `BOARDS[id]`. Socket event `lobby:board` in `server/index.js` next to `lobby:teams` (line ~177).
- `start()` passes `board: this.board` to `createGame`. `rematch()` keeps it. `view()` and `summary()` expose `board`.
- `animationMs` and the bot delay don't care.
- **Naming clash:** `game.boardSeat` / `game.boardOverride` already mean "whose *board skin* is on the table". Call the new thing `mode`/`variant` in the room (`room.variant`, `game.variant`) to avoid confusion. Suggest `variant` everywhere.

### 1.5 Rewards (`server/economy.js:99-150`, `cosmetics.json` `rewards`)
Add `"variantMultiplier": { "classic": 1, "blitz": 0.6 }`. In `awardGame`, after the bot-game halving, `lines = lines.map(l => ({...l, amount: Math.floor(l.amount * mult)}))` and a `note` line "Blitz: 60% rewards (shorter game)". `firstWinOfDay` and `levelUpBonus` stay full — they're once-a-day / milestone, not farmable. Stats (`games/wins/captures/sixes`) count normally.

Also `perMarbleHome` is per marble, so Blitz naturally pays 3× instead of 5×; fine.

### 1.6 Client
- `src/game/geometry.js` exports become spec-driven: `layout(variant)` returning `{ RING, HOME, BASE, BASE_TRAY, DIE_SPOT, DIE_THROW_FROM, INNER_CORNERS, entryIdx, tipIdx, positionOf }`, memoized per variant. Keep the current named exports as the classic layout so `Rules.js` (tutorial art) and `Pings.js` (`SNAP_SPOTS`) don't need edits on day one.
- Thread `variant` through `Scene` → `Board`, `Marbles`, `Die`, `Pings`. `Board.js` geometries are `useMemo`'d module singletons today (`buildBoardGeometry()` called once); make them `useMemo(() => build(layout), [variant])` and dispose the old ones. The existing `useSkinTransition` swap-wave can double as the "board shrinks" transition when a lobby toggles variants.
- `App.js:373` lobby preview: `Array.from({ length: BOARDS[room.variant].marbles })`. `DEMO_BOARD` stays classic.
- `Game.js:84` (`homeCount === 5` for teams helping) and `:246` (`"x of 5 marbles home"`) read `game.spec.marbles`.
- `Lobby.js` gets a **Classic / Blitz** segmented control mirroring the Teams one (`Lobby.js:232-245`), with a one-line blurb: "Blitz: 3 marbles, smaller board, about a third of the time. Pays 60%."
- Home "Quick play vs bots" → keep classic; Quick Match (section 2) offers both.
- `Rules.js` gets one slide or a footnote mentioning Blitz. Tutorial art stays classic.

### 1.7 Tests
- `rules.test.js`: wrap the suite in `for (const variant of ['classic','blitz'])` where the test is variant-agnostic; the corner test (`:155-160`, asserts `[8,24,40]`/`56`) becomes spec-relative. Add: track has `4*arm` unique cells; a marble at `lastTrack` with roll 1 lands in `home(0)`; Blitz win with 3 marbles home; full bot games finish on Blitz (reuse `:212-229`).
- `rooms.test.js`: host toggles variant, non-host can't, rematch preserves, `view().variant`.
- `economy.test.js`: Blitz payout is 60% of classic for identical stats; first-win bonus untouched.
- `Marbles.test.js` (client): add a Blitz layout case if it tests `positionOf`.

### 1.8 Commits
1. `Add shared board specs and make the rules engine spec-driven`
2. `Blitz variant: lobby toggle, room state, 60% rewards`
3. `Blitz board: client layout, mesh and HUD read the spec`

---

## 2. Public tables + Quick Match

### Server
- `Room.public = false`; host toggle `lobby:public`. Rooms created via Quick Match are public by default; Discord instance rooms never are.
- `RoomManager.openTables()` → public rooms with no game (or `phase==='over'`), at least one connected human, and a free seat; sorted by humans desc, then `lastActive`.
- `room:quickMatch { variant }`: pick the first open table with matching variant, else `create()` with `public=true, variant`. Uses the existing `enter()` in `index.js:132-146`, so the one-room-per-account rules hold.
- **Auto-start countdown** (in `Room`): when `public && !game && humans >= 2`, arm a 30s timer (`startTimer`, exposed as `startsIn` in `view()` like `turnEndsIn`). On fire: fill empty seats with bots (reuse `addBot`), then `start()` bypassing `requireHost`. Any seat change re-arms; dropping below 2 humans cancels. Host can still start early or flip the room private (which cancels the countdown).
- Guard: public rooms can't be joined once `game` is live except as spectators (already how `join()` behaves).
- `GET /api/presence` (no auth; cache 5s in memory): `{ playing, inLobbies, tables: [{ code, variant, humans, seats, teams, startsIn }] }`. `playing` = distinct connected humans in live games + lobbies.
- Sweep: public lobbies with zero connected humans die on the existing `isAbandoned` path.

### Client
- `Home.js`: primary CTA becomes **Play online** (opens a tiny sheet: Classic / Blitz), then **Create a room for friends**, then **Quick play vs bots**. Under the logo: "12 playing now · 2 open tables" from `/api/presence`, polled every 15s while Home is mounted.
- Open-tables list (collapsed by default, max 5): code, variant chip, `2/4`, join button → `room:join`.
- `Lobby.js`: "Public table" toggle (host only) + countdown pill "Starting in 0:24 — empty seats get bots". Public rooms show a hint "Anyone can join from the home screen".
- Rewards unchanged: `botGame` is already `humansAtStart < 2` (`rooms.js:375`), so a public game that auto-filled with bots but had 2+ humans pays full.

### Tests
`rooms.test.js`: quickMatch joins an existing open table before creating; variant mismatch creates a new one; countdown arms at 2 humans, cancels at 1, fills bots and starts; private flip cancels; `openTables` excludes started rooms and instance rooms.

### Commits
1. `Public tables: room flag, open-table listing, presence endpoint`
2. `Quick Match with auto-start countdown and bot fill`
3. `Home: Play online, live player count and open tables`

---

## 3. Leaderboards

### Data
All-time comes straight from `users` (`games, wins, captures, sixes, xp`). Weekly needs a rollup:

```sql
CREATE TABLE IF NOT EXISTS weekly_stats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week TEXT NOT NULL,           -- ISO week 'YYYY-Www' (UTC, Monday start)
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  captures INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, week)
);
CREATE INDEX IF NOT EXISTS weekly_week ON weekly_stats(week);
```

Add to `SCHEMA` in `db.js` (new table, no column migration needed). `Economy.awardGame` does `INSERT ... ON CONFLICT DO UPDATE SET games=games+1, ...` per player. **Bot games (`humansAtStart<2`) don't count toward weekly wins** — keep `games`/`captures`/`sixes` but pass `wins: 0`; note it in the panel. All-time keeps counting them (existing behaviour, Luckiest depends on it).

Merging a guest into a Discord account (`accounts.js` ~`:250-270`) must also fold `weekly_stats` rows in (sum per week) before `deleteUser`.

### API
`GET /api/leaderboard?board=wins|captures|sixes|level&range=week|all` (auth, so we can return the caller's rank). Response `{ range, board, week, refreshAt, rows: [{ rank, userId, name, value, level, tags, nameplate }], me: { rank, value } | null }`. Top 50; `me` via a `COUNT(*) WHERE value > mine` query. Only users with `games >= 3` (all-time) / `>= 1` (weekly) to keep fresh guests out. Cache each `(board,range)` for 30s in memory.

### Client
`Leaderboard.js` modal from the account bar (next to Profile): tabs Wins / Captures / Sixes / Level, toggle This week / All time, rows render the player's nameplate class (reuse the chip styling from `Game.js:221`) so cosmetics show off. Sticky "you" row at the bottom when outside top 50. Countdown to weekly reset.

### Tests
`economy.test.js`: two games in the same week accumulate; a bot game adds games but not wins; week boundary splits rows. `accounts` merge test: weekly rows survive a guest merge. API test for `me.rank`.

### Commits
1. `Track weekly stats per player`
2. `Leaderboard API and panel`

---

## 4. Table cosmetic slot

### Current state
The felt under the board is the `felt` field of the *board* skin (`skins.js:890-896` wood table, `:1163-1188` special boards), turned into a texture in `boardSkin()` (`:1222`) and drawn by `Table` in `Board.js:181-192`. The starter lends their board to the table (`game.boardSeat`, `App.js:360`).

### Design
- New slot in `cosmetics.json`: `"table": { "label": "Tables", "default": "table.match" }`. `table.match` = "Match my board" (rarity `default`, uses the board skin's `felt` exactly as today, so nothing changes for anyone).
- ~14 items: commons (felt colours: forest, navy, burgundy, charcoal), rares (linen, leather, cork mat, chalkboard), epics (calçada portuguesa cobble, azulejo tile floor, sand, ocean), legendaries (starfield, lava flow with slow emissive animation). Each is `{ canvas | color, roughness, repeat, glow? }`, built in a new `tableSkin(itemId, fallbackFelt)` in `skins.js` alongside `boardSkin`.
- **Whose table?** Same rule as boards: the starter's (`game.boardSeat`). Add `game.tableOverride` for the Dev mid-game picker (`setBoard` in `rooms.js:295-303` generalises to `setTableSkin(slot, itemId)`). `App.js:360-361` computes `tableSkinId` the same way it computes `boardSkinId`.
- `Board.js`: `Table` takes `skin` (from `tableSkin(...)`) instead of `materials.felt`. `useSkinTransition` gets the table skin in its key so the wave plays on table swaps too.
- `Preview.js` (`:57-59`) renders a table swatch for the Locker/Shop; a flat disc under a mini board is enough.
- Server: `catalog.js` `SLOTS/DEFAULTS` are derived from the JSON, so `equip`, `equipped()`, `publicInfo` pick it up automatically. `botCosmetics()` (`economy.js:203-209`) adds `table`. Drop pools/featured widen automatically via `DROPPABLE`.
- Locker: new tab appears automatically if it iterates `slots` (check `Locker.js:9-24`). Shop/featured: nothing to do.

### Tests
`economy.test.js`: box can drop a table item; `botCosmetics` returns a table. `tags.test.js`/accounts: `equipped()` falls back to `table.match`. Client: `tableSkin('table.match', felt)` returns the felt colour.

### Commit
`Add table cosmetics, separate from the board`

---

## 5. Capture FX + trail slots

### Current state
Capture visuals are one hardcoded `fx.emit('burst', …)` + `shake` in `Marbles.js:99-101`, with colours from the two seats. Movement segments are planned in `Marbles.js:30-56` and stepped in `:90-115`. Particles are a single instanced system in `Particles.js` listening to `burst`.

### Design
- Slots: `"capture": { "default": "fx.classic" }`, `"trail": { "default": "trail.none" }`.
- **Capture FX** (~10 items): classic burst (default), shatter (shards, low gravity), splash (blue droplets + ring), confetti (paper, slow fall), lightning (emissive bolt sprite + flash, legendary), fireworks (two-stage burst), smoke poof, coins (gold, ping sound), petals, black hole (particles pulled *in* then released, legendary). Each is a preset: `{ particles: {count,speed,up,size,gravity,life,spread,colors|'seat'}, shake, ring?, flash?, sound? }`. The **capturer's** equipped item plays. Victim keeps their marble colours in the palette.
- **Trail** (~8 items): none (default), sparkle, smoke, rainbow, fire, bubbles, stardust, glitch (Dev exclusive). Emitted every frame while a marble segment is in flight (`:90-115`), throttled to ~1 emit per 40ms per marble; each is `{ count, size, life, gravity, colors|'seat', rate }`.
- `fx.js` grows `capturePreset(itemId)`/`trailPreset(itemId)`; `Particles.js` gains `ring` and `flash` primitives (a scaling ring mesh and a brief point-light/emissive plane). Keep it to one particle system; presets only tweak parameters, so perf is unchanged.
- Sound: presets may name an `sfx` variant; add 3-4 new synthesized ones to `sound.js` (`capture` already takes a kind).
- `Preview.js`: capture preview loops a burst every 1.5s on a marble; trail preview orbits a marble.
- Server: automatic via `SLOTS`. `botCosmetics` adds both.

### Tests
Client: presets resolve for every item in the slot, unknown id falls back to default. Server: same drop/equip checks as section 4.

### Commits
1. `Capture FX cosmetics`
2. `Marble trail cosmetics`

---

## 6. Extras

### 6.1 Match history
- Table `games (id, played_at, variant, mode, bot_game, winners TEXT, players TEXT /* [{userId,name,seat,captures,home,won}] */, turns INTEGER)`. Written in `awardGame` (one row per game, not per player) inside the same transaction; keep a `game_players(game_id, user_id)` join for lookup.
- `GET /api/me/history?limit=20` → rows with the caller's outcome. `Profile.js` gets a "Recent games" list: date, variant chip, W/L, captures, opponents (names only; no cross-profile browsing to keep the guest privacy story simple).
- Retention: prune rows older than 90 days in the minute sweep.

### 6.2 Colorblind mode
- Setting `colorblind: boolean` in `src/game/settings.js`, toggle in `Settings.js`.
- Marbles: overlay a small seat glyph sprite (● ▲ ■ ◆) on the top of each marble (`Marbles.js` sphere group; sprite with `depthTest` off, scaled with marble radius). Board: the seat-coloured entry ring (`Board.js:282`) gets the same glyph as a decal.
- HUD: nameplate chips (`Game.js:221`) and lobby seats prefix the glyph. Ghost move markers stay red for captures but add a ✕ glyph.
- Also bump `SEAT_COLORS` contrast check: red/green are the classic problem pair; the yellow seat is fine. Don't change the palette, just add the shapes.

### Commits
`Match history in the profile`, `Colorblind mode: seat glyphs on marbles and chips`

---

## Cross-cutting notes

- **Line endings**: git warned `LF will be replaced by CRLF` on Scene.js. Consider a `.gitattributes` with `* text=auto eol=lf` early in the branch so diffs stay clean.
- **`view()` payload size**: adding `spec` to the game state is a few dozen bytes; fine. Don't put the full `BOARDS` table in it.
- **Backwards compat**: old clients (open tabs) receiving `game.variant='blitz'` would render with classic geometry. `App.js` already reloads on version mismatch? Check; if not, add a `serverVersion` to `/api/config` and prompt a reload when it changes. Cheap insurance before shipping Blitz.
- **Docs**: update `README.md` (Structure list: `src/shared/boards.js`, new slots, presence/leaderboard routes) and the `docs/media` shots once Blitz + tables exist.
- **AGENTS.md**: add `npm run test:server && CI=true npm test -- --watchAll=false` as the verification line if it isn't obvious enough already.
