import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEX_LIMITS, LexError, MUTABILITY, OUTLINE_LIMITS, OutlineError, VISIBILITY, blankText, brackets, closing, compareVersions, outline, parseVersion, readExpression, readPragma, solidityExpression, tokenize, versionText } from '../src/index.js';

// The readers: the lexer that sets comments and literals aside, the outline of contracts, functions and scopes, and the
// version pragma.

const kinds = (text) => tokenize(text).tokens.map((t) => (t.t === 'id' || t.t === 'num' || t.t === 'p' ? t.v : `<${t.t}${t.v ? ` ${t.v}` : ''}>`));
const outlineOf = (text) => outline(tokenize(text).tokens);

test('lexer: comments of every form are passed over, and literals are one token with no text', () => {
  assert.deepEqual(kinds('a // tx.origin\nb /* tx.origin */ c /// natspec\nd /** @notice x */ e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(kinds('x = "tx.origin == owner";'), ['x', '=', '<str>', ';']);
  assert.deepEqual(kinds("x = 'it\\'s' + \"a\\\"b\";"), ['x', '=', '<str>', '+', '<str>', ';']);
  assert.deepEqual(kinds('h = hex"00ff"; u = unicode"caf\\u00e9"; s = hex\'aa\';'), ['h', '=', '<str hex>', ';', 'u', '=', '<str unicode>', ';', 's', '=', '<str hex>', ';']);
  assert.deepEqual(kinds('hex + unicode'), ['hex', '+', 'unicode'], 'the words alone are names');
  assert.deepEqual(kinds('a /* never closed\nb c'), ['a'], 'an unclosed comment runs to the end');
  assert.deepEqual(kinds('a = "never closed\nb;'), ['a', '=', '<str>', 'b', ';'], 'an unclosed string ends at its line');
  assert.deepEqual(kinds('a = "x\\\nb";'), ['a', '=', '<str>', 'b', '<str>'], 'a backslash before a line end does not carry the string on');
  assert.deepEqual(kinds('s = "ends at the file'), ['s', '=', '<str>']);
  assert.deepEqual(kinds('a//x\rb'), ['a', 'b'], 'a line comment ends at CR');
});

test('lexer: the pragma is one token with its raw text, numbers keep their text, operators are read longest first', () => {
  const t = tokenize('pragma solidity  >=0.8.0\n <0.9.0;\npragma abicoder v2;').tokens;
  assert.deepEqual(t.map((x) => [x.t, x.v]), [['pragma', 'solidity >=0.8.0 <0.9.0'], ['p', ';'], ['pragma', 'abicoder v2'], ['p', ';']]);
  assert.deepEqual(tokenize('pragma solidity ^0.8.0').tokens.map((x) => x.v), ['solidity ^0.8.0'], 'a pragma with no semicolon');
  assert.deepEqual(kinds('1_000 0x4242 1.5e3 2e-1 .5 0X1F'), ['1_000', '0x4242', '1.5e3', '2e-1', '.5', '0X1F']);
  assert.deepEqual(kinds('a >>>= b <<= c >>= d => e == f != g <= h >= i && j || k ++ -- += -= *= /= %= |= &= ^= << >> ** := -> >>>'), ['a', '>>>=', 'b', '<<=', 'c', '>>=', 'd', '=>', 'e', '==', 'f', '!=', 'g', '<=', 'h', '>=', 'i', '&&', 'j', '||', 'k', '++', '--', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '<<', '>>', '**', ':=', '->', '>>>']);
  assert.deepEqual(kinds('$x _y a1'), ['$x', '_y', 'a1']);
  assert.deepEqual(kinds('a \u00e9 \ud83d\ude00 b'), ['a', '<other>', '<other>', 'b'], 'a character outside ASCII is one token of its own');
  assert.equal(tokenize('\ufeffa').tokens[0].o, 1, 'a byte order mark is passed over');
  assert.deepEqual(tokenize('a\r\n  b').tokens.map((x) => x.o), [0, 5]);
});

test('lexer: blankText keeps every offset and line end and blanks comments and literals', () => {
  const text = 'a = "tx.origin"; // x\r\n/* y\nz */ b';
  const blank = blankText(text);
  assert.equal(blank.length, text.length);
  assert.equal(blank, `a = ${' '.repeat(11)};${' '.repeat(5)}\r\n${' '.repeat(4)}\n${' '.repeat(5)}b`);
  assert.ok(!blank.includes('tx.origin'));
});

test('lexer: the limits of tokens and of the length of names and numbers', () => {
  assert.throws(() => tokenize('a b c d', { maxTokens: 3 }), (e) => e instanceof LexError && /more than 3 tokens/.test(e.reason) && e.offset === 6);
  assert.throws(() => tokenize(`x ${'n'.repeat(20)}`, { maxNameLength: 10 }), (e) => e instanceof LexError && /a name longer than 10 characters/.test(e.reason) && e.offset === 2);
  assert.throws(() => tokenize(`x = 0x${'1'.repeat(20)};`, { maxNameLength: 10 }), /a number longer than 10 characters/);
  assert.equal(LEX_LIMITS.maxTokens, 400000);
});

test('outline: contracts, interfaces, libraries, abstract contracts and their bases', () => {
  const o = outlineOf('pragma solidity 0.8.24;\nimport {A, B as C} from "./x.sol";\nimport "./y.sol" as Y;\ninterface I { function f() external; }\nlibrary L {}\nabstract contract Base is A, C(1) {}\ncontract D is Base, Y.Z { }\ncontract;');
  assert.deepEqual(o.contracts.map((c) => [c.kind, c.abstract, c.name, c.bases.map((b) => b.name)]), [['interface', false, 'I', []], ['library', false, 'L', []], ['contract', true, 'Base', ['A', 'C']], ['contract', false, 'D', ['Base', 'Z']]]);
  assert.deepEqual([...o.imports].sort(), ['A', 'B', 'C', 'Y']);
  assert.deepEqual(o.pragmas.map((p) => p.text), ['solidity 0.8.24']);
  assert.deepEqual(outlineOf('contract E is F;').contracts[0].start, -1, 'a contract with no body');
});

test('outline: state variables with their kind, whether they grow, and constant and immutable', () => {
  const o = outlineOf('contract V {\n  address public owner;\n  uint256[] internal list;\n  uint256[3] fixedList;\n  mapping(address => uint256[]) history;\n  mapping(address => uint256) balance;\n  address constant A = address(1);\n  uint256 public immutable START;\n  IToken token = IToken(address(2));\n  event E(uint256 indexed a);\n  error Bad(uint256 a);\n  using L for uint256;\n  struct S { uint256 a; }\n  enum K { One, Two }\n  type Price is uint256;\n  uint256 x = f({a: 1});\n}');
  const vars = Object.fromEntries(o.contracts[0].vars.map((v) => [v.name, [v.type, v.kind, v.dynamic, v.constant, v.immutable]]));
  assert.deepEqual(vars, {
    owner: ['address', 'value', false, false, false],
    list: ['uint256', 'array', true, false, false],
    fixedList: ['uint256', 'array', false, false, false],
    history: ['mapping', 'mapping', true, false, false],
    balance: ['mapping', 'mapping', false, false, false],
    A: ['address', 'value', false, true, false],
    START: ['uint256', 'value', false, false, true],
    token: ['IToken', 'value', false, false, false],
    x: ['uint256', 'value', false, false, false]
  });
});

test('outline: functions with their kind, parameters, visibility, mutability, modifiers and locals', () => {
  const o = outlineOf(`contract F is Base {
  constructor(uint256 a) Base(a) payable {}
  receive() external payable {}
  fallback() external {}
  function() external {}
  modifier only(address who) { _; }
  function g(address payable to, uint256[] memory xs, bytes calldata) public view virtual override(Base) only(to) Lib.check returns (uint256 r) {
    IToken t = IToken(to);
    uint256[] storage s = list;
    address payable p = to;
    Lib.Data memory d;
    return t.total();
  }
  function h() external pure;
  function k() constant { }
}
function free(uint256 a) pure returns (uint256) { return a; }`);
  assert.deepEqual(o.functions.map((f) => [f.kind, f.name, f.contract ? f.contract.name : null]), [['constructor', 'constructor', 'F'], ['receive', 'receive', 'F'], ['fallback', 'fallback', 'F'], ['function', 'fallback', 'F'], ['modifier', 'only', 'F'], ['function', 'g', 'F'], ['function', 'h', 'F'], ['function', 'k', 'F'], ['function', 'free', null]]);
  const g = o.functions[5];
  assert.deepEqual(g.params.map((p) => [p.name, p.type, p.location, p.dynamic]), [['to', 'address', null, false], ['xs', 'uint256', 'memory', true], [null, 'bytes', 'calldata', false]]);
  assert.deepEqual([g.visibility, g.mutability, g.virtual], ['public', 'view', true]);
  assert.deepEqual(g.modifiers.map((m) => m.name), ['only', 'check']);
  assert.deepEqual([...g.locals.values()].map((l) => [l.name, l.type, l.location, l.dynamic]), [['t', 'IToken', null, false], ['s', 'uint256', 'storage', true], ['p', 'address', null, false], ['d', 'Lib', 'memory', false]]);
  assert.equal(o.functions[6].bodyStart, -1, 'a function with no body');
  assert.equal(o.functions[7].mutability, 'view', 'constant on an old function reads as view');
  assert.deepEqual(o.functions[0].modifiers.map((m) => m.name), ['Base']);
  assert.deepEqual(o.contracts[0].modifiers.map((m) => m.name), ['only']);
  assert.deepEqual([VISIBILITY.length, MUTABILITY.length], [4, 5]);
});

test('outline: statements, assembly, unchecked blocks and braces of expressions', () => {
  const text = 'contract S {\n  function f(address a) external {\n    a.call{value: 1}("");\n    uint256 x = 1; if (x > 0) { x = 2; }\n    unchecked { x++; }\n    assembly ("memory-safe") { let y := 1 { let z := 2 } }\n    g(S({a: 1}));\n    for (uint256 i; i < 2; i++) {}\n  }\n}';
  const o = outlineOf(text);
  const { tokens, stmt, asm } = o;
  const at = (v, n = 1) => {
    let seen = 0;
    return tokens.findIndex((t) => t.v === v && (seen += 1) === n);
  };
  assert.equal(stmt[at('call')], stmt[at('value')], 'call options stay in their statement');
  assert.notEqual(stmt[at('call')], stmt[at('uint256')]);
  assert.equal(stmt[at('for')], stmt[at('i', 2)], 'the semicolons of a for header do not end the statement');
  assert.equal(stmt[at('g')], stmt[at('a', 3)], 'a struct literal stays in its statement');
  assert.deepEqual(o.uncheckeds.map((u) => tokens[u.index].v), ['unchecked']);
  assert.equal(o.assemblies.length, 1);
  assert.equal(o.assemblies[0].f.name, 'f');
  assert.ok(asm[at('let')] && asm[at('z')] && !asm[at('g')]);
  assert.equal(o.functions[0].bodyEnd, tokens.length - 2);
  assert.equal(stmt[0], -1, 'a token outside a body has no statement');
});

test('outline: brackets are matched once, a wrong closing bracket is passed over, and nesting has a limit', () => {
  const t = tokenize('( [ ) ] } {').tokens;
  const match = brackets(t);
  assert.deepEqual([...match], [-1, 3, -1, -1, -1, -1]);
  assert.equal(closing(match, 1), 3);
  assert.equal(closing(match, 0), t.length);
  assert.throws(() => outline(tokenize(`contract C { function f() { ${'{'.repeat(10)} } }`).tokens, { maxNesting: 5 }), (e) => e instanceof OutlineError && /braces nested more than 5 deep/.test(e.reason));
  assert.equal(OUTLINE_LIMITS.maxNesting, 256);
  const open = outlineOf('contract C { function f() { if (x) {');
  assert.equal(open.functions[0].bodyEnd, tokenize('contract C { function f() { if (x) {').tokens.length, 'an unclosed body runs to the end');
  assert.deepEqual(outlineOf('} } { contract C {} }').contracts.map((c) => c.name), [], 'braces at the top are passed over');
  assert.deepEqual(outlineOf('struct S { uint256 a; }\nenum K { A }\nuint256 constant X = 1;\nerror E();\ncontract C {}').contracts.map((c) => c.name), ['C']);
});

test('version: versions, expressions and the lowest version a pragma admits', () => {
  assert.deepEqual(parseVersion('0.8.24'), { v: [0, 8, 24], partial: false, given: 3 });
  assert.deepEqual(parseVersion('0.8'), { v: [0, 8, 0], partial: true, given: 2 });
  assert.deepEqual(parseVersion('0.x'), { v: [0, 0, 0], partial: true, given: 1 });
  for (const bad of ['0.8.1.2', 'a.b', '0.x.1', '', '1234567890']) assert.equal(parseVersion(bad), null, bad);
  assert.equal(compareVersions([0, 8, 1], [0, 8, 10]), -1);
  assert.equal(compareVersions([0, 9, 0], [0, 8, 10]), 1);
  assert.equal(compareVersions([0, 8, 0], [0, 8, 0]), 0);
  assert.equal(versionText([0, 8, 24]), '0.8.24');
  assert.deepEqual(readExpression('>=0.6.0 <0.9.0').map((s) => s.map((c) => c.op)), [['>=', '<']]);
  assert.deepEqual(readExpression('0.6.0 - 0.8.0').map((s) => s.map((c) => c.op)), [['>=', '<=']]);
  for (const bad of ['- 0.8.0', '0.6.0 -', '=>0.8.0', '^^0.8.0', 'x y', '0.8.0 ||']) assert.equal(readExpression(bad), null, bad);
  const cases = { '0.8.24': [true, '0.8.24'], '=0.8.24': [true, '0.8.24'], '^0.8.19': [false, '0.8.19'], '>0.7': [false, '0.8.0'], '>0.8.1': [false, '0.8.2'], '>0': [false, '1.0.0'], '<0.9.0': [false, '0.0.0'], '^0.4.0 || ^0.8.0': [false, '0.4.0'], '*': [false, '0.0.0'], '0.8': [false, '0.8.0'] };
  for (const [e, [pinned, lowest]] of Object.entries(cases)) {
    const r = readPragma(e);
    assert.deepEqual([r.readable, r.pinned, versionText(r.lowest)], [true, pinned, lowest], e);
  }
  assert.deepEqual(readPragma('latest'), { expression: 'latest', readable: false, pinned: false, lowest: null });
  assert.equal(solidityExpression('solidity ^0.8.0'), '^0.8.0');
  assert.equal(solidityExpression('solidity>=0.8'), '>=0.8');
  assert.equal(solidityExpression('solidity'), '');
  assert.equal(solidityExpression('abicoder v2'), null);
  assert.equal(solidityExpression('solidityx 1'), null);
});
