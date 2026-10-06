import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_WORDS, AUTH_CALLS, AUTH_MODIFIERS, GUARD_MODIFIERS, HALF_ORDER, INITIALIZER_MODIFIERS, SENSITIVE_WORDS, UPGRADEABLE_BASES, describeFunction, isAdminName, isSensitiveName, wordsOfName } from '../src/index.js';
import { columnOf, configOf, findingsIn, lineOf, ofRule, rulesIn, sol } from './helpers.js';

// Every rule with the form it reports and a near miss on each side: the form next to it that is not reported. The
// Solidity is written inline, small enough to work out by hand, and is never compiled.

const fn = (body, header = 'external') => sol([`  address public owner;`, `  function f(address a, uint256 n) ${header} {`, ...body.map((l) => `    ${l}`), '  }']);

test('floating-pragma: ^, ~, ranges, partial versions and a missing pragma are reported; one pinned version is not', () => {
  for (const p of ['^0.8.19', '~0.8.19', '>=0.8.0 <0.9.0', '0.8', '0.8.x', '>0.8.1', '^0.8.0 || ^0.7.0', '0.8.0 - 0.8.9']) {
    const f = ofRule(sol([], { pragma: `pragma solidity ${p};` }), 'floating-pragma');
    assert.equal(f.length, 1, p);
    assert.match(f[0].found, /admits more than one compiler version/);
  }
  for (const p of ['0.8.24', '=0.8.24', ' 0.8.24 ']) assert.deepEqual(ofRule(sol([], { pragma: `pragma solidity ${p};` }), 'floating-pragma'), [], p);
  const odd = ofRule(sol([], { pragma: 'pragma solidity latest;' }), 'floating-pragma');
  assert.match(odd[0].found, /does not read this version expression/);
  const none = sol([], { pragma: 'pragma abicoder v2;' });
  const missing = ofRule(none, 'floating-pragma');
  assert.equal(missing.length, 1);
  assert.match(missing[0].found, /declares contract T but has no pragma solidity/);
  assert.equal(missing[0].line, lineOf(none, 'contract T'));
  assert.match(ofRule('function free() pure returns (uint256) { return 1; }\n', 'floating-pragma')[0].found, /declares function free/);
  assert.deepEqual(ofRule('// only a comment\n', 'floating-pragma'), [], 'a file with nothing declared needs no pragma');
  assert.deepEqual(ofRule('pragma solidity 0.8.24;\npragma abicoder v2;\ncontract A {}\n', 'floating-pragma'), []);
  const text = sol([], { pragma: 'pragma solidity ^0.8.19;' });
  assert.equal(ofRule(text, 'floating-pragma')[0].column, columnOf(text, 'pragma'));
});

test('old-compiler: a pragma that admits a version below minCompiler; the default minimum is 0.8.0', () => {
  assert.match(ofRule(sol([], { pragma: 'pragma solidity ^0.7.6;' }), 'old-compiler')[0].found, /admits 0\.7\.6, below the minimum 0\.8\.0; before 0\.8\.0, arithmetic wraps/);
  assert.match(ofRule(sol([], { pragma: 'pragma solidity >=0.6.0 <0.9.0;' }), 'old-compiler')[0].found, /admits 0\.6\.0/);
  assert.deepEqual(ofRule(sol([], { pragma: 'pragma solidity ^0.8.0;' }), 'old-compiler'), [], 'exactly the minimum');
  assert.deepEqual(ofRule(sol([], { pragma: 'pragma solidity 0.7.6;' }), 'old-compiler').length, 1, 'pinned below the minimum');
  const raised = configOf({ minCompiler: '0.8.20' });
  const f = ofRule(sol([], { pragma: 'pragma solidity 0.8.19;' }), 'old-compiler', raised);
  assert.equal(f[0].found, 'pragma solidity 0.8.19 admits 0.8.19, below the minimum 0.8.20');
  assert.deepEqual(ofRule(sol([], { pragma: 'pragma solidity 0.8.20;' }), 'old-compiler', raised), []);
  assert.deepEqual(ofRule(sol([], { pragma: 'pragma solidity latest;' }), 'old-compiler'), [], 'an expression that is not read is not compared');
});

