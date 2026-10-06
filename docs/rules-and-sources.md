# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change. The same points are in src/data.js and are shown by `--explain`;
research/sources.md has a longer note on each page. The tool reads the Solidity files on disk as text and compiles
nothing: a point says what a page says, and a finding says what a file holds. The result is an input to a smart
contract review before an audit, not a security audit and not a guarantee that the contracts are safe.

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `floating-pragma` | warning | `swcFloating`, `versionPragma` |
| `old-compiler` | warning | `swcOutdated`, `checkedSince08`, `knownBugs`, `swcOverflow` |
| `tx-origin-auth` | error | `txOriginNever`, `swcTxOrigin` |
| `unchecked-call` | error | `checkReturn`, `lowLevelFalse`, `swcUncheckedCall`, `owaspUnchecked` |
| `delegatecall-untrusted` | error | `swcDelegatecall`, `lowLevelNoChecks`, `ozNoDelegatecall` |
| `selfdestruct` | warning | `selfdestructDeprecated`, `swcSelfdestruct`, `ozNoDelegatecall` |
| `weak-randomness` | warning | `timestampNotRandom`, `randomnessPublic`, `swcRandomness`, `owaspRandomness` |
| `state-write-after-call` | warning | `cei`, `swcReentrancy`, `ethCei`, `owaspUnchecked` |
| `admin-change-without-event` | warning | `ethEvents` |
| `missing-access-control` | info | `ethAccessControl`, `swcUnprotected`, `swcSelfdestruct`, `owaspAccess` |
| `upgradeable-initializer` | warning | `ozInitializer`, `ozDisable`, `ozInitializerOnce`, `ozAuthorizeUpgrade` |
| `unbounded-loop` | warning | `loopsGas`, `swcGasLimit`, `owaspDos` |
| `ecrecover-unchecked` | warning | `ecrecoverZero`, `swcMalleability`, `swcVerification` |
| `inline-assembly` | info | `assemblyBypasses` |
| `unchecked-block` | info | `overflowWraps`, `checkedSince08`, `swcOverflow` |
| `hardcoded-address` | info | `addressLiterals` |
| `unreadable-file` | error, always | `jsonUtf8`, `jsonRepeatedNames` |
| `scan-limit` | error, always | `lexical` |

### `floating-pragma`

A pragma solidity that names more than one version, or none.

- `swcFloating` (SWC-103 Floating Pragma (Smart Contract Weakness Classification)): a contract is to be deployed with the compiler version and flags it was tested with, so the pragma is locked; a floating pragma may be fine for a library others build on.
- `versionPragma` (Layout of a Solidity Source File (Solidity documentation)): a version pragma only makes the compiler refuse versions outside the range it names; with ^ it admits every later version before the next breaking release.

The tool's own choice: a pragma solidity whose expression is anything but one full version with no operator or with =, such as ^0.8.19, >=0.8.0 <0.9.0 or 0.8; a file that declares a contract, an interface, a library or a function and has no pragma solidity; a version expression the tool does not read; a library meant for others may float on purpose, so the rule can be set off for it.

What to change: pin the version the contracts were tested with, such as pragma solidity 0.8.24;, and check the list of known compiler bugs for it.

### `old-compiler`

A pragma that admits a compiler below the minimum.

- `swcOutdated` (SWC-102 Outdated Compiler Version (Smart Contract Weakness Classification)): an outdated compiler version carries bugs that later versions fixed, and a recent version is advised.
- `checkedSince08` (Expressions and Control Structures (Solidity documentation)): since Solidity 0.8.0 arithmetic reverts on overflow and underflow by default, and an unchecked block brings back the wrapping of earlier versions.
- `knownBugs` (List of Known Bugs (Solidity documentation)): the documentation keeps a list of security-relevant bugs of the compiler with the versions each affects, and code built with an old version may carry bugs a later version fixed.
- `swcOverflow` (SWC-101 Integer Overflow and Underflow (Smart Contract Weakness Classification)): an arithmetic operation that passes the largest or the smallest value of its type wraps around, and vetted safe arithmetic is advised throughout.

