// The checks of one Solidity file, over its outline (src/outline.js). Every check is a loop over the tokens of the file
// or of one body, in order, with the brackets matched once for the whole file; nothing is compiled and nothing is run.
// Each check looks for the forms docs/method.md lists and says in its message where it found them. The checks are a
// heuristic over the text of the file, and the words of the tables below are the tool's own choice.

import { closing } from './outline.js';
import { compareVersions, parseVersion, readPragma, solidityExpression, versionText } from './version.js';
import { asciiLower } from './words.js';

// Words of the names of state variables that hold who controls a contract: its owner, its admins, its roles and the
// target of an upgrade. A name is split into words (camelCase, snake_case) and each word is compared whole.
export const ADMIN_WORDS = ['owner', 'owners', 'admin', 'admins', 'administrator', 'governance', 'governor', 'guardian', 'operator', 'operators', 'implementation', 'impl', 'role', 'roles', 'minter', 'minters', 'pauser', 'upgrader', 'authority', 'controller', 'manager', 'keeper'];

// Words of the names of other state variables that are sensitive to change: the pause switch, fees, where money goes,
// oracles, signers and lists of who may act.
export const SENSITIVE_WORDS = [...ADMIN_WORDS, 'paused', 'fee', 'fees', 'treasury', 'oracle', 'signer', 'signers', 'whitelist', 'whitelisted', 'allowlist', 'allowlisted', 'blacklist', 'blacklisted', 'blocklist', 'beneficiary', 'collector'];

// Modifiers that read as access control by their name. A modifier defined in the same file counts too when its body
// checks msg.sender or calls one of AUTH_CALLS.
export const AUTH_MODIFIERS = ['auth', 'requiresAuth', 'restricted', 'authorized', 'ownerOnly', 'adminOnly', 'isOwner', 'isAdmin'];

// Calls that check who the caller is, as the access control contracts in common use name them.
export const AUTH_CALLS = ['_checkOwner', '_checkRole', 'hasRole', '_onlyOwner', '_requireOwner', '_authorize', 'isAuthorized', '_requireCallerIsOwner'];

// Modifiers that guard a function against a second entry.
export const GUARD_MODIFIERS = ['nonReentrant', 'noReentrancy', 'nonReentrantView', 'lock', 'mutex', 'reentrancyGuard'];

// The bases and modifiers that mark a contract as upgradeable behind a proxy.
export const UPGRADEABLE_BASES = ['Initializable', 'UUPSUpgradeable'];
export const INITIALIZER_MODIFIERS = ['initializer', 'reinitializer'];

// The upper bound of s in a signature that is not malleable: half the order of the curve secp256k1.
export const HALF_ORDER = '0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0';

// The arguments of a call, the left side of an assignment and the header of a loop are looked at up to this many
// tokens, so that nested hostile input cannot make the work grow with the square of its size.
export const LOOKAHEAD = 1024;

const HASHES = ['keccak256', 'sha256', 'sha3', 'ripemd160'];
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '<<=', '>>=', '>>>=']);
const CHAIN = ['timestamp', 'number', 'prevrandao', 'difficulty'];

const isP = (tok, v) => tok !== undefined && tok.t === 'p' && tok.v === v;
const isId = (tok, v) => tok !== undefined && tok.t === 'id' && (v === undefined || tok.v === v);

// The words of a name: "_pendingOwner" is pending and owner, "FEE_COLLECTOR" is fee and collector, "setURI" is set and
// uri. Letters are lowered the ASCII way.
export function wordsOfName(name) {
  const out = [];
  let word = '';
  const s = String(name);
  for (let k = 0; k < s.length; k += 1) {
    const c = s[k];
    const upper = c >= 'A' && c <= 'Z';
    const letter = upper || (c >= 'a' && c <= 'z');
    const digit = c >= '0' && c <= '9';
    if (!letter && !digit) {
      if (word) out.push(word);
      word = '';
      continue;
    }
    const prev = s[k - 1];
    const next = s[k + 1];
    const prevLower = prev !== undefined && ((prev >= 'a' && prev <= 'z') || (prev >= '0' && prev <= '9'));
    const nextLower = next !== undefined && next >= 'a' && next <= 'z';
    const prevUpper = prev !== undefined && prev >= 'A' && prev <= 'Z';
    if (upper && word && (prevLower || (prevUpper && nextLower))) {
      out.push(word);
      word = '';
    }
    word += c;
  }
  if (word) out.push(word);
  return out.map(asciiLower);
}

