const fs = require('fs');
const path = require('path');

const packages = [
  { name: 'types', path: 'packages/types' },
  { name: 'database', path: 'packages/database' },
  { name: 'validation', path: 'packages/validation' },
  { name: 'search', path: 'packages/search' },
  { name: 'shared', path: 'packages/shared' },
  { name: 'data-sources', path: 'services/data-sources' },
  { name: 'timetable-parser', path: 'services/timetable-parser' },
  { name: 'diff-engine', path: 'services/diff-engine' },
  { name: 'sync-engine', path: 'services/sync-engine' },
];

const targetDir = path.resolve(__dirname, 'node_modules', '@mumbai-timetable');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

for (const pkg of packages) {
  const pkgDir = path.join(targetDir, pkg.name);
  if (!fs.existsSync(pkgDir)) {
    fs.mkdirSync(pkgDir, { recursive: true });
  }

  const pkgJson = {
    name: `@mumbai-timetable/${pkg.name}`,
    version: '1.0.0',
    main: path.relative(pkgDir, path.resolve(__dirname, 'dist', pkg.path, 'src', 'index.js')).replace(/\\/g, '/'),
    types: path.relative(pkgDir, path.resolve(__dirname, 'dist', pkg.path, 'src', 'index.d.ts')).replace(/\\/g, '/'),
  };

  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8');
}

console.log('Registered @mumbai-timetable packages in node_modules successfully.');
