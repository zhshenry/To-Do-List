import sharp from 'sharp';

const reference = await sharp('docs/approved-design.png')
  .extract({ left: 302, top: 84, width: 572, height: 854 })
  .resize(440, 700, { fit: 'contain', background: '#eee9e2' }).png().toBuffer();
const implementation = await sharp('test-results/expanded.png').resize(440, 700).png().toBuffer();
const background = Buffer.from(`<svg width="920" height="760" xmlns="http://www.w3.org/2000/svg">
  <rect width="920" height="760" fill="#eee9e2"/>
  <text x="20" y="30" font-family="Segoe UI, Microsoft YaHei" font-size="18" fill="#171923">确认稿参考</text>
  <text x="480" y="30" font-family="Segoe UI, Microsoft YaHei" font-size="18" fill="#171923">To Do List 0.2 实际窗口</text>
</svg>`);
await sharp(background).composite([{ input: reference, left: 20, top: 45 }, { input: implementation, left: 480, top: 45 }]).png().toFile('test-results/design-comparison.png');
