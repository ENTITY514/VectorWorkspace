const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'Desktop', 'src');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walk(path.join(dir, file), fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const files = walk(srcDir);
const report = [];

let uuidUsage = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length > 200) {
    report.push(`yagni Component/File too large (>200 lines): ${path.relative(srcDir, file)} (${lines.length} lines)`);
  }
  
  if (content.includes('uuid')) {
    uuidUsage.push(path.relative(srcDir, file));
  }
}

if (uuidUsage.length > 0) {
  report.push(`native uuid package used in ${uuidUsage.join(', ')}. Replace with crypto.randomUUID().`);
}

console.log(report.join('\n'));
