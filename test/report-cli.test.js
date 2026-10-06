import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, NOTICE, USAGE, VERSION, buildReport, csvField, defaultConfig, escapeData, escapeProperty, parseArgs, summaryLines, toCsv, toGithub, toJson, toText } from '../src/index.js';
import { P, Q, SITE, cli, lineOf, run, siteWith, sol } from './helpers.js';

const WARN = siteWith({ [P]: sol([], { pragma: 'pragma solidity ^0.8.20;' }) });
const ERROR_FILE = sol(['  address owner;', '  function f() external { require(tx.origin == owner); }']);
const ERROR = siteWith({ [P]: ERROR_FILE });
const INFO = siteWith({ [P]: sol(['  function f() external pure returns (uint256 x) { unchecked { x = 1; } }']) });

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(SITE);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^solidity-pattern-check: s\ninput: 2 Solidity files; 0 other files passed over; 0 folders named \.git or node_modules passed over; 0 paths excluded; 0 links not followed\nconfig: built-in defaults: include \*\*\/\*\.sol; exclude lib\/\*\*, out\/\*\*, cache\/\*\* and artifacts\/\*\*; minimum compiler 0\.8\.0; minimum severity info; fail on error\n/);
  assert.match(clean.out, /\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  assert.equal((await run(WARN)).code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, ['s', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(INFO, ['s', '--fail-on', 'warning'])).code, 0);
  assert.equal((await run(INFO, ['s', '--fail-on', 'info'])).code, 1);
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['s', '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['s', '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const error = await run(ERROR);
  assert.equal(error.code, 1);
  assert.match(error.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
  assert.match(error.out, new RegExp(`\\n {2}ERROR {4}tx-origin-auth {14}s/contracts/Vault\\.sol:${lineOf(ERROR_FILE, 'tx.origin')}\\n`));
});

test('cli: a file that cannot be read is an unreadable-file error, a file past a limit a scan-limit error, and the run goes on', async () => {
  const r = await run(siteWith({ 's/Bin.sol': Buffer.from([0x63, 0, 0x7b]), 's/Latin.sol': Buffer.from([0x61, 0xe9]) }), ['s', '--json']);
  assert.equal(r.code, 1);
  const out = JSON.parse(r.out);
  const f = out.findings.filter((x) => x.rule === 'unreadable-file');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.column]), [['s/Bin.sol', 1, 1], ['s/Latin.sol', 1, 1]]);
  assert.match(f[0].found, /the file cannot be read: holds binary data/);
  assert.deepEqual(out.files.find((x) => x.file === 's/Bin.sol'), { file: 's/Bin.sol', contracts: 0, functions: 0, byLevel: { error: 1, warning: 0, info: 0 } });
  const big = await run(siteWith({ 's/Big.sol': `// ${'x'.repeat(200)}` }), ['s', '--json'], { maxFileBytes: 100 });
  assert.match(JSON.parse(big.out).findings[0].found, /the file cannot be read: .*bytes is over the 100 byte limit/);
  const deep = await run({ 's/Deep.sol': 'contract C {\n  function f() { { { {' }, ['s', '--json'], { maxNesting: 3 });
  assert.deepEqual(JSON.parse(deep.out).findings.map((x) => [x.rule, x.line, x.column]), [['scan-limit', 2, 20]]);
});

test('cli: files saved as UTF-16 with their byte order mark, with a UTF-8 mark, or with CRLF or CR line ends, give the same findings', async () => {
  const text = sol(['  address owner;', '  uint256 public fee;', '  function f(address a) external {', '    require(tx.origin == owner);', '    payable(a).send(1);', '    fee = 2;', '  }'], { pragma: 'pragma solidity ^0.7.0;' });
  const base = JSON.parse((await run(siteWith({ [P]: text }), ['s', '--json'])).out);
  assert.ok(base.findings.length >= 5);
  for (const change of [(t) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, 'utf16le')]), (t) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(t)]), (t) => t.split('\n').join('\r\n'), (t) => t.split('\n').join('\r')]) {
    const r = JSON.parse((await run(siteWith({ [P]: change(text) }), ['s', '--json'])).out);
    assert.deepEqual(r.findings, base.findings);
  }
});

test('cli: --min-severity hides the findings below it and says so', async () => {
  const r = await run(INFO, ['s', '--min-severity', 'warning']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0; 1 below warning not shown/);
  assert.match(r.out, /note: 1 finding below warning is not shown/);
});

