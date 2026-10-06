import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_EXCLUDE, DEFAULT_INCLUDE, DEFAULT_MIN_COMPILER, DEFAULT_RULES, KEYS, RULES, defaultConfig, defaultsAsConfig, distance, isObject, kindOf, pathPatternProblem, readConfig, suggestion, validateConfig } from '../src/index.js';
import { P, SITE, configOf, run, sol, siteWith } from './helpers.js';

// The configuration file: every key with a good value and a bad one, unknown keys with their line and a suggestion,
// and a key named twice refused.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  return [];
};

test('config: the defaults, and --print-defaults read back give the same configuration', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.include, DEFAULT_INCLUDE);
  assert.deepEqual(d.exclude, DEFAULT_EXCLUDE);
  assert.deepEqual(DEFAULT_EXCLUDE, ['lib/**', 'out/**', 'cache/**', 'artifacts/**']);
  assert.equal(d.minCompiler, DEFAULT_MIN_COMPILER);
  assert.equal(d.minSeverity, 'info');
  assert.equal(d.failOn, 'error');
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.deepEqual(Object.keys(KEYS), ['name', 'include', 'exclude', 'rules', 'minCompiler', 'minSeverity', 'failOn']);
  d.include.push('x');
  assert.equal(defaultConfig().include.length, 1, 'the defaults are copied, never shared');
  assert.deepEqual(Object.keys(DEFAULT_RULES), RULES.filter((r) => r.key).map((r) => r.key), 'every rule of the configuration has a key, in the order of the rules');
  assert.deepEqual(Object.entries(DEFAULT_RULES).filter(([, v]) => v === 'error').map(([k]) => k), ['txOrigin', 'uncheckedCall', 'delegatecallTarget']);
  assert.deepEqual(Object.entries(DEFAULT_RULES).filter(([, v]) => v === 'info').map(([k]) => k), ['accessControl', 'assembly', 'uncheckedBlock', 'hardcodedAddress']);
});

test('config: every key with a good value is taken; the lists replace their defaults and keep a value once', () => {
  const c = configOf({ name: 'Review', include: ['**/*.sol', 'src/*.sol', 'src/*.sol'], exclude: ['test/**'], rules: { assembly: 'off', uncheckedBlock: 'error' }, minCompiler: '0.8.20', minSeverity: 'warning', failOn: 'warning' });
  assert.equal(c.name, 'Review');
  assert.deepEqual(c.include, ['**/*.sol', 'src/*.sol']);
  assert.deepEqual(c.exclude, ['test/**']);
  assert.equal(c.rules.assembly, 'off');
  assert.equal(c.rules.uncheckedBlock, 'error');
  assert.equal(c.minCompiler, '0.8.20');
  assert.equal(c.minSeverity, 'warning');
  assert.equal(c.failOn, 'warning');
  assert.equal(configOf({ minCompiler: '00.08.010' }).minCompiler, '0.8.10', 'a version is written back in its plain form');
});