The tool's own choice: a pragma solidity whose lowest admitted version is below minCompiler (0.8.0 by default, the first version that checks arithmetic); the version the project is built with in its tool settings is not read.

What to change: move the code to a recent 0.8 compiler and pin it; below 0.8.0, guard every arithmetic operation with checked arithmetic.

### `tx-origin-auth`

Tx.origin used to decide who may act.

- `txOriginNever` (Security Considerations (Solidity documentation)): tx.origin is never to be used for authorization: a contract the owner calls can call the wallet in the name of the owner and pass a check on tx.origin.
- `swcTxOrigin` (SWC-115 Authorization through tx.origin (Smart Contract Weakness Classification)): authorization through tx.origin lets a contract the authorized account calls pass the check; msg.sender is to be used instead.

The tool's own choice: tx.origin on one side of == or != (other than tx.origin == msg.sender, which only tells an account from a contract), or as the key of an index in a require, an assert, an if or a while; tx.origin read for a log or passed on is not reported.

What to change: check msg.sender instead, with an owner or a role, such as require(msg.sender == owner).

### `unchecked-call`

A low-level call whose success value is not checked.

- `checkReturn` (Security Considerations (Solidity documentation)): send and the low-level call functions return false instead of throwing when they fail, and their return value is always to be checked.
- `lowLevelFalse` (Expressions and Control Structures (Solidity documentation)): the low-level calls return false as their first value on an exception instead of passing it up, and return true when the called account does not exist.
- `swcUncheckedCall` (SWC-104 Unchecked Call Return Value (Smart Contract Weakness Classification)): when the return value of a message call is not checked, execution goes on after the call fails, and the logic after it can go wrong.
- `owaspUnchecked` (OWASP Smart Contract Top 10 (OWASP)): the OWASP Smart Contract Top 10 lists unchecked external calls and reentrancy attacks among its categories.

The tool's own choice: a .call, .send, .delegatecall or .staticcall as a statement of its own, with its result dropped; a success value left out of the tuple it is assigned to, such as (, bytes memory data); a success value assigned to a name that is never read again in the function; a call inside a require, an if, a return or another expression counts as checked; calls in assembly are not read.

What to change: check the success value, such as (bool ok, ) = to.call{value: amount}(""); require(ok, "transfer failed");, or use a library call that reverts on failure.

### `delegatecall-untrusted`

A delegatecall to an address taken from a parameter or from storage.

- `swcDelegatecall` (SWC-112 Delegatecall to Untrusted Callee (Smart Contract Weakness Classification)): delegatecall runs the code of the target with the storage and the balance of the caller, so a target the user can choose must be checked against a list of trusted addresses.
- `lowLevelNoChecks` (Units and Globally Available Variables (Solidity documentation)): call, delegatecall and staticcall bypass type checking, do not check that the account holds code, and send and transfer are deprecated.
- `ozNoDelegatecall` (Writing Upgradeable Contracts (OpenZeppelin Docs)): an implementation contract avoids selfdestruct and delegatecall, because a direct call to it could destroy it and break every proxy that points at it.

The tool's own choice: x.delegatecall(...) or address(x).delegatecall(...) where x is a parameter of the function or a state variable that is not constant or immutable, and delegatecall(gas, x, ...) in assembly where x is a parameter; a target held in a local variable is not traced.

What to change: delegatecall only to a constant or immutable address, or check the target against a list of trusted addresses that only an authorized party can change.

### `selfdestruct`

Selfdestruct in the code.

- `selfdestructDeprecated` (Units and Globally Available Variables (Solidity documentation)): selfdestruct is deprecated since Solidity 0.8.18, and on networks with the Cancun upgrade it only sends the balance unless it runs in the transaction that created the contract.
- `swcSelfdestruct` (SWC-106 Unprotected SELFDESTRUCT Instruction (Smart Contract Weakness Classification)): a selfdestruct that lacks access control lets anyone remove the contract; the advice is to remove it unless it is needed, and else to guard it well.
- `ozNoDelegatecall` (Writing Upgradeable Contracts (OpenZeppelin Docs)): an implementation contract avoids selfdestruct and delegatecall, because a direct call to it could destroy it and break every proxy that points at it.