test('tx-origin-auth: tx.origin compared or used as a key in a check; tx.origin == msg.sender and a read for a log are not', () => {
  for (const line of ['require(tx.origin == owner, "no");', 'if (tx.origin != owner) revert();', 'require(owner == tx.origin);', 'require(allowed[tx.origin]);']) {
    const text = sol(['  address public owner;', '  mapping(address => bool) public allowed;', `  function f() external { ${line} }`]);
    const found = ofRule(text, 'tx-origin-auth');
    assert.equal(found.length, 1, line);
    assert.equal(found[0].line, lineOf(text, 'tx.origin'));
    assert.match(found[0].found, /in function f of T/);
  }
  for (const line of ['require(tx.origin == msg.sender);', 'require(msg.sender == tx.origin);', 'emit Seen(tx.origin);', 'last = tx.origin;', 'counts[tx.origin] += 1;']) {
    const text = sol(['  address public last;', '  mapping(address => uint256) public counts;', '  event Seen(address who);', `  function f() external { ${line} }`]);
    assert.deepEqual(ofRule(text, 'tx-origin-auth'), [], line);
  }
  const modifier = sol(['  address owner;', '  modifier onlyOrigin() { require(tx.origin == owner); _; }']);
  assert.match(ofRule(modifier, 'tx-origin-auth')[0].found, /in modifier onlyOrigin of T/);
  assert.deepEqual(ofRule(sol(['  // require(tx.origin == owner);', '  string s = "tx.origin == owner";']), 'tx-origin-auth'), [], 'comments and strings are not read');
  assert.match(ofRule('pragma solidity 0.8.24;\nfunction g(address o) view { require(tx.origin == o); }\n', 'tx-origin-auth')[0].found, /in function g/);
});

test('unchecked-call: a result dropped, a success value left out or never read; a checked call is not reported', () => {
  const dropped = fn(['payable(a).send(n);', 'a.call{value: n}("");', 'a.delegatecall("");', 'a.staticcall("");']);
  assert.equal(ofRule(dropped, 'unchecked-call').length, 4);
  assert.match(ofRule(dropped, 'unchecked-call')[0].found, /the result of \.send in function f of T is not used/);
  assert.match(ofRule(fn(['(, bytes memory d) = a.call("");', 'd;']), 'unchecked-call')[0].found, /left out of the tuple/);
  assert.match(ofRule(fn(['(bool ok, ) = a.call("");']), 'unchecked-call')[0].found, /ok, the success value of \.call in function f of T, is never read/);
  assert.match(ofRule(fn(['bool sent = payable(a).send(n);']), 'unchecked-call')[0].found, /sent, the success value of \.send/);
  for (const body of [['(bool ok, ) = a.call("");', 'require(ok);'], ['bool sent = payable(a).send(n);', 'if (!sent) revert();'], ['require(payable(a).send(n));'], ['if (!payable(a).send(n)) revert();'], ['payable(a).transfer(n);'], ['(bool ok, bytes memory d) = a.call("");', 'require(ok && d.length > 0);']]) {
    assert.deepEqual(ofRule(fn(body), 'unchecked-call'), [], body.join(' '));
  }
  assert.deepEqual(ofRule(sol(['  function f(address a) external returns (bool) { return payable(a).send(1); }']), 'unchecked-call'), [], 'a returned result is passed on');
  assert.deepEqual(ofRule(fn(['assembly { pop(call(gas(), a, 0, 0, 0, 0, 0)) }']), 'unchecked-call'), [], 'assembly is not read');
  assert.deepEqual(ofRule(fn(['token.call;']), 'unchecked-call'), [], 'a member named call that is not called');
});

