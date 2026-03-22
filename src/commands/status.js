const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const antigravityManager = require('../antigravity/manager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Status der Antigravity-Instanzen anzeigen'),

  async execute(interaction) {
    const statuses = antigravityManager.getStatus();

    if (statuses.length === 0) {
      return interaction.reply({
        content: '📭 Keine Antigravity-Instanzen registriert.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('📡 Antigravity Status')
      .setDescription(
        statuses.map(s => {
          const statusIcon = s.connected ? '🟢 Online' : '🔴 Offline';
          return `**${s.name}** – ${statusIcon}\n  └ \`${s.host}:${s.port}\`${s.description ? ` – ${s.description}` : ''}`;
        }).join('\n\n')
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
