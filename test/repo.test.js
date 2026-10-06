import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYS, RULES } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/blockchain/development';
const DECISIONS = ['docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md', 'docs/decisions/0002-read-solidity-with-a-lexer-of-its-own-and-compile-nothing.md', 'docs/decisions/0003-check-the-files-on-disk-and-fetch-nothing.md'];
const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'research/sources.md', ...(await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`)];
const YEAR = /\b(?:19|20)\d{2}\b/;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const NOT_A = 'not a security audit and not a guarantee that the contracts are safe';

// Every file of a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

// Every text file of the repository that is committed.
async function allFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel || '.'), { withFileTypes: true })) {
      if (['.git', 'coverage'].includes(e.name) || (!rel && ['dist', 'node_modules'].includes(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('');
  return out.sort();
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'solidity-pattern-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/solidity-pattern-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['solidity-pattern-check'], 'bin/solidity-pattern-check.js');
  for (const k of ['solidity', 'smart-contracts', 'ethereum', 'blockchain', 'security', 'static-analysis', 'cli']) assert.ok(pkg.keywords.includes(k), k);
  assert.match(pkg.description, /^Solidity pattern check: /);
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.name, pkg.name);
  assert.ok((await read('bin/solidity-pattern-check.js')).startsWith('#!/usr/bin/env node\n'));
});

test('README: one link to the page on blockchain development services, in the closing Background section, with the page title as its text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[Blockchain Development Services](${HOMEPAGE})`));
  assert.equal(readme.split('innerluxes.dev/').length - 1, 1, 'the README links to the site once');
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests > 70);
});

test('README: what it reports, how to run it with npx or node, the options, the inputs, the example output and the limits', async () => {
  const readme = await read('README.md');
  for (const heading of ['## Quick start', '## Usage', '## How the files are read', '## What it reports', '## Inputs and excluded paths', '## What is not checked', '## The configuration file', '## Formats', '## Exit codes', '## Limits', '## Architecture', '## Where the facts come from']) assert.ok(readme.includes(`\n${heading}\n`), heading);
  assert.match(readme, /npx --yes github:INNERLUXES\/solidity-pattern-check \./);
  assert.match(readme, /node bin\/solidity-pattern-check\.js examples\/messy --config examples\/config\.json/);
  for (const option of ['--exclude', '--config', '--format', '--json', '--min-severity', '--fail-on', '--explain', '--print-defaults', '--help', '--version']) assert.ok(readme.includes(option), option);
  for (const r of RULES) assert.ok(readme.includes(r.key ? `| \`${r.id}\` | \`rules.${r.key}\` |` : `| \`${r.id}\` | none |`), `README: ${r.id}`);
  for (const s of ['security-considerations', 'layout-of-source-files', 'units-and-global-variables', 'https://swcregistry.io/docs/SWC-101', 'writing-upgradeable', 'api/proxy', 'https://ethereum.org/developers/docs/smart-contracts/security/', 'https://owasp.org/www-project-smart-contract-top-10/', 'https://www.rfc-editor.org/rfc/rfc4180', 'https://www.rfc-editor.org/rfc/rfc8259', 'CSV_Injection', 'workflow-commands']) assert.ok(readme.includes(s), s);
  assert.match(readme, /There is no SARIF format/);
});

test('README and documents: an input to a smart contract review, not a security audit and not a guarantee', async () => {
  for (const file of ['README.md', 'docs/limits.md', 'docs/method.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'docs/rules-and-sources.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'research/sources.md', 'docs/decisions/0002-read-solidity-with-a-lexer-of-its-own-and-compile-nothing.md']) assert.ok((await read(file)).replace(/\s+/g, ' ').includes(NOT_A), file);
  const readme = await read('README.md');
  assert.ok(readme.indexOf(NOT_A.split(' ').slice(0, 6).join(' ')) < readme.indexOf('## Quick start'), 'said before the quick start');
  assert.ok(readme.replace(/\s+/g, ' ').includes('It is not an auditor.'));
  assert.ok(readme.replace(/\s+/g, ' ').includes('compiles nothing, runs nothing, deploys nothing, fetches nothing and reads no clock'));
  assert.ok(readme.includes('heuristic'));
  assert.match(await read('docs/limits.md'), /^The tool is not an auditor/m);
});

