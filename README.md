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
2–4 players per room, with optional bots. Play **Classic** (five marbles) or **Blitz** (three marbles on a shorter board), free-for-all or host-enabled 2v2 teams with partners opposite each other. Bots take over for absent players; disconnected players get one reconnect grace period, and you can pick marbles and cycle moves by keyboard.

Players get a guest account automatically, earn **Marbucks** by playing, and spend them on chests and daily featured cosmetics (marbles, boards, dice, nameplates). Profiles, match history, player cards and leaderboards show completed-game progress; in-game chat supports team messages and optionally hidden event logs. The menu and game controls include bug reports and ideas with admin replies.

Everything is cosmetic: Marbucks cannot be purchased, and the optional one-time **Supporter Pack** is sold through Discord. "Login with Discord" saves progress across devices, and the same app runs as a **Discord Activity** inside voice channels.

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
  build: .
  container_name: marralhinha
  restart: unless-stopped
  volumes:
    - ./data/marralhinha:/app/data
```

The image listens on port 3001 and keeps its SQLite database in `/app/data`. The bind mount above stores both the database and its `backups/` folder at `./data/marralhinha` on the host hard drive. Docker's `VOLUME /app/data` alone is not a substitute for an intentional host bind mount if you need to find and copy the files. With a Cloudflare Tunnel container on the same compose network, route the hostname to `http://marralhinha:3001`; no published ports needed.

### Daily SQLite backups

The server saves a consistent standalone `.sqlite` snapshot to `backups/` beside the database shortly after startup if today's backup is missing. It checks hourly thereafter and creates at most one verified snapshot per UTC day while the server is running. SQLite's `VACUUM INTO` includes committed WAL data; do not copy the live `.db` file alone. Set `DB_BACKUP_DIR` if the backup should live on another mounted drive. Backups are **never deleted automatically**, so monitor disk space and choose your own retention policy. Keeping a second copy on another drive or offsite protects against failure of the disk holding both the database and these backups.

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
3. Check `data/backups/` for daily SQLite snapshots and copy them to another disk or offsite location regularly.

`HOST=127.0.0.1` keeps the port private so the only way in is through the tunnel. The server trusts one proxy hop for client IPs (used by the guest sign-up rate limit).
Discord is optional; without its env vars the game runs with guest accounts only.

Environment variables (see `.env.example`):

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: enable Discord login and Activity mode
- `DISCORD_BOT_TOKEN`, `DISCORD_SUPPORTER_SKU_ID`: enable server-verified Supporter purchases (keep the bot token server-only)
- `PUBLIC_URL`: public URL of the server (the OAuth redirect is `<PUBLIC_URL>/api/auth/discord/callback`)
- `CLIENT_URL`: where to send the browser after login (only needed in dev, e.g. `http://localhost:3000`)
- `PORT` (default `3001`), `HOST` (default: all interfaces), `DB_PATH` (default `data/marralhinha.db`), `DB_BACKUP_DIR` (default `backups/` beside the DB)
- `CLIENT_ORIGIN`: comma-separated allowed origins, only needed if the frontend is hosted on a different domain
- `DEV_DISCORD_IDS`: comma-separated Discord user ids that get the **Dev** tag (admin) when they log in
- `REACT_APP_SERVER_URL` (build time): server URL if the frontend isn't served by the game server

## Tags and admin

Players can carry tags, shown next to their name everywhere (account bar, lobby, in-game chips):

- **Dev**: admin. Unlocks the exclusive Dev set (Singularity marble, Mainframe board, Overclock dice, Root nameplate) and the **Admin** panel in the account bar: search players, toggle tags, grant Marbucks and items, rename.
- **Beta**: early testers. Unlocks the Blueprint set (Prototype marble, Blueprint board, Test Build dice, Blueprint nameplate).
- **Supporter**: a verified one-time Discord purchase. Unlocks the Tideglass marble, Moonwake board, Beacon die, and Keepsake nameplate while the entitlement is active.
- **Luckiest**: the highest eligible recent-game luck score. The Golden Die unlocks permanently after seven cumulative days holding the title.