The tool's own choice: a call of selfdestruct or of its old name suicide, in Solidity or in assembly, whatever guards it; whether the caller is checked is the business of missing-access-control.

What to change: remove selfdestruct: it is deprecated, it no longer removes the code on most networks, and in an implementation behind a proxy it can break every proxy; send the balance out with a guarded withdrawal instead.

### `weak-randomness`

A value of the block used like a random number.

- `timestampNotRandom` (Units and Globally Available Variables (Solidity documentation)): block.timestamp and blockhash are not to be relied on as a source of randomness; blockhash is only known for the last 256 blocks and block.prevrandao replaces block.difficulty.
- `randomnessPublic` (Security Considerations (Solidity documentation)): everything a contract uses is public, and block builders can sway values a contract might use as a source of randomness.
- `swcRandomness` (SWC-120 Weak Sources of Randomness from Chain Attributes (Smart Contract Weakness Classification)): block.timestamp, blockhash, block.difficulty and block.number are weak sources of randomness because the producers of blocks can choose or influence them.
- `owaspRandomness` (OWASP Smart Contract Top 10 (OWASP)): the OWASP Smart Contract Top 10 lists insecure randomness and integer overflow and underflow among its categories.

The tool's own choice: block.timestamp, block.number, block.prevrandao, block.difficulty or blockhash inside the arguments of keccak256, sha256, sha3 or ripemd160, or in a statement that uses % (modulo); a heuristic: a deadline check such as block.timestamp >= end is not reported, and a % on a time span is.

What to change: use a verifiable source of randomness, such as a randomness oracle with proofs or a commit and reveal scheme, and never a value the block proposer can see or choose.

### `state-write-after-call`

A write to storage after an external call in the same function.

- `cei` (Security Considerations (Solidity documentation)): a call to another contract hands it control, and it can call back before the first call ends; the Checks-Effects-Interactions pattern does every check, then every change of state, and only then calls other contracts.
- `swcReentrancy` (SWC-107 Reentrancy (Smart Contract Weakness Classification)): a call to another contract can let it take over the flow and call back before the first function ends; the fixes are to change all state before the call, or a reentrancy lock.
- `ethCei` (Smart contract security (ethereum.org)): checks first, then the changes of state, then the calls to other contracts, removes the reentrancy condition; a lock is a second guard.
- `owaspUnchecked` (OWASP Smart Contract Top 10 (OWASP)): the OWASP Smart Contract Top 10 lists unchecked external calls and reentrancy attacks among its categories.

The tool's own choice: a function that does not only read, with no nonReentrant or similar guard, that writes a state variable (or a storage reference) after a .call, .send or .transfer, a call through a contract type T(x).f(...), or a call on a variable whose type is a contract or an interface (declared in the file, imported by name, or named I and a capital letter); the order of the tokens stands for the order of execution, so a write in an earlier branch is not told apart, and calls in other functions or modifiers are not followed.

What to change: follow Checks-Effects-Interactions: make every change of state before the external call, or guard the function with a reentrancy lock such as nonReentrant.

### `admin-change-without-event`

A change of owner, admin, role or upgrade target with no event.

- `ethEvents` (Smart contract security (ethereum.org)): a contract emits an event whenever a party takes a safety-critical action, so that the action can be tracked and a team can react fast.

The tool's own choice: a function that writes a state variable whose name holds a word of ADMIN_WORDS (owner, admin, role, operator, implementation and the others of docs/method.md) and has no emit statement in its body; constructors and initializers are left out, and an event emitted by a function it calls is not seen.

What to change: emit an event with the old and the new value, such as OwnershipTransferred(previousOwner, newOwner), in the function that makes the change.

### `missing-access-control`

A public function that changes sensitive state with no visible access control.

