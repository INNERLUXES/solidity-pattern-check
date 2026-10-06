// The outline of a Solidity file, from its tokens (src/lexer.js): the pragmas and imports, every contract, interface and
// library with its bases, state variables, modifiers and functions, and for every function its parameters, visibility,
// mutability, modifiers, local variables and the range of its body. Braces are tracked with a stack of the tool's own
// and no recursion: a brace opens a contract, a function body, a block, an unchecked block, an assembly block, or an
// expression (call options such as {value: v}, named arguments, a struct literal), and each kind is kept apart. Every
// token of a body gets the number of its statement (a statement ends at a semicolon outside parentheses, or at a brace
// of a block) and a mark when it sits inside an assembly block. The outline is the light structure the checks need, not
// the syntax tree of the compiler: docs/method.md says what it reads and docs/limits.md what it simplifies.

export const OUTLINE_LIMITS = { maxNesting: 256 };

export class OutlineError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

export const VISIBILITY = ['public', 'external', 'internal', 'private'];
export const MUTABILITY = ['view', 'pure', 'payable', 'constant', 'nonpayable'];
const VAR_WORDS = new Set(['public', 'private', 'internal', 'constant', 'immutable', 'override', 'transient']);
const LOCATIONS = new Set(['memory', 'storage', 'calldata']);
const FUNCTION_WORDS = new Set(['function', 'constructor', 'modifier', 'fallback', 'receive']);
// Words that start a statement and never a declaration of a local variable.
const STATEMENT_WORDS = new Set(['return', 'if', 'else', 'for', 'while', 'do', 'emit', 'revert', 'delete', 'assembly', 'unchecked', 'break', 'continue', 'try', 'catch', 'new', 'throw', 'require', 'assert', '_']);

const isP = (tok, v) => tok !== undefined && tok.t === 'p' && tok.v === v;
const isId = (tok, v) => tok !== undefined && tok.t === 'id' && (v === undefined || tok.v === v);

// The index of the token that closes each bracket, worked out once for the whole file with a stack: match[i] is the
// index of the ')', ']' or '}' that closes the bracket opened at i, or -1 when it is not closed. A closing bracket of
// the wrong kind is passed over.
export function brackets(tokens) {
  const match = new Int32Array(tokens.length).fill(-1);
  const open = [];
  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    if (tok.t !== 'p') continue;
    if (tok.v === '(' || tok.v === '[' || tok.v === '{') open.push(k);
    else if (tok.v === ')' || tok.v === ']' || tok.v === '}') {
      const want = tok.v === ')' ? '(' : tok.v === ']' ? '[' : '{';
      if (open.length && tokens[open.at(-1)].v === want) match[open.pop()] = k;
    }
  }
  return match;
}

// The index of the token that closes the bracket opened at i, or the number of tokens when it is not closed.
export const closing = (match, i) => (match[i] >= 0 ? match[i] : match.length);

// The parts of a list split at commas outside brackets: [[from, to]] as token indices, to exclusive.
function splitList(tokens, from, to) {
  const out = [];
  let depth = 0;
  let start = from;
  for (let k = from; k < to; k += 1) {
    const v = tokens[k].t === 'p' ? tokens[k].v : '';
    if (v === '(' || v === '[' || v === '{') depth += 1;
    else if (v === ')' || v === ']' || v === '}') depth -= 1;
    else if (v === ',' && depth === 0) {
      out.push([start, k]);
      start = k + 1;
    }
  }
  if (to > start) out.push([start, to]);
  return out;
}

// A parameter or a declared variable from its tokens: { name, type, location, offset, dynamic }.
function declarationOf(tokens, from, to) {
  const ids = [];
  let location = null;
  for (let k = from; k < to; k += 1) {
    const tok = tokens[k];
    if (tok.t !== 'id') continue;
    if (LOCATIONS.has(tok.v)) location = tok.v;
    else if (!VAR_WORDS.has(tok.v) && tok.v !== 'payable' && tok.v !== 'indexed') ids.push(k);
  }
  if (ids.length === 0) return null;
  let dynamic = false;
  for (let k = from; k + 1 < to; k += 1) if (isP(tokens[k], '[') && isP(tokens[k + 1], ']')) dynamic = true;
  const named = ids.length > 1 && !isP(tokens[ids.at(-1) - 1], '.');
  return { name: named ? tokens[ids.at(-1)].v : null, type: tokens[ids[0]].v, location, offset: tokens[named ? ids.at(-1) : ids[0]].o, dynamic };
}

