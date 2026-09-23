const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', '..', 'dist');
const target = path.resolve(__dirname, '..', 'app');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error('Frontend não compilado: rode npm run build em app/ antes de empacotar o Electron.');
}

fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true, force: true });
console.log(`Frontend atualizado em ${target}`);
