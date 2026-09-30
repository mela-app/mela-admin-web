// Builds every Mela brand asset from one geometry (mark.mjs) and the two
// wordmark typefaces, Montserrat and Noto Sans Ethiopic (both SIL OFL), so
// the app icon, splash, in-app logo, console favicon and share page can't
// drift apart. The outputs are committed; only a logo change needs this.
// The other apps are written in their own checkouts next to this one
// (../mela-mobile, ../mela-web, ../mela-backend), or wherever
// MELA_MOBILE_DIR / MELA_WEB_DIR / MELA_BACKEND_DIR point:
//
//   cd branding && npm ci && npm run build
//   cd ../../mela-mobile && dart run flutter_launcher_icons && dart run flutter_native_splash:create
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { markAt, node, STROKE, toSvgPath } from './mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const checkout = (variable, name) => resolve(process.env[variable] || join(repo, '..', name));
const mobileRepo = checkout('MELA_MOBILE_DIR', 'mela-mobile');
const webRepo = checkout('MELA_WEB_DIR', 'mela-web');
const backendRepo = checkout('MELA_BACKEND_DIR', 'mela-backend');
const skipped = new Set();

const COLORS = {
  teal: '#1D5B7C',
  amber: '#F5A623',
  navy: '#1B3A55',
  white: '#FFFFFF',
};

// Icons get a heavier line than the logo so the M survives small sizes.
const ICON_STROKE = 16;
const FAVICON_STROKE = 19;
const NOTIFICATION_STROKE = 22;

const fonts = {
  latin: loadFont('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'),
  ethiopic: loadFont(
    '@expo-google-fonts/noto-sans-ethiopic/600SemiBold/NotoSansEthiopic_600SemiBold.ttf',
  ),
};

const lockup = buildLockup();

// --- Master artwork -------------------------------------------------------

const svgDir = join(here, 'svg');
write(join(svgDir, 'mela-mark.svg'), markSvg({ line: COLORS.teal, arrow: COLORS.amber }));
write(join(svgDir, 'mela-mark-reversed.svg'), markSvg({ line: COLORS.white, arrow: COLORS.amber }));
write(
  join(svgDir, 'mela-logo.svg'),
  lockupSvg({ line: COLORS.teal, arrow: COLORS.amber, text: COLORS.navy }),
);
write(
  join(svgDir, 'mela-logo-reversed.svg'),
  lockupSvg({ line: COLORS.white, arrow: COLORS.amber, text: COLORS.white }),
);
const appIcon = iconSvg({ markWidth: 0.56, tile: { fill: COLORS.teal } });
write(join(svgDir, 'mela-app-icon.svg'), appIcon);

// --- Mobile: sources for flutter_launcher_icons / flutter_native_splash ------

const mobileAssets = join(mobileRepo, 'assets/branding');
// iOS, web and Windows apply their own mask to a full-bleed square.
writePng(join(mobileAssets, 'app-icon.png'), appIcon, 1024);
// Android 7 launchers show the icon unmasked, so it brings its own shape.
writePng(
  join(mobileAssets, 'app-icon-legacy.png'),
  iconSvg({ markWidth: 0.52, tile: { fill: COLORS.teal, inset: 40, radius: 170 } }),
  1024,
);
// macOS: an 824px rounded tile on a 1024 canvas.
writePng(
  join(mobileAssets, 'app-icon-macos.png'),
  iconSvg({ markWidth: 0.46, tile: { fill: COLORS.teal, inset: 100, radius: 185 } }),
  1024,
);
// Android 8+ adaptive icon: the mark stays inside the 66/108 safe circle.
writePng(join(mobileAssets, 'app-icon-foreground.png'), iconSvg({ markWidth: 0.42 }), 1024);
// Android 13 themed icon: one colour, tinted by the system.
writePng(
  join(mobileAssets, 'app-icon-monochrome.png'),
  iconSvg({ markWidth: 0.42, line: COLORS.white, arrow: COLORS.white }),
  1024,
);
// Splash (at 4x): a 160dp teal disc, matching what Android 12+ draws itself
// from splash-android12.png (fits the 640px circle of a 960px canvas).
writePng(
  join(mobileAssets, 'splash.png'),
  iconSvg({ size: 640, markWidth: 0.625, tile: { fill: COLORS.teal, shape: 'circle' } }),
  640,
);
writePng(join(mobileAssets, 'splash-android12.png'), iconSvg({ size: 960, markWidth: 400 / 960 }), 960);

