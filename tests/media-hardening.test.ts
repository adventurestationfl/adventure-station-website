import { it, expect } from 'vitest';
import sharp from 'sharp';
import { sanitizeJpeg } from '../src/lib/jpeg';

it('removes metadata after a scan as well as pre-scan metadata without damaging pixels', async () => {
  const source = await sharp({
    create: { width: 12, height: 8, channels: 3, background: '#137b91' },
  })
    .jpeg({ progressive: true })
    .toBuffer();
  const text = Buffer.from('Exif\0\0GPS TEST LOCATION');
  const metadata = Buffer.concat([
    Buffer.from([255, 225, (text.length + 2) >> 8, (text.length + 2) & 255]),
    text,
  ]);
  const withMetadata = Buffer.concat([
    source.subarray(0, 2),
    metadata,
    source.subarray(2, -2),
    metadata,
    source.subarray(-2),
  ]);
  const sanitized = sanitizeJpeg(withMetadata);
  expect(Buffer.from(sanitized.bytes).includes(text)).toBe(false);
  expect(sanitized).toMatchObject({ width: 12, height: 8 });
  const expected = await sharp(source).raw().toBuffer();
  expect(await sharp(sanitized.bytes).raw().toBuffer()).toEqual(expected);
});

it('rejects truncated scans, trailing active payloads and excessive declared dimensions', async () => {
  const source = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } })
    .jpeg()
    .toBuffer();
  expect(() => sanitizeJpeg(source.subarray(0, -2))).toThrow('damaged');
  expect(() => sanitizeJpeg(Buffer.concat([source, Buffer.from('<script>bad</script>')]))).toThrow(
    'damaged',
  );
  const oversized = Buffer.from(source),
    sof = oversized.indexOf(Buffer.from([255, 192]));
  expect(sof).toBeGreaterThan(0);
  oversized[sof + 7] = 255;
  oversized[sof + 8] = 255;
  expect(() => sanitizeJpeg(oversized)).toThrow('4096');
});
