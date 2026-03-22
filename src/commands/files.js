const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasInstanceAccess } = require('../permissions/permissions');
const { stmts } = require('../database/db');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('files')
    .setDescription('.md Dateien anzeigen')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Alle .md Dateien auflisten')
        .addStringOption(o => o.setName('directory').setDescription('Verzeichnis (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('Eine .md Datei anzeigen')
        .addStringOption(o => o.setName('path').setDescription('Pfad zur Datei').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'list': {
        const dir = interaction.options.getString('directory') || process.cwd();

        try {
          const mdFiles = findMdFiles(dir);

          if (mdFiles.length === 0) {
            return interaction.reply({ content: '📭 Keine .md Dateien gefunden.', ephemeral: true });
          }

          const fileList = mdFiles.slice(0, 30).map(f => {
            const rel = path.relative(dir, f);
            return `📄 \`${rel}\``;
          }).join('\n');

          const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('📁 Markdown-Dateien')
            .setDescription(fileList + (mdFiles.length > 30 ? `\n\n... und ${mdFiles.length - 30} weitere` : ''))
            .setFooter({ text: `Verzeichnis: ${dir}` })
            .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
          return interaction.reply({
            content: `❌ Fehler beim Lesen des Verzeichnisses: ${err.message}`,
            ephemeral: true,
          });
        }
      }

      case 'view': {
        const filePath = interaction.options.getString('path');

        // Security: only allow .md files
        if (!filePath.endsWith('.md')) {
          return interaction.reply({ content: '🚫 Nur `.md` Dateien können angezeigt werden.', ephemeral: true });
        }

        // Resolve path (handle relative paths)
        const resolvedPath = path.resolve(filePath);

        // Block directory traversal
        if (resolvedPath.includes('..')) {
          return interaction.reply({ content: '🚫 Ungültiger Pfad.', ephemeral: true });
        }

        try {
          const content = fs.readFileSync(resolvedPath, 'utf-8');

          // Truncate for Discord (embed max 4096 chars)
          const truncated = content.length > 3900
            ? content.substring(0, 3900) + '\n\n... *(Datei gekürzt)*'
            : content;

          const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle(`📄 ${path.basename(resolvedPath)}`)
            .setDescription('```md\n' + truncated + '\n```')
            .setFooter({ text: resolvedPath })
            .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
          return interaction.reply({
            content: `❌ Datei konnte nicht gelesen werden: ${err.message}`,
            ephemeral: true,
          });
        }
      }
    }
  },
};

/**
 * Recursively find all .md files in a directory (max 3 levels deep).
 */
function findMdFiles(dir, depth = 0, maxDepth = 3) {
  const results = [];
  if (depth > maxDepth) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        results.push(...findMdFiles(fullPath, depth + 1, maxDepth));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (_) { /* permission errors etc. */ }

  return results;
}