test('delegatecall-untrusted: a target from a parameter or a mutable state variable; constant, immutable and this are not', () => {
  const param = fn(['(bool ok, ) = a.delegatecall("");', 'require(ok);']);
  assert.match(ofRule(param, 'delegatecall-untrusted')[0].found, /delegatecall to a, a parameter of function f of T/);
  const wrapped = fn(['(bool ok, ) = address(a).delegatecall("");', 'require(ok);']);
  assert.equal(ofRule(wrapped, 'delegatecall-untrusted').length, 1);
  const state = sol(['  address public impl;', '  function f() external { (bool ok, ) = impl.delegatecall(""); require(ok); }']);
  assert.match(ofRule(state, 'delegatecall-untrusted')[0].found, /delegatecall to impl, a state variable in function f of T: whoever can change impl/);
  for (const decl of ['address public constant IMPL = address(0x1);', 'address public immutable IMPL;']) {
    assert.deepEqual(ofRule(sol([`  ${decl}`, '  function f() external { (bool ok, ) = IMPL.delegatecall(""); require(ok); }']), 'delegatecall-untrusted'), [], decl);
  }
  assert.deepEqual(ofRule(fn(['(bool ok, ) = address(this).delegatecall("");', 'require(ok);']), 'delegatecall-untrusted'), []);
  assert.deepEqual(ofRule(fn(['address local = a;', '(bool ok, ) = local.delegatecall("");', 'require(ok);']), 'delegatecall-untrusted'), [], 'a local is not traced');
  const asm = fn(['assembly { let r := delegatecall(gas(), a, 0, 0, 0, 0) }']);
  assert.match(ofRule(asm, 'delegatecall-untrusted')[0].found, /delegatecall in assembly to a, a parameter/);
  assert.deepEqual(ofRule(fn(['assembly { let t := sload(0) let r := delegatecall(gas(), t, 0, 0, 0, 0) }']), 'delegatecall-untrusted'), []);
});

test('selfdestruct: selfdestruct and suicide in Solidity and in assembly; a name that only holds the word is not', () => {
  assert.equal(ofRule(fn(['selfdestruct(payable(a));']), 'selfdestruct').length, 1);
  assert.match(ofRule(fn(['suicide(a);']), 'selfdestruct')[0].found, /^suicide in function f of T$/);
  assert.match(ofRule(fn(['assembly { selfdestruct(a) }']), 'selfdestruct')[0].found, /selfdestruct in assembly in function f/);
  assert.deepEqual(ofRule(fn(['selfdestructDisabled = true;']), 'selfdestruct'), []);
  assert.deepEqual(ofRule(fn(['registry.selfdestruct(a);']), 'selfdestruct'), [], 'a member of another contract');
  assert.deepEqual(ofRule(sol(['  function selfdestruct2() external {}']), 'selfdestruct'), []);
});

test('weak-randomness: a block value hashed or taken modulo; a deadline check is not', () => {
  for (const line of ['uint256 r = uint256(keccak256(abi.encodePacked(block.timestamp)));', 'uint256 r = block.number % 10;', 'bytes32 r = sha256(abi.encode(blockhash(block.number - 1)));', 'uint256 r = uint256(keccak256(abi.encode(block.prevrandao, a)));', 'uint256 r = block.difficulty % n;', 'bytes32 r = keccak256(abi.encode(block.blockhash(1)));']) {
    const f = ofRule(fn([line, 'r;']), 'weak-randomness');
    assert.equal(f.length, 1, line);
  }
  assert.match(ofRule(fn(['uint256 r = (block.timestamp + block.number) % 7;', 'r;']), 'weak-randomness')[0].found, /block\.timestamp goes into a % \(modulo\) in function f of T/);
  for (const line of ['require(block.timestamp >= n);', 'uint256 end = block.timestamp + n;', 'bytes32 h = keccak256(abi.encode(a));', 'uint256 r = n % 3;', 'emit At(block.number);']) {
    assert.deepEqual(ofRule(fn([line]), 'weak-randomness'), [], line);
  }
  assert.deepEqual(ofRule(fn(['assembly { let r := mod(timestamp(), 2) }']), 'weak-randomness'), [], 'assembly is not read');
});

