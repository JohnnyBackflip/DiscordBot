const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const antigravityManager = require('../antigravity/manager');
const { isAdmin, hasInstanceAccess, getEffectiveModel, isModelBlocked } = require('../permissions/permissions');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Sende eine Nachricht an eine Antigravity-Instanz')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Deine Nachricht an die KI')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('instance')
        .setDescription('Name der Antigravity-Instanz')
        .setRequired(false)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const message = interaction.options.getString('message');
    let instanceName = interaction.options.getString('instance');

    // If no instance specified, use the first one the user has access to
    if (!instanceName) {
      let availableInstances;

      if (isAdmin(userId)) {
        // Admins have access to all instances
        availableInstances = stmts.listInstances.all().map(i => ({ instance_name: i.name }));
      } else {
        availableInstances = stmts.getUserInstances.all(userId);
      }

      if (availableInstances.length === 0) {
        return interaction.reply({
          content: isAdmin(userId)
            ? '📭 Keine Antigravity-Instanzen registriert. Nutze `/instance add` um eine hinzuzufügen.'
            : '🚫 Du hast keinen Zugriff auf eine Antigravity-Instanz. Wende dich an einen Admin.',
          ephemeral: true,
        });
      }
      instanceName = availableInstances[0].instance_name;
    }

    // Check instance access
    if (!hasInstanceAccess(userId, instanceName)) {
      return interaction.reply({
        content: `🚫 Du hast keinen Zugriff auf die Instanz **${instanceName}**.`,
        ephemeral: true,
      });
    }

    // Check model
    const { model, source } = getEffectiveModel(userId);
    if (model && isModelBlocked(userId, model)) {
      return interaction.reply({
        content: `🚫 Dein aktuelles Modell **${model}** ist für dich blockiert. Wähle ein anderes mit \`/model set\`.`,
        ephemeral: true,
      });
    }

    // Defer reply since AI response may take time
    await interaction.deferReply();

    try {
      const response = await antigravityManager.sendMessage(instanceName, message, model);

      // Truncate if too long for Discord (max 4096 for embed description)
      const truncated = response.length > 4000
        ? response.substring(0, 4000) + '\n\n... *(Antwort gekürzt)*'
        : response;

      const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle(`🤖 Antigravity – ${instanceName}`)
        .setDescription(truncated)
        .setFooter({
          text: `Modell: ${model || 'Standard'} (${source}) • Angefragt von ${interaction.user.username}`,
        })
        .setTimestamp();

      // Reply in the same context (channel or DM)
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(`[/ask] Error:`, err);
      await interaction.editReply({
        content: `❌ Fehler bei der Kommunikation mit **${instanceName}**: ${err.message}`,
      });
    }
  },
};
