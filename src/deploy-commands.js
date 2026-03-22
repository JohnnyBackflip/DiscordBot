require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in .env');
  process.exit(1);
}

// ─── Collect Commands ──────────────────────────────────────────────────────────
const commands = [];
const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsDir, file));
  if ('data' in command) {
    commands.push(command.data.toJSON());
    console.log(`📦 Prepared: /${command.data.name}`);
  }
}

// ─── Deploy ────────────────────────────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`\n🚀 Deploying ${commands.length} commands...`);

    if (guildId) {
      // Guild-specific (instant, good for development)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`✅ Deployed to guild ${guildId}`);
    } else {
      // Global (takes up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      console.log('✅ Deployed globally (may take up to 1 hour to propagate)');
    }
  } catch (err) {
    console.error('❌ Deploy failed:', err);
    process.exit(1);
  }
})();