test('state-write-after-call: a write after .call, .send, .transfer or an interface call; the order of Checks-Effects-Interactions and a guard are not', () => {
  const head = 'interface IVault { function pay(address to) external; }';
  const base = (body, mods = '') => sol(['  mapping(address => uint256) public balances;', '  IVault public vault;', '  uint256 public total;', `  function f(address a, uint256 n) external ${mods} {`, ...body.map((l) => `    ${l}`), '  }'], { head });
  const after = base(['(bool ok, ) = a.call{value: n}("");', 'require(ok);', 'balances[a] -= n;']);
  const f = ofRule(after, 'state-write-after-call');
  assert.equal(f.length, 1);
  assert.equal(f[0].found, `function f of T writes balances at line ${lineOf(after, 'balances[a] -= n')} after the external call .call at line ${lineOf(after, 'a.call')}; a contract it calls can enter again before the write`);
  for (const body of [['payable(a).transfer(n);', 'total += n;'], ['vault.pay(a);', 'delete balances[a];'], ['IVault(a).pay(a);', 'total++;'], ['require(payable(a).send(n));', 'balances[a] = 0;']]) {
    assert.equal(ofRule(base(body), 'state-write-after-call').length, 1, body.join(' '));
  }
  for (const body of [['balances[a] -= n;', '(bool ok, ) = a.call{value: n}("");', 'require(ok);'], ['uint256 local = 1;', 'vault.pay(a);', 'local += 1;'], ['vault.pay(a);', 'emit Paid(a);']]) {
    assert.deepEqual(ofRule(base(body), 'state-write-after-call'), [], body.join(' '));
  }
  assert.deepEqual(ofRule(base(['(bool ok, ) = a.call{value: n}("");', 'require(ok);', 'balances[a] -= n;'], 'nonReentrant'), 'state-write-after-call'), [], 'a reentrancy guard');
  assert.deepEqual(ofRule(base(['(bool ok, ) = a.delegatecall("");', 'require(ok);', 'total = 1;']), 'state-write-after-call'), [], 'a delegatecall runs in this contract');
  const storageRef = sol(['  struct P { uint256 amount; }', '  mapping(address => P) internal positions;', '  function f(address a) external {', '    P storage p = positions[a];', '    payable(a).transfer(p.amount);', '    p.amount = 0;', '  }']);
  assert.match(ofRule(storageRef, 'state-write-after-call')[0].found, /writes p at line/);
  const view = sol(['  uint256 x;', '  function f(address a) external view returns (uint256) { return IVault(a).total(); }'], { head: 'interface IVault { function total() external view returns (uint256); }' });
  assert.deepEqual(ofRule(view, 'state-write-after-call'), []);
  const pushed = base(['vault.pay(a);', 'list.push(a);']).replace('uint256 public total;', 'address[] public list;');
  assert.equal(ofRule(pushed, 'state-write-after-call').length, 1, 'push is a write');
  const shadowed = base(['vault.pay(a);', 'uint256 total = 2;', 'total = 3;']);
  assert.deepEqual(ofRule(shadowed, 'state-write-after-call'), [], 'a local of the same name');
});

