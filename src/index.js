require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

// ─── Create Client ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel], // Required for DM support
});

// ─── Load Commands ─────────────────────────────────────────────────────────────
client.commands = new Collection();

const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsDir, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`📦 Loaded command: /${command.data.name}`);
  } else {
    console.warn(`⚠️  Skipped ${file}: missing "data" or "execute" export`);
  }
}

// ─── Load Events ───────────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsDir, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`🎧 Loaded event: ${event.name}`);
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
const antigravityManager = require('./antigravity/manager');

async function shutdown() {
  console.log('\n🛑 Shutting down...');
  await antigravityManager.disconnectAll();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Login ─────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN not set in .env file!');
  process.exit(1);
}

client.login(token);
