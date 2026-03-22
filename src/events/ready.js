module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Bot ready! Logged in as ${client.user.tag}`);
    console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

    client.user.setPresence({
      activities: [{ name: 'Antigravity AI', type: 3 }], // 3 = Watching
      status: 'online',
    });
  },
};