test('admin-change-without-event: a write to an owner, admin, role or implementation with no emit; an emit, a constructor and an initializer are not', () => {
  for (const name of ['owner', '_pendingOwner', 'admin', 'implementation', 'minterRole', 'GOVERNOR']) {
    const text = sol([`  address public ${name};`, `  function set(address a) external onlyOwner { ${name} = a; }`, '  modifier onlyOwner() { _; }']);
    assert.match(ofRule(text, 'admin-change-without-event')[0].found, new RegExp(`function set of T changes ${name} and emits no event`), name);
  }
  assert.equal(ofRule(sol(['  mapping(bytes32 => mapping(address => bool)) roles;', '  function grant(bytes32 r, address a) external { require(msg.sender == address(1)); roles[r][a] = true; }']), 'admin-change-without-event').length, 1);
  for (const lines of [['  address public owner;', '  event Changed(address a);', '  function set(address a) external { emit Changed(a); owner = a; }'], ['  address public owner;', '  constructor(address a) { owner = a; }'], ['  address public owner;', '  function initialize(address a) external initializer { owner = a; }', '  modifier initializer() { _; }'], ['  address public ownerless;', '  uint256 public fee;', '  function set(uint256 a) external { fee = a; }'], ['  address public owner;', '  function view1() external view returns (address) { return owner; }']]) {
    assert.deepEqual(ofRule(sol(lines), 'admin-change-without-event'), [], lines.join(' '));
  }
});

test('missing-access-control: a public function that changes sensitive state with no guard; a modifier or a check of msg.sender is a guard', () => {
  const open = sol(['  uint256 public fee;', '  function setFee(uint256 v) public { fee = v; }']);
  assert.equal(ofRule(open, 'missing-access-control')[0].found, 'public function setFee of T changes fee with no access control modifier and no check of msg.sender');
  assert.match(ofRule(sol(['  function kill() external { selfdestruct(payable(msg.sender)); }']), 'missing-access-control')[0].found, /uses selfdestruct/);
  assert.match(ofRule(sol(['  function run(address t) external { (bool ok, ) = t.delegatecall(""); require(ok); }']), 'missing-access-control')[0].found, /uses delegatecall/);
  assert.equal(ofRule(sol(['  bool public paused;', '  function pause() { paused = true; }'], { pragma: 'pragma solidity 0.4.26;' }), 'missing-access-control').length, 1, 'no visibility reads as public in old code');
  const guarded = [
    ['  uint256 public fee;', '  function setFee(uint256 v) external onlyOwner { fee = v; }'],
    ['  uint256 public fee;', '  function setFee(uint256 v) external onlyRole(ADMIN) { fee = v; }'],
    ['  uint256 public fee;', '  function setFee(uint256 v) external auth { fee = v; }'],
    ['  uint256 public fee;', '  address admin;', '  modifier guard() { require(msg.sender == admin); _; }', '  function setFee(uint256 v) external guard { fee = v; }'],
    ['  uint256 public fee;', '  address admin;', '  function setFee(uint256 v) external { require(msg.sender == admin); fee = v; }'],
    ['  uint256 public fee;', '  function setFee(uint256 v) external { if (_msgSender() != address(1)) revert(); fee = v; }'],
    ['  uint256 public fee;', '  function setFee(uint256 v) external { _checkOwner(); fee = v; }'],
    ['  uint256 public fee;', '  function setFee(uint256 v) internal { fee = v; }'],
    ['  uint256 public total;', '  function add(uint256 v) external { total += v; }'],
    ['  uint256 public fee;', '  function initialize(uint256 v) external { fee = v; }']
  ];
  for (const lines of guarded) assert.deepEqual(ofRule(sol(lines), 'missing-access-control'), [], lines.join(' '));
  const notACheck = sol(['  uint256 public fee;', '  mapping(address => uint256) paid;', '  modifier logged() { _; }', '  function setFee(uint256 v) external logged { paid[msg.sender] = v; fee = v; }']);
  assert.equal(ofRule(notACheck, 'missing-access-control').length, 1, 'msg.sender outside a check and a modifier that checks nothing are not a guard');
  assert.deepEqual(ofRule('pragma solidity 0.8.24;\nlibrary L { function set(uint256 v) public pure returns (uint256) { return v; } }\n', 'missing-access-control'), []);
});