// A state variable from the tokens of its declaration, up to the semicolon: { name, type, kind, dynamic, constant,
// immutable, offset } or null. kind is 'mapping', 'array' or 'value'; dynamic is true for an array of no fixed length,
// and for a mapping whose values are such arrays.
function stateVariableOf(tokens, from, to) {
  let end = to;
  let depth = 0;
  for (let k = from; k < to; k += 1) {
    const v = tokens[k].t === 'p' ? tokens[k].v : '';
    if (v === '(' || v === '[') depth += 1;
    else if (v === ')' || v === ']') depth -= 1;
    else if (v === '=' && depth === 0) {
      end = k;
      break;
    }
  }
  let nameAt = -1;
  let constant = false;
  let immutable = false;
  for (let k = from; k < end; k += 1) {
    const tok = tokens[k];
    if (tok.t !== 'id') continue;
    if (tok.v === 'constant') constant = true;
    else if (tok.v === 'immutable') immutable = true;
    else if (!VAR_WORDS.has(tok.v)) nameAt = k;
  }
  if (nameAt <= from) return null;
  const first = tokens[from];
  if (!isId(first)) return null;
  let dynamic = false;
  let kind = 'value';
  if (first.v === 'mapping') {
    kind = 'mapping';
    let arrow = -1;
    for (let k = from; k < nameAt; k += 1) if (isP(tokens[k], '=>')) arrow = k;
    for (let k = arrow; arrow >= 0 && k + 1 < nameAt; k += 1) if (isP(tokens[k], '[') && isP(tokens[k + 1], ']')) dynamic = true;
  } else {
    for (let k = from; k + 1 < nameAt; k += 1) {
      if (isP(tokens[k], '[')) kind = 'array';
      if (isP(tokens[k], '[') && isP(tokens[k + 1], ']')) dynamic = true;
    }
  }
  return { name: tokens[nameAt].v, type: first.v, kind, dynamic, constant, immutable, offset: tokens[nameAt].o };
}

// Reads the header of a function, a constructor, a modifier, a fallback or a receive function that starts at i. Returns
// the function and the index of the token that ends the header ('{' or ';', or tokens.length).
function readHeader(tokens, match, i, contract) {
  const kw = tokens[i].v;
  const f = { kind: kw, name: kw === 'function' || kw === 'modifier' ? '' : kw, contract, offset: tokens[i].o, params: [], visibility: null, mutability: null, virtual: false, modifiers: [], bodyStart: -1, bodyEnd: -1, locals: new Map() };
  let k = i + 1;
  if (isId(tokens[k]) && (kw === 'function' || kw === 'modifier')) {
    f.name = tokens[k].v;
    f.offset = tokens[k].o;
    k += 1;
  } else if (kw === 'function') f.name = 'fallback';
  if (isP(tokens[k], '(')) {
    const end = closing(match, k);
    for (const [a, b] of splitList(tokens, k + 1, end)) {
      const d = declarationOf(tokens, a, b);
      if (d) f.params.push(d);
    }
    k = end + 1;
  }
  while (k < tokens.length && !isP(tokens[k], '{') && !isP(tokens[k], ';')) {
    const tok = tokens[k];
    if (tok.t !== 'id') {
      k += 1;
      continue;
    }
    if (VISIBILITY.includes(tok.v)) f.visibility = tok.v;
    else if (MUTABILITY.includes(tok.v)) f.mutability = tok.v === 'constant' ? 'view' : tok.v;
    else if (tok.v === 'virtual') f.virtual = true;
    else if (tok.v === 'override' || tok.v === 'returns') {
      if (isP(tokens[k + 1], '(')) k = closing(match, k + 1);
    } else {
      let name = tok.v;
      let at = k;
      while (isP(tokens[at + 1], '.') && isId(tokens[at + 2])) {
        at += 2;
        name = tokens[at].v;
      }
      f.modifiers.push({ name, offset: tok.o });
      k = at;
      if (isP(tokens[k + 1], '(')) k = closing(match, k + 1);
    }
    k += 1;
  }
  return { f, end: k };
}

