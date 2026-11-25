# CordList Tickets

A standalone Discord support-ticket bot built with Node.js 24 and discord.js. It creates private ticket channels, collects optional intake answers, provides staff claim/close/reopen/transfer controls, persists configuration and ticket state in JSON, and saves HTML transcripts locally while uploading them to an audit channel.

Bot and configuration messages use a consistent CordList embed theme with the bundled `assets/cordlist-banner.png` artwork.

## Requirements

- Node.js 24.x and npm
- A Discord application and bot account
- A Wispbyte server with Node.js 24 selected and persistent disk storage

## Discord application setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and add a bot.
2. Copy the bot token from the Bot page. Keep it private; do not commit it or put it in `.env.example`.
3. Under **OAuth2 > URL Generator**, select the `bot` and `applications.commands` scopes. Select these bot permissions:
   - Manage Channels
   - Manage Roles (needed to set ticket-channel permission overwrites)
   - View Channels
   - Send Messages
   - Read Message History
   - Embed Links
   - Attach Files
4. Open the generated URL and invite the bot to your server. Place its role above any roles whose channel permissions it needs to manage.
5. No privileged Gateway intents are required. The bot uses only the `Guilds` intent; it does not request message content or a member-list intent.

## Wispbyte deployment

1. Sign in to the [Wispbyte client](https://wispbyte.com/client) and create a dedicated server for this bot. Select the **Node.js 24** runtime/image. Wispbyte currently allows one Discord bot per server.
2. In [Wispbyte GitHub Integration](https://wispbyte.com/client/github), connect the public repository `iknouee/cordlist-tickets`. Use branch `iknouee-discord-ticket-bot` (the repository's default branch), then clone/pull it onto the server. If GitHub Integration is unavailable in your server view, upload the repository files in the server's **Files** page instead. Include the root `index.js`, `package.json`, `package-lock.json`, `src`, and `assets`; do not upload `.env`.
3. In the server's **Startup** settings, set `JS_FILE` to `index.js`. Wispbyte's Node startup runs the JavaScript file named by `JS_FILE`; the root entry launches `src/index.js`. Dependencies are declared in `package.json`, so Wispbyte should install them automatically.
4. Add these variables in the server's **Startup / Environment Variables** settings:

   | Variable | Required | Value |
   | --- | --- | --- |
   | `JS_FILE` | Yes | `index.js` for the bot; use `src/deploy-commands.js` for one-time slash-command registration |
   | `DISCORD_TOKEN` | Yes | Bot token from the Developer Portal |
   | `DISCORD_CLIENT_ID` | Yes | Application ID from General Information |
   | `DISCORD_GUILD_ID` | No | Server ID for immediate guild-only command updates while testing |
   | `DATA_DIR` | No | Persistent data directory; defaults to `./data` inside the server files |

5. Register slash commands once by setting `JS_FILE` to `src/deploy-commands.js` and starting the server. Wait for `Registered 1 slash command(s)` in the console; the deploy script exits afterward, so the server going offline is expected. Restore `JS_FILE` to `index.js` and start the bot again. Set `DISCORD_GUILD_ID` first for quick testing; omit it to register globally, which can take time to propagate. Alternatively, run `npm run deploy:commands` locally with the same environment variables.
6. Check the console for `Ticket bot is online as ...`. Keep `DATA_DIR` on persistent storage so `state.json` and transcripts survive restarts.

For local development, copy `.env.example` to `.env`, fill in the values privately, then run `npm install`, `npm run deploy:commands`, and `npm start`. Wispbyte's free servers need a client-panel login at least once every two weeks to stay running.

## Configure the ticket system

Run these commands in the server where the bot is installed. Commands are restricted to members with **Manage Server**:

1. `/ticket setup` with a panel text channel, staff role, audit text channel, and optional per-user open-ticket limit (defaults to 1).
2. Add each category with `/ticket category add`. Enter a name and short description; optional intake questions are separated with semicolons, for example `What do you need help with?;What have you tried?`. A category may have up to five questions. Optionally select a Discord channel category as the destination.
3. The panel updates automatically when categories are added or removed. `/ticket category list` and `/ticket config` show the current setup.

Each ticket is private to its opener, the configured staff role, and the bot. Staff-only controls enforce role membership server-side. Closing a ticket locks the opener's sending permissions, saves an HTML transcript under `DATA_DIR/transcripts`, and uploads it to the configured audit channel. Reopening restores the opener's sending permissions. A transfer target must be a member of the configured staff role.

## Persistence and operations

`DATA_DIR/state.json` stores per-server settings and ticket records. Writes use a temporary file followed by an atomic rename; malformed state is reported and does not silently reset. Closed tickets remain in the history and do not count toward the open-ticket limit. Transcript files are retained locally even if the audit-channel upload fails; that failure is logged and shown to the staff member closing the ticket.

Use `npm test` to run the focused utility and persistence tests.
