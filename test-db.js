const { db, stmts } = require('./src/database/db');

try {
  // Test instance creation
  stmts.addInstance.run('test-inst', 'localhost', 8888, 'test desc');
  
  // Test linking
  stmts.setChannelInstance.run('123456789', 'test-inst', 'admin-user');
  
  // Test querying
  const res = stmts.getChannelInstance.get('123456789');
  console.log('Channel instance mapping:', res);
  
  // Test unlink
  stmts.removeChannelInstance.run('123456789');
  const res2 = stmts.getChannelInstance.get('123456789');
  console.log('After unlink:', res2);

  // Clean up
  stmts.removeInstance.run('test-inst');
  console.log('Test successful');
} catch (e) {
  console.error('Test failed:', e);
  process.exit(1);
}
