# CordList Tickets

A standalone Discord support-ticket bot built with Node.js 24 and discord.js. It creates private ticket channels, collects optional intake answers, provides staff claim/close/reopen/transfer controls, persists configuration and ticket state in JSON, and saves HTML transcripts locally while uploading them to an audit channel.

Bot and configuration messages use a consistent CordList embed theme with the bundled `assets/cordlist-banner.png` artwork.

## Requirements

- Node.js 24.x and npm
- A Discord application and bot account
- A Bot-Hosting server with Node.js 24 selected and persistent disk storage

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

## Bot-Hosting deployment

1. Create a Node.js server in Bot-Hosting and select **Node.js 24** as its runtime.
2. Upload the repository contents, including `package.json`, `package-lock.json`, and the `src` and `assets` directories. Do not upload `.env` or any real token to a public location.
3. Set the server startup command to `npm start` (the package entry point is `src/index.js`). Install dependencies with `npm install` in the server console if the panel does not install them automatically.
4. Add these environment variables in the host's startup/environment settings:

   | Variable | Required | Value |
   | --- | --- | --- |
   | `DISCORD_TOKEN` | Yes | Bot token from the Developer Portal |
   | `DISCORD_CLIENT_ID` | Yes | Application ID from General Information |
   | `DISCORD_GUILD_ID` | No | Server ID for immediate guild-only command updates while testing |
   | `DATA_DIR` | No | Persistent data directory; use `/home/container/data` on a standard Bot-Hosting container |

5. Deploy slash commands once using `npm run deploy:commands` from the server console (or a local terminal with the same environment variables). Set `DISCORD_GUILD_ID` first for a test server; omit it to register globally, which can take time to propagate.
6. Start the server with `npm start`. Check the console for `Ticket bot is online as ...`. Keep the `DATA_DIR` directory on persistent host storage so `state.json` and transcripts survive restarts.

For local development, copy `.env.example` to `.env`, fill in the values privately, then run `npm install`, `npm run deploy:commands`, and `npm start`.

## Configure the ticket system

Run these commands in the server where the bot is installed. Commands are restricted to members with **Manage Server**:

1. `/ticket setup` with a panel text channel, staff role, audit text channel, and optional per-user open-ticket limit (defaults to 1).
2. Add each category with `/ticket category add`. Enter a name and short description; optional intake questions are separated with semicolons, for example `What do you need help with?;What have you tried?`. A category may have up to five questions. Optionally select a Discord channel category as the destination.
3. The panel updates automatically when categories are added or removed. `/ticket category list` and `/ticket config` show the current setup.

Each ticket is private to its opener, the configured staff role, and the bot. Staff-only controls enforce role membership server-side. Closing a ticket locks the opener's sending permissions, saves an HTML transcript under `DATA_DIR/transcripts`, and uploads it to the configured audit channel. Reopening restores the opener's sending permissions. A transfer target must be a member of the configured staff role.

## Persistence and operations

`DATA_DIR/state.json` stores per-server settings and ticket records. Writes use a temporary file followed by an atomic rename; malformed state is reported and does not silently reset. Closed tickets remain in the history and do not count toward the open-ticket limit. Transcript files are retained locally even if the audit-channel upload fails; that failure is logged and shown to the staff member closing the ticket.

Use `npm test` to run the focused utility and persistence tests.