test('upgradeable-initializer: no _disableInitializers, an initialize with no initializer, an __init with no onlyInitializing and an open _authorizeUpgrade', () => {
  const head = 'import {Initializable} from "./Initializable.sol";';
  const upgradeable = (lines, bases = 'Initializable') => sol(lines, { head, bases });
  const none = ofRule(upgradeable(['  uint256 x;']), 'upgradeable-initializer');
  assert.match(none[0].found, /contract T inherits Initializable and has no constructor that calls _disableInitializers\(\)/);
  assert.match(ofRule(upgradeable(['  constructor() {}']), 'upgradeable-initializer')[0].found, /the constructor of T does not call _disableInitializers\(\)/);
  assert.match(ofRule(upgradeable(['  constructor() { _disableInitializers(); }', '  function initialize() public {}']), 'upgradeable-initializer')[0].found, /public function initialize of T has no initializer or reinitializer modifier/);
  assert.match(ofRule(upgradeable(['  constructor() { _disableInitializers(); }', '  function __T_init() internal {}']), 'upgradeable-initializer')[0].found, /function __T_init of T has no onlyInitializing modifier/);
  assert.match(ofRule(upgradeable(['  constructor() { _disableInitializers(); }', '  function _authorizeUpgrade(address) internal override {}'], 'Initializable, UUPSUpgradeable'), 'upgradeable-initializer')[0].found, /function _authorizeUpgrade of T has no access control modifier/);
  assert.match(ofRule(sol(['  function initialize() external initializer {}', '  modifier initializer() { _; }']), 'upgradeable-initializer')[0].found, /contract T uses the initializer modifier and has no constructor/);
  assert.equal(ofRule(upgradeable(['  constructor() { _disableInitializers(); }'], 'OwnableUpgradeable'), 'upgradeable-initializer').length, 0);
  const good = upgradeable([
    '  address owner;',
    '  modifier onlyOwner() { require(msg.sender == owner); _; }',
    '  /// @custom:oz-upgrades-unsafe-allow constructor',
    '  constructor() { _disableInitializers(); }',
    '  function initialize() external initializer {}',
    '  function initializeV2() external reinitializer(2) {}',
    '  function __T_init() internal onlyInitializing {}',
    '  function __T_init_unchained() internal onlyInitializing {}',
    '  function _authorizeUpgrade(address) internal override onlyOwner {}'
  ], 'Initializable, UUPSUpgradeable');
  assert.deepEqual(ofRule(good, 'upgradeable-initializer'), []);
  assert.deepEqual(ofRule(`pragma solidity 0.8.24;\n${head}\nabstract contract A is Initializable { function __A_init() internal onlyInitializing {} }\n`, 'upgradeable-initializer'), [], 'an abstract contract needs no constructor');
  assert.deepEqual(ofRule(sol(['  function initialize() external {}']), 'upgradeable-initializer'), [], 'a contract that is not upgradeable');
  assert.deepEqual(ofRule(upgradeable(['  constructor() { _disableInitializers(); }', '  function initialized() external view returns (bool) { return true; }', '  function initialize() internal {}']), 'upgradeable-initializer'), [], 'a view named like it and an internal initialize');
});

