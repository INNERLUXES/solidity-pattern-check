// The version pragma: pragma solidity followed by a version expression, read as the Solidity documentation describes
// it (the npm style of versions): comparators with ^, ~, >=, >, <=, < or =, a range a - b, sets of comparators joined
// by ||, and versions such as 0.8.19, 0.8 or 0.8.x. The tool needs two things from it: whether the expression names one
// version only (a pinned pragma), and the lowest version it admits, to compare with the minimum of the configuration.
// The reader is a loop over the characters of the expression, with no regular expression built from it.

// A version as three numbers, or null when it is not a version. A missing part or x, X or * reads as 0 and makes the
// version partial; given counts the numbers written before the first missing part or wildcard.
export function parseVersion(text) {
  const parts = String(text).split('.');
  if (parts.length > 3) return null;
  const out = [];
  let given = 0;
  for (const p of parts) {
    if (p === 'x' || p === 'X' || p === '*') out.push(0);
    else if (/^\d{1,9}$/.test(p) && given === out.length) {
      out.push(Number(p));
      given += 1;
    } else return null;
  }
  while (out.length < 3) out.push(0);
  return { v: out, partial: given < 3, given };
}

// -1, 0 or 1 as version a is below, equal to or above version b.
export function compareVersions(a, b) {
  for (let k = 0; k < 3; k += 1) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  return 0;
}

export const versionText = (v) => v.join('.');

const OPERATOR_CHARS = '<>=^~';

// The comparators of an expression: [[{ op, version }]], one list for each set joined by ||, or null when the text is
// not a version expression the tool reads. A range a - b is the comparators >=a and <=b.
export function readExpression(text) {
  const s = String(text);
  const sets = [[]];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ') {
      i += 1;
      continue;
    }
    if (s.startsWith('||', i)) {
      sets.push([]);
      i += 2;
      continue;
    }
    if (s[i] === '-' && s[i + 1] === ' ') {
      const set = sets.at(-1);
      if (set.length === 0 || set.at(-1).op !== '') return null;
      set.at(-1).op = '>=';
      set.push({ op: '<=', version: null, hyphen: true });
      i += 1;
      continue;
    }
    let op = '';
    while (i < s.length && OPERATOR_CHARS.includes(s[i])) op += s[i++];
    if (!['', '=', '^', '~', '>=', '>', '<=', '<'].includes(op)) return null;
    while (s[i] === ' ') i += 1;
    let word = '';
    while (i < s.length && s[i] !== ' ' && s[i] !== '|') word += s[i++];
    const version = parseVersion(word);
    if (!version) return null;
    const set = sets.at(-1);
    if (set.length && set.at(-1).hyphen && set.at(-1).version === null) set.at(-1).version = version;
    else set.push({ op, version });
  }
  if (sets.some((set) => set.length === 0 || set.some((c) => c.version === null))) return null;
  return sets;
}

// What a pragma solidity says: { expression, readable, pinned, lowest }. pinned is true when the expression names one
// full version, with no operator or with =; lowest is the lowest version the expression admits, or null when the
// expression is not read.
export function readPragma(expression) {
  const sets = readExpression(expression);
  if (!sets) return { expression, readable: false, pinned: false, lowest: null };
  const pinned = sets.length === 1 && sets[0].length === 1 && (sets[0][0].op === '' || sets[0][0].op === '=') && !sets[0][0].version.partial;
  let lowest = null;
  for (const set of sets) {
    let lo = [0, 0, 0];
    for (const { op, version } of set) {
      let v = version.v;
      if (op === '>') {
        v = [...v];
        const last = Math.max(0, version.given - 1);
        v[last] += 1;
        for (let k = last + 1; k < 3; k += 1) v[k] = 0;
      }
      if (op !== '<' && op !== '<=' && compareVersions(v, lo) > 0) lo = v;
    }
    if (lowest === null || compareVersions(lo, lowest) < 0) lowest = lo;
  }
  return { expression, readable: true, pinned, lowest };
}

// The version expression of a pragma token, or null when the pragma is not pragma solidity (abicoder, experimental).
export function solidityExpression(raw) {
  const text = String(raw).trim();
  if (!text.startsWith('solidity')) return null;
  const rest = text.slice('solidity'.length);
  if (rest.length && rest[0] !== ' ' && !OPERATOR_CHARS.includes(rest[0])) return null;
  return rest.trim();
}
