// A Solidity lexer of the tool's own. It reads the text once, left to right, and turns it into tokens with their
// offsets, so that no check ever looks at the inside of a comment or a literal: line comments (//, ///), block comments
// (/* */, /** */), string literals in double and single quotes with their escapes, unicode"..." and hex"..." literals
// are each one token with no text, or no token at all for a comment. A pragma is kept as one token with its raw text up
// to the semicolon, because a version such as ^0.8.19 is not an expression. Numbers keep their text (an address literal
// is a number of 40 hexadecimal digits), identifiers keep their name, and the operators of Solidity and Yul are read
// longest first. The lexer never fails on what it reads: an unclosed comment runs to the end of the file, and an unclosed
// string ends at the end of its line, as the compiler would refuse it. It stops only at its limits (docs/limits.md).

export const LEX_LIMITS = { maxTokens: 400000, maxNameLength: 1024 };

export class LexError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

// The operators of Solidity and of Yul, longest first.
const OPERATORS = ['>>>=', '<<=', '>>=', '>>>', '=>', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '<<', '>>', '**', ':=', '->'];

const isIdStart = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 36 || c === 95;
const isIdPart = (c) => isIdStart(c) || (c >= 48 && c <= 57);
const isDigit = (c) => c >= 48 && c <= 57;
const isHex = (c) => isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;
const isLineEnd = (c) => c === 10 || c === 13;

// The tokens of a text: { tokens: [{ t, v, o }], blanks: [[start, end]] }. t is 'id' (an identifier or a keyword),
// 'num' (a number, with its text), 'str' (a string literal; v is '', 'hex' or 'unicode'), 'pragma' (v is the raw text
// after the word pragma, with runs of white space as one space), 'p' (punctuation or an operator) or 'other' (a
// character that is none of these). blanks lists the ranges of the comments and literals.
export function tokenize(text, limits = LEX_LIMITS) {
  const lim = { ...LEX_LIMITS, ...limits };
  const n = text.length;
  const tokens = [];
  const blanks = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const push = (t, v, o) => {
    if (tokens.length >= lim.maxTokens) throw new LexError(`more than ${lim.maxTokens.toLocaleString('en-US')} tokens`, o);
    tokens.push({ t, v, o });
  };
  // A string literal from its opening quote at q; returns the offset after it.
  const stringEnd = (q) => {
    const quote = text.charCodeAt(q);
    let k = q + 1;
    while (k < n) {
      const c = text.charCodeAt(k);
      if (c === quote) return k + 1;
      if (isLineEnd(c)) return k;
      k += c === 92 && k + 1 < n && !isLineEnd(text.charCodeAt(k + 1)) ? 2 : 1;
    }
    return n;
  };
  while (i < n) {
    const c = text.charCodeAt(i);
    if (isSpace(c)) {
      i += 1;
      continue;
    }
    if (c === 47 && text.charCodeAt(i + 1) === 47) {
      const start = i;
      while (i < n && !isLineEnd(text.charCodeAt(i))) i += 1;
      blanks.push([start, i]);
      continue;
    }
    if (c === 47 && text.charCodeAt(i + 1) === 42) {
      const start = i;
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      blanks.push([start, i]);
      continue;
    }
    if (c === 34 || c === 39) {
      const end = stringEnd(i);
      push('str', '', i);
      blanks.push([i, end]);
      i = end;
      continue;
    }
    if (isIdStart(c)) {
      const start = i;
      while (i < n && isIdPart(text.charCodeAt(i))) i += 1;
      if (i - start > lim.maxNameLength) throw new LexError(`a name longer than ${lim.maxNameLength.toLocaleString('en-US')} characters`, start);
      const word = text.slice(start, i);
      const q = text.charCodeAt(i);
      if ((word === 'hex' || word === 'unicode') && (q === 34 || q === 39)) {
        const end = stringEnd(i);
        push('str', word, start);
        blanks.push([start, end]);
        i = end;
        continue;
      }
      if (word === 'pragma') {
        const semi = text.indexOf(';', i);
        const end = semi < 0 ? n : semi;
        push('pragma', text.slice(i, Math.min(end, i + 4096)).replace(/\s+/g, ' ').trim(), start);
        i = end;
        continue;
      }
      push('id', word, start);
      continue;
    }
    if (isDigit(c) || (c === 46 && isDigit(text.charCodeAt(i + 1)))) {
      const start = i;
      if (c === 48 && (text.charCodeAt(i + 1) === 120 || text.charCodeAt(i + 1) === 88)) {
        i += 2;
        while (i < n && (isHex(text.charCodeAt(i)) || text.charCodeAt(i) === 95)) i += 1;
      } else {
        while (i < n && (isDigit(text.charCodeAt(i)) || text.charCodeAt(i) === 95 || text.charCodeAt(i) === 46)) i += 1;
        if (i < n && (text.charCodeAt(i) === 101 || text.charCodeAt(i) === 69)) {
          i += 1;
          if (text.charCodeAt(i) === 45) i += 1;
          while (i < n && isDigit(text.charCodeAt(i))) i += 1;
        }
      }
      if (i - start > lim.maxNameLength) throw new LexError(`a number longer than ${lim.maxNameLength.toLocaleString('en-US')} characters`, start);
      push('num', text.slice(start, i), start);
      continue;
    }
    let op = null;
    for (const o of OPERATORS) {
      if (text.startsWith(o, i)) {
        op = o;
        break;
      }
    }
    if (op) {
      push('p', op, i);
      i += op.length;
      continue;
    }
    if (c < 128) {
      push('p', text[i], i);
      i += 1;
      continue;
    }
    push('other', '', i);
    i += c >= 0xd800 && c <= 0xdbff ? 2 : 1;
  }
  return { tokens, blanks };
}

// The text with every comment and literal blanked: each character in them a space, line ends kept, so that offsets,
// lines and columns stay where they were.
export function blankText(text, limits = LEX_LIMITS) {
  const { blanks } = tokenize(text, limits);
  const parts = [];
  let at = 0;
  for (const [start, end] of blanks) {
    parts.push(text.slice(at, start), text.slice(start, end).replace(/[^\r\n]/g, ' '));
    at = end;
  }
  parts.push(text.slice(at));
  return parts.join('');
}