// The index of the next ';' at the same depth of brackets from i, or tokens.length.
function statementEnd(tokens, i) {
  let depth = 0;
  for (let k = i; k < tokens.length; k += 1) {
    const v = tokens[k].t === 'p' ? tokens[k].v : '';
    if (v === '(' || v === '[' || v === '{') depth += 1;
    else if (v === ')' || v === ']' || v === '}') {
      if (depth === 0) return k;
      depth -= 1;
    } else if (v === ';' && depth === 0) return k;
  }
  return tokens.length;
}

// The outline of a file from its tokens.
export function outline(tokens, limits = OUTLINE_LIMITS) {
  const lim = { ...OUTLINE_LIMITS, ...limits };
  const n = tokens.length;
  const asm = new Uint8Array(n);
  const stmt = new Int32Array(n).fill(-1);
  const match = brackets(tokens);
  const out = { pragmas: [], imports: new Set(), contracts: [], functions: [], assemblies: [], uncheckeds: [], asm, stmt, match, tokens };
  const stack = [];
  let statement = 0;
  let paren = 0;
  let asmDepth = 0;
  let pendingAsm = false;
  const push = (frame, at) => {
    if (stack.length >= lim.maxNesting) throw new OutlineError(`braces nested more than ${lim.maxNesting} deep`, tokens[at].o);
    stack.push(frame);
  };
  const body = () => {
    for (let k = stack.length - 1; k >= 0; k -= 1) if (stack[k].kind === 'body') return stack[k].f;
    return null;
  };
  let i = 0;
  while (i < n) {
    const tok = tokens[i];
    const top = stack.at(-1);
    if (top === undefined || top.kind === 'contract') {
      const contract = top ? top.c : null;
      if (tok.t === 'pragma') {
        if (!contract) out.pragmas.push({ text: tok.v, offset: tok.o });
        i += 1;
        continue;
      }
      if (isP(tok, '}')) {
        if (top) {
          top.c.end = i;
          stack.pop();
        }
        i += 1;
        continue;
      }
      if (isId(tok, 'import') && !contract) {
        const end = statementEnd(tokens, i);
        for (let k = i + 1; k < end; k += 1) if (isId(tokens[k]) && !['as', 'from'].includes(tokens[k].v)) out.imports.add(tokens[k].v);
        i = end + 1;
        continue;
      }
      const abstract = isId(tok, 'abstract') && isId(tokens[i + 1]) && ['contract', 'interface', 'library'].includes(tokens[i + 1].v);
      const kindAt = abstract ? i + 1 : i;
      if (isId(tokens[kindAt]) && ['contract', 'interface', 'library'].includes(tokens[kindAt].v) && isId(tokens[kindAt + 1])) {
        const c = { kind: tokens[kindAt].v, abstract, name: tokens[kindAt + 1].v, offset: tokens[kindAt + 1].o, bases: [], vars: [], functions: [], modifiers: [], start: -1, end: n };
        let k = kindAt + 2;
        let depth = 0;
        let afterIs = false;
        while (k < n && !(depth === 0 && (isP(tokens[k], '{') || isP(tokens[k], ';')))) {
          const t = tokens[k];
          if (isP(t, '(')) depth += 1;
          else if (isP(t, ')')) depth -= 1;
          else if (isId(t, 'is') && depth === 0) afterIs = true;
          else if (afterIs && depth === 0 && isId(t) && (isP(tokens[k + 1], ',') || isP(tokens[k + 1], '{') || isP(tokens[k + 1], '('))) c.bases.push({ name: t.v, offset: t.o });
          k += 1;
        }
        out.contracts.push(c);
        if (isP(tokens[k], '{')) {
          c.start = k;
          push({ kind: 'contract', c }, k);
        }
        i = k + 1;
        continue;
      }
      if (isId(tok) && FUNCTION_WORDS.has(tok.v) && (tok.v !== 'fallback' && tok.v !== 'receive' ? true : isP(tokens[i + 1], '('))) {
        const { f, end } = readHeader(tokens, match, i, contract);
        out.functions.push(f);
        if (contract) (f.kind === 'modifier' ? contract.modifiers : contract.functions).push(f);
        if (isP(tokens[end], '{')) {
          f.bodyStart = end;
          f.bodyEnd = n;
          push({ kind: 'body', f }, end);
          paren = 0;
          stmt[end] = statement;
          statement += 1;
        }
        i = end + 1;
        continue;
      }
      if (isId(tok) && ['struct', 'enum'].includes(tok.v)) {
        let k = i;
        while (k < n && !isP(tokens[k], '{') && !isP(tokens[k], ';')) k += 1;
        if (isP(tokens[k], '{')) push({ kind: 'skip' }, k);
        i = k + 1;
        continue;
      }
      if (isP(tok, '{')) {
        push({ kind: 'skip' }, i);
        i += 1;
        continue;
      }
      // A state variable, an event, an error, a using directive or a constant of the file, up to its semicolon.
      const end = statementEnd(tokens, i);
      if (contract && isId(tok) && !['event', 'error', 'using', 'type'].includes(tok.v)) {
        const v = stateVariableOf(tokens, i, end);
        if (v) contract.vars.push(v);
      }
      i = end < n && isP(tokens[end], ';') ? end + 1 : Math.max(end, i + 1);
      continue;
    }

    // Inside a function body, a block, an assembly block, an expression or a skipped part.
    if (top.kind === 'skip') {
      if (isP(tok, '{')) push({ kind: 'skip' }, i);
      else if (isP(tok, '}')) stack.pop();
      i += 1;
      continue;
    }
    stmt[i] = statement;
    if (asmDepth > 0) asm[i] = 1;
    if (isP(tok, '(')) paren += 1;
    else if (isP(tok, ')')) paren = Math.max(0, paren - 1);
    else if (isId(tok, 'assembly') && asmDepth === 0) {
      pendingAsm = true;
      out.assemblies.push({ offset: tok.o, index: i, f: body() });
    } else if (isId(tok, 'unchecked') && isP(tokens[i + 1], '{') && asmDepth === 0) out.uncheckeds.push({ offset: tok.o, index: i, f: body() });
    else if (isP(tok, '{')) {
      if (pendingAsm || asmDepth > 0) {
        pendingAsm = false;
        asmDepth += 1;
        asm[i] = 1;
        push({ kind: 'asm' }, i);
      } else if (paren > 0 || (isId(tokens[i + 1]) && isP(tokens[i + 2], ':'))) {
        push({ kind: 'expr' }, i);
      } else {
        push({ kind: 'block' }, i);
        statement += 1;
      }
    } else if (isP(tok, '}')) {
      const frame = stack.pop();
      if (frame.kind === 'asm') asmDepth -= 1;
      if (frame.kind === 'body') {
        frame.f.bodyEnd = i;
        paren = 0;
      }
      if (frame.kind !== 'expr') statement += 1;
    } else if (isP(tok, ';') && paren === 0) statement += 1;
    i += 1;
  }
  for (const f of out.functions) if (f.bodyStart >= 0) readLocals(tokens, match, f, stmt);
  return out;
}

