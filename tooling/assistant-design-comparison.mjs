import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const source = await sharp(path.resolve('docs/approved-ai-floating-design.png'))
  .resize({ width: 900, height: 600, fit: 'contain', background: '#e8e5df' }).png().toBuffer();
const implementation = await sharp(path.join(output, 'floating-workspace.png'))
  .resize({ width: 900, height: 600, fit: 'contain', background: '#e8e5df' }).png().toBuffer();
const labels = Buffer.from(`<svg width="1840" height="650" xmlns="http://www.w3.org/2000/svg"><style>text{font:600 18px 'Segoe UI','Microsoft YaHei',sans-serif;fill:#171923}</style><text x="20" y="30">确认稿</text><text x="940" y="30">真实 Electron 窗口</text></svg>`);
await sharp({ create: { width: 1840, height: 650, channels: 4, background: '#f5f2ed' } })
  .composite([{ input: labels, left: 0, top: 0 }, { input: source, left: 20, top: 45 }, { input: implementation, left: 940, top: 45 }])
  .png().toFile(path.join(output, 'assistant-design-comparison.png'));
