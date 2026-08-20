const fs = require('fs');
const path = require('path');

const editorModelPath = path.join(__dirname, 'Desktop', 'src', 'ktp', 'editorModel.ts');
let content = fs.readFileSync(editorModelPath, 'utf8').replace(/\r\n/g, '\n');

const lines = content.split('\n');
const exports = lines.filter(l => l.startsWith('export '));
console.log(exports.join('\n'));
