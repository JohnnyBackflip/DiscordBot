const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin, getEffectiveModel, isModelBlocked } = require('../permissions/permissions');
const { stmts } = require('../database/db');
const antigravityManager = require('../antigravity/manager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('model')
    .setDescription('KI-Modell Einstellungen')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Dein Standard-Modell festlegen')
        .addStringOption(o => o.setName('model').setDescription('Modell-Name (z.B. gemini-pro, claude-3, gpt-4)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Dein aktuelles Modell anzeigen')
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Verfügbare Modelle einer Instanz anzeigen')
        .addStringOption(o => o.setName('instance').setDescription('Instanz-Name').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('lock')
        .setDescription('Modell für einen Benutzer erzwingen (Admin)')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('model').setDescription('Modell-Name').setRequired(true))
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
        .addStringOption(o => o.setName('model').setDescription('Modell-Name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('unblock')
        .setDescription('Modell-Block für einen Benutzer aufheben (Admin)')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer').setRequired(true))
        .addStringOption(o => o.setName('model').setDescription('Modell-Name').setRequired(true))
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
            content: `🚫 Das Modell **${model}** ist für dich blockiert.`,
            ephemeral: true,
          });
        }

        // Check if user has a locked model
        const locked = stmts.getLockedModel.get(userId);
        if (locked) {
          return interaction.reply({
            content: `🔒 Dein Modell ist auf **${locked.model}** festgelegt und kann nicht geändert werden. Wende dich an einen Admin.`,
            ephemeral: true,
          });
        }

        stmts.setDefaultModel.run(userId, model);
        return interaction.reply({
          content: `✅ Dein Standard-Modell ist jetzt **${model}**.`,
          ephemeral: true,
        });
      }

      case 'info': {
        const { model, source } = getEffectiveModel(userId);
        const restrictions = stmts.getModelRestrictions.all(userId);

        const embed = new EmbedBuilder()
          .setColor(0x7C3AED)
          .setTitle('🧠 Dein Modell')
          .addFields(
            { name: 'Aktives Modell', value: model || '*Standard (der Instanz)*', inline: true },
            { name: 'Quelle', value: source === 'locked' ? '🔒 Admin-Sperre' : source === 'user' ? '👤 Eigene Wahl' : '⚙️ Standard', inline: true },
          );

        if (restrictions.length > 0) {
          embed.addFields({
            name: 'Einschränkungen',
            value: restrictions.map(r =>
              `${r.type === 'lock' ? '🔒 Gesperrt auf' : '🚫 Blockiert'}: **${r.model}**`
            ).join('\n'),
          });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      case 'list': {
        const instanceName = interaction.options.getString('instance');

        if (!instanceName) {
          // List common models
          const commonModels = [
            '• `gemini-2.5-pro` – Google Gemini 2.5 Pro',
            '• `gemini-2.0-flash` – Google Gemini 2.0 Flash',
            '• `claude-sonnet-4-20250514` – Anthropic Claude Sonnet 4',
            '• `claude-3-5-sonnet` – Anthropic Claude 3.5 Sonnet',
            '• `gpt-4o` – OpenAI GPT-4o',
          ];
          const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('🧠 Gängige Modelle')
            .setDescription(commonModels.join('\n'))
            .setFooter({ text: 'Nutze /model set <name>, um dein Modell festzulegen' });

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {
          const models = await antigravityManager.listModels(instanceName);
          if (models.length === 0) {
            return interaction.editReply('Keine Modelle in der Instanz gefunden (möglicherweise kann der Bot die Modell-Auswahl nicht auslesen).');
          }
          const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle(`🧠 Modelle – ${instanceName}`)
            .setDescription(models.map(m => `• \`${m}\``).join('\n'));

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply(`❌ Fehler: ${err.message}`);
        }
      }

      // Admin-only subcommands below
      case 'lock': {
        if (!isAdmin(userId)) {
          return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        const model = interaction.options.getString('model');

        // Remove any existing lock first
        stmts.removeModelRestriction.run(user.id, '%', 'lock');
        stmts.addModelRestriction.run(user.id, model, 'lock', userId);

        return interaction.reply({
          content: `🔒 **${user.username}** ist jetzt auf Modell **${model}** festgelegt.`,
          ephemeral: true,
        });
      }

      case 'unlock': {
        if (!isAdmin(userId)) {
          return interaction.reply({ content: '🚫 Nur Admins.', ephemeral: true });
        }
        const user = interaction.options.getUser('user');
        // Remove all locks
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
          content: `🚫 **${user.username}** kann das Modell **${model}** nicht mehr benutzen.`,
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
          content: `✅ **${user.username}** kann das Modell **${model}** wieder benutzen.`,
          ephemeral: true,
        });
      }
    }
  },
};
