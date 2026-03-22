const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin, setCommandAccess } = require('../permissions/permissions');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('command-access')
    .setDescription('Command-Berechtigungen für Benutzer verwalten (Admin)')
    .addSubcommand(sub =>
      sub.setName('grant')
        .setDescription('Benutzer einen Command freischalten')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('command').setDescription('Command-Name (z.B. ask)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('revoke')
        .setDescription('Benutzer einen Command sperren')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('command').setDescription('Command-Name (z.B. ask)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Command-Berechtigungen eines Benutzers anzeigen')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('grant-all')
        .setDescription('Benutzer alle Commands freischalten')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 Nur Admins können Command-Berechtigungen verwalten.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'grant': {
        const user = interaction.options.getUser('user');
        const cmd = interaction.options.getString('command').toLowerCase();
        setCommandAccess(user.id, cmd, true, interaction.user.id);
        return interaction.reply({
          content: `✅ **${user.username}** kann jetzt \`/${cmd}\` benutzen.`,
          ephemeral: true,
        });
      }

      case 'revoke': {
        const user = interaction.options.getUser('user');
        const cmd = interaction.options.getString('command').toLowerCase();
        setCommandAccess(user.id, cmd, false, interaction.user.id);
        return interaction.reply({
          content: `🔒 **${user.username}** kann \`/${cmd}\` nicht mehr benutzen.`,
          ephemeral: true,
        });
      }

      case 'grant-all': {
        const user = interaction.options.getUser('user');
        const allCommands = ['ask', 'instance', 'permit', 'command-access', 'model', 'files', 'help', 'admin', 'status'];
        for (const cmd of allCommands) {
          setCommandAccess(user.id, cmd, true, interaction.user.id);
        }
        return interaction.reply({
          content: `✅ **${user.username}** kann jetzt alle Commands benutzen.`,
          ephemeral: true,
        });
      }

      case 'list': {
        const user = interaction.options.getUser('user');
        const commands = stmts.getUserCommands.all(user.id);

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle(`⚡ Command-Berechtigungen – ${user.username}`)
          .setDescription(
            commands.length > 0
              ? commands.map(c => `${c.allowed ? '✅' : '❌'} \`/${c.command_name}\``).join('\n')
              : '*Keine Command-Berechtigungen gesetzt (Standard: gesperrt)*'
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },
};