// Android's status-bar icon for pushes: 24dp, white on transparent (the
// system tints it), content inside the 20dp safe area.
for (const [density, px] of [
  ['mdpi', 24],
  ['hdpi', 36],
  ['xhdpi', 48],
  ['xxhdpi', 72],
  ['xxxhdpi', 96],
]) {
  writePng(
    join(mobileRepo, `android/app/src/main/res/drawable-${density}/ic_notification.png`),
    iconSvg({ size: 96, markWidth: 0.8, stroke: NOTIFICATION_STROKE, line: COLORS.white, arrow: COLORS.white }),
    px,
  );
}

// --- Admin console ------------------------------------------------------

const adminPublic = join(repo, 'public');
const favicon = iconSvg({
  size: 64,
  markWidth: 0.66,
  stroke: FAVICON_STROKE,
  tile: { fill: COLORS.teal, radius: 14 },
});
write(join(adminPublic, 'favicon.svg'), favicon);
writePng(join(adminPublic, 'favicon-32.png'), favicon, 32);
writePng(
  join(adminPublic, 'apple-touch-icon.png'),
  iconSvg({ size: 180, markWidth: 0.56, tile: { fill: COLORS.teal } }),
  180,
);

// --- Code: the same paths for in-app rendering ----------------------------

const generated = 'Generated by branding/build.mjs (mela-admin-web) - do not edit by hand.';

const webLogoData = `// ${generated}

export const MELA_COLORS = { teal: '${COLORS.teal}', amber: '${COLORS.amber}', navy: '${COLORS.navy}' } as const

/** The mark, in its own units; its ink fills \`viewBox\`. */
export const MELA_MARK = {
  viewBox: '${viewBox(lockup.mark.bounds)}',
  stroke: ${n(lockup.mark.stroke)},
  nodeRadius: ${n(lockup.mark.nodeRadius)},
  node: { x: ${n(node.x)}, y: ${n(node.y)} },
  headRounding: ${n(lockup.mark.headRounding)},
  line: '${toSvgPath(lockup.mark.line)}',
  shaft: '${toSvgPath(lockup.mark.shaft)}',
  head: '${toSvgPath(lockup.mark.head)}',
} as const

/** The lockup: the mark, with "MELA" over "መላ" to its right. */
export const MELA_LOCKUP = {
  viewBox: '${viewBox(lockup.bounds)}',
  latin: '${toSvgPath(lockup.latin)}',
  ethiopic: '${toSvgPath(lockup.ethiopic)}',
} as const
`;

// The admin console and the share page's browser player draw the same logo.
write(join(repo, 'src/components/brand/logo-data.ts'), webLogoData);
write(join(webRepo, 'src/brand/logo-data.ts'), webLogoData);

write(
  join(mobileRepo, 'lib/core/widgets/mela_logo_data.dart'),
  `// ${generated}
//
// The Mela mark and wordmark as paths, in the mark's own units: the mark's
// ink fills [MelaLogoData.markBounds]; the lockup (the mark, with "MELA"
// over "መላ" to its right) fills [MelaLogoData.lockupBounds].

import 'dart:ui';

abstract final class MelaLogoData {
  static const Rect markBounds = ${dartRect(lockup.mark.bounds)};
  static const Rect lockupBounds = ${dartRect(lockup.bounds)};
  static const double stroke = ${n(lockup.mark.stroke)};
  static const Offset node = Offset(${n(node.x)}, ${n(node.y)});
  static const double nodeRadius = ${n(lockup.mark.nodeRadius)};
  static const double headRounding = ${n(lockup.mark.headRounding)};

  static final Path line = ${dartPath(lockup.mark.line)};

  static final Path shaft = ${dartPath(lockup.mark.shaft)};

  static final Path head = ${dartPath(lockup.mark.head)};

  /// "MELA".
  static final Path latin = ${dartPath(lockup.latin)};

  /// "መላ".
  static final Path ethiopic = ${dartPath(lockup.ethiopic)};
}
`,
);

