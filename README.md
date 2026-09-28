# Marralhinha Online

![Marralhinha Online](public/og-image.jpg)

Online multiplayer version of Marralhinha (say it like "mah-hah-LEEN-yah"), the traditional marble board game from Terceira (Açores).
Made by [Ryan Polasky](https://github.com/ryanpolasky).

| Gameplay | Captures |
| --- | --- |
| ![Gameplay](docs/media/gameplay.jpg) | ![Capture](docs/media/capture.jpg) |
| **Lootboxes** | **Locker** |
| ![Legendary drop](docs/media/shop-legendary.jpg) | ![Locker](docs/media/locker.jpg) |
| **Victory + rewards** | **Mobile** |
| ![Win screen](docs/media/win.jpg) | <img src="docs/media/mobile-game.jpg" alt="Mobile" width="220" /> |

More in [`docs/media`](docs/media): home screen, shop, a 1920×1080 cover (`cover.jpg`, handy for the Discord Activity art) and a 1024px app icon.
2–4 players per room, with optional bots. With 4 players it's 2v2, partners sitting opposite each other.

Players get a guest account automatically, earn **Marbucks** by playing, and spend them on lootboxes and a daily
shop full of cosmetics (marbles, boards, dice, nameplates). Everything is cosmetic; there is no real money.
"Login with Discord" saves progress across devices, and the same app runs as a **Discord Activity** inside voice channels.

Requires **Node 22.5+** (uses the built-in `node:sqlite`).

## Development

```bash
npm install
cp .env.example .env # optional, only needed for Discord
npm run server:dev   # game server on http://localhost:3001 (auto-restarts)
npm start            # React dev server on http://localhost:3000
```

Open http://localhost:3000 in two browser windows (or on your phone over LAN) to play against yourself.
Accounts, coins and inventories are stored in `data/marralhinha.db` (SQLite, git-ignored).

## Production

```bash
npm run build
npm run server       # serves ./build, the API and Socket.IO on $PORT (default 3001)
```

The server needs a persistent disk for the SQLite file (for example a Fly.io volume, a Render disk or a VPS).

Environment variables (see `.env.example`):

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: enable Discord login and Activity mode
- `PUBLIC_URL`: public URL of the server (the OAuth redirect is `<PUBLIC_URL>/api/auth/discord/callback`)
- `CLIENT_URL`: where to send the browser after login (only needed in dev, e.g. `http://localhost:3000`)
- `PORT` (default `3001`), `DB_PATH` (default `data/marralhinha.db`)
- `CLIENT_ORIGIN`: comma-separated allowed origins, only needed if the frontend is hosted on a different domain
- `REACT_APP_SERVER_URL` (build time): server URL if the frontend isn't served by the game server

## Discord setup

### 1. Create the app

1. Go to https://discord.com/developers/applications and create an application.
2. **OAuth2** page: copy the **Client ID** and **Client Secret** into `.env` as `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.
   Never commit `.env`.

### 2. "Login with Discord" on the website

1. **OAuth2 → Redirects**: add `http://localhost:3001/api/auth/discord/callback` (and your production
   `https://your-domain/api/auth/discord/callback` later).
2. In `.env` set `PUBLIC_URL=http://localhost:3001` and, when using the React dev server, `CLIENT_URL=http://localhost:3000`.
3. Restart the server. A **Log in** button appears in the account bar. Logging in keeps everything the guest earned;
   if that Discord account already has progress, the guest's coins and items are merged into it.

### 3. Discord Activity

Activities load your app inside Discord through Discord's proxy, so the server needs a public HTTPS URL.

1. Build and run the production server (`npm run build && npm run server`); it serves the game, API and sockets on one port.
2. Expose it with a tunnel, e.g. `cloudflared tunnel --url http://localhost:3001`, and copy the `*.trycloudflare.com` host.
3. In the developer portal:
   - **Activities → URL Mappings**: prefix `/` → target `<your tunnel host>` (no `https://`).
   - **Activities → Settings**: enable Activities.
   - **Installation**: enable User Install and Guild Install.
   - **OAuth2 → Redirects**: must contain at least one URL (the website callback above works).
4. Enable Developer Mode in Discord (User Settings → Advanced), join a voice channel, open the App Launcher and start the Activity.

Everyone in the same voice channel lands at the same table automatically. Inside Discord, players are signed in with their
Discord account, so their coins and cosmetics are shared with the website.
While the app is unverified, only you and members of your developer team can launch it.

## Tests

```bash
npm run test:server              # rules, economy and account tests (node:test)
CI=true npm test                 # React tests
```

## Structure

- `server/game/rules.js`: authoritative rules engine (pure functions, no I/O)
- `server/game/bot.js`: bot move heuristics
- `server/rooms.js`: rooms, lobby seats, host controls, bots, reconnect, away autoplay, Discord instance rooms
- `server/db.js`, `server/accounts.js`: SQLite schema, guest/Discord accounts, sessions, merging guests into Discord accounts
- `server/economy.js`: match rewards (bot games halved and capped per day), daily streaks, lootboxes with pity, daily featured shop
- `server/api.js`, `server/discord.js`: REST API and Discord OAuth (website redirect flow and Activity code exchange)
- `server/index.js`: Express, API and Socket.IO wiring
- `src/shared/cosmetics.json`: the item catalog, drop rates, prices and reward values (used by server and client)
- `src/game/geometry.js`: board layout (must match the ring model in `rules.js`)
- `src/game/sound.js`: synthesized WebAudio sound effects (no audio files)
- `src/game/fun.js`: reaction stickers, random nicknames, end-of-game awards
- `src/net/`: API client, socket, sign-in bootstrap (guest, Discord redirect, Discord Activity)
- `src/three/`: lazy-loaded react-three-fiber scene (`Scene`, `Board`, `Marbles`, `Die`, `Particles`, `Preview`), procedural `skins` and `textures`
- `src/components/`: HTML overlay UI: `Home`, `Lobby`, `Game` (HUD), `AccountBar`, `Shop`, `Locker`, `Economy` (shared bits), `Rules`, `Confetti`, `Icons`
