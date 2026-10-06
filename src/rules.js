// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change. docs/method.md says exactly what each rule looks at and what it cannot
// see. The checks themselves are in src/analyze.js, the reading of Solidity in src/lexer.js and src/outline.js and the
// version pragma in src/version.js.

import { LEVELS } from './data.js';
import { grouped, plural } from './size.js';

export const RULES = [
  {
    id: 'floating-pragma',
    key: 'floatingPragma',
    title: 'a pragma solidity that names more than one version, or none',
    basis: ['swcFloating', 'versionPragma'],
    own: 'a pragma solidity whose expression is anything but one full version with no operator or with =, such as ^0.8.19, >=0.8.0 <0.9.0 or 0.8; a file that declares a contract, an interface, a library or a function and has no pragma solidity; a version expression the tool does not read; a library meant for others may float on purpose, so the rule can be set off for it',
    rule: () => 'a pragma solidity with ^, ~, a range or a partial version, or none',
    fix: 'pin the version the contracts were tested with, such as pragma solidity 0.8.24;, and check the list of known compiler bugs for it'
  },
  {
    id: 'old-compiler',
    key: 'oldCompiler',
    title: 'a pragma that admits a compiler below the minimum',
    basis: ['swcOutdated', 'checkedSince08', 'knownBugs', 'swcOverflow'],
    own: 'a pragma solidity whose lowest admitted version is below minCompiler (0.8.0 by default, the first version that checks arithmetic); the version the project is built with in its tool settings is not read',
    rule: (config) => `a pragma solidity that admits a version below ${config.minCompiler}`,
    fix: 'move the code to a recent 0.8 compiler and pin it; below 0.8.0, guard every arithmetic operation with checked arithmetic'
  },
  {
    id: 'tx-origin-auth',
    key: 'txOrigin',
    title: 'tx.origin used to decide who may act',
    basis: ['txOriginNever', 'swcTxOrigin'],
    own: 'tx.origin on one side of == or != (other than tx.origin == msg.sender, which only tells an account from a contract), or as the key of an index in a require, an assert, an if or a while; tx.origin read for a log or passed on is not reported',
    rule: () => 'tx.origin compared, or used as a key, in a check',
    fix: 'check msg.sender instead, with an owner or a role, such as require(msg.sender == owner)'
  },
  {
    id: 'unchecked-call',
    key: 'uncheckedCall',
    title: 'a low-level call whose success value is not checked',
    basis: ['checkReturn', 'lowLevelFalse', 'swcUncheckedCall', 'owaspUnchecked'],
    own: 'a .call, .send, .delegatecall or .staticcall as a statement of its own, with its result dropped; a success value left out of the tuple it is assigned to, such as (, bytes memory data); a success value assigned to a name that is never read again in the function; a call inside a require, an if, a return or another expression counts as checked; calls in assembly are not read',
    rule: () => 'a .call, .send, .delegatecall or .staticcall whose success value is dropped or never read',
    fix: 'check the success value, such as (bool ok, ) = to.call{value: amount}(""); require(ok, "transfer failed");, or use a library call that reverts on failure'
  },
  {
    id: 'delegatecall-untrusted',
    key: 'delegatecallTarget',
    title: 'a delegatecall to an address taken from a parameter or from storage',
    basis: ['swcDelegatecall', 'lowLevelNoChecks', 'ozNoDelegatecall'],
    own: 'x.delegatecall(...) or address(x).delegatecall(...) where x is a parameter of the function or a state variable that is not constant or immutable, and delegatecall(gas, x, ...) in assembly where x is a parameter; a target held in a local variable is not traced',
    rule: () => 'delegatecall to a parameter or a mutable state variable',
    fix: 'delegatecall only to a constant or immutable address, or check the target against a list of trusted addresses that only an authorized party can change'
  },
  {
    id: 'selfdestruct',
    key: 'selfdestruct',
    title: 'selfdestruct in the code',
    basis: ['selfdestructDeprecated', 'swcSelfdestruct', 'ozNoDelegatecall'],
    own: 'a call of selfdestruct or of its old name suicide, in Solidity or in assembly, whatever guards it; whether the caller is checked is the business of missing-access-control',
    rule: () => 'a call of selfdestruct or suicide',
    fix: 'remove selfdestruct: it is deprecated, it no longer removes the code on most networks, and in an implementation behind a proxy it can break every proxy; send the balance out with a guarded withdrawal instead'
  },
  {
    id: 'weak-randomness',
    key: 'weakRandomness',
    title: 'a value of the block used like a random number',
    basis: ['timestampNotRandom', 'randomnessPublic', 'swcRandomness', 'owaspRandomness'],
    own: 'block.timestamp, block.number, block.prevrandao, block.difficulty or blockhash inside the arguments of keccak256, sha256, sha3 or ripemd160, or in a statement that uses % (modulo); a heuristic: a deadline check such as block.timestamp >= end is not reported, and a % on a time span is',
    rule: () => 'block.timestamp, block.number, block.prevrandao, block.difficulty or blockhash hashed or taken modulo',
    fix: 'use a verifiable source of randomness, such as a randomness oracle with proofs or a commit and reveal scheme, and never a value the block proposer can see or choose'
  },
  {
    id: 'state-write-after-call',
    key: 'stateWriteAfterCall',
    title: 'a write to storage after an external call in the same function',
    basis: ['cei', 'swcReentrancy', 'ethCei', 'owaspUnchecked'],
    own: 'a function that does not only read, with no nonReentrant or similar guard, that writes a state variable (or a storage reference) after a .call, .send or .transfer, a call through a contract type T(x).f(...), or a call on a variable whose type is a contract or an interface (declared in the file, imported by name, or named I and a capital letter); the order of the tokens stands for the order of execution, so a write in an earlier branch is not told apart, and calls in other functions or modifiers are not followed',
    rule: () => 'a state write that comes after an external call in a function with no reentrancy guard',
    fix: 'follow Checks-Effects-Interactions: make every change of state before the external call, or guard the function with a reentrancy lock such as nonReentrant'
  },
  {
    id: 'admin-change-without-event',
    key: 'adminEvent',
    title: 'a change of owner, admin, role or upgrade target with no event',
    basis: ['ethEvents'],
    own: 'a function that writes a state variable whose name holds a word of ADMIN_WORDS (owner, admin, role, operator, implementation and the others of docs/method.md) and has no emit statement in its body; constructors and initializers are left out, and an event emitted by a function it calls is not seen',
    rule: () => 'a write to an owner, admin, role or implementation variable in a function that emits nothing',
    fix: 'emit an event with the old and the new value, such as OwnershipTransferred(previousOwner, newOwner), in the function that makes the change'
  },
  {
    id: 'missing-access-control',
    key: 'accessControl',
    title: 'a public function that changes sensitive state with no visible access control',
    basis: ['ethAccessControl', 'swcUnprotected', 'swcSelfdestruct', 'owaspAccess'],
    own: 'a public or external function of a contract that does not only read, writes a state variable whose name holds a word of SENSITIVE_WORDS or uses selfdestruct or delegatecall, has no modifier named only... or one of AUTH_MODIFIERS, no modifier of the file that checks msg.sender, no require, assert or if on msg.sender and no call of AUTH_CALLS; a note, because a modifier from another file is not read and a function may be open on purpose',
    rule: () => 'a public or external function that changes sensitive state with no access control in sight',
    fix: 'guard the function with an access control modifier such as onlyOwner or onlyRole, or check msg.sender at its start; if it is open on purpose, say so in a comment for the review'
  },
  {
    id: 'upgradeable-initializer',
    key: 'initializer',
    title: 'an upgradeable contract whose initialization is not locked',
    basis: ['ozInitializer', 'ozDisable', 'ozInitializerOnce', 'ozAuthorizeUpgrade'],
    own: 'in a contract that inherits Initializable, UUPSUpgradeable or a base whose name ends in Upgradeable, or uses the initializer modifier: no constructor, or a constructor that does not call _disableInitializers() (abstract contracts are left out); a public or external function named initialize or init... with no initializer or reinitializer modifier; an internal __Name_init function with no onlyInitializing; an _authorizeUpgrade with no access control',
    rule: () => 'an upgradeable contract with no _disableInitializers(), an unguarded initializer or an open _authorizeUpgrade',
    fix: 'add a constructor that calls _disableInitializers(), mark initialize with the initializer modifier and the initializers of parent contracts with onlyInitializing, and guard _authorizeUpgrade with onlyOwner or a role'
  },
  {
    id: 'unbounded-loop',
    key: 'unboundedLoop',
    title: 'a loop over a dynamic array in storage',
    basis: ['loopsGas', 'swcGasLimit', 'owaspDos'],
    own: 'a for loop whose condition, or a while loop whose condition, reads the length of a state variable (or a storage reference) that is an array of no fixed length, or an array held in a mapping, in a function that does not only read; a loop over a parameter in memory or calldata, or up to a fixed number, is not reported; whether the array can grow without bound is not known',
    rule: () => 'a for or while loop up to the length of a dynamic array in storage',
    fix: 'bound the work of one call: process the array in pages with a start and a count, let each party pull its own share, or cap the length of the array'
  },
  {
    id: 'ecrecover-unchecked',
    key: 'ecrecover',
    title: 'ecrecover used directly, with no check for address(0) or for malleable signatures',
    basis: ['ecrecoverZero', 'swcMalleability', 'swcVerification'],
    own: 'a call of ecrecover whose result is not compared with address(0) (when it is assigned, anywhere in the function; else in its statement), or in a file where the upper bound of s, half the order of the curve, is not written; a heuristic: the check may sit in a function the tool does not follow',
    rule: () => 'ecrecover with no address(0) check or no bound on s',
    fix: 'use a reviewed library such as ECDSA.recover of OpenZeppelin, which rejects address(0) and the upper range of s, and never use a signature itself as the key of a processed message'
  },
  {
    id: 'inline-assembly',
    key: 'assembly',
    title: 'an inline assembly block',
    basis: ['assemblyBypasses'],
    own: 'every assembly block in a function or a modifier, with or without the memory-safe flag; a note for the review, because assembly is often needed and correct',
    rule: () => 'an assembly block',
    fix: 'keep assembly small and commented, test it on its own, and ask the review to read it line by line'
  },
  {
    id: 'unchecked-block',
    key: 'uncheckedBlock',
    title: 'an unchecked block',
    basis: ['overflowWraps', 'checkedSince08', 'swcOverflow'],
    own: 'every unchecked block; a note for the review, because unchecked is common and safe when the bounds are proven, such as a loop counter below a length',
    rule: () => 'an unchecked block',
    fix: 'keep in an unchecked block only arithmetic whose bounds are checked just before it, and say why in a comment'
  },
  {
    id: 'hardcoded-address',
    key: 'hardcodedAddress',
    title: 'an address written into the code',
    basis: ['addressLiterals'],
    own: 'a hexadecimal literal of exactly 40 digits outside comments and strings, the zero address left out; a note, because a constant for a well-known address can be right, but it differs from chain to chain and cannot be changed after the deployment',
    rule: () => 'a literal address of 40 hexadecimal digits',
    fix: 'pass the address to the constructor or the initializer and keep it in an immutable or a guarded variable, or name it in one constant with a comment that says which chain it belongs to'
  },
  {
    id: 'unreadable-file',
    key: null,
    title: 'a file that cannot be read',
    basis: ['jsonUtf8', 'jsonRepeatedNames'],
    own: 'a file over its size limit, a binary file, or a file that is not valid UTF-8, or UTF-16 with its byte order mark; nothing in it is checked; this rule cannot be set lower or off',
    rule: () => 'a file that the tool could not read',
    fix: 'save the file as UTF-8; a file larger than the limit can be checked with a larger limit in a run of its own'
  },
  {
    id: 'scan-limit',
    key: null,
    title: 'the input is larger than the limits of a run',
    basis: ['lexical'],
    own: 'a folder with more files, folders or Solidity files than the limits of docs/limits.md, folders nested deeper, or a Solidity file past the limits of the lexer and the outline (tokens, names, nesting); the rest is not read, so the run fails; this rule cannot be set lower or off',
    rule: () => 'a folder or a file past a limit of the run',
    fix: 'exclude the folders that are not contracts of the project, or check the parts of the project in runs of their own'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
