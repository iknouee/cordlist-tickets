import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const EMPTY_STATE = () => ({ guilds: {}, tickets: {} });

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.state = this.#load();
  }

  #load() {
    if (!fs.existsSync(this.filePath)) return EMPTY_STATE();

    try {
      const state = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!state || typeof state !== "object") {
        throw new Error("State file must contain a JSON object.");
      }
      return {
        guilds: state.guilds && typeof state.guilds === "object" ? state.guilds : {},
        tickets: state.tickets && typeof state.tickets === "object" ? state.tickets : {},
      };
    } catch (error) {
      throw new Error(`Could not load persisted state at ${this.filePath}: ${error.message}`, {
        cause: error,
      });
    }
  }

  #save() {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // Preserve the original persistence error.
      }
      throw new Error(`Could not persist bot state: ${error.message}`, { cause: error });
    }
  }

  getGuild(guildId) {
    return this.state.guilds[guildId] ?? null;
  }

  setGuild(guildId, config) {
    this.state.guilds[guildId] = { ...config, guildId };
    this.#save();
    return this.state.guilds[guildId];
  }

  updateGuild(guildId, update) {
    const current = this.getGuild(guildId);
    if (!current) throw new Error("This server has not been configured yet.");
    return this.setGuild(guildId, { ...current, ...update });
  }

  getTicket(channelId) {
    return this.state.tickets[channelId] ?? null;
  }

  getTicketsForUser(guildId, userId, openOnly = false) {
    return Object.values(this.state.tickets).filter(
      (ticket) =>
        ticket.guildId === guildId &&
        ticket.userId === userId &&
        (!openOnly || ticket.status === "open"),
    );
  }

  createTicket(ticket) {
    if (this.state.tickets[ticket.channelId]) {
      throw new Error(`Ticket ${ticket.channelId} is already recorded.`);
    }
    this.state.tickets[ticket.channelId] = {
      ...ticket,
      status: "open",
      claimedBy: null,
      createdAt: new Date().toISOString(),
      closedAt: null,
    };
    this.#save();
    return this.state.tickets[ticket.channelId];
  }

  updateTicket(channelId, update) {
    const ticket = this.getTicket(channelId);
    if (!ticket) throw new Error("This channel is not a recorded ticket.");
    this.state.tickets[channelId] = { ...ticket, ...update };
    this.#save();
    return this.state.tickets[channelId];
  }

  removeTicket(channelId) {
    if (!this.state.tickets[channelId]) return;
    delete this.state.tickets[channelId];
    this.#save();
  }
}
