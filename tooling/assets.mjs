import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('assets', { recursive: true });
await mkdir('public', { recursive: true });

await sharp('assets/app-icon-source.png').resize(256, 256).png().toFile('assets/icon.png');
const png = await readFile('assets/icon.png');
const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await writeFile('assets/icon.ico', Buffer.concat([header, png]));

const source = await sharp('assets/brand-logo-source.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const background = [source.data[0], source.data[1], source.data[2]];
for (let index = 0; index < source.data.length; index += 4) {
  const distance = Math.hypot(source.data[index] - background[0], source.data[index + 1] - background[1], source.data[index + 2] - background[2]);
  source.data[index + 3] = Math.max(0, Math.min(255, Math.round((distance - 4) * 12)));
}
await sharp(source.data, { raw: source.info }).trim().resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile('public/brand-logo.png');