test('README and documents: no number that reads like a year, no date in words and no full date', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/, file);
    assert.doesNotMatch(text, DATE, file);
  }
  for (const file of ['package.json', ...DECISIONS]) assert.doesNotMatch(await read(file), DATE, file);
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('every file: none of the words this project keeps out of its prose, and no name of a tool that wrote it', async () => {
  // Built from pieces, so that this file does not hold the words; a word is matched at its start.
  const words = [['har', 'ness'], ['del', 'v'], ['lever', 'ag'], ['seam', 'less'], ['rob', 'ust'], ['cutting', '-edg'], ['un', 'lock'], ['em', 'power'], ['ele', 'vat'], ['stream', 'lin'], ['game', '-changer'], ['tap', 'estr'], ['re', 'alm'], ['further', 'more'], ['more', 'over'], ['in today', "'s"], ['gene', 'rated'], ['trans', 'form']].map((p) => p.join(''));
  const banned = new RegExp(`\\b(?:${words.join('|')})`, 'i');
  const names = new RegExp(`${['cla', 'ude'].join('')}|${['anthro', 'pic'].join('')}|\\b${['A', 'I'].join('')}\\b|\\b${['assis', 'tant'].join('')}|\\b${['ch', 'at'].join('')}\\b|\\b${['ses', 'sion'].join('')}|${['co-', 'authored'].join('')}`, 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    const text = await read(file);
    assert.doesNotMatch(text, banned, file);
    assert.doesNotMatch(text, names, file);
  }
  assert.match(`an ${['assis', 'tant'].join('')} wrote this`, names);
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"solidity-pattern-check security"/);
  assert.doesNotMatch(text, /within\s+\d|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|we guarantee|guaranteed|respond within|reply within/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems, two Node versions and coverage, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  assert.match(ci, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('codeql: JavaScript only, with the security-extended queries, and the made-up contracts of the examples left out', async () => {
  const codeql = await read('.github/workflows/codeql.yml');
  assert.match(codeql, /languages: javascript-typescript/);
  assert.doesNotMatch(codeql, /autobuild/i);
  assert.match(codeql, /security-extended/);
  assert.match(codeql, /paths-ignore:\n\s+- examples/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^examples\/\*\* linguist-documentation$/m);
  assert.match(attributes, /^examples\/\*\* linguist-detectable=false$/m);
  assert.match(attributes, /^examples\/\*\* linguist-vendored$/m);
  assert.doesNotMatch(await read('.github/dependabot.yml'), /package-ecosystem: (?:nuget|pip|maven)/);
});

test('release workflow: the SSDF gate, then a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(release, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/solidity-pattern-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  const owners = await read('.github/CODEOWNERS');
  assert.match(owners, /^\* @innerluxesdev$/m);
  for (const f of ['walk', 'files', 'lexer', 'outline', 'version', 'analyze', 'glob', 'json', 'data', 'defaults', 'csv', 'config', 'rules', 'check', 'report']) assert.match(owners, new RegExp(`^/src/${f}\\.js @innerluxesdev$`, 'm'), f);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/clean\/\*\* -text$/m);
  assert.match(attributes, /^examples\/messy\/\*\* -text$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
  assert.match(await read('.gitignore'), /^\.env$/m);
});

test('the repository names no other tool of the organization outside the SSDF gate', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md', 'package.json', 'src/cli.js', 'src/check.js']) {
    assert.doesNotMatch(await read(file), /form-ux-check|xamarin-maui-check|spm-dependency-check|ui-markup-a11y-check|design-token-check|dotnet-port-scan|angularjs-migration-inventory|jakarta-migration-check|version-catalog-check|msix-manifest-check|mobile-manifest-check|lockfile-check|eol-runtime-check|app-manifest-check|privacy-manifest-check|release-gate-check|bus-factor-check/i, file);
  }
});

