const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'Desktop', 'src', 'ktp');
const files = [
  'backup.ts',
  'editorModel.test.ts',
  'editorModel.ts',
  'fromDb.ts',
  'lib.ts',
  'templateLib.ts',
  'useKtpEditorState.ts'
];

for (const file of files) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Remove import
  content = content.replace(/import\s+\{\s*v4\s+as\s+uuidv4\s*\}\s+from\s+["']uuid["'];?\r?\n/g, '');
  
  // Replace calls
  content = content.replace(/uuidv4\(\)/g, 'crypto.randomUUID()');
  
  fs.writeFileSync(fullPath, content, 'utf8');
}
console.log('UUID replaced successfully');
