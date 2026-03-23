const manager = require('./src/antigravity/manager');

async function test() {
  console.log('Testing manager explicitly...');
  const res = await manager.sendMessage('lunar-slayer', 'sage mir nochmal den inhalt von src ganz kurz');
  console.log('\\n=== FINAL RESULT FROM MANAGER ===\\n');
  console.log(res);
  console.log('\\n=================================\\n');
  process.exit(0);
}

test().catch(e => { console.error('Error:', e); process.exit(1); });
