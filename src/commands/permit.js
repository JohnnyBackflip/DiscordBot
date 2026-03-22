const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin, grantInstanceAccess, revokeInstanceAccess, revokeAllInstanceAccess } = require('../permissions/permissions');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permit')
    .setDescription('Benutzer-Berechtigungen verwalten (Admin)')
    .addSubcommand(sub =>
      sub.setName('grant')
        .setDescription('Benutzer Zugriff auf eine Instanz gewähren')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('instance').setDescription('Instanz-Name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('revoke')
        .setDescription('Benutzer Zugriff auf eine Instanz entziehen')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('instance').setDescription('Instanz-Name (leer = alle)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Berechtigungen eines Benutzers anzeigen')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 Nur Admins können Berechtigungen verwalten.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'grant': {
        const user = interaction.options.getUser('user');
        const instanceName = interaction.options.getString('instance');

        // Check instance exists
        const inst = stmts.getInstance.get(instanceName);
        if (!inst) {
          return interaction.reply({ content: `❌ Instanz **${instanceName}** existiert nicht.`, ephemeral: true });
        }

        grantInstanceAccess(user.id, instanceName, interaction.user.id);
        return interaction.reply({
          content: `✅ **${user.username}** hat jetzt Zugriff auf **${instanceName}**.`,
          ephemeral: true,
        });
      }

      case 'revoke': {
        const user = interaction.options.getUser('user');
        const instanceName = interaction.options.getString('instance');

        if (instanceName) {
          revokeInstanceAccess(user.id, instanceName);
          return interaction.reply({
            content: `🔒 **${user.username}** hat keinen Zugriff mehr auf **${instanceName}**.`,
            ephemeral: true,
          });
        } else {
          revokeAllInstanceAccess(user.id);
          return interaction.reply({
            content: `🔒 **${user.username}** hat keinen Zugriff mehr auf alle Instanzen.`,
            ephemeral: true,
          });
        }
      }

      case 'list': {
        const user = interaction.options.getUser('user');
        const instances = stmts.getUserInstances.all(user.id);
        const commands = stmts.getUserCommands.all(user.id);

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle(`🔐 Berechtigungen – ${user.username}`)
          .addFields(
            {
              name: '📡 Instanzen',
              value: instances.length > 0
                ? instances.map(i => `• ${i.instance_name}`).join('\n')
                : '*Keine*',
              inline: true,
            },
            {
              name: '⚡ Commands',
              value: commands.length > 0
                ? commands.map(c => `• \`/${c.command_name}\` – ${c.allowed ? '✅' : '❌'}`).join('\n')
                : '*Keine (Standard: gesperrt)*',
              inline: true,
            }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },
};
