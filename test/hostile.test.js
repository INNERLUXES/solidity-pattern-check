import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, LOOKAHEAD, MAX_PROBLEMS, escapeProperty, checkText, defaultConfig, globMatch, outline, readPragma, tokenize, wordsOfName } from '../src/index.js';
import { P, SITE, cli, run, siteWith, sol, withFiles } from './helpers.js';

// Hostile input: files built to exhaust the memory, the stack or the time, to make the tool follow a link out of the
// folder, to rewrite the terminal, to start a second workflow command, to slip a formula into a spreadsheet or to
// change how objects behave. Each heavy test also checks the time, because work that grows faster than the input is a
// failure even when the answer is right. Tests that need a symbolic link, a device or file permissions are guarded
// with process.platform, and none of them asserts a line: lines are asserted in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};
const refused = (fn) => {
  try {
    fn();
  } catch {
    // refused input is fine; the time is what is checked
  }
};

test('hostile: thousands of contracts, functions, calls, writes, loops and addresses are checked in one pass', LIMIT, async () => {
  const fns = Array.from({ length: 3000 }, (_, i) => `  function f${i}(address a) external { (bool ok${i}, ) = a.call(""); total += ${i % 7}; for (uint256 j; j < list.length; j++) { total++; } require(tx.origin == owner); }`);
  const text = sol(['  address owner;', '  uint256 total;', '  address[] list;', '  address constant A = 0x4242424242424242424242424242424242424242;', ...fns]);
  const r = await fast(() => checkText(text, defaultConfig()), 30000);
  assert.equal(r.findings.filter((f) => f.rule === 'unchecked-call').length, 3000);
  assert.equal(r.findings.filter((f) => f.rule === 'state-write-after-call').length, 3000);
  assert.equal(r.findings.filter((f) => f.rule === 'unbounded-loop').length, 3000);
  assert.equal(r.stats.functions, 3000);
  const contracts = Array.from({ length: 1500 }, (_, i) => `contract C${i} is C${i + 1} { address constant A${i} = 0x4242424242424242424242424242424242424242; }`).join('\n');
  const many = await fast(() => checkText(`pragma solidity 0.8.24;\n${contracts}`, defaultConfig()), 30000);
  assert.equal(many.findings.length, 1500);
  assert.equal(many.stats.contracts, 1500);
  const capped = JSON.parse((await run(siteWith({ [P]: text }), ['s', '--json'])).out);
  assert.equal(capped.findings.filter((f) => f.rule === 'unchecked-call').length, LIMITS.maxFindingsPerRule);
  assert.ok(capped.totals.notListed > 5000);
});

test('hostile: long runs of brackets, quotes, comments, names, calls and headers are read or stopped in one pass', LIMIT, async () => {
  const body = (inner) => `pragma solidity 0.8.24;\ncontract C { function f(address a) external { ${inner} } }`;
  const runs = [
    '{'.repeat(300000), '}'.repeat(300000), '('.repeat(300000), ')'.repeat(300000), '['.repeat(300000), '"'.repeat(300000), "'".repeat(300000), '/*'.repeat(150000), '//'.repeat(150000), '*/'.repeat(150000), `a${'.b'.repeat(150000)}`,
    'pragma '.repeat(50000), `contract C is ${'A, '.repeat(100000)}{}`, 'function f('.repeat(50000), 'contract '.repeat(100000), 'abstract contract '.repeat(50000), `contract C { ${'function f() '.repeat(50000)} }`, `contract C { ${'modifier m() { _; } '.repeat(20000)} }`, `contract C { ${'uint256[] x; '.repeat(50000)} }`, `contract C { ${'mapping(address => '.repeat(50000)} }`,
    body('a.call('.repeat(50000)), body('a.delegatecall(a.delegatecall('.repeat(30000)), body('keccak256('.repeat(50000) + 'block.timestamp'), body(`uint256 r = ${'block.timestamp % '.repeat(40000)}1;`), body('a[ ; '.repeat(50000)), body('for ('.repeat(50000)), body('for (;;) { '.repeat(200)), body('while ('.repeat(50000)), body(`(${'bool ok, '.repeat(40000)}) = a.call("");`), body('ecrecover(ecrecover('.repeat(30000)), body(`address s = ecrecover(h, v, r, x); ${'require(s != address(0)); '.repeat(30000)}`), body('assembly { '.repeat(200)), body(`assembly { ${'let r := delegatecall(gas(), a, 0, 0, 0, 0) '.repeat(20000)} }`), body('unchecked { '.repeat(200)), body(`${'tx.origin == '.repeat(50000)}a;`), body('x = '.repeat(100000)), body('T storage p = q; '.repeat(30000)), body('selfdestruct('.repeat(50000)),
    `contract C { function f() { ${'{ '.repeat(255)}${'} '.repeat(255)} } }`, `${'\u00e9'.repeat(200000)}`, `${'0x'.repeat(100000)}`, `${'1e'.repeat(100000)}`, `${'hex"'.repeat(100000)}`, `${'unicode\''.repeat(100000)}`
  ];
  for (const text of runs) await fast(() => refused(() => checkText(text, defaultConfig())));
  assert.match(checkText(`contract C { function f() { ${'{'.repeat(300)} } }`, defaultConfig()).findings[0].found, /braces nested more than 256 deep/);
  assert.match(checkText(`a ${'x'.repeat(3000)}`, defaultConfig()).findings[0].found, /a name longer than 1,024 characters/);
  assert.match(checkText('a '.repeat(LIMITS.maxTokens + 1), defaultConfig()).findings[0].found, /more than 400,000 tokens/);
  assert.equal(LOOKAHEAD, 1024);
});