- `ethAccessControl` (Smart contract security (ethereum.org)): access control comes first: an owner set at creation with an onlyOwner modifier on the protected functions, or roles shared among several trusted parties.
- `swcUnprotected` (SWC-105 Unprotected Ether Withdrawal (Smart Contract Weakness Classification)): missing or weak access control lets anyone take Ether out of a contract; withdrawals are to be limited to authorized parties.
- `swcSelfdestruct` (SWC-106 Unprotected SELFDESTRUCT Instruction (Smart Contract Weakness Classification)): a selfdestruct that lacks access control lets anyone remove the contract; the advice is to remove it unless it is needed, and else to guard it well.
- `owaspAccess` (OWASP Smart Contract Top 10 (OWASP)): the OWASP Smart Contract Top 10 lists access control vulnerabilities as its first category.

The tool's own choice: a public or external function of a contract that does not only read, writes a state variable whose name holds a word of SENSITIVE_WORDS or uses selfdestruct or delegatecall, has no modifier named only... or one of AUTH_MODIFIERS, no modifier of the file that checks msg.sender, no require, assert or if on msg.sender and no call of AUTH_CALLS; a note, because a modifier from another file is not read and a function may be open on purpose.

What to change: guard the function with an access control modifier such as onlyOwner or onlyRole, or check msg.sender at its start; if it is open on purpose, say so in a comment for the review.

### `upgradeable-initializer`

An upgradeable contract whose initialization is not locked.

- `ozInitializer` (Writing Upgradeable Contracts (OpenZeppelin Docs)): an upgradeable contract uses an initializer function in place of a constructor, guarded by the initializer modifier so that it runs once, with onlyInitializing on the initializers of parent contracts.
- `ozDisable` (Writing Upgradeable Contracts (OpenZeppelin Docs)): the constructor of an implementation calls _disableInitializers() so that no one can initialize the implementation contract itself.
- `ozInitializerOnce` (Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs)): initializer lets a function run at most once, reinitializer runs a later step once for each version, and _disableInitializers in the constructor locks the contract against any initialization.
- `ozAuthorizeUpgrade` (Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs)): a UUPS contract overrides _authorizeUpgrade with an access control modifier such as onlyOwner, so that only an authorized party can upgrade it.

The tool's own choice: in a contract that inherits Initializable, UUPSUpgradeable or a base whose name ends in Upgradeable, or uses the initializer modifier: no constructor, or a constructor that does not call _disableInitializers() (abstract contracts are left out); a public or external function named initialize or init... with no initializer or reinitializer modifier; an internal __Name_init function with no onlyInitializing; an _authorizeUpgrade with no access control.

What to change: add a constructor that calls _disableInitializers(), mark initialize with the initializer modifier and the initializers of parent contracts with onlyInitializing, and guard _authorizeUpgrade with onlyOwner or a role.

### `unbounded-loop`

A loop over a dynamic array in storage.

- `loopsGas` (Security Considerations (Solidity documentation)): loops with no fixed number of iterations, such as loops that depend on values in storage, can grow past the gas limit of a block and stall the contract.
- `swcGasLimit` (SWC-128 DoS With Block Gas Limit (Smart Contract Weakness Classification)): a loop over a data structure of unknown size can grow past the block gas limit, so work on large arrays is to be split over several transactions.
- `owaspDos` (OWASP Smart Contract Top 10 (OWASP)): the OWASP Smart Contract Top 10 lists denial of service attacks among its categories.

The tool's own choice: a for loop whose condition, or a while loop whose condition, reads the length of a state variable (or a storage reference) that is an array of no fixed length, or an array held in a mapping, in a function that does not only read; a loop over a parameter in memory or calldata, or up to a fixed number, is not reported; whether the array can grow without bound is not known.

What to change: bound the work of one call: process the array in pages with a start and a count, let each party pull its own share, or cap the length of the array.

### `ecrecover-unchecked`

Ecrecover used directly, with no check for address(0) or for malleable signatures.

