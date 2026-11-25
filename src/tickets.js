import fs from "node:fs/promises";
import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createTranscriptHtml, parseQuestions, slugify } from "./utils.js";

const PANEL_SELECT_ID = "ticket:open";
const TRANSCRIPT_MESSAGE_LIMIT = 5000;
const BANNER_NAME = "cordlist-banner.png";
const BANNER_PATH = fileURLToPath(new URL("../assets/cordlist-banner.png", import.meta.url));
const creationLocks = new Map();
const ticketActionLocks = new Map();

function brandedEmbed(embed, color = 0x6d5dfc) {
  return embed
    .setColor(color)
    .setImage(`attachment://${BANNER_NAME}`)
    .setFooter({ text: "CORDLIST TICKETS  |  SUPPORT" });
}

function bannerAttachment() {
  return { attachment: BANNER_PATH, name: BANNER_NAME };
}

function noticeEmbed(title, description, color) {
  return brandedEmbed(
    new EmbedBuilder().setTitle(title).setDescription(description),
    color,
  );
}

function brandedPayload(title, description, color) {
  return {
    embeds: [noticeEmbed(title, description, color)],
    files: [bannerAttachment()],
    allowedMentions: { parse: [] },
  };
}

async function replyBranded(interaction, title, description, color = 0x6d5dfc) {
  const payload = brandedPayload(title, description, color);
  if (interaction.deferred && !interaction.isButton()) {
    return interaction.editReply(payload);
  }
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ ...payload, ephemeral: true });
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

async function runExclusive(locks, key, operation) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(key, current);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

function isStaff(member, config) {
  return Boolean(
    member &&
      (member.permissions?.has(PermissionFlagsBits.Administrator) ||
        member.roles?.cache?.has(config.staffRoleId)),
  );
}

function panelComponents(config) {
  if (!config.categories.length) return [];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PANEL_SELECT_ID)
    .setPlaceholder("Choose a ticket category")
    .addOptions(
      config.categories.slice(0, 25).map((category) => ({
        label: category.name.slice(0, 100),
        description: category.description.slice(0, 100),
        value: category.id,
      })),
    );
  return [new ActionRowBuilder().addComponents(menu)];
}

function panelPayload(config) {
  const embed = brandedEmbed(new EmbedBuilder()
    .setTitle("Contact support")
    .setDescription(
      config.categories.length
        ? "Choose the category that best matches your request. Our support team will assist you in a private channel."
        : "Our support team is getting ready. A server manager can add ticket categories with `/ticket category add`.",
    )
    .addFields(
      ...config.categories.slice(0, 8).map((category) => ({
        name: category.name,
        value: category.description,
        inline: true,
      })),
      {
        name: "Ticket limit",
        value: `${config.userTicketLimit} open ticket${config.userTicketLimit === 1 ? "" : "s"} per user`,
        inline: true,
      },
    ));

  return {
    embeds: [embed],
    components: panelComponents(config),
    files: [bannerAttachment()],
  };
}

export async function publishPanel(channel, config, store) {
  const payload = panelPayload(config);
  let message = null;

  if (config.panelChannelId === channel.id && config.panelMessageId) {
    try {
      message = await channel.messages.fetch(config.panelMessageId);
      await message.edit({ ...payload, attachments: [] });
    } catch (error) {
      if (error.code !== 10008) throw error;
    }
  }

  if (!message) message = await channel.send(payload);
  store.updateGuild(config.guildId, {
    panelChannelId: channel.id,
    panelMessageId: message.id,
  });
  return message;
}

function ticketControls(ticket) {
  const open = ticket.status === "open";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:claim")
        .setLabel(ticket.claimedBy ? "Claimed" : "Claim")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!open || Boolean(ticket.claimedBy)),
      new ButtonBuilder()
        .setCustomId("ticket:close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!open),
      new ButtonBuilder()
        .setCustomId("ticket:reopen")
        .setLabel("Reopen")
        .setStyle(ButtonStyle.Success)
        .setDisabled(open),
      new ButtonBuilder()
        .setCustomId("ticket:transfer")
        .setLabel("Transfer")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!open),
    ),
  ];
}

async function updateTicketMessage(channel, ticket) {
  const message = await channel.messages.fetch(ticket.controlMessageId);
  const embed = brandedEmbed(
    EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder()).setFooter({
      text: `CORDLIST TICKETS  |  ${ticket.status.toUpperCase()}  |  ${
        ticket.claimedBy ? "CLAIMED" : "UNCLAIMED"
      }`,
    }),
  );
  await message.edit({
    embeds: [embed],
    components: ticketControls(ticket),
    attachments: [],
    files: [bannerAttachment()],
  });
}