test('hostile: pragmas, names and patterns of any length are read in time bounded by their length', LIMIT, async () => {
  await fast(() => {
    for (let i = 0; i < 20; i += 1) {
      readPragma(`${'>=0.8.0 '.repeat(3000)}`);
      readPragma(`${'^0.8.0 || '.repeat(3000)}0.8.1`);
      wordsOfName('aB'.repeat(100000));
    }
  });
  const path = `${'a/'.repeat(500)}b`;
  await fast(() => {
    for (let i = 0; i < 200; i += 1) globMatch(`${'*'.repeat(100)}**${'?*'.repeat(50)}c`, path);
  });
  assert.equal(globMatch('**/b', path), true);
  await fast(() => outline(tokenize(`contract C { ${'function f(uint256 a) external { uint256 b = a; } '.repeat(20000)} }`).tokens));
});

test('hostile: thousands of folders and files are listed in seconds, and the limits of a folder hold', LIMIT, async () => {
  const files = { ...SITE };
  for (let i = 0; i < 300; i += 1) files[`s/m${i}/C${i}.sol`] = sol([`  uint256 public v${i};`]);
  const r = await fast(() => run(files, ['s', '--json']), 60000);
  assert.equal(JSON.parse(r.out).input.solidityFiles, 302);
  const capped = JSON.parse((await run(files, ['s', '--json'], { maxInputFiles: 10 })).out);
  assert.match(capped.findings.find((f) => f.rule === 'scan-limit').found, /the folder holds more than 10 Solidity files/);
  assert.equal(capped.result.pass, false);
  const entries = JSON.parse((await run(files, ['s', '--json'], { maxProjectEntries: 5 })).out);
  assert.match(entries.findings.find((f) => f.rule === 'scan-limit').found, /more than 5 files and folders/);
  const deep = { ...SITE, [`s/${'d/'.repeat(40)}A.sol`]: 'x' };
  const depth = JSON.parse((await run(deep, ['s', '--json'])).out);
  assert.match(depth.findings.find((f) => f.rule === 'scan-limit').found, /folders nested more than 32 deep/);
});