export const isAdminName = (name) => wordsOfName(name).some((w) => ADMIN_WORDS.includes(w));
export const isSensitiveName = (name) => wordsOfName(name).some((w) => SENSITIVE_WORDS.includes(w));

// How a function is named in a message: "function payOut of ClubVault", "the constructor of ClubVault".
export function describeFunction(f) {
  const of = f.contract ? ` of ${f.contract.name}` : '';
  if (f.kind === 'constructor') return `the constructor${of}`;
  if (f.kind === 'fallback' || f.kind === 'receive') return `the ${f.kind} function${of}`;
  if (f.kind === 'modifier') return `modifier ${f.name}${of}`;
  return `function ${f.name}${of}`;
}

const isInitializerFunction = (f) => /^(?:initialize|init)(?:$|[A-Z_0-9])/.test(f.name) || f.modifiers.some((m) => INITIALIZER_MODIFIERS.includes(m.name) || m.name === 'onlyInitializing');
const changesState = (f) => f.mutability !== 'view' && f.mutability !== 'pure';
const isOpenToAll = (f) => f.visibility === 'public' || f.visibility === 'external' || (f.visibility === null && f.contract !== null && f.contract.kind !== 'library');

// Runs every check on the outline of one file. place turns an offset into { line, column }. Returns { findings: [{ rule,
// offset, found }], stats }.
export function analyze(o, config, place) {
  const { tokens, match, asm, stmt } = o;
  const n = tokens.length;
  const findings = [];
  const add = (rule, offset, found) => findings.push({ rule, offset, found });
  const lineAt = (offset) => place(offset).line;

  // The first token of every statement, and the function and the contract of every token.
  const stmtStart = new Map();
  for (let k = 0; k < n; k += 1) {
    if (stmt[k] < 0) continue;
    if (!stmtStart.has(stmt[k])) stmtStart.set(stmt[k], k);
  }
  const owner = new Int32Array(n).fill(-1);
  o.functions.forEach((f, idx) => {
    if (f.bodyStart >= 0) for (let k = f.bodyStart; k <= Math.min(f.bodyEnd, n - 1); k += 1) owner[k] = idx;
  });
  const inContract = new Int32Array(n).fill(-1);
  o.contracts.forEach((c, idx) => {
    if (c.start >= 0) for (let k = c.start; k <= Math.min(c.end, n - 1); k += 1) inContract[k] = idx;
  });
  const opener = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k += 1) if (match[k] >= 0) opener[match[k]] = k;
  const fnAt = (k) => (owner[k] >= 0 ? o.functions[owner[k]] : null);
  const where = (k) => {
    const f = fnAt(k);
    if (f) return ` in ${describeFunction(f)}`;
    const c = inContract[k] >= 0 ? o.contracts[inContract[k]] : null;
    return c ? ` in ${c.kind} ${c.name}` : '';
  };

  // address(0) that starts at j, or that ends at j.
  const zeroAt = (j) => isId(tokens[j], 'address') && isP(tokens[j + 1], '(') && tokens[j + 2] !== undefined && tokens[j + 2].t === 'num' && /^(?:0+|0x0+)$/.test(tokens[j + 2].v) && isP(tokens[j + 3], ')');
  const zeroEndsAt = (j) => isP(tokens[j], ')') && opener[j] >= 1 && zeroAt(opener[j] - 1);

  // For every token of a statement, the depth of brackets from the start of the statement; for every statement, the
  // first = outside brackets, whether it holds a % and whether it compares a value with address(0); and for every
  // token, whether it sits inside the arguments of keccak256, sha256, sha3 or ripemd160. One pass over the file.
  const depthAt = new Int32Array(n);
  const firstEq = new Map();
  const modulo = new Set();
  const zeroStatements = new Set();
  const hashCount = new Int32Array(n + 1);
  let current = -2;
  let depth = 0;
  for (let k = 0; k < n; k += 1) {
    const tok = tokens[k];
    if (stmt[k] !== current) {
      current = stmt[k];
      depth = 0;
    }
    depthAt[k] = depth;
    if (tok.t !== 'p') {
      if (tok.t === 'id' && HASHES.includes(tok.v) && isP(tokens[k + 1], '(') && match[k + 1] >= 0) {
        hashCount[k + 2] += 1;
        hashCount[match[k + 1]] -= 1;
      }
      continue;
    }
    if (current < 0 || asm[k]) continue;
    if (tok.v === '(' || tok.v === '[') depth += 1;
    else if (tok.v === ')' || tok.v === ']') depth = Math.max(0, depth - 1);
    else if (tok.v === '=' && depth === 0 && !firstEq.has(current)) firstEq.set(current, k);
    else if (tok.v === '%') modulo.add(current);
    else if ((tok.v === '==' || tok.v === '!=') && (zeroAt(k + 1) || zeroEndsAt(k - 1))) zeroStatements.add(current);
  }
  const inHash = new Uint8Array(n);
  for (let k = 0, sum = 0; k < n; k += 1) {
    sum += hashCount[k];
    inHash[k] = sum > 0 ? 1 : 0;
  }

  // The contracts of the file by name, the types that name a contract, and the state variables a contract sees: its
  // own and those of its bases declared in the same file.
  const byName = new Map(o.contracts.map((c) => [c.name, c]));
  const isContractType = (name) => byName.has(name) ? byName.get(name).kind !== 'library' : o.imports.has(name) || /^I[A-Z][A-Za-z0-9_]*$/.test(name);
  const stateOf = new Map();
  for (const c of o.contracts) {
    const vars = new Map();
    const seen = new Set();
    const queue = [c];
    while (queue.length) {
      const x = queue.shift();
      if (seen.has(x.name)) continue;
      seen.add(x.name);
      for (const v of x.vars) if (!vars.has(v.name)) vars.set(v.name, v);
      for (const b of x.bases) if (byName.has(b.name)) queue.push(byName.get(b.name));
    }
    stateOf.set(c, vars);
  }
  const stateFor = (f) => (f.contract ? stateOf.get(f.contract) : new Map());
  const paramMaps = new Map();
  const paramOf = (f, name) => {
    if (!paramMaps.has(f)) paramMaps.set(f, new Map(f.params.filter((p) => p.name !== null).reverse().map((p) => [p.name, p])));
    return paramMaps.get(f).get(name) ?? null;
  };

  // The last place in a body where each name is read, worked out once for each function.
  const lastSeen = new Map();
  const lastIndexOf = (f, name) => {
    if (!lastSeen.has(f)) {
      const m = new Map();
      for (let k = f.bodyStart + 1; k < f.bodyEnd && k < n; k += 1) if (tokens[k].t === 'id' && !isP(tokens[k - 1], '.')) m.set(tokens[k].v, k);
      lastSeen.set(f, m);
    }
    return lastSeen.get(f).get(name) ?? -1;
  };

  // The name a statement assigns to before its first = at eq: the last name before it, or in a tuple the name of its
  // first slot, with null for a slot left empty. Worked out once for each statement.
  const assigned = new Map();
  const assignedName = (s, eq) => {
    if (!assigned.has(eq)) {
      let name = null;
      const tuple = isP(tokens[s], '(');
      if (tuple) {
        for (let k = s + 1; k < eq && k < s + LOOKAHEAD && !isP(tokens[k], ',') && !isP(tokens[k], ')'); k += 1) if (isId(tokens[k]) && !['memory', 'storage', 'calldata'].includes(tokens[k].v)) name = tokens[k].v;
      } else {
        for (let k = Math.max(s, eq - LOOKAHEAD); k < eq; k += 1) if (isId(tokens[k])) name = tokens[k].v;
      }
      assigned.set(eq, { name, tuple });
    }
    return assigned.get(eq);
  };

  // The names a body compares with address(0), worked out once for each function.
  const zeroNames = new Map();
  const comparedWithZero = (f, name) => {
    if (!zeroNames.has(f)) {
      const names = new Set();
      for (let k = f.bodyStart + 1; k < f.bodyEnd && k < n; k += 1) {
        if (!isP(tokens[k], '==') && !isP(tokens[k], '!=')) continue;
        if (isId(tokens[k - 1]) && zeroAt(k + 1)) names.add(tokens[k - 1].v);
        if (zeroEndsAt(k - 1) && isId(tokens[k + 1])) names.add(tokens[k + 1].v);
      }
      zeroNames.set(f, names);
    }
    return zeroNames.get(f).has(name);
  };

  // The body of a function as token indices, outside assembly, worked out once for each function.
  const bodies = new Map();
  const bodyTokens = (f) => {
    if (!bodies.has(f)) {
      const out = [];
      for (let k = f.bodyStart + 1; k < f.bodyEnd && k < n; k += 1) if (!asm[k]) out.push(k);
      bodies.set(f, out);
    }
    return bodies.get(f);
  };

  // The variable a name refers to in a function: a parameter, a local, a state variable, or null.
  const resolve = (f, name) => {
    const p = paramOf(f, name);
    if (p) return { where: 'parameter', v: p };
    if (f.locals.has(name)) return { where: 'local', v: f.locals.get(name) };
    const s = stateFor(f).get(name);
    return s ? { where: 'state', v: s } : null;
  };

  // The writes to storage in a body: [{ index, name }] for an assignment, ++, --, delete, push or pop on a state
  // variable or on a local storage reference, through any [index] and .member after it.
  const writesIn = (f) => {
    const out = [];
    for (const k of bodyTokens(f)) {
      const tok = tokens[k];
      if (tok.t !== 'id' || isP(tokens[k - 1], '.')) continue;
      const r = resolve(f, tok.v);
      if (!r) continue;
      const storageRef = r.where !== 'state' && r.v.location === 'storage';
      if (r.where !== 'state' && !storageRef) continue;
      if (r.where === 'state' && (r.v.constant || r.v.immutable)) continue;
      let j = k + 1;
      let written = isP(tokens[k - 1], '++') || isP(tokens[k - 1], '--') || isId(tokens[k - 1], 'delete');
      while (!written && j < f.bodyEnd) {
        if (isP(tokens[j], '[')) j = closing(match, j) + 1;
        else if (isP(tokens[j], '.') && isId(tokens[j + 1])) {
          if ((tokens[j + 1].v === 'push' || tokens[j + 1].v === 'pop') && isP(tokens[j + 2], '(')) written = true;
          j += 2;
        } else break;
      }
      if (!written && tokens[j] && tokens[j].t === 'p' && (ASSIGN.has(tokens[j].v) || tokens[j].v === '++' || tokens[j].v === '--')) written = true;
      if (written) out.push({ index: k, name: tok.v, state: r.where === 'state' });
    }
    return out;
  };

  // The low-level calls of a body: .call, .send, .delegatecall, .staticcall and .transfer, with the index of the dot,
  // the name and the index of the parenthesis that closes the arguments.
  const lowLevel = (f) => {
    const out = [];
    for (const k of bodyTokens(f)) {
      if (!isP(tokens[k], '.') || !isId(tokens[k + 1])) continue;
      const name = tokens[k + 1].v;
      if (!['call', 'send', 'delegatecall', 'staticcall', 'transfer'].includes(name)) continue;
      let open = k + 2;
      if (isP(tokens[open], '{') && name !== 'send' && name !== 'transfer') open = closing(match, open) + 1;
      if (!isP(tokens[open], '(')) continue;
      out.push({ dot: k, name, close: closing(match, open) });
    }
    return out;
  };

  // The external calls of a body, in order: the low-level calls that hand over control (.call, .send, .transfer), a
  // call through a contract type T(x).f(...), and a call on a variable whose type is a contract or an interface.
  const externalCalls = (f) => {
    const out = lowLevel(f).filter((c) => c.name !== 'delegatecall' && c.name !== 'staticcall').map((c) => ({ index: c.dot, close: c.close, text: `.${c.name}` }));
    for (const k of bodyTokens(f)) {
      const tok = tokens[k];
      if (tok.t !== 'id' || isP(tokens[k - 1], '.')) continue;
      if (isP(tokens[k + 1], '(') && isContractType(tok.v)) {
        const close = closing(match, k + 1);
        if (isP(tokens[close + 1], '.') && isId(tokens[close + 2]) && isP(tokens[close + 3], '(')) out.push({ index: close + 1, close: closing(match, close + 3), text: `${tok.v}(...).${tokens[close + 2].v}` });
        continue;
      }
      if (isP(tokens[k + 1], '.') && isId(tokens[k + 2]) && isP(tokens[k + 3], '(')) {
        const r = resolve(f, tok.v);
        if (r && isContractType(r.v.type)) out.push({ index: k + 1, close: closing(match, k + 3), text: `${tok.v}.${tokens[k + 2].v}` });
      }
    }
    return out.sort((a, b) => a.index - b.index);
  };

  // True when a body checks the caller: msg.sender or _msgSender() in a require, an assert or an if, or a call of
  // AUTH_CALLS.
  const callerChecks = new Map();
  const checksCaller = (f) => {
    if (!callerChecks.has(f)) callerChecks.set(f, readsCaller(f));
    return callerChecks.get(f);
  };
  const readsCaller = (f) => {
    for (const k of bodyTokens(f)) {
      const tok = tokens[k];
      if (tok.t !== 'id') continue;
      if (AUTH_CALLS.includes(tok.v) && isP(tokens[k + 1], '(')) return true;
      const sender = (tok.v === 'msg' && isP(tokens[k + 1], '.') && isId(tokens[k + 2], 'sender')) || (tok.v === '_msgSender' && isP(tokens[k + 1], '('));
      if (!sender) continue;
      const first = tokens[stmtStart.get(stmt[k])];
      if (isId(first) && ['require', 'assert', 'if', 'while'].includes(first.v)) return true;
    }
    return false;
  };
  const definedModifiers = new Map();
  for (const f of o.functions) if (f.kind === 'modifier' && f.bodyStart >= 0) definedModifiers.set(f.name, f);
  const hasAccessModifier = (f) => f.modifiers.some((m) => /^only[A-Z_]/.test(m.name) || m.name === 'only' || AUTH_MODIFIERS.includes(m.name) || (definedModifiers.has(m.name) && checksCaller(definedModifiers.get(m.name))));
  const hasAccessControl = (f) => hasAccessModifier(f) || checksCaller(f);
  const has = (f, name) => bodyTokens(f).some((k) => isId(tokens[k], name) && !isP(tokens[k - 1], '.'));

  // floating-pragma and old-compiler.
  const solidityPragmas = o.pragmas.map((p) => ({ ...p, expression: solidityExpression(p.text) })).filter((p) => p.expression !== null);
  const minimum = parseVersion(config.minCompiler).v;
  for (const p of solidityPragmas) {
    const r = readPragma(p.expression);
    const shown = `pragma solidity ${p.expression}`.slice(0, 120);
    if (!r.readable) add('floating-pragma', p.offset, `${shown}: the tool does not read this version expression, so it cannot tell that one compiler version is named`);
    else if (!r.pinned) add('floating-pragma', p.offset, `${shown} admits more than one compiler version, from ${versionText(r.lowest)} on; the file may be built with a version it was not tested with`);
    if (r.readable && compareVersions(r.lowest, minimum) < 0) {
      const wraps = compareVersions(r.lowest, [0, 8, 0]) < 0 ? '; before 0.8.0, arithmetic wraps on overflow and underflow with no revert' : '';
      add('old-compiler', p.offset, `${shown} admits ${versionText(r.lowest)}, below the minimum ${versionText(minimum)}${wraps}`);
    }
  }
  if (solidityPragmas.length === 0 && (o.contracts.length || o.functions.length)) {
    const first = o.contracts.length ? o.contracts[0] : o.functions[0];
    const what = o.contracts.length ? `${first.kind} ${first.name}` : `function ${first.name}`;
    add('floating-pragma', first.offset, `the file declares ${what} but has no pragma solidity, so any compiler version may build it`);
  }

  // tx-origin-auth.
  for (let k = 0; k + 2 < n; k += 1) {
    if (asm[k] || !isId(tokens[k], 'tx') || !isP(tokens[k + 1], '.') || !isId(tokens[k + 2], 'origin') || isP(tokens[k - 1], '.')) continue;
    const before = tokens[k - 1];
    const after = tokens[k + 3];
    const compared = (before && before.t === 'p' && (before.v === '==' || before.v === '!=')) || (after && after.t === 'p' && (after.v === '==' || after.v === '!='));
    let used = compared;
    if (compared) {
      const other = after && after.t === 'p' && (after.v === '==' || after.v === '!=') ? [k + 4, k + 5, k + 6] : [k - 4, k - 3, k - 2];
      if (isId(tokens[other[0]], 'msg') && isP(tokens[other[1]], '.') && isId(tokens[other[2]], 'sender')) used = false;
    } else if (isP(before, '[') && stmt[k] >= 0) {
      const first = tokens[stmtStart.get(stmt[k])];
      used = isId(first) && ['require', 'assert', 'if', 'while'].includes(first.v);
    }
    if (used) add('tx-origin-auth', tokens[k].o, `tx.origin decides who may act${where(k)}; a contract the account calls can pass this check in its name`);
  }

  for (const f of o.functions) {
    if (f.bodyStart < 0) continue;
    const name = describeFunction(f);

    // unchecked-call.
    for (const c of lowLevel(f)) {
      if (c.name === 'transfer') continue;
      const s = stmtStart.get(stmt[c.dot]);
      const eqAt = firstEq.get(stmt[c.dot]);
      const eq = eqAt !== undefined && eqAt < c.dot ? eqAt : -1;
      if (isId(tokens[s], 'return') || (depthAt[c.dot] > 0 && eq < 0)) continue;
      const what = `.${c.name}`;
      if (eq < 0) {
        add('unchecked-call', tokens[c.dot].o, `the result of ${what}${where(c.dot)} is not used, so a failed call goes on as if it worked`);
        continue;
      }
      const { name: variable, tuple } = assignedName(s, eq);
      if (tuple && variable === null) {
        add('unchecked-call', tokens[c.dot].o, `the success value of ${what}${where(c.dot)} is left out of the tuple, so a failed call goes on as if it worked`);
        continue;
      }
      if (variable !== null && lastIndexOf(f, variable) <= c.close) add('unchecked-call', tokens[c.dot].o, `${variable}, the success value of ${what}${where(c.dot)}, is never read after the call`);
    }

    // delegatecall-untrusted, in Solidity and in assembly.
    for (const c of lowLevel(f)) {
      if (c.name !== 'delegatecall') continue;
      let target = null;
      const prev = tokens[c.dot - 1];
      if (isId(prev)) target = prev.v;
      else if (isP(prev, ')') && opener[c.dot - 1] >= 0 && c.dot - opener[c.dot - 1] < LOOKAHEAD) {
        const ids = [];
        for (let k = opener[c.dot - 1] + 1; k < c.dot - 1; k += 1) if (isId(tokens[k]) && tokens[k].v !== 'payable') ids.push(tokens[k].v);
        if (ids.length === 1) target = ids[0];
      }
      const r = target === null || target === 'this' ? null : resolve(f, target);
      if (r && r.where === 'parameter') add('delegatecall-untrusted', tokens[c.dot].o, `delegatecall to ${target}, a parameter of ${name}: the caller picks the code that runs with the storage and the balance of this contract`);
      else if (r && r.where === 'state' && !r.v.constant && !r.v.immutable) add('delegatecall-untrusted', tokens[c.dot].o, `delegatecall to ${target}, a state variable${where(c.dot)}: whoever can change ${target} picks the code that runs with the storage and the balance of this contract`);
    }
    for (let k = f.bodyStart + 1; k < f.bodyEnd && k < n; k += 1) {
      if (!asm[k] || !isId(tokens[k], 'delegatecall') || !isP(tokens[k + 1], '(')) continue;
      const close = closing(match, k + 1);
      let comma = 0;
      let depth = 0;
      const second = [];
      for (let j = k + 2; j < close && j < k + LOOKAHEAD && comma < 2; j += 1) {
        const v = tokens[j].t === 'p' ? tokens[j].v : '';
        if (v === '(') depth += 1;
        else if (v === ')') depth -= 1;
        else if (v === ',' && depth === 0) comma += 1;
        else if (comma === 1) second.push(tokens[j]);
      }
      if (second.length === 1 && isId(second[0]) && paramOf(f, second[0].v)) add('delegatecall-untrusted', tokens[k].o, `delegatecall in assembly to ${second[0].v}, a parameter of ${name}: the caller picks the code that runs with the storage and the balance of this contract`);
    }

    // selfdestruct, in Solidity and in assembly.
    for (let k = f.bodyStart + 1; k < f.bodyEnd && k < n; k += 1) {
      const tok = tokens[k];
      if (isId(tok) && (tok.v === 'selfdestruct' || tok.v === 'suicide') && isP(tokens[k + 1], '(') && !isP(tokens[k - 1], '.')) add('selfdestruct', tok.o, `${tok.v}${asm[k] ? ' in assembly' : ''} in ${name}`);
    }

    // weak-randomness.
    const reported = new Set();
    for (const k of bodyTokens(f)) {
      const tok = tokens[k];
      let attribute = null;
      if (isId(tok, 'block') && isP(tokens[k + 1], '.') && isId(tokens[k + 2]) && CHAIN.includes(tokens[k + 2].v)) attribute = `block.${tokens[k + 2].v}`;
      else if (isId(tok, 'blockhash') && isP(tokens[k + 1], '(') && !isP(tokens[k - 1], '.')) attribute = 'blockhash';
      else if (isId(tok, 'block') && isP(tokens[k + 1], '.') && isId(tokens[k + 2], 'blockhash')) attribute = 'block.blockhash';
      if (attribute === null || reported.has(stmt[k]) || (!inHash[k] && !modulo.has(stmt[k]))) continue;
      reported.add(stmt[k]);
      // The name of the nearest hash around the value, looked for outward from it.
      let hash = 'a % (modulo)';
      for (let j = k - 1, d = 0; inHash[k] && j >= 0 && j > k - LOOKAHEAD; j -= 1) {
        if (isP(tokens[j], ')')) d += 1;
        else if (isP(tokens[j], '(') && d > 0) d -= 1;
        else if (isP(tokens[j], '(') && isId(tokens[j - 1]) && HASHES.includes(tokens[j - 1].v)) {
          hash = tokens[j - 1].v;
          break;
        }
      }
      add('weak-randomness', tok.o, `${attribute} goes into ${hash}${where(k)}; the proposer of the block can see and sway the value`);
    }

    const writes = writesIn(f);

    // state-write-after-call.
    if (f.kind === 'function' && changesState(f) && !f.modifiers.some((m) => GUARD_MODIFIERS.includes(m.name))) {
      const calls = externalCalls(f);
      if (calls.length) {
        const first = calls[0];
        const write = writes.find((w) => w.index > first.close);
        if (write) add('state-write-after-call', tokens[write.index].o, `${name} writes ${write.name} at line ${lineAt(tokens[write.index].o)} after the external call ${first.text} at line ${lineAt(tokens[first.index].o)}; a contract it calls can enter again before the write`);
      }
    }

    if (f.kind !== 'function' || !changesState(f) || isInitializerFunction(f)) continue;

    // admin-change-without-event.
    const admin = writes.find((w) => w.state && isAdminName(w.name));
    if (admin && !has(f, 'emit')) add('admin-change-without-event', tokens[admin.index].o, `${name} changes ${admin.name} and emits no event, so a change of who controls the contract leaves no log`);

    // missing-access-control.
    if (isOpenToAll(f) && f.contract && f.contract.kind === 'contract') {
      const sensitive = writes.find((w) => w.state && isSensitiveName(w.name));
      const dangerous = ['selfdestruct', 'suicide'].find((x) => has(f, x)) ?? (lowLevel(f).some((c) => c.name === 'delegatecall') ? 'delegatecall' : null);
      if ((sensitive || dangerous) && !hasAccessControl(f)) {
        const at = sensitive ? tokens[sensitive.index].o : f.offset;
        const what = sensitive ? `changes ${sensitive.name}` : `uses ${dangerous}`;
        add('missing-access-control', at, `${f.visibility ?? 'public'} ${name} ${what} with no access control modifier and no check of msg.sender`);
      }
    }
  }

  // upgradeable-initializer.
  for (const c of o.contracts) {
    if (c.kind !== 'contract') continue;
    const base = c.bases.find((b) => UPGRADEABLE_BASES.includes(b.name) || b.name.endsWith('Upgradeable'));
    const uses = c.functions.some((f) => f.modifiers.some((m) => INITIALIZER_MODIFIERS.includes(m.name)));
    if (!base && !uses) continue;
    const why = base ? `inherits ${base.name}` : 'uses the initializer modifier';
    if (!c.abstract) {
      const ctor = c.functions.find((f) => f.kind === 'constructor');
      if (!ctor) add('upgradeable-initializer', c.offset, `contract ${c.name} ${why} and has no constructor that calls _disableInitializers(), so anyone can initialize its implementation`);
      else if (ctor.bodyStart >= 0 && !has(ctor, '_disableInitializers')) add('upgradeable-initializer', ctor.offset, `the constructor of ${c.name} does not call _disableInitializers(), so anyone can initialize the implementation of a contract that ${why}`);
    }
    for (const f of c.functions) {
      if (f.kind !== 'function') continue;
      const names = f.modifiers.map((m) => m.name);
      if (/^(?:initialize|init)(?:$|[A-Z_0-9])/.test(f.name) && isOpenToAll(f) && !names.some((m) => INITIALIZER_MODIFIERS.includes(m))) add('upgradeable-initializer', f.offset, `${f.visibility ?? 'public'} ${describeFunction(f)} has no initializer or reinitializer modifier, so it can be called again`);
      if (/^__[A-Za-z0-9]+_init(?:_unchained)?$/.test(f.name) && !names.some((m) => m === 'onlyInitializing' || INITIALIZER_MODIFIERS.includes(m))) add('upgradeable-initializer', f.offset, `${describeFunction(f)} has no onlyInitializing modifier, so it can run outside an initializer`);
      if (f.name === '_authorizeUpgrade' && f.bodyStart >= 0 && !hasAccessControl(f)) add('upgradeable-initializer', f.offset, `${describeFunction(f)} has no access control modifier and no check of msg.sender, so anyone can upgrade the contract`);
    }
  }

  // unbounded-loop.
  for (const f of o.functions) {
    if (f.bodyStart < 0 || !changesState(f)) continue;
    for (const k of bodyTokens(f)) {
      const kw = tokens[k];
      if (!isId(kw) || (kw.v !== 'for' && kw.v !== 'while') || !isP(tokens[k + 1], '(')) continue;
      const close = Math.min(closing(match, k + 1), k + LOOKAHEAD);
      let from = k + 2;
      let to = close;
      if (kw.v === 'for') {
        const semis = [];
        for (let j = k + 2; j < close && semis.length < 2; j += 1) if (isP(tokens[j], ';')) semis.push(j);
        if (semis.length < 2) continue;
        [from, to] = [semis[0] + 1, semis[1]];
      }
      for (let j = from; j < to; j += 1) {
        const tok = tokens[j];
        if (!isId(tok) || isP(tokens[j - 1], '.')) continue;
        const r = resolve(f, tok.v);
        if (!r || !r.v.dynamic || (r.where !== 'state' && r.v.location !== 'storage')) continue;
        let m = j + 1;
        while (isP(tokens[m], '[') && m < to) m = closing(match, m) + 1;
        if (isP(tokens[m], '.') && isId(tokens[m + 1], 'length')) {
          add('unbounded-loop', kw.o, `the ${kw.v} loop in ${describeFunction(f)} runs to ${tok.v}${m > j + 1 ? '[...]' : ''}.length, an array in storage that can keep growing`);
          break;
        }
      }
    }
  }

  // ecrecover-unchecked.
  const halfOrder = tokens.some((t) => t.t === 'num' && asciiLower(t.v).split('_').join('') === HALF_ORDER);
  for (const f of o.functions) {
    if (f.bodyStart < 0) continue;
    for (const k of bodyTokens(f)) {
      if (!isId(tokens[k], 'ecrecover') || !isP(tokens[k + 1], '(') || isP(tokens[k - 1], '.')) continue;
      const s = stmtStart.get(stmt[k]);
      const eq = firstEq.get(stmt[k]);
      const variable = eq !== undefined && eq < k ? assignedName(s, eq).name : null;
      const zeroChecked = variable === null ? zeroStatements.has(stmt[k]) : comparedWithZero(f, variable);
      const missing = [];
      if (!zeroChecked) missing.push('the result is not compared with address(0), which ecrecover returns for a signature it cannot read');
      if (!halfOrder) missing.push('s is not limited to the lower half of the curve order, so a second valid signature can be made from the first');
      if (missing.length) add('ecrecover-unchecked', tokens[k].o, `ecrecover in ${describeFunction(f)}: ${missing.join('; ')}`);
    }
  }

  // inline-assembly, unchecked-block and hardcoded-address.
  for (const a of o.assemblies) add('inline-assembly', a.offset, `an assembly block${a.f ? ` in ${describeFunction(a.f)}` : ''}; the type checker and the safety checks of Solidity do not reach inside it`);
  for (const u of o.uncheckeds) add('unchecked-block', u.offset, `an unchecked block${u.f ? ` in ${describeFunction(u.f)}` : ''}; arithmetic inside it wraps on overflow and underflow with no revert`);
  for (let k = 0; k < n; k += 1) {
    const tok = tokens[k];
    if (tok.t !== 'num' || !/^0x[0-9a-fA-F]{40}$/.test(tok.v) || /^0x0{40}$/.test(tok.v)) continue;
    add('hardcoded-address', tok.o, `the address ${tok.v} is written into the code${where(k)}; it differs from chain to chain and cannot be changed after the deployment`);
  }

  const kinds = { contract: 0, interface: 0, library: 0 };
  for (const c of o.contracts) kinds[c.kind] += 1;
  const fns = o.functions.filter((f) => f.kind !== 'modifier');
  const stats = {
    contracts: kinds.contract,
    interfaces: kinds.interface,
    libraries: kinds.library,
    functions: fns.length,
    openStateChanging: fns.filter((f) => f.kind === 'function' && f.bodyStart >= 0 && changesState(f) && isOpenToAll(f)).length,
    modifiers: o.functions.length - fns.length,
    assembly: o.assemblies.length,
    pragma: solidityPragmas.length === 0 ? 'missing' : solidityPragmas.every((p) => readPragma(p.expression).pinned) ? 'pinned' : 'floating'
  };
  return { findings, stats };
}