test('cli: the folder and --exclude must be usable, or the run stops with no result', async () => {
  const file = await run(SITE, [P]);
  assert.equal(file.code, 2);
  assert.match(file.err, /s\/contracts\/Vault\.sol: is a file; give the folder of the project/);
  assert.match((await run(SITE, ['nowhere'])).err, /nowhere: no such file or folder/);
  assert.match((await run(SITE, ['s', '--exclude', '../x'])).err, /--exclude "\.\.\/x" leaves the folder with \.\./);
  const excluded = JSON.parse((await run(ERROR, ['s', '--exclude', 'contracts/Vault.sol', '--json'])).out);
  assert.deepEqual(excluded.findings, []);
  assert.equal(excluded.input.excluded, 1);
  assert.match(excluded.notes.join('\n'), /1 path matching lib\/\*\*, out\/\*\*, cache\/\*\*, artifacts\/\*\* and contracts\/Vault\.sol is left out/);
  const empty = await run({ 's/readme.txt': 'x' }, ['s']);
  assert.match(empty.out, /note: the folder holds no file that the include patterns name/);
  const none = await run({ 's/a.sol': '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n' }, ['s']);
  assert.match(none.out, /note: the files hold no contract, interface, library or function/);
  const one = await run({ ...SITE, 's/.git/x.sol': 'x', 's/node_modules/y.sol': 'y' }, ['s']);
  assert.match(one.out, /note: 2 folders named \.git or node_modules are passed over/);
});

test('cli: usage errors give exit code 2 and the usage', async () => {
  for (const argv of [[], ['--format', 'xml', 's'], ['--min-severity', 'fatal', 's'], ['--fail-on'], ['s', '--bogus'], ['s', '--config', 'a', '--config', 'b'], ['s', '--explain', '--format', 'csv'], ['s', '--json', '--format', 'csv'], ['-'], ['s', '--config', '-'], ['https://example.test/repo'], ['s', '--config', 'https://a.test/c.json'], ['s', 't'], ['s', '--exclude', '--json']]) {
    const r = await cli(argv, process.cwd());
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, /^solidity-pattern-check: .+\n\nUsage: solidity-pattern-check/, argv.join(' '));
  }
  assert.match((await cli(['https://example.test/repo'], process.cwd())).err, /never fetches a URL/);
  assert.match((await cli(['s', 't'], process.cwd())).err, /give one folder/);
  assert.match((await cli([], process.cwd())).err, /give the folder of the project to check/);
  assert.throws(() => parseArgs(['s', ...Array.from({ length: 101 }, () => ['--exclude', 'x']).flat()]), /more than 100 exclude patterns/);
  assert.deepEqual(parseArgs(['s', '--exclude', 'a', '--exclude', 'b']).exclude, ['a', 'b']);
  assert.equal(parseArgs(['s', '--json', '--format', 'json']).format, 'json');
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--exclude', '--config', '--format', '--json', '--min-severity', '--fail-on', '--explain', '--print-defaults', 'Exit codes: 0', 'tx-origin-auth (rules.txOrigin)', 'unreadable-file (always error)', 'it is not an audit, compiles nothing, runs nothing']) assert.ok(USAGE.replace(/\s+/g, ' ').includes(s), s);
  assert.equal((await cli(['-v'], process.cwd())).out, `${VERSION}\n`);
  assert.equal((await cli(['-h'], process.cwd())).code, 0);
  const d = await cli(['--print-defaults'], process.cwd());
  assert.equal(JSON.parse(d.out).name, 'built-in defaults');
  assert.equal(JSON.parse(d.out).minCompiler, '0.8.0');
});

test('report: the JSON report holds the input, the configuration, the files, the summary, the findings and the result', async () => {
  const out = JSON.parse((await run(ERROR, ['s', '--json'])).out);
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'files', 'summary', 'rules', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.equal(out.tool, 'solidity-pattern-check');
  assert.equal(out.notice, NOTICE);
  const f = out.findings[0];
  assert.deepEqual(Object.keys(f), ['rule', 'level', 'file', 'line', 'column', 'at', 'found', 'fix']);
  assert.equal(f.at, `${P}:${f.line}`);
  assert.equal(out.rules.length, 18);
  assert.deepEqual(Object.keys(out.files[0]), ['file', 'contracts', 'functions', 'byLevel']);
  assert.deepEqual(Object.keys(out.summary), ['files', 'contracts', 'interfaces', 'libraries', 'functions', 'openStateChanging', 'modifiers', 'assembly', 'pinned', 'floating', 'missing']);
  assert.equal(out.config.minCompiler, '0.8.0');
  const explained = JSON.parse((await run(ERROR, ['s', '--json', '--explain'])).out);
  assert.ok(explained.findings[0].basis.length > 0);
  assert.ok(explained.findings[0].own.length > 0);
});

