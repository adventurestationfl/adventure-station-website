import fs from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = JSON.parse(fs.readFileSync('docs/baseline/files.json', 'utf8'));
for (const file of baseline.files) {
  const hash = createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  // Exact frozen Windows-checkout and original Git-blob hashes; no generic content normalization.
  if (![file.sha256,file.gitBlobSha256].includes(hash)) throw new Error(`Protected baseline changed: ${file.path}`);
}
console.log('All three original production files remain byte-for-byte unchanged.');