write(
  join(backendRepo, 'src/share/brand.ts'),
  `// ${generated}

/** The Mela lockup for dark backgrounds, as inline SVG markup. */
export const MELA_LOGO_SVG =
  '${lockupSvg({ line: COLORS.white, arrow: COLORS.amber, text: COLORS.white }, ' role="img" aria-label="Mela"').trim()}';

export const MELA_COLORS = { teal: '${COLORS.teal}', amber: '${COLORS.amber}' } as const;
`,
);

// --- Building blocks ------------------------------------------------------

function buildLockup() {
  const mark = markAt(STROKE);
  const { minX, minY, maxX, maxY } = mark.bounds;
  const markHeight = maxY - minY;

  const latin = fitHeight(setText(fonts.latin, 'MELA', 0.08), markHeight * 0.3);
  const ethiopic = fitHeight(setText(fonts.ethiopic, 'መላ', 0.04), markHeight * 0.34);
  const gap = markHeight * 0.13;
  const left = maxX + markHeight * 0.24;
  const top = minY + (markHeight - (height(latin) + gap + height(ethiopic))) / 2;
  const latinPlaced = moveTo(latin, left, top);
  const ethiopicPlaced = moveTo(ethiopic, left, top + height(latin) + gap);
  const right = Math.max(inkBounds(latinPlaced).maxX, inkBounds(ethiopicPlaced).maxX);

  return {
    mark,
    latin: fromOpentype(latinPlaced),
    ethiopic: fromOpentype(ethiopicPlaced),
    bounds: { minX, minY, maxX: right, maxY },
  };
}

/** Lays `text` out in font units, with extra letter spacing in em. */
function setText(font, text, tracking) {
  const glyphs = font.stringToGlyphs(text);
  const commands = [];
  let x = 0;
  glyphs.forEach((glyph, index) => {
    commands.push(...glyph.getPath(x, 0, font.unitsPerEm).commands);
    const next = glyphs[index + 1];
    x += glyph.advanceWidth + tracking * font.unitsPerEm;
    if (next) x += font.getKerningValue(glyph, next);
  });
  return commands;
}

function fitHeight(commands, targetHeight) {
  return transform(commands, targetHeight / height(commands), 0, 0);
}

function moveTo(commands, left, top) {
  const bounds = inkBounds(commands);
  return transform(commands, 1, left - bounds.minX, top - bounds.minY);
}

function transform(commands, scale, dx, dy) {
  return commands.map((command) => {
    const moved = { type: command.type };
    for (const [kx, ky] of [
      ['x', 'y'],
      ['x1', 'y1'],
      ['x2', 'y2'],
    ]) {
      if (command[kx] !== undefined) {
        moved[kx] = command[kx] * scale + dx;
        moved[ky] = command[ky] * scale + dy;
      }
    }
    return moved;
  });
}

function inkBounds(commands) {
  const path = new opentype.Path();
  path.commands = commands;
  const box = path.getBoundingBox();
  return { minX: box.x1, minY: box.y1, maxX: box.x2, maxY: box.y2 };
}

function height(commands) {
  const bounds = inkBounds(commands);
  return bounds.maxY - bounds.minY;
}

function fromOpentype(commands) {
  return commands.map((command) => {
    switch (command.type) {
      case 'M':
      case 'L':
        return [command.type, command.x, command.y];
      case 'Q':
        return ['Q', command.x1, command.y1, command.x, command.y];
      case 'C':
        return ['C', command.x1, command.y1, command.x2, command.y2, command.x, command.y];
      case 'Z':
        return ['Z'];
      default:
        throw new Error(`Unexpected path command ${command.type}`);
    }
  });
}

