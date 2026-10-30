import { HttpError } from './http';

// Validate marker structure without decoding pixels. The normal upload path first
// decodes/re-encodes in the browser; never claim this parser is an image decoder.
export function sanitizeJpeg(input: Uint8Array) {
  if (input.length < 4 || input[0] !== 255 || input[1] !== 216)
    throw new HttpError(400, 'Please upload a JPEG image.');
  const damaged = () => new HttpError(400, 'This image is damaged.');
  const parts: Uint8Array[] = [input.slice(0, 2)];
  let offset = 2,
    width = 0,
    height = 0,
    frame = false,
    scans = 0,
    ended = false;
  while (offset < input.length) {
    const start = offset;
    if (input[offset++] !== 255) throw damaged();
    while (input[offset] === 255) offset++;
    const marker = input[offset++];
    if (marker === undefined) throw damaged();
    if (marker === 217) {
      if (!frame || !scans || offset !== input.length) throw damaged();
      parts.push(input.slice(start, offset));
      ended = true;
      break;
    }
    if (
      ![192, 193, 194, 196, 219, 221, 218, 254].includes(marker) &&
      !(marker >= 224 && marker <= 239)
    )
      throw damaged();
    const segment = offset;
    const length = (input[offset] ?? 0) * 256 + (input[offset + 1] ?? 0),
      end = offset + length;
    if (length < 2 || end > input.length) throw damaged();
    if ([192, 193, 194].includes(marker)) {
      const components = input[offset + 7] ?? 0;
      if (
        frame ||
        input[offset + 2] !== 8 ||
        ![1, 3].includes(components) ||
        length !== 8 + 3 * components
      )
        throw damaged();
      height = (input[offset + 3] ?? 0) * 256 + (input[offset + 4] ?? 0);
      width = (input[offset + 5] ?? 0) * 256 + (input[offset + 6] ?? 0);
      if (!width || !height || width > 4096 || height > 4096 || width * height > 16000000)
        throw new HttpError(400, 'Choose a valid image no larger than 4096 × 4096 pixels.');
      frame = true;
    }
    // Remove every application/comment segment, including between progressive scans.
    if (!(marker >= 224 && marker <= 239) && marker !== 254) parts.push(input.slice(start, end));
    offset = end;
    if (marker === 218) {
      const components = input[segment + 2] ?? 0;
      if (
        !frame ||
        ![1, 2, 3].includes(components) ||
        length !== 6 + 2 * components ||
        ++scans > 256
      )
        throw damaged();
      const entropyStart = offset;
      let found = false;
      while (offset < input.length) {
        const nextMarker = input.indexOf(255, offset);
        if (nextMarker < 0) throw damaged();
        offset = nextMarker;
        const next = input[offset + 1];
        if (next === 0 || (next !== undefined && next >= 208 && next <= 215)) {
          offset += 2;
          continue;
        }
        if (next === 255) {
          offset++;
          continue;
        }
        parts.push(input.slice(entropyStart, offset));
        found = true;
        break;
      }
      if (!found) throw damaged();
    }
  }
  if (!ended) throw damaged();
  const bytes = new Uint8Array(parts.reduce((size, p) => size + p.length, 0));
  let cursor = 0;
  for (const part of parts) {
    bytes.set(part, cursor);
    cursor += part.length;
  }
  return { bytes, width, height };
}