// The local variables of a function: a statement that starts with a type (an identifier, perhaps with .Name parts and
// [] or [n] after it, and address payable) followed by an optional data location and a name, then = or ;. Each local
// is { name, type, location, dynamic, offset }.
function readLocals(tokens, match, f, stmt) {
  let previous = -1;
  for (let k = f.bodyStart + 1; k < f.bodyEnd; k += 1) {
    if (stmt[k] === previous) continue;
    previous = stmt[k];
    const tok = tokens[k];
    if (!isId(tok) || STATEMENT_WORDS.has(tok.v)) continue;
    let j = k + 1;
    let dynamic = false;
    while (j < f.bodyEnd) {
      if (isP(tokens[j], '.') && isId(tokens[j + 1])) j += 2;
      else if (isP(tokens[j], '[')) {
        if (isP(tokens[j + 1], ']')) dynamic = true;
        j = closing(match, j) + 1;
      } else if (isId(tokens[j], 'payable')) j += 1;
      else break;
    }
    let location = null;
    if (isId(tokens[j]) && LOCATIONS.has(tokens[j].v)) {
      location = tokens[j].v;
      j += 1;
    }
    if (isId(tokens[j]) && (isP(tokens[j + 1], '=') || isP(tokens[j + 1], ';'))) {
      f.locals.set(tokens[j].v, { name: tokens[j].v, type: tok.v, location, dynamic, offset: tokens[j].o });
    }
  }
}
