const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../permissions/permissions');
const antigravityManager = require('../antigravity/manager');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin-Panel (nur für Admins)')
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Gesamtstatus des Bots anzeigen')
    )
    .addSubcommand(sub =>
      sub.setName('reset-user')
        .setDescription('Alle Einstellungen eines Benutzers zurücksetzen')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('set-model')
        .setDescription('Standard-Modell eines Benutzers setzen')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('model').setDescription('Modell-Name').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'status': {
        const statuses = antigravityManager.getStatus();
        const allInstances = stmts.listInstances.all();

        const instanceInfo = statuses.length > 0
          ? statuses.map(s =>
              `${s.connected ? '🟢' : '🔴'} **${s.name}** – \`${s.host}:${s.port}\`${s.description ? ` – ${s.description}` : ''}`
            ).join('\n')
          : '*Keine Instanzen registriert*';

        // Count users with permissions
        const allPerms = stmts.listInstances.all().flatMap(inst =>
          stmts.getInstanceUsers.all(inst.name)
        );
        const uniqueUsers = new Set(allPerms.map(p => p.user_id));

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle('🛠️ Admin-Dashboard')
          .addFields(
            { name: '📡 Instanzen', value: instanceInfo },
            { name: '👥 Berechtigte Benutzer', value: `${uniqueUsers.size} Benutzer insgesamt`, inline: true },
            { name: '📊 Registrierte Instanzen', value: `${allInstances.length}`, inline: true },
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'reset-user': {
        const user = interaction.options.getUser('user');

        // Clear all permissions
        stmts.revokeAllAccess.run(user.id);

        // Clear command permissions
        const commands = stmts.getUserCommands.all(user.id);
        for (const cmd of commands) {
          stmts.removeCommandAccess.run(user.id, cmd.command_name);
        }

        // Clear model restrictions
        const restrictions = stmts.getModelRestrictions.all(user.id);
        for (const r of restrictions) {
          stmts.removeModelRestriction.run(user.id, r.model, r.type);
        }

        return interaction.reply({
          content: `🔄 Alle Einstellungen und Berechtigungen von **${user.username}** wurden zurückgesetzt.`,
          ephemeral: true,
        });
      }

      case 'set-model': {
        const user = interaction.options.getUser('user');
        const model = interaction.options.getString('model');
        stmts.setDefaultModel.run(user.id, model);
        return interaction.reply({
          content: `✅ Standard-Modell von **${user.username}** auf **${model}** gesetzt.`,
          ephemeral: true,
        });
      }
    }
  },
};
