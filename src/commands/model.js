const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin, getEffectiveModel, isModelBlocked } = require('../permissions/permissions');
const { stmts } = require('../database/db');
const antigravityManager = require('../antigravity/manager');

// ─── Available Antigravity Models ──────────────────────────────────────────────
const AVAILABLE_MODELS = [
  { value: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
  { value: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)' },
  { value: 'gemini-3-flash', name: 'Gemini 3 Flash' },
  { value: 'claude-sonnet-4.6-thinking', name: 'Claude Sonnet 4.6 (Thinking)' },
  { value: 'claude-opus-4.6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
  { value: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
];

const MODEL_CHOICES = AVAILABLE_MODELS.map(m => ({ name: m.name, value: m.value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('model')
    .setDescription('KI-Modell Einstellungen')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Dein Standard-Modell festlegen')
        .addStringOption(o =>
          o.setName('model')
            .setDescription('Wähle ein Modell')
            .setRequired(true)
            .addChoices(...MODEL_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Dein aktuelles Modell anzeigen')
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Alle verfügbaren Modelle anzeigen')
    )
    .addSubcommand(sub =>
      sub.setName('lock')
        .setDescription('Modell für einen Benutzer erzwingen (Admin)')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o =>
          o.setName('model')
            .setDescription('Modell')
            .setRequired(true)
            .addChoices(...MODEL_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub.setName('unlock')
        .setDescription('Modell-Sperre für einen Benutzer aufheben (Admin)')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('block')
        .setDescription('Modell für einen Benutzer blockieren (Admin)')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o =>
          o.setName('model')
            .setDescription('Modell')
            .setRequired(true)
            .addChoices(...MODEL_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub.setName('unblock')
        .setDescription('Modell-Block für einen Benutzer aufheben (Admin)')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o =>
          o.setName('model')
            .setDescription('Modell')
            .setRequired(true)
            .addChoices(...MODEL_CHOICES)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    switch (sub) {
      case 'set': {
        const model = interaction.options.getString('model');

        // Check if model is blocked for this user
        if (isModelBlocked(userId, model)) {
          return interaction.reply({
            content: `🚫 Das Modell **${getModelDisplayName(model)}** ist für dich blockiert.`,
            ephemeral: true,
          });
        }

        // Check if user has a locked model
        const locked = stmts.getLockedModel.get(userId);
        if (locked) {
          return interaction.reply({
            content: `🔒 Dein Modell ist auf **${getModelDisplayName(locked.model)}** festgelegt und kann nicht geändert werden. Wende dich an einen Admin.`,
            ephemeral: true,
          });
        }

        stmts.setDefaultModel.run(userId, model);
        return interaction.reply({
          content: `✅ Dein Standard-Modell ist jetzt **${getModelDisplayName(model)}**.`,
          ephemeral: true,
        });
      }

      case 'info': {
        const { model, source } = getEffectiveModel(userId);
        const restrictions = stmts.getModelRestrictions.all(userId);

        const displayName = model ? getModelDisplayName(model) : null;
        const sourceText = source === 'locked'
          ? '🔒 Admin-Sperre'
          : source === 'user'
            ? '👤 Eigene Wahl'
            : '⚙️ Kein Modell gesetzt';

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle('🧠 Dein Modell')
          .addFields(
            {
              name: 'Aktives Modell',
              value: displayName || '*Kein Modell gesetzt – nutze `/model set` um eines zu wählen*',
              inline: true,
            },
            { name: 'Quelle', value: sourceText, inline: true },
          );

        if (model) {
          embed.addFields({
            name: 'Modell-ID',
            value: `\`${model}\``,
            inline: true,
          });
        }

        if (restrictions.length > 0) {
          embed.addFields({
            name: 'Einschränkungen',
            value: restrictions.map(r =>
              `${r.type === 'lock' ? '🔒 Gesperrt auf' : '🚫 Blockiert'}: **${getModelDisplayName(r.model)}**`
            ).join('\n'),
          });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'list': {
        const { model: currentModel } = getEffectiveModel(userId);

        const modelList = AVAILABLE_MODELS.map(m => {
          const isCurrent = currentModel === m.value;
          const blocked = isModelBlocked(userId, m.value);
          let prefix = '•';
          if (isCurrent) prefix = '▶️';
          if (blocked) prefix = '🚫';

          return `${prefix} **${m.name}**\n   ID: \`${m.value}\`${isCurrent ? ' ← *dein Modell*' : ''}${blocked ? ' *(blockiert)*' : ''}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle('🧠 Verfügbare Modelle')
          .setDescription(modelList)
          .setFooter({ text: 'Nutze /model set um dein Modell zu wählen' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Admin-only subcommands below
      case 'lock': {
        if (!isAdmin(userId)) {
          return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const model = interaction.options.getString('model');

        // Remove any existing lock first
        const existingRestrictions = stmts.getModelRestrictions.all(user.id);
        for (const r of existingRestrictions) {
          if (r.type === 'lock') {
            stmts.removeModelRestriction.run(user.id, r.model, 'lock');
          }
        }
        stmts.addModelRestriction.run(user.id, model, 'lock', userId);

        return interaction.reply({
          content: `🔒 **${user.username}** ist jetzt auf **${getModelDisplayName(model)}** festgelegt.`,
          ephemeral: true,
        });
      }

      case 'unlock': {
        if (!isAdmin(userId)) {
          return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const restrictions = stmts.getModelRestrictions.all(user.id);
        for (const r of restrictions) {
          if (r.type === 'lock') {
            stmts.removeModelRestriction.run(user.id, r.model, 'lock');
          }
        }
        return interaction.reply({
          content: `🔓 Modell-Sperre für **${user.username}** aufgehoben.`,
          ephemeral: true,
        });
      }

      case 'block': {
        if (!isAdmin(userId)) {
          return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const model = interaction.options.getString('model');
        stmts.addModelRestriction.run(user.id, model, 'block', userId);
        return interaction.reply({
          content: `🚫 **${user.username}** kann **${getModelDisplayName(model)}** nicht mehr benutzen.`,
          ephemeral: true,
        });
      }

      case 'unblock': {
        if (!isAdmin(userId)) {
          return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const model = interaction.options.getString('model');
        stmts.removeModelRestriction.run(user.id, model, 'block');
        return interaction.reply({
          content: `✅ **${user.username}** kann **${getModelDisplayName(model)}** wieder benutzen.`,
          ephemeral: true,
        });
      }
    }
  },
};

/**
 * Get the display name for a model value.
 */
function getModelDisplayName(value) {
  const found = AVAILABLE_MODELS.find(m => m.value === value);
  return found ? found.name : value;
}
