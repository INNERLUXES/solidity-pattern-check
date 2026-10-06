// Shared test helpers: Solidity files built inline, read in memory or written into a temporary folder that is removed
// after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the tool does, so a test never
// holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkText, defaultConfig, lineStarts, main, positionOf, readConfig } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'solidity-pattern-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The column (from 1) of the n-th place where needle starts in text.
export const columnOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).column;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object = null) => (object === null ? defaultConfig() : readConfig(JSON.stringify(object), 'config.json'));

// A Solidity file with a pinned pragma and these lines inside one contract T, with the head (imports, other contracts)
// before it and the bases after "is".
export function sol(lines, { pragma = 'pragma solidity 0.8.24;', head = '', bases = '' } = {}) {
  const body = Array.isArray(lines) ? lines.join('\n') : lines;
  return `// SPDX-License-Identifier: MIT
${pragma}
${head}
contract T${bases ? ` is ${bases}` : ''} {
${body}
}
`;
}

// The findings of one file, through the lexer, the outline and the checks: [{ rule, line, column, found }].
export const findingsIn = (text, config = defaultConfig()) => checkText(text, config).findings;

// The rule ids of the findings of one file.
export const rulesIn = (text, config) => findingsIn(text, config).map((f) => f.rule);

// The findings of one rule in one file.
export const ofRule = (text, rule, config) => findingsIn(text, config).filter((f) => f.rule === rule);

export const P = 's/contracts/Vault.sol';
export const Q = 's/contracts/Token.sol';

// A project with nothing to report: a vault with an owner, events and the order of Checks-Effects-Interactions, and a
// small token.
export const SITE = {
  [P]: sol([
    '  address public owner;',
    '  mapping(address => uint256) public balances;',
    '  event OwnerChanged(address previousOwner, address newOwner);',
    '  modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }',
    '  constructor() { owner = msg.sender; }',
    '  function setOwner(address next) external onlyOwner { emit OwnerChanged(owner, next); owner = next; }',
    '  function withdraw(uint256 amount) external {',
    '    balances[msg.sender] -= amount;',
    '    (bool ok, ) = msg.sender.call{value: amount}("");',
    '    require(ok, "failed");',
    '  }'
  ]),
  [Q]: sol(['  mapping(address => uint256) public balanceOf;', '  function move(address to, uint256 amount) external {', '    balanceOf[msg.sender] -= amount;', '    balanceOf[to] += amount;', '  }'])
};

// The project with some files changed or added; null takes a file out.
export function siteWith(changes = {}) {
  const out = { ...SITE };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = ['s'], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// The JSON report of a folder of files, with more arguments.
export async function reportOf(files, args = ['s'], limits) {
  const r = await run(files, [...args, '--json'], limits);
  if (r.code === 2) throw new Error(r.err);
  return { ...JSON.parse(r.out), code: r.code };
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
