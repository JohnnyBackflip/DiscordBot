const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Hilfe und Benutzerhandbuch anzeigen'),

  async execute(interaction) {
    // Read the USER_HELP.md file
    const helpPath = path.join(__dirname, '..', '..', 'USER_HELP.md');
    let helpContent = 'Kein Hilfe-Dokument gefunden.';

    try {
      helpContent = fs.readFileSync(helpPath, 'utf-8');
    } catch (_) { /* file not found */ }

    // Split into sections for embed fields
    const sections = helpContent.split(/^## /m).filter(Boolean);

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('📖 Antigravity Discord Bot – Hilfe')
      .setTimestamp();

    if (sections.length > 0) {
      // First section is the intro (before first ##)
      const intro = sections[0].replace(/^# .*\n/, '').trim();
      if (intro) embed.setDescription(intro.substring(0, 4096));

      // Add remaining sections as fields (max 25 fields)
      for (let i = 1; i < Math.min(sections.length, 10); i++) {
        const lines = sections[i].split('\n');
        const title = lines[0].trim();
        const body = lines.slice(1).join('\n').trim().substring(0, 1024);
        if (title && body) {
          embed.addFields({ name: title, value: body });
        }
      }
    } else {
      embed.setDescription(helpContent.substring(0, 4096));
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
