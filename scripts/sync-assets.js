const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..', 'apps', 'web-admin', 'public');
const targetDir = path.resolve(__dirname, '..', 'public');

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory does not exist: ${sourceDir}`);
  process.exit(1);
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log(`[Asset Sync] Successfully synchronized all assets from:`);
console.log(`   Source: apps/web-admin/public/`);
console.log(`   Target: public/`);
