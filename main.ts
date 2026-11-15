// IRONLINE — the hand-in step for make.fun's threejs-fps-02 bounty.
//
// What this program does, in order:
//   1. works out where the entry lives on disk (the folder holding this file)
//      and where the hand-in goes (MAKEFUN_OUTPUT_DIR, or /output);
//   2. stages the finished game — the static files in game/ and the three
//      screenshots in screenshots/ — into that output folder;
//   3. asks the vendored make.fun library to describe the staged copy as
//      dossier.json, the summary the judge reads.
//
// Nothing here builds, renders or fetches anything: the game is finished
// on disk, and this script only copies it and writes its summary.

import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-threejs.ts';

/** The scorer's caps for the dossier (see the vendored library's header). */
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

/** An environment variable's value, or `fallback` when it is unset or empty. */
function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/** The folder this file lives in. */
function repoRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Copy one folder of the entry into the output folder, creating the
 * destination first. A missing source is an error for the game itself
 * and a quiet skip for the screenshots.
 */
function stageFolder(source: string, destination: string, required: boolean): void {
  if (!fs.existsSync(source)) {
    if (required) throw new Error(`missing entry folder: ${source}`);
    return;
  }
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

const root = repoRoot();
const output = envOr('MAKEFUN_OUTPUT_DIR', '/output');

fs.mkdirSync(output, { recursive: true });
stageFolder(join(root, 'game'), join(output, 'game'), true);
stageFolder(join(root, 'screenshots'), join(output, 'screenshots'), false);

const dossier = buildDossier(output, DOSSIER_CAPS);
fs.writeFileSync(join(output, 'dossier.json'), dossier);