- `ecrecoverZero` (Units and Globally Available Variables (Solidity documentation)): ecrecover returns zero on error, a valid signature can be turned into a different valid signature without the private key, and a wrapper such as the ECDSA library of OpenZeppelin is advised.
- `swcMalleability` (SWC-117 Signature Malleability (Smart Contract Weakness Classification)): a signature can be changed into another valid one without the private key, so a signature must never be the key that marks a message as processed.
- `swcVerification` (SWC-122 Lack of Proper Signature Verification (Smart Contract Weakness Classification)): a contract that acts on signed messages must recover and verify the signer with ecrecover rather than trust another sign.

The tool's own choice: a call of ecrecover whose result is not compared with address(0) (when it is assigned, anywhere in the function; else in its statement), or in a file where the upper bound of s, half the order of the curve, is not written; a heuristic: the check may sit in a function the tool does not follow.

What to change: use a reviewed library such as ECDSA.recover of OpenZeppelin, which rejects address(0) and the upper range of s, and never use a signature itself as the key of a processed message.

### `inline-assembly`

An inline assembly block.

- `assemblyBypasses` (Inline Assembly (Solidity documentation)): inline assembly works close to the virtual machine and bypasses several important safety features and checks of Solidity, so it is for cases where it is needed and well understood.

The tool's own choice: every assembly block in a function or a modifier, with or without the memory-safe flag; a note for the review, because assembly is often needed and correct.

What to change: keep assembly small and commented, test it on its own, and ask the review to read it line by line.

### `unchecked-block`

An unchecked block.

- `overflowWraps` (Security Considerations (Solidity documentation)): arithmetic is checked by default and reverts on overflow, but an unchecked block wraps silently, so no one should assume they are protected from overflow bugs.
- `checkedSince08` (Expressions and Control Structures (Solidity documentation)): since Solidity 0.8.0 arithmetic reverts on overflow and underflow by default, and an unchecked block brings back the wrapping of earlier versions.
- `swcOverflow` (SWC-101 Integer Overflow and Underflow (Smart Contract Weakness Classification)): an arithmetic operation that passes the largest or the smallest value of its type wraps around, and vetted safe arithmetic is advised throughout.

The tool's own choice: every unchecked block; a note for the review, because unchecked is common and safe when the bounds are proven, such as a loop counter below a length.

What to change: keep in an unchecked block only arithmetic whose bounds are checked just before it, and say why in a comment.

### `hardcoded-address`

An address written into the code.

- `addressLiterals` (Types (Solidity documentation)): a hexadecimal literal of 40 digits that passes the checksum test is of type address, and an address can be converted to address payable to send it Ether.

The tool's own choice: a hexadecimal literal of exactly 40 digits outside comments and strings, the zero address left out; a note, because a constant for a well-known address can be right, but it differs from chain to chain and cannot be changed after the deployment.

What to change: pass the address to the constructor or the initializer and keep it in an immutable or a guarded variable, or name it in one constant with a comment that says which chain it belongs to.

### `unreadable-file`

A file that cannot be read.

- `jsonUtf8` (RFC 8259, The JSON Data Interchange Format): JSON text exchanged between systems must be UTF-8.
- `jsonRepeatedNames` (RFC 8259, The JSON Data Interchange Format): when an object repeats a name the behavior of the software that reads it cannot be predicted, so the JSON reader of this tool refuses a repeated name.

The tool's own choice: a file over its size limit, a binary file, or a file that is not valid UTF-8, or UTF-16 with its byte order mark; nothing in it is checked; this rule cannot be set lower or off.

What to change: save the file as UTF-8; a file larger than the limit can be checked with a larger limit in a run of its own.

### `scan-limit`

The input is larger than the limits of a run.

- `lexical` (Language Grammar (Solidity documentation)): the grammar defines string literals in double or single quotes with escapes, unicode and hex string literals, identifiers of letters, digits, $ and _, and the flags and dialect of an assembly block.

