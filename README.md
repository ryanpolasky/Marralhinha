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

More in [`docs/media`](docs/media): home screen, shop, a 4K cover (`cover.jpg`, handy for the Discord Activity art) and the app icon as SVG and 1024px PNG, in rounded (`icon`) and square (`icon-square`) versions.
2–4 players per room, with optional bots. Games are free-for-all; with 4 players the host can switch on 2v2 teams (partners sit opposite each other).

Players get a guest account automatically, earn **Marbucks** by playing, and spend them on lootboxes and a daily
shop full of cosmetics (marbles, boards, dice, nameplates). Everything is cosmetic; there is no real money.
"Login with Discord" saves progress across devices, and the same app runs as a **Discord Activity** inside voice channels.

Requires **Node 22.9+** (uses the built-in `node:sqlite` and `--env-file-if-exists`).

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
Everything (site, API, WebSockets) is served from one port, so it works behind a single reverse proxy or tunnel.

### Docker

```yaml
marralhinha:
  build: ../Projects/Marralhinha
  container_name: marralhinha
  restart: unless-stopped
  volumes:
    - ./data/marralhinha:/app/data
```

The image listens on port 3001 and keeps its SQLite database in `/app/data`. With a Cloudflare Tunnel container on the same compose network, route the hostname to `http://marralhinha:3001`; no published ports needed.

### Self-hosting behind a Cloudflare Tunnel

1. On the machine: `npm ci && npm run build`, then run `NODE_ENV=production HOST=127.0.0.1 npm run server` under a process manager (pm2, systemd, …) so it restarts on crashes and reboots.
2. Point the tunnel at it, e.g. in `~/.cloudflared/config.yml`:
   ```yaml
   ingress:
     - hostname: marralhinha.app
       service: http://localhost:3001
     - service: http_status:404
   ```
   WebSockets work through tunnels out of the box.
3. Back up `data/marralhinha.db` (accounts, coins, cosmetics) now and then.

`HOST=127.0.0.1` keeps the port private so the only way in is through the tunnel. The server trusts one proxy hop for client IPs (used by the guest sign-up rate limit).
Discord is optional; without its env vars the game runs with guest accounts only.

Environment variables (see `.env.example`):

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: enable Discord login and Activity mode
- `PUBLIC_URL`: public URL of the server (the OAuth redirect is `<PUBLIC_URL>/api/auth/discord/callback`)
- `CLIENT_URL`: where to send the browser after login (only needed in dev, e.g. `http://localhost:3000`)
- `PORT` (default `3001`), `HOST` (default: all interfaces), `DB_PATH` (default `data/marralhinha.db`)
- `CLIENT_ORIGIN`: comma-separated allowed origins, only needed if the frontend is hosted on a different domain
- `DEV_DISCORD_IDS`: comma-separated Discord user ids that get the **Dev** tag (admin) when they log in
- `REACT_APP_SERVER_URL` (build time): server URL if the frontend isn't served by the game server

## Tags and admin

Players can carry tags, shown next to their name everywhere (account bar, lobby, in-game chips):

- **Dev**: admin. Unlocks the exclusive Dev set (Singularity marble, Mainframe board, Overclock dice, Root nameplate) and the **Admin** panel in the account bar: search players, toggle tags, grant Marbucks and items, rename.
- **Beta**: early testers. Unlocks the Blueprint set (Prototype marble, Blueprint board, Test Build dice, Blueprint nameplate).

Exclusive cosmetics never drop from chests or show up in the shop; they come and go with the tag. Tags are defined in `src/shared/cosmetics.json` (`tags`), items opt in with a `"tag"` field.

Bootstrapping the first Dev:

```bash
# Discord login: set DEV_DISCORD_IDS in .env, then log in
# Any account (guest included), from the server machine:
npm run tag -- "Your Name" dev      # or a user id / Discord id
npm run tag -- --list               # who has tags
npm run tag -- SomeUser beta --remove
```

Devs can't remove their own Dev tag from the panel (so you can't lock yourself out); use the CLI for that.

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

## Legal

- [Terms of Service](TERMS.md), served at https://marralhinha.app/terms
- [Privacy Policy](PRIVACY.md), served at https://marralhinha.app/privacy

The server renders these Markdown files into the site's pages (`server/legal.js`), so edit the `.md` files and both stay in sync.

## Tests

```bash
npm run test:server              # rules, economy and account tests (node:test)
CI=true npm test                 # React tests
```

## Structure

- `server/game/rules.js`: authoritative rules engine (pure functions, no I/O)
- `server/game/bot.js`: bot move heuristics
- `server/rooms.js`: rooms, lobby seats, host controls, bots, reconnect, away autoplay, Discord instance rooms
- `server/db.js`, `server/accounts.js`: SQLite schema (+ column migrations), guest/Discord accounts, sessions, tags, admin grants, merging guests into Discord accounts
- `server/tools/tag.js`: CLI to grant/remove tags (`npm run tag`)
- `server/economy.js`: match rewards (bot games halved and capped per day), daily streaks, lootboxes with pity, daily featured shop
- `server/api.js`, `server/discord.js`: REST API and Discord OAuth (website redirect flow and Activity code exchange)
- `server/index.js`: Express, API and Socket.IO wiring
- `src/shared/cosmetics.json`: the item catalog, drop rates, prices and reward values (used by server and client)
- `src/game/geometry.js`: board layout (must match the ring model in `rules.js`)
- `src/game/sound.js`: synthesized WebAudio sound effects (no audio files)
- `src/game/music.js`: looping background track (`public/audio/marralhinha.mp3`), volume in Settings
- `src/game/fun.js`: reaction stickers, random nicknames, end-of-game awards
- `src/net/`: API client, socket, sign-in bootstrap (guest, Discord redirect, Discord Activity)
- `src/three/`: lazy-loaded react-three-fiber scene (`Scene`, `Board`, `Marbles`, `Die`, `Particles`, `Preview`), procedural `skins` and `textures`
- `src/components/`: HTML overlay UI: `Home`, `Lobby`, `Game` (HUD), `AccountBar`, `Shop`, `Locker`, `Admin`, `Settings`, `Economy` (shared bits), `Rules`, `Confetti`, `Icons`