test('unbounded-loop: a for or while loop up to the length of a dynamic array in storage; a memory array or a fixed bound is not', () => {
  const state = ['  address[] public members;', '  mapping(address => uint256[]) public history;', '  uint256[10] public fixedList;', '  uint256 public total;'];
  const loops = ['for (uint256 i = 0; i < members.length; i++) { total += 1; }', 'uint256 i; while (i < members.length) { i++; }', 'for (uint256 i; i < history[a].length; ++i) { total += 1; }', 'uint256[] storage h = history[a]; for (uint256 i; i < h.length; ++i) { total += h[i]; }'];
  for (const line of loops) {
    const text = sol([...state, `  function f(address a) external { ${line} }`]);
    const found = ofRule(text, 'unbounded-loop');
    assert.equal(found.length, 1, line);
    assert.match(found[0].found, /loop in function f of T runs to /);
  }
  assert.match(ofRule(sol([...state, '  function f(address a) external { for (uint256 i; i < history[a].length; ++i) { total += 1; } }']), 'unbounded-loop')[0].found, /runs to history\[\.\.\.\]\.length/);
  const misses = ['for (uint256 i = 0; i < 10; i++) { total += 1; }', 'for (uint256 i = 0; i < list.length; i++) { total += list[i]; }', 'for (uint256 i = 0; i < fixedList.length; i++) { total += 1; }', 'for (;;) { break; }', 'uint256 n = members.length; total = n;'];
  for (const line of misses) assert.deepEqual(ofRule(sol([...state, `  function f(address a, uint256[] memory list) external { ${line} }`]), 'unbounded-loop'), [], line);
  assert.deepEqual(ofRule(sol([...state, '  function f() external view returns (uint256 s) { for (uint256 i; i < members.length; i++) s += 1; }']), 'unbounded-loop'), [], 'a view function');
});

test('ecrecover-unchecked: no address(0) check or no bound on s; both checks or a library are not reported', () => {
  const bound = `if (uint256(s) > ${HALF_ORDER}) revert();`;
  const recover = (lines, extra = '') => sol(['  address signer0;', `  function f(bytes32 h, uint8 v, bytes32 r, bytes32 s) external view returns (address) {${extra}`, ...lines.map((l) => `    ${l}`), '  }']);
  const both = ofRule(recover(['address who = ecrecover(h, v, r, s);', 'return who;']), 'ecrecover-unchecked');
  assert.match(both[0].found, /the result is not compared with address\(0\).*; s is not limited to the lower half/);
  assert.match(ofRule(recover([bound, 'address who = ecrecover(h, v, r, s);', 'return who;']), 'ecrecover-unchecked')[0].found, /^ecrecover in function f of T: the result is not compared with address\(0\), which ecrecover returns for a signature it cannot read$/);
  assert.match(ofRule(recover(['address who = ecrecover(h, v, r, s);', 'require(who != address(0));', 'return who;']), 'ecrecover-unchecked')[0].found, /^ecrecover in function f of T: s is not limited/);
  for (const lines of [[bound, 'address who = ecrecover(h, v, r, s);', 'require(who != address(0));', 'return who;'], [bound, 'address who = ecrecover(h, v, r, s);', 'if (address(0) == who) revert();', 'return who;'], [bound.replace('0x7f', '0x7F').replace('5d576e', '5D576E'), 'require(ecrecover(h, v, r, s) != address(0));', 'return signer0;']]) {
    assert.deepEqual(ofRule(recover(lines), 'ecrecover-unchecked'), [], lines.join(' '));
  }
  assert.equal(ofRule(recover([bound, 'require(ecrecover(h, v, r, s) == signer0);', 'return signer0;']), 'ecrecover-unchecked').length, 1, 'compared with a signer that may be zero');
  assert.deepEqual(ofRule(recover(['return ECDSA.recover(h, v, r, s);']), 'ecrecover-unchecked'), [], 'a library');
});

test('inline-assembly, unchecked-block and hardcoded-address: notes for the review', () => {
  const text = sol(['  address constant A = 0x4242424242424242424242424242424242424242;', '  address constant Z = 0x0000000000000000000000000000000000000000;', '  bytes32 constant H = 0x4242424242424242424242424242424242424242424242424242424242424242;', '  function f() external view returns (uint256 x) {', '    assembly ("memory-safe") { x := sload(0) }', '    unchecked { x += 1; }', '  }']);
  const f = findingsIn(text);
  assert.deepEqual(f.map((x) => x.rule).sort(), ['hardcoded-address', 'inline-assembly', 'unchecked-block']);
  assert.match(f.find((x) => x.rule === 'hardcoded-address').found, /the address 0x4242424242424242424242424242424242424242 is written into the code in contract T/);
  assert.match(f.find((x) => x.rule === 'inline-assembly').found, /an assembly block in function f of T/);
  assert.equal(f.find((x) => x.rule === 'unchecked-block').line, lineOf(text, 'unchecked'));
  assert.deepEqual(rulesIn(sol(['  // assembly { } unchecked { }', '  string s = "0x4242424242424242424242424242424242424242";', '  uint256 uncheckedTotal;'])), []);
  assert.deepEqual(rulesIn('pragma solidity 0.8.24;\naddress constant A = 0x4242424242424242424242424242424242424242;\n'), ['hardcoded-address']);
});

