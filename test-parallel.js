const manager = require('./src/antigravity/manager');

async function testParallel() {
  console.log('Sending first message...');
  const p1 = manager.sendMessage('lunar', 'erste frage');
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Sending second message while first is busy...');
  const p2 = manager.sendMessage('lunar', 'zweite frage').catch(err => {
    console.log('Caught expected error for second message:', err.message);
  });
  
  await Promise.all([p1, p2]);
  console.log('Done!');
  process.exit(0);
}

testParallel().catch(e => { console.error('Outer Error:', e); process.exit(1); });
