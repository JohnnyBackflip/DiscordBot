const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('files')
    .setDescription('Dateien und Verzeichnisse anzeigen')
    .addSubcommand(sub =>
      sub.setName('listmds')
        .setDescription('Alle .md Dateien auflisten')
        .addStringOption(o => o.setName('directory').setDescription('Verzeichnis (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('tree')
        .setDescription('Dateibaum des Projektes oder eines Pfades anzeigen')
        .addStringOption(o => o.setName('path').setDescription('Pfad (optional, Standard: Projektverzeichnis)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('Eine .md Datei anzeigen')
        .addStringOption(o => o.setName('path').setDescription('Pfad zur .md Datei').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'listmds': {
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

      case 'tree': {
        const targetPath = interaction.options.getString('path') || process.cwd();
        const resolvedPath = path.resolve(targetPath);

        try {
          const tree = buildTree(resolvedPath, '', 0, 3);

          if (!tree) {
            return interaction.reply({ content: '📭 Verzeichnis ist leer oder nicht lesbar.', ephemeral: true });
          }

          // Truncate for Discord embed (max 4096 chars)
          const header = `📂 ${path.basename(resolvedPath)}/\n`;
          const maxLen = 4000 - header.length;
          const truncated = tree.length > maxLen
            ? tree.substring(0, maxLen) + '\n... *(gekürzt)*'
            : tree;

          const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('🗂️ Dateibaum')
            .setDescription('```\n' + header + truncated + '\n```')
            .setFooter({ text: resolvedPath })
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

/**
 * Build a tree representation of a directory.
 */
function buildTree(dir, prefix = '', depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return prefix + '...\n';

  let result = '';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      if (entry.isDirectory()) {
        result += prefix + connector + '📁 ' + entry.name + '/\n';
        result += buildTree(
          path.join(dir, entry.name),
          prefix + childPrefix,
          depth + 1,
          maxDepth
        );
      } else {
        const icon = entry.name.endsWith('.md') ? '📄' :
                     entry.name.endsWith('.js') ? '📜' :
                     entry.name.endsWith('.json') ? '📋' :
                     entry.name.endsWith('.txt') ? '📝' : '📎';
        result += prefix + connector + icon + ' ' + entry.name + '\n';
      }
    }
  } catch (_) { /* permission errors */ }

  return result;
}
