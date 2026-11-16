#!/usr/bin/env node
/**
 * Sync web game assets from /workspace/flappy-clone into www/
 * Source of truth remains flappy-clone; do not edit copies in www/.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../flappy-clone');
const DEST = path.resolve(__dirname, '../www');

const COPY_FILES = [
  'index.html',
  'style.css',
  'game.js',
  'obstacles.js',
  'ads.js',
  'sky-hop.html',
];

// v1.7: never bundle these into the app. The bundled legal pages were stale
// (Sept 15 privacy copy with [AD NETWORK PRIVACY URL] / [CONTACT EMAIL]
// placeholders); the app now links to the live policy instead:
// https://dannymac1992dm-tech.github.io/sky-hop/privacy.html
// README.md is internal (box paths) and not used by the game.
const EXCLUDE = new Set(['privacy.html', 'terms.html', 'legal-index.html', 'README.md', 'AUDIO-LICENSE.md']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(name) {
  const from = path.join(SRC, name);
  const to = path.join(DEST, name);
  if (!fs.existsSync(from)) {
    console.warn(`[sync:web] skip missing: ${name}`);
    return false;
  }
  fs.copyFileSync(from, to);
  console.log(`[sync:web] ${name}`);
  return true;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`[sync:web] Source not found: ${SRC}`);
    process.exit(1);
  }
  ensureDir(DEST);
  // Clear stale assets (keep .gitkeep if any)
  for (const ent of fs.readdirSync(DEST)) {
    if (ent === '.gitkeep') continue;
    fs.rmSync(path.join(DEST, ent), { recursive: true, force: true });
  }
  let n = 0;
  for (const f of COPY_FILES) {
    if (copyFile(f)) n++;
  }
  // Copy any other top-level assets (images, audio, etc.) without touching nested tooling
  for (const ent of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    if (COPY_FILES.includes(ent.name)) continue;
    if (EXCLUDE.has(ent.name)) {
      console.log(`[sync:web] excluded ${ent.name}`);
      continue;
    }
    if (ent.name === 'node_modules' || ent.name === 'package.json' || ent.name === 'package-lock.json' || ent.name === 'tests') continue;
    const from = path.join(SRC, ent.name);
    const to = path.join(DEST, ent.name);
    if (ent.isDirectory()) {
      fs.cpSync(from, to, { recursive: true });
      console.log(`[sync:web] dir ${ent.name}/`);
      n++;
    } else if (ent.isFile()) {
      fs.copyFileSync(from, to);
      console.log(`[sync:web] ${ent.name}`);
      n++;
    }
  }
  console.log(`[sync:web] Done. ${n} item(s) -> ${DEST}`);
  console.log(`[sync:web] Source of truth: ${SRC}`);
}

main();
