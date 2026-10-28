import fs from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = JSON.parse(fs.readFileSync('docs/baseline/files.json', 'utf8'));
for (const file of baseline.files) {
  const hash = createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  if (hash !== file.sha256) throw new Error(`Protected baseline changed: ${file.path}`);
}
console.log('All three original production files remain byte-for-byte unchanged.');