The tool's own choice: a folder with more files, folders or Solidity files than the limits of docs/limits.md, folders nested deeper, or a Solidity file past the limits of the lexer and the outline (tokens, names, nesting); the rest is not read, so the run fails; this rule cannot be set lower or off.

What to change: exclude the folders that are not contracts of the project, or check the parts of the project in runs of their own.

## The points

| Point | Page | What it says |
| --- | --- | --- |
| `cei` | Security Considerations (Solidity documentation) | a call to another contract hands it control, and it can call back before the first call ends; the Checks-Effects-Interactions pattern does every check, then every change of state, and only then calls other contracts |
| `txOriginNever` | Security Considerations (Solidity documentation) | tx.origin is never to be used for authorization: a contract the owner calls can call the wallet in the name of the owner and pass a check on tx.origin |
| `checkReturn` | Security Considerations (Solidity documentation) | send and the low-level call functions return false instead of throwing when they fail, and their return value is always to be checked |
| `loopsGas` | Security Considerations (Solidity documentation) | loops with no fixed number of iterations, such as loops that depend on values in storage, can grow past the gas limit of a block and stall the contract |
| `overflowWraps` | Security Considerations (Solidity documentation) | arithmetic is checked by default and reverts on overflow, but an unchecked block wraps silently, so no one should assume they are protected from overflow bugs |
| `randomnessPublic` | Security Considerations (Solidity documentation) | everything a contract uses is public, and block builders can sway values a contract might use as a source of randomness |
| `versionPragma` | Layout of a Solidity Source File (Solidity documentation) | a version pragma only makes the compiler refuse versions outside the range it names; with ^ it admits every later version before the next breaking release |
| `timestampNotRandom` | Units and Globally Available Variables (Solidity documentation) | block.timestamp and blockhash are not to be relied on as a source of randomness; blockhash is only known for the last 256 blocks and block.prevrandao replaces block.difficulty |
| `ecrecoverZero` | Units and Globally Available Variables (Solidity documentation) | ecrecover returns zero on error, a valid signature can be turned into a different valid signature without the private key, and a wrapper such as the ECDSA library of OpenZeppelin is advised |
| `lowLevelNoChecks` | Units and Globally Available Variables (Solidity documentation) | call, delegatecall and staticcall bypass type checking, do not check that the account holds code, and send and transfer are deprecated |
| `selfdestructDeprecated` | Units and Globally Available Variables (Solidity documentation) | selfdestruct is deprecated since Solidity 0.8.18, and on networks with the Cancun upgrade it only sends the balance unless it runs in the transaction that created the contract |
| `checkedSince08` | Expressions and Control Structures (Solidity documentation) | since Solidity 0.8.0 arithmetic reverts on overflow and underflow by default, and an unchecked block brings back the wrapping of earlier versions |
| `lowLevelFalse` | Expressions and Control Structures (Solidity documentation) | the low-level calls return false as their first value on an exception instead of passing it up, and return true when the called account does not exist |
| `assemblyBypasses` | Inline Assembly (Solidity documentation) | inline assembly works close to the virtual machine and bypasses several important safety features and checks of Solidity, so it is for cases where it is needed and well understood |
| `addressLiterals` | Types (Solidity documentation) | a hexadecimal literal of 40 digits that passes the checksum test is of type address, and an address can be converted to address payable to send it Ether |
| `knownBugs` | List of Known Bugs (Solidity documentation) | the documentation keeps a list of security-relevant bugs of the compiler with the versions each affects, and code built with an old version may carry bugs a later version fixed |
| `lexical` | Language Grammar (Solidity documentation) | the grammar defines string literals in double or single quotes with escapes, unicode and hex string literals, identifiers of letters, digits, $ and _, and the flags and dialect of an assembly block |
| `swcOverflow` | SWC-101 Integer Overflow and Underflow (Smart Contract Weakness Classification) | an arithmetic operation that passes the largest or the smallest value of its type wraps around, and vetted safe arithmetic is advised throughout |
| `swcOutdated` | SWC-102 Outdated Compiler Version (Smart Contract Weakness Classification) | an outdated compiler version carries bugs that later versions fixed, and a recent version is advised |
| `swcFloating` | SWC-103 Floating Pragma (Smart Contract Weakness Classification) | a contract is to be deployed with the compiler version and flags it was tested with, so the pragma is locked; a floating pragma may be fine for a library others build on |
| `swcUncheckedCall` | SWC-104 Unchecked Call Return Value (Smart Contract Weakness Classification) | when the return value of a message call is not checked, execution goes on after the call fails, and the logic after it can go wrong |
| `swcUnprotected` | SWC-105 Unprotected Ether Withdrawal (Smart Contract Weakness Classification) | missing or weak access control lets anyone take Ether out of a contract; withdrawals are to be limited to authorized parties |
| `swcSelfdestruct` | SWC-106 Unprotected SELFDESTRUCT Instruction (Smart Contract Weakness Classification) | a selfdestruct that lacks access control lets anyone remove the contract; the advice is to remove it unless it is needed, and else to guard it well |
| `swcReentrancy` | SWC-107 Reentrancy (Smart Contract Weakness Classification) | a call to another contract can let it take over the flow and call back before the first function ends; the fixes are to change all state before the call, or a reentrancy lock |
| `swcDelegatecall` | SWC-112 Delegatecall to Untrusted Callee (Smart Contract Weakness Classification) | delegatecall runs the code of the target with the storage and the balance of the caller, so a target the user can choose must be checked against a list of trusted addresses |
| `swcTxOrigin` | SWC-115 Authorization through tx.origin (Smart Contract Weakness Classification) | authorization through tx.origin lets a contract the authorized account calls pass the check; msg.sender is to be used instead |
| `swcMalleability` | SWC-117 Signature Malleability (Smart Contract Weakness Classification) | a signature can be changed into another valid one without the private key, so a signature must never be the key that marks a message as processed |
| `swcVerification` | SWC-122 Lack of Proper Signature Verification (Smart Contract Weakness Classification) | a contract that acts on signed messages must recover and verify the signer with ecrecover rather than trust another sign |
| `swcRandomness` | SWC-120 Weak Sources of Randomness from Chain Attributes (Smart Contract Weakness Classification) | block.timestamp, blockhash, block.difficulty and block.number are weak sources of randomness because the producers of blocks can choose or influence them |
| `swcGasLimit` | SWC-128 DoS With Block Gas Limit (Smart Contract Weakness Classification) | a loop over a data structure of unknown size can grow past the block gas limit, so work on large arrays is to be split over several transactions |
| `ozInitializer` | Writing Upgradeable Contracts (OpenZeppelin Docs) | an upgradeable contract uses an initializer function in place of a constructor, guarded by the initializer modifier so that it runs once, with onlyInitializing on the initializers of parent contracts |
| `ozDisable` | Writing Upgradeable Contracts (OpenZeppelin Docs) | the constructor of an implementation calls _disableInitializers() so that no one can initialize the implementation contract itself |
| `ozNoDelegatecall` | Writing Upgradeable Contracts (OpenZeppelin Docs) | an implementation contract avoids selfdestruct and delegatecall, because a direct call to it could destroy it and break every proxy that points at it |
| `ozAuthorizeUpgrade` | Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs) | a UUPS contract overrides _authorizeUpgrade with an access control modifier such as onlyOwner, so that only an authorized party can upgrade it |
| `ozInitializerOnce` | Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs) | initializer lets a function run at most once, reinitializer runs a later step once for each version, and _disableInitializers in the constructor locks the contract against any initialization |
| `ethAccessControl` | Smart contract security (ethereum.org) | access control comes first: an owner set at creation with an onlyOwner modifier on the protected functions, or roles shared among several trusted parties |
| `ethEvents` | Smart contract security (ethereum.org) | a contract emits an event whenever a party takes a safety-critical action, so that the action can be tracked and a team can react fast |
| `ethCei` | Smart contract security (ethereum.org) | checks first, then the changes of state, then the calls to other contracts, removes the reentrancy condition; a lock is a second guard |
| `owaspAccess` | OWASP Smart Contract Top 10 (OWASP) | the OWASP Smart Contract Top 10 lists access control vulnerabilities as its first category |
| `owaspUnchecked` | OWASP Smart Contract Top 10 (OWASP) | the OWASP Smart Contract Top 10 lists unchecked external calls and reentrancy attacks among its categories |
| `owaspRandomness` | OWASP Smart Contract Top 10 (OWASP) | the OWASP Smart Contract Top 10 lists insecure randomness and integer overflow and underflow among its categories |
| `owaspDos` | OWASP Smart Contract Top 10 (OWASP) | the OWASP Smart Contract Top 10 lists denial of service attacks among its categories |
| `csvRecords` | RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice |
| `csvInjection` | CSV Injection (OWASP) | a spreadsheet may read a cell that starts with =, +, -, @, a tab, a carriage return or a line feed as a formula, and no one escape is safe in every program that opens the file |
| `jsonUtf8` | RFC 8259, The JSON Data Interchange Format | JSON text exchanged between systems must be UTF-8 |
| `jsonRepeatedNames` | RFC 8259, The JSON Data Interchange Format | when an object repeats a name the behavior of the software that reads it cannot be predicted, so the JSON reader of this tool refuses a repeated name |
| `githubAnnotations` | Workflow commands for GitHub Actions (GitHub Docs) | a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run |

