const { isAdmin, hasCommandAccess } = require('../permissions/permissions');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`⚠️  Unknown command: ${interaction.commandName}`);
      return;
    }

    // Permission check
    const userId = interaction.user.id;
    const cmdName = interaction.commandName;

    if (!hasCommandAccess(userId, cmdName)) {
      return interaction.reply({
        content: '🚫 Du hast keine Berechtigung für diesen Command. Wende dich an einen Bot-Admin.',
        ephemeral: true,
      });
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`❌ Error executing /${cmdName}:`, err);
      const replyMethod = interaction.replied || interaction.deferred
        ? 'followUp'
        : 'reply';
      await interaction[replyMethod]({
        content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
        ephemeral: true,
      }).catch(() => {});
    }
  },
};
