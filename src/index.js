import "dotenv/config";
import path from "node:path";
import { Client, GatewayIntentBits } from "discord.js";
import { Store } from "./store.js";
import { registerTicketHandlers } from "./tickets.js";

const dataDirectory = path.resolve(process.env.DATA_DIR || "./data");
const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("DISCORD_TOKEN is required. Copy .env.example to .env and configure it.");
}

const store = new Store(path.join(dataDirectory, "state.json"));
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

registerTicketHandlers(client, store, dataDirectory);

client.once("ready", () => {
  console.log(`Ticket bot is online as ${client.user.tag}.`);
});
client.on("error", (error) => console.error("Discord client error:", error));
client.on("warn", (warning) => console.warn("Discord client warning:", warning));
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    console.log(`Received ${signal}; shutting down ticket bot.`);
    client.destroy();
  });
}

try {
  await client.login(token);
} catch (error) {
  console.error("Could not connect the bot to Discord:", error);
  process.exitCode = 1;
}

export { client, store };