test('words of names, the tables and the names of functions', () => {
  assert.deepEqual(wordsOfName('_pendingOwner'), ['pending', 'owner']);
  assert.deepEqual(wordsOfName('FEE_COLLECTOR'), ['fee', 'collector']);
  assert.deepEqual(wordsOfName('setURI'), ['set', 'uri']);
  assert.deepEqual(wordsOfName('URIValue2x'), ['uri', 'value2x']);
  assert.ok(isAdminName('newOwner') && !isAdminName('ownership') && !isAdminName('knowner'));
  assert.ok(isSensitiveName('feeBps') && !isSensitiveName('balance'));
  for (const list of [ADMIN_WORDS, SENSITIVE_WORDS, AUTH_MODIFIERS, AUTH_CALLS, GUARD_MODIFIERS, UPGRADEABLE_BASES, INITIALIZER_MODIFIERS]) assert.ok(list.length > 1);
  const c = { name: 'V', kind: 'contract' };
  assert.equal(describeFunction({ kind: 'constructor', contract: c }), 'the constructor of V');
  assert.equal(describeFunction({ kind: 'receive', contract: c }), 'the receive function of V');
  assert.equal(describeFunction({ kind: 'fallback', contract: null }), 'the fallback function');
  assert.equal(describeFunction({ kind: 'modifier', name: 'm', contract: c }), 'modifier m of V');
});

test('comments and literals: the code of every rule in a comment, in NatSpec or in a string gives no finding', () => {
  const triggers = [
    'require(tx.origin == owner);',
    'payable(a).send(1);',
    '(bool ok, ) = a.delegatecall("");',
    'selfdestruct(payable(a));',
    'uint256 r = uint256(keccak256(abi.encode(block.timestamp))) % 2;',
    'a.call{value: 1}(""); total = 1;',
    'owner = a;',
    'for (uint256 i; i < list.length; i++) { total++; }',
    'address w = ecrecover(h, 1, h, h);',
    'assembly { sstore(0, 1) }',
    'unchecked { total += 1; }',
    'address x = 0x4242424242424242424242424242424242424242;'
  ];
  const quoted = (t) => t.split('"').join('\\"');
  const lines = ['  address owner;', '  address[] list;', '  uint256 total;', '  bytes32 h;', '  function f(address a) external {', ...triggers.flatMap((t) => [`    // ${t}`, `    /* ${t} */`, `    /// ${t}`, `    string memory s = "${quoted(t)}";`, `    bytes memory u = unicode"${quoted(t)}";`, `    string memory q = '${t}';`]), '  }'];
  const text = sol(lines);
  assert.deepEqual(findingsIn(text), []);
  assert.equal(findingsIn(sol(['  address owner;', '  address[] list;', '  uint256 total;', '  bytes32 h;', '  function f(address a) external {', ...triggers.map((t) => `    ${t}`), '  }'])).length >= triggers.length, true, 'the same lines as code are found');
});

test('the configuration turns a rule off', () => {
  const text = sol([], { pragma: 'pragma solidity ^0.8.0;' });
  assert.equal(ofRule(text, 'floating-pragma').length, 1);
  assert.equal(ofRule(text, 'floating-pragma', configOf({ rules: { floatingPragma: 'off' } })).length, 1, 'the checks still find it; the report leaves it out');
});
