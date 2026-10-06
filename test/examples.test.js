import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const M = 'examples/messy';
const VAULT = `${M}/contracts/ClubVault.sol`;
const RAFFLE = `${M}/contracts/RaffleDraw.sol`;
const V2 = `${M}/contracts/upgradeable/ClubVaultV2.sol`;
const TOKEN = `${M}/contracts/interfaces/IClubToken.sol`;

test('examples: the messy project fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean project passes with no finding and the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--config', 'examples/config.json', '--fail-on', 'info'])).code, 0, 'the clean project also passes with the configuration of the messy one, at every level');
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  const outputs = { 'messy-explain.txt': [...MESSY, '--explain'], 'messy.json': [...MESSY, '--json', '--explain'], 'messy-findings.csv': [...MESSY, '--format', 'csv'], 'messy-github.txt': [...MESSY, '--format', 'github'], 'defaults.json': ['--print-defaults'] };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: every rule fires on the messy project, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const lines = {};
  for (const f of [VAULT, RAFFLE, V2]) lines[f] = (await readFile(resolve(root, f), 'utf8')).split('\n');
  const at = (file, needle) => `${file}:${lines[file].findIndex((l) => l.includes(needle)) + 1}`;
  const of = (rule) => report.findings.filter((f) => f.rule === rule).map((f) => f.at);
  assert.deepEqual(of('floating-pragma'), [at(VAULT, 'pragma'), at(RAFFLE, 'pragma')]);
  assert.deepEqual(of('old-compiler'), [at(VAULT, 'pragma'), at(RAFFLE, 'pragma')]);
  assert.deepEqual(of('tx-origin-auth'), [at(VAULT, 'require(tx.origin == owner')]);
  assert.deepEqual(of('unchecked-call'), [at(VAULT, 'member.send'), at(V2, 'plugin.delegatecall')]);
  assert.deepEqual(of('delegatecall-untrusted'), [at(V2, 'target.delegatecall'), at(V2, 'plugin.delegatecall')]);
  assert.deepEqual(of('selfdestruct'), [at(VAULT, 'selfdestruct(')]);
  assert.deepEqual(of('weak-randomness'), [at(RAFFLE, 'keccak256(abi.encodePacked(block.timestamp')]);
  assert.deepEqual(of('state-write-after-call'), [at(VAULT, 'balances[msg.sender] -= amount')]);
  assert.deepEqual(of('admin-change-without-event'), [at(VAULT, 'owner = newOwner')]);
  assert.deepEqual(of('missing-access-control'), [at(VAULT, 'feeCollector = collector'), at(V2, 'function runPlugin')]);
  assert.deepEqual(of('upgradeable-initializer'), [at(V2, 'contract ClubVaultV2'), at(V2, 'function initialize'), at(V2, 'function _authorizeUpgrade')]);
  assert.deepEqual(of('unbounded-loop'), [at(VAULT, 'i < members.length')]);
  assert.deepEqual(of('ecrecover-unchecked'), [at(RAFFLE, 'ecrecover(')]);
  assert.deepEqual(of('inline-assembly'), [at(VAULT, 'assembly {')]);
  assert.deepEqual(of('unchecked-block'), [at(VAULT, 'unchecked {')]);
  assert.deepEqual(of('hardcoded-address'), [at(VAULT, '0x4242')]);
  assert.deepEqual(report.rules.filter((r) => r.findings === 0).map((r) => r.id), ['unreadable-file', 'scan-limit']);
  assert.deepEqual(report.files.map((f) => f.file), [VAULT, RAFFLE, TOKEN, V2]);
});

test('examples: without the configuration, the mocks are read too; lib and node_modules never are', async () => {
  const report = JSON.parse((await run(['examples/messy', '--json'])).out);
  assert.ok(report.findings.some((f) => f.file === 'examples/messy/mocks/MockClubToken.sol' && f.rule === 'tx-origin-auth'));
  assert.ok(!report.findings.some((f) => f.rule === 'old-compiler' && f.file === VAULT), '^0.8.19 is not below the default minimum of 0.8.0');
  assert.ok(!report.findings.some((f) => f.file.includes('node_modules') || f.file.includes('/lib/')));
  assert.equal(report.input.foldersPassedOver, 1);
  assert.equal(report.input.excluded, 1);
});

test('examples: the same files written with CRLF line ends and as UTF-16 give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'solidity-pattern-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const f of [VAULT, RAFFLE, TOKEN]) {
      const text = await readFile(resolve(root, f), 'utf8');
      await writeFile(resolve(dir, f), text.split('\n').join('\r\n'));
    }
    const v2 = (await readFile(resolve(root, V2), 'utf8')).split('\n').join('\r\n');
    await writeFile(resolve(dir, V2), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(v2, 'utf16le')]));
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
