const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdmin } = require('../permissions/permissions');
const { stmts } = require('../database/db');
const antigravityManager = require('../antigravity/manager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('instance')
    .setDescription('Antigravity-Instanzen verwalten (Admin)')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Neue Instanz hinzufügen')
        .addStringOption(o => o.setName('name').setDescription('Einzigartiger Name').setRequired(true))
        .addIntegerOption(o => o.setName('port').setDescription('CDP Port').setRequired(true))
        .addStringOption(o => o.setName('host').setDescription('Hostname (Standard: localhost)').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Beschreibung').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Instanz entfernen')
        .addStringOption(o => o.setName('name').setDescription('Name der Instanz').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Alle Instanzen anzeigen')
    )
    .addSubcommand(sub =>
      sub.setName('connect')
        .setDescription('Verbindung zu einer Instanz herstellen')
        .addStringOption(o => o.setName('name').setDescription('Name der Instanz').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('disconnect')
        .setDescription('Verbindung zu einer Instanz trennen')
        .addStringOption(o => o.setName('name').setDescription('Name der Instanz').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 Nur Admins können Instanzen verwalten.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'add': {
        const name = interaction.options.getString('name');
        const port = interaction.options.getInteger('port');
        const host = interaction.options.getString('host') || 'localhost';
        const desc = interaction.options.getString('description') || '';

        stmts.addInstance.run(name, host, port, desc);
        return interaction.reply({
          content: `✅ Instanz **${name}** hinzugefügt (${host}:${port})`,
          ephemeral: true,
        });
      }

      case 'remove': {
        const name = interaction.options.getString('name');
        await antigravityManager.disconnect(name);
        stmts.removeInstance.run(name);
        return interaction.reply({
          content: `🗑️ Instanz **${name}** entfernt.`,
          ephemeral: true,
        });
      }

      case 'list': {
        const statuses = antigravityManager.getStatus();
        if (statuses.length === 0) {
          return interaction.reply({ content: '📭 Keine Instanzen registriert.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle('📡 Antigravity-Instanzen')
          .setDescription(
            statuses.map(s =>
              `${s.connected ? '🟢' : '🔴'} **${s.name}** – \`${s.host}:${s.port}\`${s.description ? ` – ${s.description}` : ''}`
            ).join('\n')
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'connect': {
        const name = interaction.options.getString('name');
        await interaction.deferReply({ ephemeral: true });
        try {
          await antigravityManager.connect(name);
          return interaction.editReply(`🟢 Verbunden mit **${name}**.`);
        } catch (err) {
          return interaction.editReply(`❌ Verbindung zu **${name}** fehlgeschlagen: ${err.message}`);
        }
      }

      case 'disconnect': {
        const name = interaction.options.getString('name');
        await antigravityManager.disconnect(name);
        return interaction.reply({ content: `🔴 Verbindung zu **${name}** getrennt.`, ephemeral: true });
      }
    }
  },
};