Exclusive cosmetics never drop from chests or appear among Marbucks offers. Dev and Beta items follow their tags; Supporter follows its server-verified Discord entitlement. Tags are defined in `src/shared/cosmetics.json` (`tags`), items opt in with a `"tag"` field.

Bootstrapping the first Dev:

```bash
# Discord login: set DEV_DISCORD_IDS in .env, then log in
# Any account (guest included), from the server machine:
npm run tag -- "Your Name" dev      # or a user id / Discord id
npm run tag -- --list               # who has tags
npm run tag -- SomeUser beta --remove
```

Devs can't remove their own Dev tag from the panel (so you can't lock yourself out); use the CLI for that.

## Supporter Pack SKU

Create a **Durable** (one-time, not consumable or recurring) SKU in the Discord Developer Portal under **Monetization → Manage SKUs**. Set its price to **$5.99 USD**, publish it to **Store & API**, and set `DISCORD_SUPPORTER_SKU_ID` and `DISCORD_BOT_TOKEN` on the game server. Until both are configured, the paid shop button stays disabled. The bot token must never be exposed to the browser or committed. The animated 1360×480 marketing asset is `public/supporter-pack.gif` (displayed at 680×240 in the shop); `public/supporter-pack-still.png` is its reduced-motion fallback. The original `public/supporter-pack.png` remains available separately.

Suggested store listing:

- **Name:** Supporter Pack
- **Description:** Keep the Marralhinha table glowing. A permanent Supporter badge and four exclusive cosmetics; no gameplay advantage.
- **Benefits:** Supporter badge; Tideglass marble; Moonwake board; Beacon die; Keepsake nameplate.

After publishing, test in Discord Application Test Mode before taking real payments. The shop opens Discord's checkout, but only the server's entitlement lookup grants access; refunds revoke the badge and cosmetics at the next sync. Existing owners can press **Already purchased? Check access**.

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
npm test -- --watchAll=false     # React tests
npm run build                    # production bundle
```

## Structure

- `server/game/rules.js`: authoritative rules engine (pure functions, no I/O)
- `server/game/bot.js`: bot move heuristics
- `server/rooms.js`: rooms, lobby seats, host controls, bots, reconnect, away autoplay, Discord instance rooms
- `server/db.js`, `server/accounts.js`: SQLite schema (+ column migrations), daily consistent backups, guest/Discord accounts, sessions, tags, Luckiest reigns, admin grants and account merges
- `server/tools/tag.js`: CLI to grant/remove tags (`npm run tag`)
- `server/economy.js`: match rewards (bot games halved and capped per day), daily streaks, lootboxes with pity, daily featured shop
- `server/api.js`, `server/discord.js`: REST API, Discord OAuth (website/Activity) and server-side Supporter entitlement checks
- `server/index.js`: Express, API and Socket.IO wiring
- `src/shared/cosmetics.json`: the item catalog, drop rates, prices and reward values (used by server and client)
- `src/game/geometry.js`: board layout (must match the ring model in `rules.js`)
- `src/game/sound.js`: synthesized WebAudio sound effects (no audio files)
- `src/game/music.js`: looping background track (`public/audio/marralhinha.mp3`), volume in Settings
- `src/game/fun.js`: reaction stickers, random nicknames, end-of-game awards
- `src/net/`: API client, socket, sign-in bootstrap (guest, Discord redirect, Discord Activity)
- `src/three/`: lazy-loaded react-three-fiber scene (`Scene`, `Board`, `Marbles`, `Die`, `Particles`, `Preview`), procedural `skins` and `textures`
- `src/components/`: HTML overlay UI: `Home`, `Lobby`, `Game` (HUD), `AccountBar`, `Shop`, `Locker`, `Admin`, `Settings`, `Economy` (shared bits), `Rules`, `Confetti`, `Icons`