async function sendAudit(guild, config, ticket, action, attachment) {
  const auditChannel = await guild.channels.fetch(config.auditChannelId);
  if (!auditChannel?.isTextBased()) {
    throw new Error("The configured audit-log channel is missing or is not a text channel.");
  }

  await auditChannel.send({
    embeds: [
      brandedEmbed(new EmbedBuilder()
        .setTitle(`Ticket ${action}`)
        .setDescription("A support ticket event has been recorded.")
        .addFields(
          { name: "Ticket", value: `<#${ticket.channelId}>`, inline: true },
          { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
          { name: "Category", value: ticket.categoryName, inline: true },
        )
        .setTimestamp(),
      action === "closed" ? 0xe5484d : 0x6d5dfc),
    ],
    files: [bannerAttachment(), ...(attachment ? [attachment] : [])],
    allowedMentions: { parse: [] },
  });
}

async function fetchTranscriptMessages(channel) {
  const messages = [];
  let before;

  while (messages.length < TRANSCRIPT_MESSAGE_LIMIT) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, TRANSCRIPT_MESSAGE_LIMIT - messages.length),
      ...(before ? { before } : {}),
    });
    if (!batch.size) break;

    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return messages;
}

async function createTicketUnlocked(interaction, store, dataDirectory, category, answers) {
  const guild = interaction.guild;
  const config = store.getGuild(guild.id);
  if (!config) throw new Error("The ticket system is not configured in this server.");

  const openTickets = store.getTicketsForUser(guild.id, interaction.user.id, true);
  if (openTickets.length >= config.userTicketLimit) {
    throw new Error(`You already have the maximum of ${config.userTicketLimit} open ticket(s).`);
  }

  const staffRole = await guild.roles.fetch(config.staffRoleId);
  if (!staffRole) throw new Error("The configured staff role no longer exists.");

  let parent;
  if (category.channelCategoryId) {
    parent = await guild.channels.fetch(category.channelCategoryId);
    if (parent?.type !== ChannelType.GuildCategory) {
      throw new Error(`The Discord channel category for "${category.name}" no longer exists.`);
    }
  }

  const channel = await guild.channels.create({
    name: `ticket-${slugify(category.name)}-${slugify(interaction.user.username)}`.slice(0, 95),
    type: ChannelType.GuildText,
    ...(parent ? { parent: parent.id } : {}),
    topic: `Support ticket for ${interaction.user.tag} · ${category.name}`,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ],
  });

  const ticket = {
    channelId: channel.id,
    guildId: guild.id,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    categoryId: category.id,
    categoryName: category.name,
    controlMessageId: null,
    transcriptPath: null,
  };

  try {
    store.createTicket(ticket);
    const fields = answers.map((answer) => ({
      name: answer.question.slice(0, 256),
      value: answer.value.slice(0, 1024) || "(No answer provided)",
    }));
    const embed = brandedEmbed(new EmbedBuilder()
      .setTitle(category.name)
      .setDescription(
        answers.length
          ? "Your request is open. A member of our support team will be with you shortly."
          : "Your request is open. Please describe how we can help, and a member of our support team will be with you shortly.",
      )
      .addFields(...fields)
      .setTimestamp());
    const message = await channel.send({
      content: `<@${interaction.user.id}> <@&${staffRole.id}>`,
      embeds: [embed],
      components: ticketControls(store.getTicket(channel.id)),
      files: [bannerAttachment()],
      allowedMentions: { users: [interaction.user.id], roles: [staffRole.id] },
    });
    store.updateTicket(channel.id, { controlMessageId: message.id });

    try {
      await sendAudit(guild, config, store.getTicket(channel.id), "opened");
    } catch (error) {
      console.error("Could not write ticket-open audit entry:", error);
    }
    return channel;
  } catch (error) {
    try {
      store.removeTicket(channel.id);
      await channel.delete("Ticket setup failed; cleaning up the incomplete channel.");
    } catch (cleanupError) {
      console.error("Failed to clean up an incomplete ticket channel:", cleanupError);
    }
    throw error;
  }
}

async function createTicket(interaction, store, dataDirectory, category, answers) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  return runExclusive(creationLocks, key, () =>
    createTicketUnlocked(interaction, store, dataDirectory, category, answers),
  );
}

function intakeModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket:intake:${category.id}`)
    .setTitle(`New ${category.name}`.slice(0, 45));

  for (const [index, question] of category.questions.entries()) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`answer-${index}`)
          .setLabel(question)
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );
  }

  return modal;
}

function replyError(interaction, error) {
  console.error("Ticket interaction failed:", error);
  return replyBranded(interaction, "Ticket action failed", error.message, 0xe5484d);
}

async function handlePanelSelection(interaction, store, dataDirectory) {
  const config = store.getGuild(interaction.guildId);
  const category = config?.categories.find(
    (candidate) => candidate.id === interaction.values[0],
  );
  if (!category) {
    await replyBranded(
      interaction,
      "Category unavailable",
      "That ticket category is no longer available. Please use the current panel.",
      0xe5a93d,
    );
    return;
  }

  if (category.questions.length) {
    await interaction.showModal(intakeModal(category));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const channel = await createTicket(interaction, store, dataDirectory, category, []);
  await interaction.editReply({
    ...brandedPayload("Your ticket is open", `Your private support channel is ready: ${channel}`),
  });
}

async function handleIntakeSubmit(interaction, store, dataDirectory, categoryId) {
  const config = store.getGuild(interaction.guildId);
  const category = config?.categories.find((candidate) => candidate.id === categoryId);
  if (!category) throw new Error("That ticket category is no longer available.");

  const answers = category.questions.map((question, index) => ({
    question,
    value: interaction.fields.getTextInputValue(`answer-${index}`).trim(),
  }));
  await interaction.deferReply({ ephemeral: true });
  const channel = await createTicket(interaction, store, dataDirectory, category, answers);
  await interaction.editReply({
    ...brandedPayload("Your ticket is open", `Your private support channel is ready: ${channel}`),
  });
}

async function handleTicketButton(interaction, store, dataDirectory) {
  const ticket = store.getTicket(interaction.channelId);
  if (!ticket || ticket.guildId !== interaction.guildId) {
    await replyBranded(interaction, "Ticket not found", "This channel is not an active ticket.", 0xe5a93d);
    return;
  }
  const config = store.getGuild(ticket.guildId);
  if (!config || !isStaff(interaction.member, config)) {
    await replyBranded(
      interaction,
      "Staff access required",
      "Only members of the configured support staff role can use this control.",
      0xe5a93d,
    );
    return;
  }

  const action = interaction.customId.slice("ticket:".length);
  if (action === "transfer") {
    if (ticket.status !== "open") {
      await replyBranded(
        interaction,
        "Ticket is closed",
        "Reopen this ticket before transferring it.",
        0xe5a93d,
      );
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`ticket:transfer-submit:${ticket.channelId}`)
      .setTitle("Transfer ticket")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("target-user-id")
            .setLabel("Discord user ID of the staff member")
            .setPlaceholder("123456789012345678")
            .setMinLength(17)
            .setMaxLength(20)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferUpdate();

  await runExclusive(ticketActionLocks, ticket.channelId, async () => {
    const ticket = store.getTicket(interaction.channelId);
    const config = ticket && store.getGuild(ticket.guildId);
    if (!ticket || ticket.guildId !== interaction.guildId) {
      throw new Error("This channel is no longer a recorded ticket.");
    }
    if (!config || !isStaff(interaction.member, config)) {
      throw new Error("Only configured support staff can manage this ticket.");
    }

    if (action === "claim") {
      if (ticket.status !== "open") throw new Error("Reopen this ticket before claiming it.");
      if (ticket.claimedBy) throw new Error(`This ticket is already claimed by <@${ticket.claimedBy}>.`);
      const updated = store.updateTicket(ticket.channelId, { claimedBy: interaction.user.id });
      await updateTicketMessage(interaction.channel, updated);
      await sendAudit(interaction.guild, config, updated, `claimed by ${interaction.user.tag}`);
    } else if (action === "close") {
      if (ticket.status !== "open") throw new Error("This ticket is already closed.");
      const messages = await fetchTranscriptMessages(interaction.channel);
      const html = createTranscriptHtml(ticket, messages);
      const transcriptDirectory = path.join(dataDirectory, "transcripts");
      await fs.mkdir(transcriptDirectory, { recursive: true });
      const filename = `${ticket.channelId}-${Date.now()}.html`;
      const transcriptPath = path.join(transcriptDirectory, filename);
      await fs.writeFile(transcriptPath, html, "utf8");

      await interaction.channel.permissionOverwrites.edit(ticket.userId, {
        SendMessages: false,
        AddReactions: false,
        AttachFiles: false,
        EmbedLinks: false,
      });
      const updated = store.updateTicket(ticket.channelId, {
        status: "closed",
        closedAt: new Date().toISOString(),
        transcriptPath,
      });
      await updateTicketMessage(interaction.channel, updated);
      try {
        await sendAudit(interaction.guild, config, updated, "closed", {
          attachment: transcriptPath,
          name: filename,
        });
      } catch (error) {
        console.error(`Transcript saved at ${transcriptPath}, but audit delivery failed:`, error);
        await replyBranded(
          interaction,
          "Ticket closed; transcript upload failed",
          `The transcript was saved locally, but could not be uploaded to the audit channel: ${error.message}`,
          0xe5a93d,
        );
      }
    } else if (action === "reopen") {
      if (ticket.status !== "closed") throw new Error("This ticket is already open.");
      await interaction.channel.permissionOverwrites.edit(ticket.userId, {
        SendMessages: true,
        AddReactions: true,
        AttachFiles: true,
        EmbedLinks: true,
      });
      const updated = store.updateTicket(ticket.channelId, { status: "open", closedAt: null });
      await updateTicketMessage(interaction.channel, updated);
      await sendAudit(interaction.guild, config, updated, "reopened");
    } else {
      throw new Error("Unknown ticket control.");
    }
  });
}

async function handleTransferSubmit(interaction, store, expectedChannelId) {
  await interaction.deferReply({ ephemeral: true });
  await runExclusive(ticketActionLocks, interaction.channelId, async () => {
    const ticket = store.getTicket(interaction.channelId);
    const config = ticket && store.getGuild(ticket.guildId);
    if (
      !ticket ||
      interaction.channelId !== expectedChannelId ||
      ticket.status !== "open" ||
      !config
    ) {
      throw new Error("This ticket is no longer open.");
    }
    if (!isStaff(interaction.member, config)) {
      throw new Error("Only configured support staff can transfer tickets.");
    }

    const targetId = interaction.fields.getTextInputValue("target-user-id").trim();
    const target = await interaction.guild.members.fetch(targetId);
    if (target.user.bot || !target.roles.cache.has(config.staffRoleId)) {
      throw new Error("The selected user must be a member of the configured support staff role.");
    }

    await interaction.channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    const updated = store.updateTicket(ticket.channelId, { claimedBy: target.id });
    await updateTicketMessage(interaction.channel, updated);
    await sendAudit(interaction.guild, config, updated, `transferred to ${target.user.tag}`);
    await interaction.editReply({
      ...brandedPayload("Ticket transferred", `This ticket is now assigned to <@${target.id}>.`),
      allowedMentions: { users: [target.id] },
    });
  });
}

async function handleTicketDeleted(channel, store) {
  const ticket = store.getTicket(channel.id);
  if (!ticket || ticket.status === "deleted") return;
  store.updateTicket(channel.id, {
    status: "deleted",
    deletedAt: new Date().toISOString(),
  });
}

function requireManager(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error("You need the Manage Server permission to configure tickets.");
  }
}

async function handleTicketCommand(interaction, store) {
  requireManager(interaction);
  const subcommand = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup(false);

  if (subcommand === "setup") {
    const panelChannel = interaction.options.getChannel("panel-channel", true);
    const staffRole = interaction.options.getRole("staff-role", true);
    const auditChannel = interaction.options.getChannel("audit-channel", true);
    const existing = store.getGuild(interaction.guildId);
    const config = store.setGuild(interaction.guildId, {
      ...(existing ?? {}),
      staffRoleId: staffRole.id,
      auditChannelId: auditChannel.id,
      userTicketLimit: interaction.options.getInteger("user-ticket-limit") ?? existing?.userTicketLimit ?? 1,
      categories: existing?.categories ?? [],
      panelChannelId: panelChannel.id,
      panelMessageId: existing?.panelChannelId === panelChannel.id ? existing.panelMessageId : null,
    });
    await publishPanel(panelChannel, config, store);
    await interaction.reply({
      ...brandedPayload(
        "Ticket system configured",
        `Panel: ${panelChannel}\nStaff: <@&${staffRole.id}>\nAudit log: ${auditChannel}`,
      ),
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (group === "category" && subcommand === "add") {
    const config = store.getGuild(interaction.guildId);
    if (!config) throw new Error("Run `/ticket setup` before adding categories.");
    if (config.categories.length >= 25) throw new Error("Discord panels support at most 25 categories.");
    const name = interaction.options.getString("name", true).trim();
    const description = interaction.options.getString("description", true).trim();
    if (!name || !description) {
      throw new Error("Category name and description must not be blank.");
    }
    if (config.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A category named "${name}" already exists.`);
    }
    const questions = parseQuestions(interaction.options.getString("questions") ?? "");
    const discordCategory = interaction.options.getChannel("channel-category");
    const category = {
      id: `${slugify(name).slice(0, 30)}-${randomUUID().slice(0, 8)}`,
      name,
      description,
      questions,
      channelCategoryId: discordCategory?.id ?? null,
    };
    const updated = store.updateGuild(interaction.guildId, {
      categories: [...config.categories, category],
    });
    const panel = await interaction.guild.channels.fetch(updated.panelChannelId);
    if (!panel?.isTextBased()) throw new Error("The configured ticket panel channel no longer exists.");
    await publishPanel(panel, updated, store);
    await interaction.reply({
      ...brandedPayload(
        "Category added",
        `**${category.name}** is ready${questions.length ? ` with ${questions.length} intake question(s)` : ""}.`,
      ),
      ephemeral: true,
    });
    return;
  }

  if (group === "category" && subcommand === "remove") {
    const config = store.getGuild(interaction.guildId);
    if (!config) throw new Error("Run `/ticket setup` before removing categories.");
    const name = interaction.options.getString("name", true).trim();
    const categories = config.categories.filter(
      (category) => category.name.toLowerCase() !== name.toLowerCase(),
    );
    if (categories.length === config.categories.length) {
      throw new Error(`No category named "${name}" was found.`);
    }
    const updated = store.updateGuild(interaction.guildId, { categories });
    const panel = await interaction.guild.channels.fetch(updated.panelChannelId);
    if (!panel?.isTextBased()) throw new Error("The configured ticket panel channel no longer exists.");
    await publishPanel(panel, updated, store);
    await interaction.reply({
      ...brandedPayload("Category removed", `Removed **${name}** from the ticket panel.`),
      ephemeral: true,
    });
    return;
  }

  if (group === "category" && subcommand === "list") {
    const config = store.getGuild(interaction.guildId);
    if (!config) throw new Error("Run `/ticket setup` before listing categories.");
    const listing = config.categories.length
      ? config.categories
          .map(
            (category) =>
              `- **${category.name}** - ${category.questions.length} question(s)${category.channelCategoryId ? ` | <#${category.channelCategoryId}>` : ""}`,
          )
          .join("\n")
      : "No categories configured.";
    await interaction.reply({
      ...brandedPayload("Ticket categories", listing),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "config") {
    const config = store.getGuild(interaction.guildId);
    if (!config) throw new Error("This server has not been configured yet. Run `/ticket setup`.");
    await interaction.reply({
      embeds: [
        brandedEmbed(new EmbedBuilder()
          .setTitle("Ticket configuration")
          .addFields(
            { name: "Panel", value: `<#${config.panelChannelId}>`, inline: true },
            { name: "Staff role", value: `<@&${config.staffRoleId}>`, inline: true },
            { name: "Audit channel", value: `<#${config.auditChannelId}>`, inline: true },
            { name: "Open tickets per user", value: String(config.userTicketLimit), inline: true },
            { name: "Categories", value: String(config.categories.length), inline: true },
          )),
      ],
      files: [bannerAttachment()],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  throw new Error("Unknown ticket command.");
}

export function registerTicketHandlers(client, store, dataDirectory) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "ticket") {
        await handleTicketCommand(interaction, store);
      } else if (interaction.isStringSelectMenu() && interaction.customId === PANEL_SELECT_ID) {
        await handlePanelSelection(interaction, store, dataDirectory);
      } else if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
        await handleTicketButton(interaction, store, dataDirectory);
      } else if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("ticket:intake:")
      ) {
        await handleIntakeSubmit(
          interaction,
          store,
          dataDirectory,
          interaction.customId.slice("ticket:intake:".length),
        );
      } else if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("ticket:transfer-submit:")
      ) {
        await handleTransferSubmit(
          interaction,
          store,
          interaction.customId.slice("ticket:transfer-submit:".length),
        );
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  });
  client.on("channelDelete", (channel) => {
    handleTicketDeleted(channel, store).catch((error) => {
      console.error(`Could not record deletion of ticket channel ${channel.id}:`, error);
    });
  });
}
