const fs = require('fs');
const path = require('path');
const dir = path.join('public','icons');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
const results = files.map(f => {
  const svg = fs.readFileSync(path.join(dir, f), 'utf8');
  const width = (svg.match(/\bwidth="([^"]+)"/) || [])[1] || '';
  const height = (svg.match(/\bheight="([^"]+)"/) || [])[1] || '';
  const viewBox = (svg.match(/\bviewBox="([^"]+)"/) || [])[1] || '';
  return { name: path.basename(f, '.svg'), width, height, viewBox };
});
results.sort((a,b)=>a.name.localeCompare(b.name));
console.table(results);
