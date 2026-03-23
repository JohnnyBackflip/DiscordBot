const manager = require('./src/antigravity/manager');

async function test() {
  console.log('Sending message to lunar...');
  const res = await manager.sendMessage('lunar', 'hallo');
  console.log('\\n=== FINAL RESULT ===\\n');
  console.log(res);
  console.log('\\n====================\\n');
  process.exit(0);
}

test().catch(e => { console.error('Error:', e); process.exit(1); });