test('docs: every rule and key is described, and the documents of the set are there and linked', async () => {
  const method = await read('docs/method.md');
  for (const r of RULES) assert.ok(method.includes(`### \`${r.id}\``), `docs/method.md: ${r.id}`);
  const inputs = await read('docs/inputs.md');
  for (const [k, v] of Object.entries(KEYS)) {
    assert.ok(inputs.includes(`\`${k}\``), `docs/inputs.md: ${k}`);
    if (k === 'rules') for (const r of Object.keys(v)) assert.ok(inputs.includes(`\`rules.${r}\``), `docs/inputs.md: rules.${r}`);
  }
  const readme = await read('README.md');
  for (const f of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/limits.md', 'docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'research/sources.md']) assert.ok(readme.includes(`(${f}`), f);
  for (const f of ['docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', ...DECISIONS, 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) assert.ok((await read(f)).length > 500, f);
  assert.match(await read('docs/secure-defaults.md'), /NIST SP 800-218/);
  const threats = await read('docs/threat-model.md');
  for (const t of ['workflow command', '__proto__', 'symbolic link', 'regular expression', 'formula', 'binary', 'recursion', 'fetch', 'comment', 'outside the folder', 'import']) assert.match(threats, new RegExp(t.replace(/[_.]/g, '.'), 'i'), t);
  for (const t of ['heuristic', 'lexer', 'own', 'NatSpec', '.git and node_modules', 'UTF-16', 'ADMIN_WORDS', 'SENSITIVE_WORDS', 'AUTH_MODIFIERS', 'AUTH_CALLS', 'GUARD_MODIFIERS', 'Checks-Effects-Interactions', 'assembly', 'call options']) assert.ok(method.includes(t), `docs/method.md: ${t}`);
  const limits = await read('docs/limits.md');
  for (const t of ['not a security audit', 'compiles nothing', 'clock', 'heuristic', 'LOOKAHEAD', 'economics', 'proxy']) assert.ok(limits.includes(t), `docs/limits.md: ${t}`);
  for (const d of DECISIONS) assert.match(await read(d), /^# \d\. .+\n\n## Status\n\nAccepted\n\n## Context\n[\s\S]+\n## Decision\n[\s\S]+\n## Consequences\n/, d);
  assert.match(await read(DECISIONS[0]), /no date/);
  assert.match(await read(DECISIONS[1]), /compiler/);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket\(|\beval\(|new Function\(|\brequire\(['"`]|\bimport\(/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src builds no regular expression from text it reads: no new RegExp anywhere in src', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'text.js') {
      // The one pattern built at run time is made of fixed code points.
      assert.equal(text.split('new RegExp(').length - 1, 1, file);
      assert.match(text, /new RegExp\(`\[\$\{span\(0, 0x1f\)\}/);
    } else assert.ok(!text.includes('new RegExp('), file);
  }
});

test('src reads only what it is given: the file system is used in src/files.js and src/walk.js only, never follows a link, and writes nothing', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    assert.doesNotMatch(text, /writeFile|appendFile|mkdir|mkdtemp|rename\(|unlink\(|realpath|readlink|symlink\(|createWriteStream|'w'/, `${file} writes nothing and resolves no link`);
    if (file === 'files.js') {
      assert.match(text, /import \{ lstat, open \} from 'node:fs\/promises'/);
      assert.match(text, /O_NOFOLLOW/);
      assert.match(text, /if \(info\.isSymbolicLink\(\)\) throw fileError/, 'a link named on the command line is refused');
      assert.doesNotMatch(text, /readdir|opendir/, 'nothing is listed here');
    } else if (file === 'walk.js') {
      assert.match(text, /import \{ readdir \} from 'node:fs\/promises'/);
      assert.match(text, /if \(entry\.isSymbolicLink\(\)\) \{\n\s+links \+= 1;\n\s+continue;/, 'a link in the folder is counted and passed over');
      assert.doesNotMatch(text, /\bstat\(|lstat\(|recursive/, 'the listing keeps a list of its own');
    } else if (file === 'cli.js') assert.match(text, /import \{ readFileSync \} from 'node:fs'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('src reads no clock, no random number, no locale and no time zone, and no function of a reader calls itself', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    assert.doesNotMatch(text, /Date\.now\(|new Date\(|\bDate\.UTC\(|Date\.parse\(|performance\.now|Math\.random|process\.hrtime|getTimezoneOffset|resolvedOptions|toLocale(?:Date|Time)String|toLocaleLowerCase|toLocaleUpperCase|localeCompare|new Intl\.|process\.env\.TZ/, file);
    for (const m of text.matchAll(/toLocaleString\(([^)]*)\)/g)) assert.equal(m[1], "'en-US'", `${file}: toLocaleString always names its locale`);
  }
  // The readers of Solidity and the checks keep no recursion at all, in their functions and in the arrow functions inside
  // them; the listing, the patterns and the JSON reader keep none in their functions, and the JSON reader stops at 32
  // levels of nesting.
  for (const file of ['walk.js', 'json.js', 'lexer.js', 'outline.js', 'analyze.js', 'version.js', 'glob.js']) {
    const text = await read(`src/${file}`);
    const arrows = ['lexer.js', 'outline.js', 'analyze.js', 'version.js'].includes(file) ? [...text.matchAll(/^ {2}const ([A-Za-z]+) = \(/gm)] : [];
    const names = [...text.matchAll(/^(?:export )?(?:async )?function ([A-Za-z]+)/gm), ...arrows].map((m) => m[1]);
    for (const name of names) {
      const start = text.search(new RegExp(`^(?:(?:export )?(?:async )?function ${name}\\(| {2}const ${name} = \\()`, 'm'));
      let body = text.slice(start);
      const firstLine = body.slice(0, body.indexOf('\n'));
      // An arrow function on one line is its own body.
      if (!firstLine.endsWith('{')) body = `${firstLine.slice(0, firstLine.indexOf('=>') + 2)}{${firstLine.slice(firstLine.indexOf('=>') + 2)}\n  };\n}\n`;
      const open = body.indexOf('{');
      // A function of the file ends at a closing brace in the first column, an arrow function inside one at a closing
      // brace indented by two spaces.
      const end = body.startsWith(' ') ? body.search(/\n {2}\};?\n/) : body.search(/\n\}\n/);
      assert.doesNotMatch(body.slice(open + 1, end > open ? end : undefined), new RegExp(`(?<![.\\w$])${name}\\(`), `${file}: ${name} does not call itself`);
    }
  }
});

test('tests: a test file that makes a link, names a device or changes permissions guards it with process.platform, and a guarded test asserts no line', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|chmod\(|\/dev\/(?:null|zero)/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link, a device or permissions`);
      guarded += 1;
    }
    for (const block of text.split(/\ntest\(/).filter((b) => /if \(process\.platform/.test(b))) {
      assert.doesNotMatch(block, /\.line\b|lineOf\(|positionOf\(|line \d|:\d+\b|line=\d/, `${f}: a test guarded by the system asserts a line`);
    }
  }
  assert.ok(guarded >= 1);
});

test('tests: every test that is skipped on a system says why, and the guards name a system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))) {
    const text = await read(`test/${f}`);
    for (const m of text.matchAll(/\bt\.skip\(([^)]*)\)/g)) assert.match(m[1], /\S+\s+\S+\s+\S+/, `${f}: skip without a reason`);
    for (const m of text.matchAll(/process\.platform (?:===|!==) '([a-z0-9]+)'/g)) assert.ok(['win32', 'linux', 'darwin'].includes(m[1]), m[1]);
  }
});

test('tests: a time limit in a test widens under coverage through NODE_V8_COVERAGE, never through the flags of the process', async () => {
  const hostile = await read('test/hostile.test.js');
  assert.match(hostile, /const COVERAGE = Boolean\(process\.env\.NODE_V8_COVERAGE\);/);
  assert.match(hostile, /const limit = COVERAGE \? ms \* 4 : ms;/);
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.js'))) {
    const text = await read(`test/${f}`);
    assert.doesNotMatch(text, new RegExp(['exec', 'Argv'].join('')), f);
    if (/Date\.now\(\) - start/.test(text)) assert.ok(text.includes('COVERAGE ? ms * 4 : ms'), `${f}: a time check that does not widen under coverage`);
  }
});

test('tests and examples: no number that reads like a year and no full date', async () => {
  for (const f of [...(await filesOf('test')), ...(await filesOf('examples')), ...(await filesOf('tools')), ...(await filesOf('src'))]) {
    const text = await read(f);
    assert.doesNotMatch(text, YEAR, f);
    assert.doesNotMatch(text, DATE, f);
  }
});

test('the examples are made up: no email address, no token-shaped string, no key, no host but the reserved .test domain, ASCII, LF line ends in the inputs', async () => {
  const tokenShape = new RegExp(`${['gh', 'p_'].join('')}[A-Za-z0-9]{20}|${['github', '_pat_'].join('')}|${['AK', 'IA'].join('')}[0-9A-Z]{16}|0x[0-9a-fA-F]{64}\\b`);
  const files = await filesOf('examples');
  for (const f of files) {
    const text = await read(f);
    if (!f.startsWith('examples/output/')) assert.doesNotMatch(text, tokenShape, `${f} holds no key-shaped string`);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    assert.doesNotMatch(text, /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, `${f} holds no email address`);
    if (!f.startsWith('examples/output/')) {
      for (const m of text.matchAll(/\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) assert.ok(m[1].endsWith('.test'), `${f}: the host ${m[1]} is not on the reserved .test domain`);
      assert.ok(!text.includes('\r'), `${f} keeps LF line ends`);
    }
  }
  const outputs = (await filesOf('examples/output')).map((f) => f.split('/').at(-1));
  assert.deepEqual(outputs, ['clean.txt', 'defaults.json', 'messy-explain.txt', 'messy-findings.csv', 'messy-github.txt', 'messy.json', 'messy.txt']);
  for (const f of ['examples/messy/README.md', 'examples/clean/README.md', 'examples/config.json', 'examples/messy/contracts/ClubVault.sol', 'examples/messy/contracts/RaffleDraw.sol', 'examples/messy/contracts/interfaces/IClubToken.sol', 'examples/messy/contracts/upgradeable/ClubVaultV2.sol', 'examples/messy/mocks/MockClubToken.sol', 'examples/messy/lib/club-upgrades/Initializable.sol', 'examples/messy/lib/club-upgrades/UUPSUpgradeable.sol', 'examples/messy/node_modules/old-club-kit/Legacy.sol', 'examples/clean/contracts/ShelfRegistry.sol', 'examples/clean/contracts/upgradeable/ShelfRegistryV2.sol']) assert.ok(files.includes(f), f);
  assert.ok((await read('examples/output/messy-findings.csv')).includes('\r\n'), 'the CSV report ends its records with CRLF');
  for (const f of files.filter((x) => x.endsWith('.sol'))) {
    const text = await read(f);
    assert.match(text, /^\/\/ SPDX-License-Identifier: MIT\n/, f);
    assert.doesNotMatch(text, /\battack|\bexploit|\bdrain|\bsteal/i, `${f} is an illustration, not an attack`);
    assert.ok(text.split('\n').length < 100, `${f} stays small`);
  }
});

test('the year check passes over versions, limits, entry numbers and addresses and catches a year, and is the same in the tests and in tools/check.mjs', async () => {
  for (const value of ['1.0.0', '0.8.24', '^0.8.19', '>=0.7.0 <0.9.0', 'SWC-120', 'SWC-128', '0x4242424242424242424242424242424242424242', '0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0', '400,000', '1,024', 'Node 22', 'RFC 4180', 'RFC 8259', '5.x']) assert.doesNotMatch(value, YEAR, value);
  for (const year of [['19', '99'], ['20', '31']].map((p) => p.join(''))) {
    assert.match(`in ${year}`, YEAR, year);
    assert.match(`${year}.09.00`, YEAR, `a version made of a date is caught: ${year}`);
    assert.match(`/top-10/${year}/`, YEAR, `an address with a year in it is caught: ${year}`);
  }
  assert.ok((await read('tools/check.mjs')).includes(`const YEAR = ${YEAR.toString()};`), 'the same pattern in the repository checks');
});
