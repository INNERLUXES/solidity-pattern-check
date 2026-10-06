// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// projects to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy project: the counts, the summary, one finding of every rule, and the result.
export const EXPECTED = [
  'input: 4 Solidity files; 1 other file passed over; 1 folder named .git or node_modules passed over; 2 paths excluded',
  'config: examples/config.json (Brindlewood Savings Club contracts review): include **/*.sol; exclude lib/**, out/**, cache/**, artifacts/** and mocks/**; minimum compiler 0.8.20',
  'findings: 23 (5 error, 13 warning, 5 info)',
  'files: 4 Solidity, with 3 contracts, 1 interface and 0 libraries',
  'pragma solidity: 2 pinned, 2 floating, 0 missing',
  'pragma solidity ^0.8.19 admits more than one compiler version',
  'pragma solidity >=0.7.0 <0.9.0 admits 0.7.0, below the minimum 0.8.20; before 0.8.0, arithmetic wraps',
  'tx.origin decides who may act in function sweep of ClubVault',
  'the result of .send in function payBonus of ClubVault is not used',
  'the success value of .delegatecall in function runPlugin of ClubVaultV2 is left out of the tuple',
  'delegatecall to target, a parameter of function execute of ClubVaultV2',
  'delegatecall to plugin, a state variable in function runPlugin of ClubVaultV2',
  'selfdestruct in function closeClub of ClubVault',
  'block.timestamp goes into keccak256 in function drawWinner of RaffleDraw',
  'function withdraw of ClubVault writes balances at line 40 after the external call .call at line 38',
  'function setOwner of ClubVault changes owner and emits no event',
  'external function setFeeCollector of ClubVault changes feeCollector with no access control modifier',
  'contract ClubVaultV2 inherits Initializable and has no constructor that calls _disableInitializers()',
  'external function initialize of ClubVaultV2 has no initializer or reinitializer modifier',
  'function _authorizeUpgrade of ClubVaultV2 has no access control modifier',
  'the for loop in function payAll of ClubVault runs to members.length',
  'ecrecover in function claim of RaffleDraw: the result is not compared with address(0)',
  'an assembly block in function readSlot of ClubVault',
  'an unchecked block in function sum of ClubVault',
  'the address 0x4242424242424242424242424242424242424242 is written into the code in contract ClubVault',
  'note: 2 paths matching lib/**, out/**, cache/**, artifacts/** and mocks/** are left out',
  'not a security audit and not a guarantee that the contracts are safe',
  'RESULT: FAIL - 5 findings at or above error (5 error, 13 warning, 5 info)'
];
// What must not be reported: the excluded mocks and libraries, the package under node_modules, the patterns in
// comments and strings, the near misses, and the findings of input problems.
export const UNWANTED = ['examples/messy/mocks/', 'lib/club-upgrades', 'node_modules/', 'Legacy', 'function isPerson', 'function buy', 'function setAdmin', 'function setPlugin', 'function deposit', 'IClubToken.sol:', 'ERROR    unreadable-file', 'ERROR    scan-limit', 'RESULT: PASS'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy project', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean project', clean, 0, ['input: 2 Solidity files; 1 other file passed over', 'findings: 0', 'pragma solidity: 2 pinned, 0 floating, 0 missing', 'RESULT: PASS - no finding at or above error'], ['  ERROR  ', '  WARNING  ', '  INFO  ', 'RESULT: FAIL']);

  // Without the configuration, the mocks are read too, and ^0.8.19 is not below the default minimum of 0.8.0.
  expect('messy, no configuration', await run(['examples/messy']), 1, ['examples/messy/mocks/MockClubToken.sol', 'minimum compiler 0.8.0'], ['old-compiler                warning  examples/messy/contracts/ClubVault.sol', 'lib/club-upgrades', 'node_modules/']);
  // Only the errors are shown with --min-severity error.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 5 (5 error); 18 below error not shown', 'RESULT: FAIL - 5 findings at or above error'], ['WARNING  ', 'INFO  ']);
  // The clean project still passes when notes fail the run.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A path that is a file stops the run.
  const F = 'examples/messy/contracts/ClubVault.sol';
  expect('a folder that is a file', await run([F]), 2, [`${F}: is a file; give the folder of the project`], [], 'err');

  // The README shows the whole report of the messy project, the --explain lines of one finding, the GitHub annotations
  // of two findings, the start of the CSV report and the report of the clean project.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy project differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean project differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('tx-origin-auth') && l.includes('examples/messy/contracts/ClubVault.sol'));
  const sample = lines.slice(at, at + 7).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of tx.origin differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=solidity-pattern-check tx-origin-auth::') || x.includes('title=solidity-pattern-check state-write-after-call::'));
  if (picked.length !== 2) problems.push(`github: the sample lines are not in the output (${picked.length})`);
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 4).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-findings.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
