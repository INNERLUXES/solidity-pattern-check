import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICE, POINTS, RULES, SOURCES, pointPage, source } from '../src/index.js';
import { configOf } from './helpers.js';

// The public pages the checks rest on: every page of src/data.js is listed in research/sources.md and in
// docs/rules-and-sources.md, every rule names points that exist, and no point is a long quote.

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');

test('data: every page has an id, a title and an https address with no number that reads like a year, and every point names a page', () => {
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
  for (const s of SOURCES) {
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\//, s.id);
    assert.doesNotMatch(s.url, /(?:19|20)\d{2}/, s.id);
    assert.ok(s.title.length > 10, s.id);
  }
  for (const [key, p] of Object.entries(POINTS)) {
    assert.ok(source(p.source), `${key}: ${p.source}`);
    assert.equal(pointPage(key).id, p.source);
    assert.ok(p.text.length < 300, `${key} is short`);
    assert.ok(!/"[^"]{20,}"/.test(p.text), `${key} is written in this project's own words, with no long quotation`);
  }
  for (const s of SOURCES) assert.ok(Object.values(POINTS).some((p) => p.source === s.id), `${s.id} is used by a point`);
  for (const host of ['docs.soliditylang.org', 'swcregistry.io', 'docs.openzeppelin.com', 'ethereum.org', 'owasp.org', 'www.rfc-editor.org', 'community.owasp.org', 'docs.github.com']) assert.ok(SOURCES.some((s) => s.url.startsWith(`https://${host}/`)), host);
  for (const page of ['security-considerations', 'layout-of-source-files', 'units-and-global-variables', 'control-structures', 'assembly.html', 'types.html', 'bugs.html', 'grammar.html', 'SWC-101', 'SWC-102', 'SWC-103', 'SWC-104', 'SWC-105', 'SWC-106', 'SWC-107', 'SWC-112', 'SWC-115', 'SWC-117', 'SWC-120', 'SWC-122', 'SWC-128', 'writing-upgradeable', 'api/proxy', 'smart-contracts/security', 'smart-contract-top-10', 'rfc4180', 'rfc8259', 'CSV_Injection', 'workflow-commands']) assert.ok(SOURCES.some((s) => s.url.includes(page)), page);
  assert.ok(SOURCES.filter((s) => s.url.startsWith('https://docs.soliditylang.org/')).every((s) => s.url.includes('/en/latest/')), 'the Solidity documentation is cited at its latest version');
});

test('data: the points name what the checks lean on, and none gives a date', () => {
  assert.match(POINTS.txOriginNever.text, /never to be used for authorization/);
  assert.match(POINTS.checkReturn.text, /always to be checked/);
  assert.match(POINTS.checkedSince08.text, /0\.8\.0/);
  assert.match(POINTS.ozDisable.text, /_disableInitializers\(\)/);
  assert.match(POINTS.ecrecoverZero.text, /returns zero on error/);
  assert.match(POINTS.swcRandomness.text, /block\.timestamp, blockhash, block\.difficulty and block\.number/);
  assert.match(POINTS.selfdestructDeprecated.text, /0\.8\.18/);
  const months = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
  for (const p of Object.values(POINTS)) assert.doesNotMatch(p.text, months);
});

test('data: every rule names points that exist, the ids and keys are unique, and every rule says what to change', () => {
  for (const r of RULES) {
    assert.ok(r.basis.length > 0, r.id);
    for (const k of r.basis) assert.ok(POINTS[k], `${r.id}: ${k}`);
    assert.match(r.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(typeof r.rule(configOf()), 'string');
    assert.equal(typeof r.rule(configOf({ minCompiler: '0.8.20' })), 'string');
    assert.ok(r.own.length > 20, r.id);
    assert.ok(r.fix.length > 10, r.id);
    assert.ok(r.title.length > 5, r.id);
  }
  assert.match(RULES.find((r) => r.id === 'old-compiler').rule(configOf({ minCompiler: '0.8.20' })), /below 0\.8\.20/);
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  assert.equal(new Set(RULES.filter((r) => r.key).map((r) => r.key)).size, RULES.filter((r) => r.key).length);
  const used = new Set(RULES.flatMap((r) => r.basis));
  for (const k of Object.keys(POINTS).filter((x) => !used.has(x))) assert.ok(['csvRecords', 'csvInjection', 'githubAnnotations'].includes(k), `${k} is used by no rule`);
  assert.ok(NOTICE.startsWith('This check reads the Solidity files on disk as text and compiles nothing'));
  assert.ok(NOTICE.includes('not a security audit and not a guarantee that the contracts are safe'));
  assert.ok(NOTICE.includes('docs/limits.md'));
});

test('research/sources.md: lists every page with its address, in its own words', async () => {
  const note = await read('research/sources.md');
  for (const s of SOURCES) assert.ok(note.includes(s.url), s.url);
  assert.ok(note.includes('Each page was fetched and read before it was listed.'));
  const quotes = note.match(/"[^"]{60,}"/g) ?? [];
  assert.deepEqual(quotes, [], 'no long quotation');
  assert.ok(!note.includes('\r'));
});

test('docs/rules-and-sources.md: every rule with its points, its choice and its fix, and every page', async () => {
  const doc = await read('docs/rules-and-sources.md');
  for (const r of RULES) {
    assert.ok(doc.includes(`### \`${r.id}\``), r.id);
    for (const k of r.basis) assert.ok(doc.includes(POINTS[k].text.slice(1)), `${r.id}: ${k}`);
    assert.ok(doc.includes(r.fix.slice(1)), `${r.id}: fix`);
    assert.ok(doc.includes(r.own.slice(1)), `${r.id}: own`);
  }
  for (const s of SOURCES) assert.ok(doc.includes(s.url), s.url);
  for (const [key, p] of Object.entries(POINTS)) assert.ok(doc.includes(`| \`${key}\` | ${pointPage(key).title} | ${p.text} |`), key);
});
