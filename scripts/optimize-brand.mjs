import sharp from 'sharp';
import fs from 'node:fs';
const source = fs.readFileSync('index.html', 'utf8');
const embedded = [...source.matchAll(/data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)/g)];
if (embedded.length !== 2) throw new Error('The original brand assets need review.');
const artwork = Buffer.from(embedded[1][1], 'base64');
await sharp(artwork).resize(96).webp({ quality: 80 }).toFile('public/brand/logo-96.webp');
for (const width of [480, 960])
  await sharp(artwork).resize(width).webp({ quality: 85 }).toFile(`public/brand/art-${width}.webp`);
console.log('Original artwork preserved; responsive WebP derivatives created.');
