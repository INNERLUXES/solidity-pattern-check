// The listing of the folder: every file the tool reads, in the order of their paths. A file is read when its path,
// relative to the folder, matches an include pattern (*.sol in every folder by default) and no exclude pattern; paths
// and patterns are compared in lowercase. The folders .git and node_modules hold history and installed packages, not the
// contracts of the project, so they are counted and passed over, in any case of letters, wherever they are; the folders
// lib, out, cache and artifacts at the top of the folder are left out by the default exclude patterns of src/defaults.js.
// A symbolic link (a junction on Windows too) is counted and never followed, so the listing cannot leave the folder or
// walk a loop. The listing keeps a list of folders of its own, with no recursion, and stops at its limits of entries,
// depth and files and says so, so a run never passes because a part of the folder was not read.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { globMatch } from './glob.js';
import { asciiLower, byCode, joinPath } from './words.js';

export const WALK_LIMITS = { maxProjectEntries: 50000, maxFolderDepth: 32, maxInputFiles: 5000 };

// The folders that are never read: the history of git and installed packages.
export const SKIPPED_FOLDERS = ['.git', 'node_modules'];

// True when a path, or a folder with a slash after it, matches one of the patterns, in lowercase.
export function matchesAny(patterns, path, folder = false) {
  const p = asciiLower(path);
  return patterns.some((x) => {
    const lower = asciiLower(x);
    return globMatch(lower, p) || (folder && globMatch(lower, `${p}/`));
  });
}

// The files below a folder: { files: [{ rel, full, name }], skipped, excluded, links, others, limit }, where rel is the
// path from the folder with forward slashes, skipped counts the folders of SKIPPED_FOLDERS passed over, others the files
// no include pattern names, and limit says which limit stopped the listing, or is null.
export async function walkFolder(root, { include = ['**/*.sol'], exclude = [], limits = WALK_LIMITS } = {}) {
  const lim = { ...WALK_LIMITS, ...limits };
  const files = [];
  let entries = 0;
  let skipped = 0;
  let excludedCount = 0;
  let links = 0;
  let others = 0;
  let limit = null;
  const folders = [{ rel: '', full: root, depth: 0 }];
  while (folders.length && limit === null) {
    const folder = folders.pop();
    const list = await readdir(folder.full, { withFileTypes: true });
    list.sort((a, b) => byCode(a.name, b.name));
    const inner = [];
    for (const entry of list) {
      entries += 1;
      if (entries > lim.maxProjectEntries) {
        limit = `more than ${lim.maxProjectEntries.toLocaleString('en-US')} files and folders`;
        break;
      }
      const rel = joinPath(folder.rel, entry.name);
      if (entry.isSymbolicLink()) {
        links += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIPPED_FOLDERS.includes(asciiLower(entry.name))) skipped += 1;
        else if (matchesAny(exclude, rel, true)) excludedCount += 1;
        else if (folder.depth + 1 > lim.maxFolderDepth) limit = `folders nested more than ${lim.maxFolderDepth} deep, at ${rel}`;
        else inner.push({ rel, full: join(folder.full, entry.name), depth: folder.depth + 1 });
        continue;
      }
      if (!entry.isFile() || !matchesAny(include, rel)) {
        others += 1;
        continue;
      }
      if (matchesAny(exclude, rel)) {
        excludedCount += 1;
        continue;
      }
      if (files.length >= lim.maxInputFiles) {
        limit = `more than ${lim.maxInputFiles.toLocaleString('en-US')} Solidity files`;
        break;
      }
      files.push({ rel, full: join(folder.full, entry.name), name: entry.name });
    }
    for (let k = inner.length - 1; k >= 0; k -= 1) folders.push(inner[k]);
  }
  files.sort((a, b) => byCode(a.rel, b.rel));
  return { files, skipped, excluded: excludedCount, links, others, limit };
}