test('config: an unknown key is an error with its line and a suggestion, at the top and in rules', () => {
  assert.deepEqual(problems('{\n  "failOm": "error"\n}'), ['c.json: line 2: "failOm" is not a key of the configuration; did you mean "failOn"?']);
  assert.deepEqual(problems('{\n  "rules": {\n    "txOrigins": "off"\n  }\n}'), ['c.json: line 3: "txOrigins" is not a key of rules; did you mean "txOrigin"?']);
  assert.deepEqual(problems('{"includes": []}'), ['c.json: line 1: "includes" is not a key of the configuration; did you mean "include"?']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
});

test('config: a value of the wrong kind is an error, and all problems are listed in the order of their lines', () => {
  const p = problems('{\n  "name": "",\n  "rules": {"assembly": "loud", "txOrigin": 3},\n  "include": ["/abs", 2],\n  "exclude": ["a\\\\b", "../up", ""],\n  "minCompiler": "0.8",\n  "minSeverity": "fatal",\n  "failOn": null\n}');
  assert.deepEqual(p, [
    'c.json: line 2: name must be a text of 1 to 120 characters',
    'c.json: line 3: rules.assembly must be one of info, warning, error, off, not "loud"',
    'c.json: line 3: rules.txOrigin must be one of info, warning, error, off, not 3',
    'c.json: line 4: include[0]: "/abs" is absolute; write it relative to the folder',
    'c.json: line 4: include[1] must be a text, not a number',
    'c.json: line 5: exclude[0]: "a\\b" uses a backslash; write paths with forward slashes',
    'c.json: line 5: exclude[1]: "../up" leaves the folder with ..',
    'c.json: line 5: exclude[2]: "" must be 1 to 200 characters',
    'c.json: line 6: minCompiler must be a version of three numbers such as 0.8.0, not "0.8"',
    'c.json: line 7: minSeverity must be one of info, warning, error',
    'c.json: line 8: failOn must be one of info, warning, error'
  ]);
  assert.deepEqual(problems('{"rules": []}'), ['c.json: line 1: rules must be an object, not a list']);
  assert.deepEqual(problems('{"include": []}'), ['c.json: line 1: include must name at least one pattern, such as **/*.sol']);
  assert.deepEqual(problems('{"exclude": "x"}'), ['c.json: line 1: exclude must be a list, not a string']);
  assert.deepEqual(problems('{"minCompiler": 8}'), ['c.json: line 1: minCompiler must be a version of three numbers such as 0.8.0, not 8']);
  assert.deepEqual(problems('{"minCompiler": "^0.8.0"}'), ['c.json: line 1: minCompiler must be a version of three numbers such as 0.8.0, not "^0.8.0"']);
  assert.deepEqual(problems('{"minCompiler": [1]}'), ['c.json: line 1: minCompiler must be a version of three numbers such as 0.8.0, not a list']);
  assert.deepEqual(problems(`{"exclude": ${JSON.stringify(Array(CONFIG_LIMITS.maxListEntries + 1).fill('a'))}}`), [`c.json: line 1: exclude holds more than ${CONFIG_LIMITS.maxListEntries} entries`]);
});

test('config: JSON that is not strict, a name given twice and a value that is not an object are refused', () => {
  assert.match(problems('{"failOn": "error",}')[0], /c\.json: line 1, column 20: a comma before the closing brace/);
  assert.match(problems('{"failOn": "error", "failOn": "info"}')[0], /appears twice in one object/);
  assert.match(problems('// comment\n{}')[0], /a comment; JSON has no comments/);
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.throws(() => validateConfig('x'), ConfigError);
});

test('config: the suggestion and the checks of patterns', () => {
  assert.equal(distance('nmae', 'name'), 1);
  assert.equal(suggestion('x'.repeat(70), ['name']), '');
  assert.equal(suggestion('zzzzzz', ['name']), '');
  assert.equal(suggestion('nmae', ['name', 'x'.repeat(70)]), '; did you mean "name"?');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf({}), 'an object');
  assert.equal(kindOf(true), 'a boolean');
  assert.ok(isObject({}) && !isObject([]));
  assert.equal(pathPatternProblem('**/mocks/**'), null);
  assert.match(pathPatternProblem('C:/x'), /absolute/);
  assert.match(pathPatternProblem('a\u0001'), /control character/);
  assert.match(pathPatternProblem('x'.repeat(201)), /must be 1 to 200 characters/);
});

test('config: through a run, a rule set to off gives no finding and a note, include picks the files, and a bad configuration stops the run', async () => {
  const files = siteWith({ [P]: sol(['  function f() external view returns (bool) { return tx.origin == address(1); }']), 'c.json': '{"rules": {"txOrigin": "off"}}' });
  const r = await run(files, ['s', '--config', 'c.json']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0\n/);
  assert.match(r.out, /note: 1 rule is off: tx-origin-auth\n/);
  const only = await run({ ...files, 's/src/Extra.SOL': sol([]), 'c.json': '{"include": ["src/*.sol"]}' }, ['s', '--config', 'c.json', '--json']);
  assert.deepEqual(JSON.parse(only.out).files.map((f) => f.file), ['s/src/Extra.SOL']);
  const bad = await run({ ...SITE, 'c.json': '{"failon": "info"}' }, ['s', '--config', 'c.json']);
  assert.equal(bad.code, 2);
  assert.equal(bad.out, '');
  assert.match(bad.err, /^solidity-pattern-check: no result, the input has a problem:\n {2}c\.json: line 1: "failon" is not a key of the configuration; did you mean "failOn"\?\n$/);
  assert.match((await run(SITE, ['s', '--config', 'none.json'])).err, /none\.json: no such file or folder/);
  assert.equal((await run({ ...SITE, 'c.json': '{"rules": {"unreadableFile": "off"}}' }, ['s', '--config', 'c.json'])).code, 2, 'the rules of input problems have no key');
  const lib = await run({ ...SITE, 's/lib/dep/Dep.sol': sol(['  function f() external { require(tx.origin == address(1)); }']), 'c.json': '{"exclude": []}' }, ['s', '--config', 'c.json', '--json']);
  assert.ok(JSON.parse(lib.out).findings.some((f) => f.file === 's/lib/dep/Dep.sol'), 'an empty exclude reads lib too');
  const libDefault = JSON.parse((await run({ ...SITE, 's/lib/dep/Dep.sol': 'x' }, ['s', '--json'])).out);
  assert.equal(libDefault.input.excluded, 1);
});
