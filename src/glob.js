// Patterns of the configuration (include and exclude) and of --exclude, matched without building a regular expression
// from them. A pattern matches a path with forward slashes, relative to the folder that is checked; src/walk.js compares
// both in lowercase. * is any run of characters but a slash, ? is one character but a slash, ** is any run of
// characters, slashes included, and **/ is any run of folders, none included. Each match walks the text once for each
// part of the pattern, so the work is bounded by the product of their lengths.

export const MAX_PATTERN_LENGTH = 200;

// The parts of a pattern: { type: 'any' | 'folders' | 'star' | 'one' | 'char', c }.
function tokens(pattern) {
  const out = [];
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.startsWith('**/', i)) {
      out.push({ type: 'folders' });
      i += 2;
    } else if (pattern.startsWith('**', i)) {
      out.push({ type: 'any' });
      i += 1;
    } else if (pattern[i] === '*') out.push({ type: 'star' });
    else if (pattern[i] === '?') out.push({ type: 'one' });
    else out.push({ type: 'char', c: pattern[i] });
  }
  return out;
}

// True when the whole text matches the pattern.
export function globMatch(pattern, text) {
  const t = String(text);
  const n = t.length;
  let states = new Uint8Array(n + 1);
  states[0] = 1;
  for (const tok of tokens(String(pattern))) {
    const next = new Uint8Array(n + 1);
    if (tok.type === 'any') {
      let on = false;
      for (let k = 0; k <= n; k += 1) {
        if (states[k]) on = true;
        if (on) next[k] = 1;
      }
    } else if (tok.type === 'folders') {
      let on = false;
      for (let k = 0; k <= n; k += 1) {
        if (states[k]) {
          on = true;
          next[k] = 1;
        }
        if (on && k < n && t[k] === '/') next[k + 1] = 1;
      }
    } else if (tok.type === 'star') {
      let on = false;
      for (let k = 0; k <= n; k += 1) {
        if (states[k]) on = true;
        if (on) next[k] = 1;
        if (k < n && t[k] === '/') on = false;
      }
    } else {
      for (let k = 0; k < n; k += 1) {
        if (!states[k]) continue;
        if (tok.type === 'one' ? t[k] !== '/' : t[k] === tok.c) next[k + 1] = 1;
      }
    }
    states = next;
  }
  return states[n] === 1;
}