test('hostile: a file over its size limit is an unreadable-file error, and a configuration over its limit stops the run', LIMIT, async () => {
  const big = await run(siteWith({ [P]: `/* ${'x'.repeat(LIMITS.maxFileBytes)} */` }), ['s', '--json']);
  assert.match(JSON.parse(big.out).findings.find((f) => f.rule === 'unreadable-file').found, /bytes is over the 4 MB limit/);
  const config = await run({ ...SITE, 'c.json': ' '.repeat(LIMITS.maxConfigBytes + 1) }, ['s', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const many = await run({ ...SITE, 'c.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]))) }, ['s', '--config', 'c.json']);
  assert.match(many.err, /\n {2}and 10 more\n$/);
  assert.equal(many.err.split('\n').filter((l) => l.startsWith('  c.json')).length, MAX_PROBLEMS);
});

test('hostile: long names and pragmas are capped in the messages', LIMIT, async () => {
  const long = 'x'.repeat(1000);
  const out = JSON.parse((await fast(() => run(siteWith({ [P]: sol([`  address owner${long};`, `  function f${long}() external { require(tx.origin == owner${long}); }`], { pragma: `pragma solidity ^0.8.0 ${'|| ^0.8.1 '.repeat(500)};` }) }), ['s', '--json']))).out);
  assert.ok(out.findings.length >= 2);
  assert.ok(out.findings.every((f) => f.found.length <= 800));
});

test('hostile: control, escape, direction and line separator characters in a pragma are removed from every format', async () => {
  const files = siteWith({ [P]: sol(['  address owner;', '  function f() external { require(tx.origin == owner); }'], { pragma: 'pragma solidity ^0.8.0 \u001b[31m\u202e\u2028\u0085x;' }) });
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run(files, ['s', '--format', format]);
    assert.equal(r.code, 1, format);
    for (const c of ['\u001b', '\u202e', '\u2028']) assert.ok(!r.out.includes(c), `${format}: ${JSON.stringify(c)}`);
  }
});

test('hostile: a name cannot end a workflow command or start another one, and a formula is neutralized in CSV', async () => {
  const files = siteWith({ [P]: sol([], { pragma: 'pragma solidity ^0.8.0 %0A::error file=x::y\n::warning::z;' }) });
  const github = await run(files, ['s', '--format', 'github']);
  const lines = github.out.trimEnd().split('\n');
  assert.ok(lines.slice(0, -1).every((l) => /^::(?:error|warning|notice) file=/.test(l)), github.out);
  assert.ok(github.out.includes('pragma solidity ^0.8.0 %250A::error file=x::y ::warning::z: the tool does not read'), github.out);
  assert.equal(escapeProperty('s/%0A::e,x.sol'), 's/%250A%3A%3Ae%2Cx.sol');
  const csv = await run({ ...SITE, 's/=HYPERLINK(1).sol': sol(['  address owner;', '  function f() external { require(tx.origin == owner); }']) }, ['s', '--format', 'csv']);
  assert.ok(csv.out.includes(",'s/=HYPERLINK(1).sol,") || csv.out.includes(',s/=HYPERLINK(1).sol,'), csv.out);
  const formula = await run({ ...SITE, '=s/C.sol': sol(['  address owner;', '  function f() external { require(tx.origin == owner); }']) }, ['=s', '--format', 'csv']);
  assert.ok(formula.out.split('\r\n').slice(1, -1).every((l) => !/,[=+@-]/.test(l.replace(/,"[^"]*"/g, ','))), formula.out);
  assert.ok(formula.out.includes(",'=s/C.sol,"));
});

test('hostile: __proto__, constructor and toString as names of contracts, functions, variables and keys change nothing', async () => {
  const text = sol(['  address __proto__;', '  address constructor_;', '  mapping(address => bool) toString;', '  function hasOwnProperty(address valueOf) external { __proto__ = valueOf; toString[valueOf] = true; }'], { head: 'contract __proto__ {}\ncontract toString is __proto__ {}' });
  const out = JSON.parse((await run({ ...siteWith({ [P]: text }), 'c.json': '{"rules": {"__proto__": "off"}}' }, ['s', '--json'])).out);
  assert.deepEqual(out.findings.map((f) => f.rule).sort(), []);
  const bad = await run({ ...SITE, 'c.json': '{"rules": {"__proto__": "off"}}' }, ['s', '--config', 'c.json']);
  assert.match(bad.err, /"__proto__" is not a key of rules/);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.toString.call([]), '[object Array]');
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF', async () => {
  const files = siteWith({ [P]: sol(['  address owner;', '  function f(address a) external {', '    require(tx.origin == owner);', '    payable(a).send(1);', '  }']) });
  const lf = JSON.parse((await run(files, ['s', '--json'])).out);
  for (const [name, change] of [['CRLF', (t) => t.split('\n').join('\r\n')], ['CR', (t) => t.split('\n').join('\r')], ['BOM', (t) => `\ufeff${t}`]]) {
    const other = JSON.parse((await run(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, change(v)])), ['s', '--json'])).out);
    assert.deepEqual(other.findings.map((f) => [f.rule, f.line, f.column]), lf.findings.map((f) => [f.rule, f.line, f.column]), name);
  }
});

test('hostile: the tool writes nothing: a run leaves the folder as it was', async () => {
  await withFiles(SITE, async (dir) => {
    const { readdir } = await import('node:fs/promises');
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli(['s', '--format', 'csv'], dir);
    await cli(['s', '--json'], dir);
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
  });
});

test('hostile: a symbolic link in the folder is counted and not followed, and a link named is refused', async (t) => {
  if (process.platform === 'win32') {
    t.skip('symbolic links need extra rights on Windows');
    return;
  }
  await withFiles(SITE, async (dir) => {
    await mkdir(resolve(dir, 'outside'));
    await writeFile(resolve(dir, 'outside/X.sol'), 'contract X { function f() external { require(tx.origin == address(1)); } }\n');
    await symlink(resolve(dir, 'outside'), resolve(dir, 's/loop'));
    await symlink(resolve(dir, 'outside/X.sol'), resolve(dir, 's/X.sol'));
    await symlink(resolve(dir, 's'), resolve(dir, 's-link'));
    const out = JSON.parse((await cli(['s', '--json'], dir)).out);
    assert.equal(out.input.links, 2);
    assert.deepEqual(out.findings, []);
    assert.match(out.notes.join('\n'), /2 symbolic links are not followed/);
    const named = await cli(['s-link'], dir);
    assert.equal(named.code, 2);
    assert.match(named.err, /is a symbolic link, which is not followed/);
    await symlink(resolve(dir, 'outside/X.sol'), resolve(dir, 'c.json'));
    assert.equal((await cli(['s', '--config', 'c.json'], dir)).code, 2);
  });
});

test('hostile: a device named as a folder is refused, and a file with no read access is an unreadable-file error', async (t) => {
  if (process.platform === 'win32') {
    t.skip('devices and file modes work differently on Windows');
    return;
  }
  const device = await cli(['/dev/null'], process.cwd());
  assert.equal(device.code, 2);
  assert.match(device.err, /is not a regular file or folder/);
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user reads every file whatever its mode');
    return;
  }
  await withFiles(SITE, async (dir) => {
    await chmod(resolve(dir, P), 0o000);
    const r = await cli(['s', '--json'], dir);
    assert.match(JSON.parse(r.out).findings.find((f) => f.rule === 'unreadable-file').found, /cannot be read \(EACCES\)/);
    await chmod(resolve(dir, P), 0o644);
  });
});