## The pages

| Page | Address |
| --- | --- |
| Security Considerations (Solidity documentation) | https://docs.soliditylang.org/en/latest/security-considerations.html |
| Layout of a Solidity Source File (Solidity documentation) | https://docs.soliditylang.org/en/latest/layout-of-source-files.html |
| Units and Globally Available Variables (Solidity documentation) | https://docs.soliditylang.org/en/latest/units-and-global-variables.html |
| Expressions and Control Structures (Solidity documentation) | https://docs.soliditylang.org/en/latest/control-structures.html |
| Inline Assembly (Solidity documentation) | https://docs.soliditylang.org/en/latest/assembly.html |
| Types (Solidity documentation) | https://docs.soliditylang.org/en/latest/types.html |
| List of Known Bugs (Solidity documentation) | https://docs.soliditylang.org/en/latest/bugs.html |
| Language Grammar (Solidity documentation) | https://docs.soliditylang.org/en/latest/grammar.html |
| SWC-101 Integer Overflow and Underflow (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-101 |
| SWC-102 Outdated Compiler Version (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-102 |
| SWC-103 Floating Pragma (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-103 |
| SWC-104 Unchecked Call Return Value (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-104 |
| SWC-105 Unprotected Ether Withdrawal (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-105 |
| SWC-106 Unprotected SELFDESTRUCT Instruction (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-106 |
| SWC-107 Reentrancy (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-107 |
| SWC-112 Delegatecall to Untrusted Callee (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-112 |
| SWC-115 Authorization through tx.origin (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-115 |
| SWC-117 Signature Malleability (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-117 |
| SWC-120 Weak Sources of Randomness from Chain Attributes (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-120 |
| SWC-122 Lack of Proper Signature Verification (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-122 |
| SWC-128 DoS With Block Gas Limit (Smart Contract Weakness Classification) | https://swcregistry.io/docs/SWC-128 |
| Writing Upgradeable Contracts (OpenZeppelin Docs) | https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable |
| Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs) | https://docs.openzeppelin.com/contracts/5.x/api/proxy |
| Smart contract security (ethereum.org) | https://ethereum.org/developers/docs/smart-contracts/security/ |
| OWASP Smart Contract Top 10 (OWASP) | https://owasp.org/www-project-smart-contract-top-10/ |
| RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | https://www.rfc-editor.org/rfc/rfc4180 |
| RFC 8259, The JSON Data Interchange Format | https://www.rfc-editor.org/rfc/rfc8259 |
| CSV Injection (OWASP) | https://community.owasp.org/attacks/CSV_Injection |
| Workflow commands for GitHub Actions (GitHub Docs) | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
