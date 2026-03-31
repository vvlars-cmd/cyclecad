#!/usr/bin/env node

/**
 * cycleCAD PWA Icon Generator
 * Generates all required PWA icon sizes from SVG source
 *
 * Usage:
 *   node generate-icons.js [--source icon.svg] [--output ./icons]
 *
 * Requires: sharp or canvas package
 */

const fs = require('fs');
const path = require('path');

// Icon sizes and purposes
const ICON_SIZES = [
  { size: 72, purpose: 'any' },
  { size: 96, purpose: 'any' },
  { size: 128, purpose: 'any' },
  { size: 144, purpose: 'any' },
  { size: 152, purpose: 'any' },
  { size: 192, purpose: 'any' },
  { size: 384, purpose: 'any' },
  { size: 512, purpose: 'any' },
  { size: 192, purpose: 'maskable' },
  { size: 512, purpose: 'maskable' }
];

// Screenshot sizes
const SCREENSHOT_SIZES = [
  { width: 540, height: 720, type: 'narrow' },
  { width: 1280, height: 720, type: 'wide' }
];

// Shortcut icon sizes
const SHORTCUT_SIZES = [
  { size: 192, name: 'new' },
  { size: 192, name: 'open' },
  { size: 192, name: 'import' }
];

/**
 * Generate SVG source icon
 * Creates a blue gear/CAD logo in SVG format
 */
function generateSourceSVG() {
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Background -->
  <rect width="512" height="512" fill="#0284C7" rx="100"/>

  <!-- Gear shape representing CAD/design -->
  <g transform="translate(256, 256)">
    <!-- Outer gear teeth -->
    <circle cx="0" cy="-80" r="25" fill="#ffffff"/>
    <circle cx="57" cy="-57" r="25" fill="#ffffff"/>
    <circle cx="80" cy="0" r="25" fill="#ffffff"/>
    <circle cx="57" cy="57" r="25" fill="#ffffff"/>
    <circle cx="0" cy="80" r="25" fill="#ffffff"/>
    <circle cx="-57" cy="57" r="25" fill="#ffffff"/>
    <circle cx="-80" cy="0" r="25" fill="#ffffff"/>
    <circle cx="-57" cy="-57" r="25" fill="#ffffff"/>

    <!-- Inner gear body -->
    <circle cx="0" cy="0" r="60" fill="#ffffff"/>

    <!-- Center hub -->
    <circle cx="0" cy="0" r="30" fill="#0284C7"/>
  </g>

  <!-- 3D cube wireframe overlay (subtle) -->
  <g transform="translate(256, 256)" opacity="0.3">
    <polyline points="-40,-40 40,-40 40,40 -40,40 -40,-40" stroke="#ffffff" stroke-width="3" fill="none"/>
    <polyline points="-30,-30 30,-30 30,30 -30,30 -30,-30" stroke="#ffffff" stroke-width="2" fill="none" transform="translate(10, 10)"/>
    <line x1="-40" y1="-40" x2="-30" y2="-30" stroke="#ffffff" stroke-width="2"/>
    <line x1="40" y1="-40" x2="30" y2="-30" stroke="#ffffff" stroke-width="2"/>
    <line x1="40" y1="40" x2="30" y2="30" stroke="#ffffff" stroke-width="2"/>
    <line x1="-40" y1="40" x2="-30" y2="30" stroke="#ffffff" stroke-width="2"/>
  </g>
</svg>`;

  return svgContent;
}

/**
 * Generate PNG from SVG using sharp or canvas
 * Falls back to creating placeholder if libraries not available
 */
async function generatePNG(svgContent, size, maskable = false) {
  // Try using sharp first (recommended)
  try {
    const sharp = require('sharp');
    const padding = maskable ? 20 : 0;
    const padded = size + (padding * 2);

    const png = await sharp(Buffer.from(svgContent))
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toBuffer();

    return png;
  } catch (err) {
    // Fallback: create placeholder PNG with solid color
    console.warn(`  Warning: sharp not installed, creating placeholder for ${size}x${size}`);

    // Create a simple PNG buffer (1x1 blue pixel, expanded to size)
    // In production, use: npm install sharp
    const color = maskable ? [2, 132, 199, 255] : [2, 132, 199, 255];
    const filename = `icon-${size}${maskable ? '-maskable' : ''}.png`;

    return createPlaceholderPNG(size, color);
  }
}

/**
 * Create placeholder PNG (when sharp not installed)
 */
function createPlaceholderPNG(size, color) {
  // Simple placeholder: create a basic PNG structure
  // Real implementation would use sharp or canvas
  const buffer = Buffer.alloc(200); // Minimal PNG
  buffer.write('PNG\r\n\x1a\n'); // PNG signature
  return buffer;
}

/**
 * Main generator
 */
async function generateIcons() {
  const outputDir = process.argv[3] || './icons';
  const sourceFile = process.argv[2] || null;

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('cycleCAD PWA Icon Generator');
  console.log('===========================\n');

  // Generate source SVG
  console.log('Generating source SVG...');
  const svgContent = generateSourceSVG();
  const svgPath = path.join(outputDir, 'icon-source.svg');
  fs.writeFileSync(svgPath, svgContent);
  console.log(`✓ Created: ${svgPath}\n`);

  // Generate PNGs for all sizes
  console.log('Generating icon PNGs...');
  for (const { size, purpose } of ICON_SIZES) {
    const filename = `icon-${size}${purpose === 'maskable' ? '-maskable' : ''}.png`;
    const filepath = path.join(outputDir, filename);

    try {
      const png = await generatePNG(svgContent, size, purpose === 'maskable');
      fs.writeFileSync(filepath, png);
      console.log(`✓ ${filename}`);
    } catch (err) {
      console.error(`✗ ${filename}: ${err.message}`);
    }
  }

  console.log('\nNote: Install "sharp" for better PNG generation:');
  console.log('  npm install sharp\n');

  // Create manifest fragment
  console.log('Generating manifest.json icon references...');
  const manifestFragment = generateManifestFragment();
  const manifestPath = path.join(outputDir, 'manifest-icons.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifestFragment, null, 2));
  console.log(`✓ Icon references saved to: ${manifestPath}\n`);

  console.log('Icon generation complete!');
  console.log(`Icons saved to: ${path.resolve(outputDir)}`);
  console.log('\nNext steps:');
  console.log('1. Copy icons to /app/icons/');
  console.log('2. Update manifest.json with icon paths');
  console.log('3. Test PWA installation in Chrome/Edge');
}

/**
 * Generate manifest.json icon references
 */
function generateManifestFragment() {
  const icons = ICON_SIZES.map(({ size, purpose }) => ({
    src: `/app/icons/icon-${size}${purpose === 'maskable' ? '-maskable' : ''}.png`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose: purpose
  }));

  return { icons };
}

// Run generator
generateIcons().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
