const { SlashCommandBuilder } = require('discord.js');
const { isAdmin } = require('../permissions/permissions');
const antigravityManager = require('../antigravity/manager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Debug: Agent Panel DOM anzeigen (Admin)')
    .addStringOption(o => o.setName('instance').setDescription('Instanz-Name').setRequired(false)),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
    }

    const instanceName = interaction.options.getString('instance') || null;

    // Find instance
    let instName = instanceName;
    if (!instName) {
      const instances = antigravityManager.getStatus();
      if (instances.length === 0) {
        return interaction.reply({ content: '📭 Keine Instanzen registriert.', ephemeral: true });
      }
      instName = instances[0].name;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const dom = await antigravityManager.dumpPanelDOM(instName);
      const truncated = dom.length > 3900 ? dom.substring(0, 3900) + '\n...(truncated)' : dom;
      return interaction.editReply({ content: '```\n' + truncated + '\n```' });
    } catch (err) {
      return interaction.editReply({ content: `❌ ${err.message}` });
    }
  },
};
