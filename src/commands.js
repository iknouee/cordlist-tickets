import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Configure and manage the ticket system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Create or update the ticket panel and server settings.")
        .addChannelOption((option) =>
          option
            .setName("panel-channel")
            .setDescription("Text channel where users open tickets.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("staff-role")
            .setDescription("Role allowed to view and manage tickets.")
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("audit-channel")
            .setDescription("Text channel for ticket audit entries and transcripts.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("user-ticket-limit")
            .setDescription("Maximum simultaneously open tickets per user (1-10).")
            .setMinValue(1)
            .setMaxValue(10),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("config").setDescription("Show the current ticket configuration."),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("category")
        .setDescription("Manage ticket categories and intake questions.")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Add a ticket category.")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("Category name shown to users.")
                .setMaxLength(80)
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("description")
                .setDescription("Short explanation shown on the ticket panel.")
                .setMaxLength(100)
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("questions")
                .setDescription("Optional questions separated by semicolons (up to five).")
                .setMaxLength(225)
                .setRequired(false),
            )
            .addChannelOption((option) =>
              option
                .setName("channel-category")
                .setDescription("Optional Discord category where these tickets are created.")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("Remove a ticket category by its name.")
            .addStringOption((option) =>
              option
                .setName("name")
                .setDescription("Category name to remove.")
                .setMaxLength(80)
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand.setName("list").setDescription("List configured ticket categories."),
        ),
    ),
].map((command) => command.toJSON());
