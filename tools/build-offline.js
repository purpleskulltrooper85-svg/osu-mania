#!/usr/bin/env node
'use strict';

/**
 * Generate the offline single-file build from the regular one.
 *
 * The regular index.html tries to fetch songs.json at boot and falls back to the
 * built-in catalog when that fails. The offline build is identical except that
 * BUILD_MODE is flipped to 'offline', which disables the manifest fetch entirely
 * (and turns the offline badge on) so the file works from file:// with no network.
 *
 * Usage: node tools/build-offline.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'index.html');
const out = path.join(root, 'osu_mania_offline.html');

const html = fs.readFileSync(src, 'utf8');
const needle = "const BUILD_MODE = 'online';";
if (!html.includes(needle)) {
  console.error("Could not find `const BUILD_MODE = 'online';` in index.html");
  process.exit(1);
}

const offline = html.replace(needle, "const BUILD_MODE = 'offline';");
fs.writeFileSync(out, offline);
console.log('Wrote', path.relative(root, out), `(${(offline.length / 1024).toFixed(0)} KB)`);
