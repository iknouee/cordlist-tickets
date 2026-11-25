import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";

test("Store persists configuration and ticket state across restarts", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cordlist-tickets-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "state.json");
  const store = new Store(filePath);

  store.setGuild("guild-1", {
    panelChannelId: "panel-1",
    panelMessageId: "message-1",
    staffRoleId: "staff-1",
    auditChannelId: "audit-1",
    userTicketLimit: 1,
    categories: [],
  });
  store.createTicket({
    channelId: "ticket-1",
    guildId: "guild-1",
    userId: "user-1",
    categoryId: "billing",
    categoryName: "Billing",
  });

  const restartedStore = new Store(filePath);
  assert.equal(restartedStore.getGuild("guild-1").staffRoleId, "staff-1");
  assert.equal(restartedStore.getTicket("ticket-1").status, "open");
  assert.equal(restartedStore.getTicketsForUser("guild-1", "user-1", true).length, 1);
  restartedStore.updateTicket("ticket-1", { status: "closed" });
  assert.equal(restartedStore.getTicketsForUser("guild-1", "user-1", true).length, 0);
});

test("Store reports malformed persistent state instead of silently resetting it", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cordlist-tickets-invalid-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "state.json");
  fs.writeFileSync(filePath, "{not json", "utf8");
  assert.throws(() => new Store(filePath), /Could not load persisted state/);
});
