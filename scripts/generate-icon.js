const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcon() {
  const size = 512;
  const half = size / 2;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#6C63FF"/>
        <stop offset="100%" stop-color="#FF6584"/>
      </linearGradient>
      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFD700"/>
        <stop offset="100%" stop-color="#FF8C00"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${size*0.18}" fill="url(#bg)"/>
    <circle cx="${half}" cy="${half*0.78}" r="${size*0.16}" fill="url(#g2)" opacity="0.9"/>
    <circle cx="${half}" cy="${half*0.78}" r="${size*0.12}" fill="white"/>
    <rect x="${half - size*0.18}" y="${half*0.9}" width="${size*0.36}" height="${size*0.04}" rx="${size*0.02}" fill="white" opacity="0.3"/>
    <rect x="${half - size*0.22}" y="${half}" width="${size*0.44}" height="${size*0.04}" rx="${size*0.02}" fill="white" opacity="0.4"/>
    <rect x="${half - size*0.25}" y="${half + size*0.1}" width="${size*0.5}" height="${size*0.04}" rx="${size*0.02}" fill="white" opacity="0.5"/>
    <rect x="${half - size*0.15}" y="${half + size*0.2}" width="${size*0.3}" height="${size*0.04}" rx="${size*0.02}" fill="white" opacity="0.6"/>
    <text x="${half - size*0.18}" y="${half + size*0.32}" font-family="Arial,sans-serif" font-size="${size*0.15}" font-weight="bold" fill="white" opacity="0.15" transform="rotate(-15, ${half}, ${half + size*0.25})">GS</text>
  </svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffer);
  console.log('Created build/icon.png (512x512)');

  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);

  const ico = Buffer.concat([icoHeader, entry, pngBuffer]);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log('Created build/icon.ico (256x256)');
}

generateIcon().catch(console.error);
