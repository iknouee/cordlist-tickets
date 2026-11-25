import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  throw new Error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID before deploying commands.");
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

try {
  const deployed = await rest.put(route, { body: commands });
  console.log(
    `Registered ${deployed.length} slash command(s) ${DISCORD_GUILD_ID ? `in guild ${DISCORD_GUILD_ID}` : "globally"}.`,
  );
} catch (error) {
  console.error("Failed to deploy slash commands:", error);
  process.exitCode = 1;
}