function markBody(mark, { line, arrow }) {
  return [
    `<path d="${toSvgPath(mark.line)}" fill="none" stroke="${line}" stroke-width="${n(mark.stroke)}" stroke-linejoin="round"/>`,
    `<circle cx="${n(node.x)}" cy="${n(node.y)}" r="${n(mark.nodeRadius)}" fill="${line}"/>`,
    `<path d="${toSvgPath(mark.shaft)}" fill="none" stroke="${arrow}" stroke-width="${n(mark.stroke)}"/>`,
    `<path d="${toSvgPath(mark.head)}" fill="${arrow}" stroke="${arrow}" stroke-width="${n(mark.headRounding)}" stroke-linejoin="round"/>`,
  ].join('');
}

function markSvg(colors) {
  return svgDocument(viewBox(lockup.mark.bounds), markBody(lockup.mark, colors));
}

function lockupSvg({ line, arrow, text }, attributes = '') {
  return svgDocument(
    viewBox(lockup.bounds),
    markBody(lockup.mark, { line, arrow }) +
      `<path d="${toSvgPath(lockup.latin)}" fill="${text}"/>` +
      `<path d="${toSvgPath(lockup.ethiopic)}" fill="${text}"/>`,
    attributes,
  );
}

/**
 * The mark centred on a square canvas: `markWidth` is the share of the
 * canvas its ink spans, over an optional backdrop `tile`.
 */
function iconSvg({
  size = 1024,
  markWidth,
  stroke = ICON_STROKE,
  line = COLORS.white,
  arrow = COLORS.amber,
  tile,
}) {
  const mark = markAt(stroke);
  const { minX, minY, maxX, maxY } = mark.bounds;
  const scale = (size * markWidth) / (maxX - minX);
  const dx = size / 2 - ((minX + maxX) / 2) * scale;
  const dy = size / 2 - ((minY + maxY) / 2) * scale;
  const backdrop = tile ? tileShape(size, tile) : '';
  return svgDocument(
    `0 0 ${size} ${size}`,
    `${backdrop}<g transform="translate(${n(dx)} ${n(dy)}) scale(${n(scale, 5)})">${markBody(mark, { line, arrow })}</g>`,
    ` width="${size}" height="${size}"`,
  );
}

function tileShape(size, { fill, shape = 'square', inset = 0, radius = 0 }) {
  if (shape === 'circle') {
    return `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - inset}" fill="${fill}"/>`;
  }
  const side = size - inset * 2;
  return `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${radius}" fill="${fill}"/>`;
}

function svgDocument(box, body, attributes = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"${attributes}>${body}</svg>\n`;
}

function viewBox({ minX, minY, maxX, maxY }) {
  return [minX, minY, maxX - minX, maxY - minY].map((value) => n(value)).join(' ');
}

function dartRect({ minX, minY, maxX, maxY }) {
  return `Rect.fromLTRB(${[minX, minY, maxX, maxY].map((value) => n(value)).join(', ')})`;
}

function dartPath(commands) {
  const calls = commands.map(([op, ...args]) => {
    const values = args.map((value) => n(value)).join(', ');
    switch (op) {
      case 'M':
        return `..moveTo(${values})`;
      case 'L':
        return `..lineTo(${values})`;
      case 'Q':
        return `..quadraticBezierTo(${values})`;
      case 'C':
        return `..cubicTo(${values})`;
      default:
        return '..close()';
    }
  });
  return `Path()\n    ${calls.join('\n    ')}`;
}

function n(value, digits = 2) {
  return String(Number(value.toFixed(digits)));
}

function loadFont(file) {
  const bytes = readFileSync(join(here, 'node_modules', file));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function writePng(file, svg, width) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  }).render();
  write(file, png.asPng());
}

function write(file, contents) {
  const checkoutRoot = [mobileRepo, webRepo, backendRepo].find((dir) => file.startsWith(dir + sep));
  if (checkoutRoot && !existsSync(checkoutRoot)) {
    if (!skipped.has(checkoutRoot)) console.warn(`  skipped ${checkoutRoot} - not checked out there`);
    skipped.add(checkoutRoot);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
  console.log(`  ${relative(repo, file).replaceAll('\\', '/')}`);
}