test('report: text with --explain, the empty tables, the cap of findings per rule, and every format of the same run', async () => {
  const many = sol(['  address owner;', ...Array.from({ length: 8 }, (_, i) => `  function f${i}() external { require(tx.origin == owner); }`)]);
  const r = await run(siteWith({ [P]: many, [Q]: null }), ['s', '--explain'], { maxFindingsPerRule: 5 });
  assert.match(r.out, /rule: tx\.origin compared, or used as a key, in a check\n {11}basis: tx\.origin is never to be used for authorization/);
  assert.match(r.out, /the tool's own choice: tx\.origin on one side of == or !=/);
  assert.match(r.out, /note: 3 findings past the limit of 5 per rule are counted but not listed/);
  assert.match(r.out, /Findings \(5\)/);
  const empty = buildReport({ input: { folder: 'x', solidityFiles: 0, otherFiles: 0, foldersPassedOver: 0, excluded: 0, links: 0, include: [], exclude: [] }, files: [], summary: { files: 0, contracts: 0, interfaces: 0, libraries: 0, functions: 0, openStateChanging: 0, modifiers: 0, assembly: 0, pinned: 0, floating: 0, missing: 0 }, raw: [], config: { ...defaultConfig(), file: 'c.json', name: 'Named', rules: { ...defaultConfig().rules, assembly: 'off', uncheckedBlock: 'off' } }, minSeverity: 'info', failOn: 'error', version: '1' });
  const text = toText(empty);
  assert.match(text, /config: c\.json \(Named\): include none; exclude none/);
  assert.match(text, /Files \(0\)\n\n {2}none\n/);
  assert.match(text, /Findings \(0\)\n\n {2}none\n/);
  assert.match(text, /note: 2 rules are off: inline-assembly, unchecked-block/);
  assert.match(text, /note: the folder holds no file that the include patterns name/);
  assert.deepEqual(summaryLines(empty).length, 4);
  assert.equal(toCsv(empty), 'level,rule,file,line,column,found,fix\r\n');
  assert.match(toGithub(empty), /^solidity-pattern-check: 0 Solidity files, 0 contracts, 0 functions, 0 findings; RESULT: PASS/);
  assert.equal(JSON.parse(toJson(empty)).findings.length, 0);
  const links = toText(buildReport({ input: { folder: 'x', solidityFiles: 1, otherFiles: 0, foldersPassedOver: 0, excluded: 0, links: 1, include: [], exclude: [] }, files: [], summary: { files: 1, contracts: 1, interfaces: 0, libraries: 0, functions: 0, openStateChanging: 0, modifiers: 0, assembly: 0, pinned: 1, floating: 0, missing: 0 }, raw: [], config: defaultConfig(), minSeverity: 'info', failOn: 'error', version: '1' }));
  assert.match(links, /note: 1 symbolic link is not followed/);
});

test('report: CSV fields are quoted and a leading formula character is neutralized; GitHub commands are escaped', async () => {
  assert.deepEqual(CSV_COLUMNS, ['level', 'rule', 'file', 'line', 'column', 'found', 'fix']);
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "x"'), '"say ""x"""');
  assert.equal(csvField('=1+1'), "'=1+1");
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('-x'), "'-x");
  assert.equal(csvField('+x'), "'+x");
  assert.equal(csvField('\tx'), "'\tx");
  assert.equal(csvField('\nx'), '"\'\nx"');
  assert.equal(csvField(null), '');
  assert.equal(csvField(3), '3');
  assert.equal(escapeData('a%b\r\nc'), 'a%25b%0D%0Ac');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
  const csv = (await run(ERROR, ['s', '--format', 'csv'])).out;
  assert.ok(csv.startsWith('level,rule,file,line,column,found,fix\r\nerror,tx-origin-auth,s/contracts/Vault.sol,'));
  const gh = (await run(ERROR, ['s', '--format', 'github'])).out;
  assert.match(gh, /^::error file=s\/contracts\/Vault\.sol,line=\d+,col=\d+,title=solidity-pattern-check tx-origin-auth::tx\.origin decides who may act/);
  assert.match(gh, /\nsolidity-pattern-check: 2 Solidity files, 2 contracts, 2 functions, 1 finding; RESULT: FAIL/);
  const info = (await run(INFO, ['s', '--format', 'github'])).out;
  assert.match(info, /^::notice file=/);
  const warn = (await run(WARN, ['s', '--format', 'github'])).out;
  assert.match(warn, /^::warning file=/);
});
