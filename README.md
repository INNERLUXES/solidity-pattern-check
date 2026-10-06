# solidity-pattern-check

Solidity pattern check. Give it the folder of a smart contract project. It reads every Solidity file in it as text,
with a lexer of its own that sets comments and string literals aside, compiles nothing, and lists the risky patterns it
can see in the code: floating or missing version pragmas, pragmas that admit an old compiler, `tx.origin` used to
decide who may act, low-level calls whose success value is not checked, `delegatecall` to an address taken from a
parameter or from storage, `selfdestruct`, values of the block used like random numbers, writes to storage after an
external call, changes of owner, admin, role or upgrade target with no event, public functions that change sensitive
state with no access control in sight, upgradeable contracts whose initialization is not locked, loops over dynamic
arrays in storage, `ecrecover` with no check for `address(0)` or malleable signatures, inline assembly, unchecked
blocks and addresses written into the code. Every finding has its file, line and column, what was found and what to
change, and the run exits with a code a pipeline can act on.

**It is an input to a smart contract review before an audit: not a security audit and not a guarantee that the
contracts are safe.** It is not an auditor. It reads files only: it compiles nothing, runs nothing, deploys nothing,
fetches nothing and reads no clock, so it does not see types across files, the order of execution, the economics of
the protocol or anything that only happens on a chain; the checks are a heuristic. A clean run means only that none of
the forms of its rules were found, and people still have to review and test the contracts, and an audit still has to
read them, before anyone can say they are safe.

Contracts hold money and cannot be changed once they are deployed, so the cheapest time to find a weak pattern is
before the audit starts. The Solidity documentation names the pitfalls
(https://docs.soliditylang.org/en/latest/security-considerations.html), the SWC Registry gives each weakness a number
(https://swcregistry.io/docs/SWC-107), and the OpenZeppelin documentation says how an upgradeable contract locks its
initialization (https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable). Before a team sends its code to
auditors, it needs the list: which contracts, which functions, which lines. This tool writes that list from the files,
on every change.

- **One check per pattern.** Sixteen rules, each with what it looks at, what it cannot see, the public pages it rests
  on and what to change, and two rules of input problems that are always errors.
- **A lexer of its own.** Comments, NatSpec, string, `hex` and `unicode` literals are set aside before any check runs,
  so `tx.origin` in a comment is never a finding; a pragma is read whole as a version expression.
- **An outline, not a compiler.** Contracts, bases, state variables, functions, modifiers, parameters, locals, blocks,
  call options, assembly and unchecked blocks, with every bracket matched once, no recursion and limits of tokens and
  nesting; UTF-8 and UTF-16 by the byte order mark, LF, CRLF and CR line ends.
- Reports as text, JSON, CSV with one row per finding and GitHub workflow annotations, with an exit code for a
  pipeline: `0` no finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 106
pass 104
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (links in the folder to a file and to a folder, a folder and a
configuration named through a link, `/dev/null` named as a folder, and a Solidity file with no read access); they are
guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs
the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install, and no compiler is needed.

```
git clone https://github.com/INNERLUXES/solidity-pattern-check.git
cd solidity-pattern-check
node bin/solidity-pattern-check.js examples/messy --config examples/config.json
```

Or without a clone, in the folder of your own project:

```
npx --yes github:INNERLUXES/solidity-pattern-check .
```

`examples/` holds two made-up projects. `examples/messy/` is the code of a savings club: a vault, a raffle, a second
version of the vault behind a proxy and the interface of a points token. Between them they hold one finding of every
rule. They also hold what must not be reported: patterns in comments and strings, near misses next to each finding, an
installed package under `node_modules`, stand-ins for installed libraries under `lib`, and a folder of mocks the
configuration leaves out. `examples/clean/` is the code of a book swap, with a registry and its upgradeable version,
which passes with no finding. The contracts are minimal illustrations of the patterns, never compiled and not meant to
be deployed, and hold no attack code.

## Usage

```
solidity-pattern-check <folder> [--exclude <pattern>]... [--config <file>] [options]
```

```
--exclude <pattern>       a path of the folder to leave out, relative to it, such as test/** or **/mocks/**;
                          may be given more than once, and adds to exclude of the configuration
--config <file>           settings in strict JSON: include, exclude, rules, minCompiler, minSeverity and failOn
                          (--print-defaults shows them)
--format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

Name one folder, the one that holds the contracts of the project. The paths in the report are relative to the folder
you run the command in, with forward slashes on every system, followed by the line.

The report of the messy example starts with what was read, the configuration, the rules and the findings in one line
each; then every file with its contracts, functions and findings; then the summary; then the count of findings of
every rule; then the findings, errors first, each with what to change:

```
solidity-pattern-check: examples/messy
input: 4 Solidity files; 1 other file passed over; 1 folder named .git or node_modules passed over; 2 paths excluded; 0 links not followed
config: examples/config.json (Brindlewood Savings Club contracts review): include **/*.sol; exclude lib/**, out/**, cache/**, artifacts/** and mocks/**; minimum compiler 0.8.20; minimum severity info; fail on error
rules: floating-pragma (warning); old-compiler (warning); tx-origin-auth (error); unchecked-call (error); delegatecall-untrusted (error); selfdestruct (warning); weak-randomness (warning); state-write-after-call (warning); admin-change-without-event (warning); missing-access-control (info); upgradeable-initializer (warning); unbounded-loop (warning); ecrecover-unchecked (warning); inline-assembly (info); unchecked-block (info); hardcoded-address (info); unreadable-file (error); scan-limit (error)
findings: 23 (5 error, 13 warning, 5 info)

Files (4)

  file                                                  contracts  functions  error  warning  info
  examples/messy/contracts/ClubVault.sol                1          13         2      6        4
  examples/messy/contracts/RaffleDraw.sol               1          4          0      4        0
  examples/messy/contracts/interfaces/IClubToken.sol    1          2          0      0        0
  examples/messy/contracts/upgradeable/ClubVaultV2.sol  1          6          3      3        1

Summary

  files: 4 Solidity, with 3 contracts, 1 interface and 0 libraries
  functions: 25, 16 public or external that change state; modifiers: 1; assembly blocks: 1
  pragma solidity: 2 pinned, 2 floating, 0 missing

Rules (18)

  rule                        level    findings
  floating-pragma             warning  2
  old-compiler                warning  2
  tx-origin-auth              error    1
  unchecked-call              error    2
  delegatecall-untrusted      error    2
  selfdestruct                warning  1
  weak-randomness             warning  1
  state-write-after-call      warning  1
  admin-change-without-event  warning  1
  missing-access-control      info     2
  upgradeable-initializer     warning  3
  unbounded-loop              warning  1
  ecrecover-unchecked         warning  1
  inline-assembly             info     1
  unchecked-block             info     1
  hardcoded-address           info     1
  unreadable-file             error    0
  scan-limit                  error    0

Findings (23)

  ERROR    unchecked-call              examples/messy/contracts/ClubVault.sol:44
           the result of .send in function payBonus of ClubVault is not used, so a failed call goes on as if it worked
           fix: check the success value, such as (bool ok, ) = to.call{value: amount}(""); require(ok, "transfer failed");, or use a library call that reverts on failure

  ERROR    tx-origin-auth              examples/messy/contracts/ClubVault.sol:52
           tx.origin decides who may act in function sweep of ClubVault; a contract the account calls can pass this check in its name
           fix: check msg.sender instead, with an owner or a role, such as require(msg.sender == owner)

  ERROR    delegatecall-untrusted      examples/messy/contracts/upgradeable/ClubVaultV2.sol:33
           delegatecall to target, a parameter of function execute of ClubVaultV2: the caller picks the code that runs with the storage and the balance of this contract
           fix: delegatecall only to a constant or immutable address, or check the target against a list of trusted addresses that only an authorized party can change

  ERROR    unchecked-call              examples/messy/contracts/upgradeable/ClubVaultV2.sol:39
           the success value of .delegatecall in function runPlugin of ClubVaultV2 is left out of the tuple, so a failed call goes on as if it worked
           fix: check the success value, such as (bool ok, ) = to.call{value: amount}(""); require(ok, "transfer failed");, or use a library call that reverts on failure

  ERROR    delegatecall-untrusted      examples/messy/contracts/upgradeable/ClubVaultV2.sol:39
           delegatecall to plugin, a state variable in function runPlugin of ClubVaultV2: whoever can change plugin picks the code that runs with the storage and the balance of this contract
           fix: delegatecall only to a constant or immutable address, or check the target against a list of trusted addresses that only an authorized party can change

  WARNING  floating-pragma             examples/messy/contracts/ClubVault.sol:2
           pragma solidity ^0.8.19 admits more than one compiler version, from 0.8.19 on; the file may be built with a version it was not tested with
           fix: pin the version the contracts were tested with, such as pragma solidity 0.8.24;, and check the list of known compiler bugs for it

  WARNING  old-compiler                examples/messy/contracts/ClubVault.sol:2
           pragma solidity ^0.8.19 admits 0.8.19, below the minimum 0.8.20
           fix: move the code to a recent 0.8 compiler and pin it; below 0.8.0, guard every arithmetic operation with checked arithmetic

  WARNING  state-write-after-call      examples/messy/contracts/ClubVault.sol:40
           function withdraw of ClubVault writes balances at line 40 after the external call .call at line 38; a contract it calls can enter again before the write
           fix: follow Checks-Effects-Interactions: make every change of state before the external call, or guard the function with a reentrancy lock such as nonReentrant

  WARNING  admin-change-without-event  examples/messy/contracts/ClubVault.sol:61
           function setOwner of ClubVault changes owner and emits no event, so a change of who controls the contract leaves no log
           fix: emit an event with the old and the new value, such as OwnershipTransferred(previousOwner, newOwner), in the function that makes the change

  WARNING  unbounded-loop              examples/messy/contracts/ClubVault.sol:69
           the for loop in function payAll of ClubVault runs to members.length, an array in storage that can keep growing
           fix: bound the work of one call: process the array in pages with a start and a count, let each party pull its own share, or cap the length of the array

  WARNING  selfdestruct                examples/messy/contracts/ClubVault.sol:90
           selfdestruct in function closeClub of ClubVault
           fix: remove selfdestruct: it is deprecated, it no longer removes the code on most networks, and in an implementation behind a proxy it can break every proxy; send the balance out with a guarded withdrawal instead

  WARNING  floating-pragma             examples/messy/contracts/RaffleDraw.sol:2
           pragma solidity >=0.7.0 <0.9.0 admits more than one compiler version, from 0.7.0 on; the file may be built with a version it was not tested with
           fix: pin the version the contracts were tested with, such as pragma solidity 0.8.24;, and check the list of known compiler bugs for it

  WARNING  old-compiler                examples/messy/contracts/RaffleDraw.sol:2
           pragma solidity >=0.7.0 <0.9.0 admits 0.7.0, below the minimum 0.8.20; before 0.8.0, arithmetic wraps on overflow and underflow with no revert
           fix: move the code to a recent 0.8 compiler and pin it; below 0.8.0, guard every arithmetic operation with checked arithmetic

  WARNING  weak-randomness             examples/messy/contracts/RaffleDraw.sol:22
           block.timestamp goes into keccak256 in function drawWinner of RaffleDraw; the proposer of the block can see and sway the value
           fix: use a verifiable source of randomness, such as a randomness oracle with proofs or a commit and reveal scheme, and never a value the block proposer can see or choose

  WARNING  ecrecover-unchecked         examples/messy/contracts/RaffleDraw.sol:28
           ecrecover in function claim of RaffleDraw: the result is not compared with address(0), which ecrecover returns for a signature it cannot read; s is not limited to the lower half of the curve order, so a second valid signature can be made from the first
           fix: use a reviewed library such as ECDSA.recover of OpenZeppelin, which rejects address(0) and the upper range of s, and never use a signature itself as the key of a processed message

  WARNING  upgradeable-initializer     examples/messy/contracts/upgradeable/ClubVaultV2.sol:8
           contract ClubVaultV2 inherits Initializable and has no constructor that calls _disableInitializers(), so anyone can initialize its implementation
           fix: add a constructor that calls _disableInitializers(), mark initialize with the initializer modifier and the initializers of parent contracts with onlyInitializing, and guard _authorizeUpgrade with onlyOwner or a role

  WARNING  upgradeable-initializer     examples/messy/contracts/upgradeable/ClubVaultV2.sol:15
           external function initialize of ClubVaultV2 has no initializer or reinitializer modifier, so it can be called again
           fix: add a constructor that calls _disableInitializers(), mark initialize with the initializer modifier and the initializers of parent contracts with onlyInitializing, and guard _authorizeUpgrade with onlyOwner or a role

  WARNING  upgradeable-initializer     examples/messy/contracts/upgradeable/ClubVaultV2.sol:43
           function _authorizeUpgrade of ClubVaultV2 has no access control modifier and no check of msg.sender, so anyone can upgrade the contract
           fix: add a constructor that calls _disableInitializers(), mark initialize with the initializer modifier and the initializers of parent contracts with onlyInitializing, and guard _authorizeUpgrade with onlyOwner or a role

  INFO     hardcoded-address           examples/messy/contracts/ClubVault.sol:12
           the address 0x4242424242424242424242424242424242424242 is written into the code in contract ClubVault; it differs from chain to chain and cannot be changed after the deployment
           fix: pass the address to the constructor or the initializer and keep it in an immutable or a guarded variable, or name it in one constant with a comment that says which chain it belongs to

  INFO     missing-access-control      examples/messy/contracts/ClubVault.sol:65
           external function setFeeCollector of ClubVault changes feeCollector with no access control modifier and no check of msg.sender
           fix: guard the function with an access control modifier such as onlyOwner or onlyRole, or check msg.sender at its start; if it is open on purpose, say so in a comment for the review

  INFO     unchecked-block             examples/messy/contracts/ClubVault.sol:77
           an unchecked block in function sum of ClubVault; arithmetic inside it wraps on overflow and underflow with no revert
           fix: keep in an unchecked block only arithmetic whose bounds are checked just before it, and say why in a comment

  INFO     inline-assembly             examples/messy/contracts/ClubVault.sol:84
           an assembly block in function readSlot of ClubVault; the type checker and the safety checks of Solidity do not reach inside it
           fix: keep assembly small and commented, test it on its own, and ask the review to read it line by line

  INFO     missing-access-control      examples/messy/contracts/upgradeable/ClubVaultV2.sol:38
           external function runPlugin of ClubVaultV2 uses delegatecall with no access control modifier and no check of msg.sender
           fix: guard the function with an access control modifier such as onlyOwner or onlyRole, or check msg.sender at its start; if it is open on purpose, say so in a comment for the review

note: 2 paths matching lib/**, out/**, cache/**, artifacts/** and mocks/** are left out
note: 1 folder named .git or node_modules is passed over

This check reads the Solidity files on disk as text and compiles nothing, runs nothing and fetches nothing; the checks are a heuristic. A finding is a lead with a file and a line for a smart contract review before an audit, and a clean result is not a security audit and not a guarantee that the contracts are safe (docs/limits.md).

RESULT: FAIL - 5 findings at or above error (5 error, 13 warning, 5 info)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  ERROR    tx-origin-auth              examples/messy/contracts/ClubVault.sol:52
           tx.origin decides who may act in function sweep of ClubVault; a contract the account calls can pass this check in its name
           fix: check msg.sender instead, with an owner or a role, such as require(msg.sender == owner)
           rule: tx.origin compared, or used as a key, in a check
           basis: tx.origin is never to be used for authorization: a contract the owner calls can call the wallet in the name of the owner and pass a check on tx.origin (Security Considerations (Solidity documentation), https://docs.soliditylang.org/en/latest/security-considerations.html)
           basis: authorization through tx.origin lets a contract the authorized account calls pass the check; msg.sender is to be used instead (SWC-115 Authorization through tx.origin (Smart Contract Weakness Classification), https://swcregistry.io/docs/SWC-115)
           the tool's own choice: tx.origin on one side of == or != (other than tx.origin == msg.sender, which only tells an account from a contract), or as the key of an index in a require, an assert, an if or a while; tx.origin read for a log or passed on is not reported
```

The clean example passes:

```
solidity-pattern-check: examples/clean
input: 2 Solidity files; 1 other file passed over; 0 folders named .git or node_modules passed over; 0 paths excluded; 0 links not followed
config: built-in defaults: include **/*.sol; exclude lib/**, out/**, cache/** and artifacts/**; minimum compiler 0.8.0; minimum severity info; fail on error
rules: floating-pragma (warning); old-compiler (warning); tx-origin-auth (error); unchecked-call (error); delegatecall-untrusted (error); selfdestruct (warning); weak-randomness (warning); state-write-after-call (warning); admin-change-without-event (warning); missing-access-control (info); upgradeable-initializer (warning); unbounded-loop (warning); ecrecover-unchecked (warning); inline-assembly (info); unchecked-block (info); hardcoded-address (info); unreadable-file (error); scan-limit (error)
findings: 0

Files (2)

  file                                                      contracts  functions  error  warning  info
  examples/clean/contracts/ShelfRegistry.sol                1          5          0      0        0
  examples/clean/contracts/upgradeable/ShelfRegistryV2.sol  1          4          0      0        0

Summary

  files: 2 Solidity, with 2 contracts, 0 interfaces and 0 libraries
  functions: 9, 5 public or external that change state; modifiers: 2; assembly blocks: 0
  pragma solidity: 2 pinned, 0 floating, 0 missing

Rules (18)

  rule                        level    findings
  floating-pragma             warning  0
  old-compiler                warning  0
  tx-origin-auth              error    0
  unchecked-call              error    0
  delegatecall-untrusted      error    0
  selfdestruct                warning  0
  weak-randomness             warning  0
  state-write-after-call      warning  0
  admin-change-without-event  warning  0
  missing-access-control      info     0
  upgradeable-initializer     warning  0
  unbounded-loop              warning  0
  ecrecover-unchecked         warning  0
  inline-assembly             info     0
  unchecked-block             info     0
  hardcoded-address           info     0
  unreadable-file             error    0
  scan-limit                  error    0

Findings (0)

  none

This check reads the Solidity files on disk as text and compiles nothing, runs nothing and fetches nothing; the checks are a heuristic. A finding is a lead with a file and a line for a smart contract review before an audit, and a clean result is not a security audit and not a guarantee that the contracts are safe (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How the files are read

1. The folder is listed with a list of folders of its own and no link followed; every file that an include pattern
   names (`**/*.sol` by default) is read, the folders .git and node_modules are passed over, and `lib`, `out`, `cache`
   and `artifacts` at the top of the folder and the paths of `--exclude` are left out.
2. Each file is decoded by its byte order mark (UTF-8 with or without one, UTF-16 with one) and read once by the lexer
   of src/lexer.js into tokens with their offsets, with every comment and literal set aside and every pragma kept whole.
3. The outline of src/outline.js finds the contracts and their bases, the state variables, the functions and modifiers
   with their parameters, visibility, mutability and modifiers, the locals, the statements, and the blocks, assembly
   blocks and unchecked blocks of every body.
4. The checks of src/analyze.js run over the tokens and the outline, and src/version.js reads the version pragma.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-read-solidity-with-a-lexer-of-its-own-and-compile-nothing.md) says why the files
are read with a lexer of the tool's own and nothing is compiled.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `floating-pragma` | `rules.floatingPragma` | warning | a pragma solidity with ^, ~, a range or a partial version, or none |
| `old-compiler` | `rules.oldCompiler` | warning | a pragma solidity that admits a version below `minCompiler` (0.8.0 by default) |
| `tx-origin-auth` | `rules.txOrigin` | error | tx.origin compared, or used as a key, in a check |
| `unchecked-call` | `rules.uncheckedCall` | error | a .call, .send, .delegatecall or .staticcall whose success value is dropped or never read |
| `delegatecall-untrusted` | `rules.delegatecallTarget` | error | delegatecall to a parameter or a mutable state variable |
| `selfdestruct` | `rules.selfdestruct` | warning | a call of selfdestruct or suicide |
| `weak-randomness` | `rules.weakRandomness` | warning | block.timestamp, block.number, block.prevrandao, block.difficulty or blockhash hashed or taken modulo |
| `state-write-after-call` | `rules.stateWriteAfterCall` | warning | a state write that comes after an external call in a function with no reentrancy guard |
| `admin-change-without-event` | `rules.adminEvent` | warning | a write to an owner, admin, role or implementation variable in a function that emits nothing |
| `missing-access-control` | `rules.accessControl` | info | a public or external function that changes sensitive state with no access control in sight |
| `upgradeable-initializer` | `rules.initializer` | warning | an upgradeable contract with no _disableInitializers(), an unguarded initializer or an open _authorizeUpgrade |
| `unbounded-loop` | `rules.unboundedLoop` | warning | a for or while loop up to the length of a dynamic array in storage |
| `ecrecover-unchecked` | `rules.ecrecover` | warning | ecrecover with no address(0) check or no bound on s |
| `inline-assembly` | `rules.assembly` | info | an assembly block |
| `unchecked-block` | `rules.uncheckedBlock` | info | an unchecked block |
| `hardcoded-address` | `rules.hardcodedAddress` | info | a literal address of 40 hexadecimal digits |
| `unreadable-file` | none | error | a file that cannot be read |
| `scan-limit` | none | error | input past the limits of a run |

The two rules of input problems are always errors. Several rules are heuristics and say so: `weak-randomness`,
`state-write-after-call`, `admin-change-without-event`, `missing-access-control` and `ecrecover-unchecked` read the
form of the code, not what it does. [docs/method.md](docs/method.md) says exactly what each rule looks at and what it
cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public pages each rule
rests on.

## Inputs and excluded paths

| Input | What is read |
| --- | --- |
| `*.sol` | the tokens of every file outside comments and literals |
| `include` | the files to read, as patterns relative to the folder, `**/*.sol` by default |
| `exclude` | paths left out, `lib/**`, `out/**`, `cache/**` and `artifacts/**` by default: installed libraries and build output |
| `--exclude <pattern>` | more paths left out, matched relative to the folder: `*` and `?` stay in one folder, `**` crosses folders, so `test/**` leaves the folder test out |

The folders .git and node_modules are never read, wherever they are. No import is followed and no build file
(`foundry.toml`, `hardhat.config`, `remappings.txt`) is read. [docs/inputs.md](docs/inputs.md) describes every input.

## What is not checked

The tool reads the files it is given and never guesses. It does not:

- compile the code, so the types of expressions, names from other files and inheritance from bases in other files are
  not known;
- run the code, so the order of execution is read from the order of the tokens, and a call or a check in another
  function or a modifier of another file is not followed;
- judge logic or economics: price oracles, flash loans, rounding, the order of transactions and the rules of the
  business are the work of an audit;
- read the deployment: the proxy, the storage layout across versions, the keys that own a contract, the networks;
- read inside assembly beyond `delegatecall` to a parameter and `selfdestruct`;
- read a date or the clock;
- say that a contract is safe: it is not a security audit and not a guarantee that the contracts are safe.

So a clean run means the folder holds none of the forms the rules look for, and every report says so.

## The configuration file

```json
{
  "name": "Brindlewood Savings Club contracts review",
  "exclude": ["lib/**", "out/**", "cache/**", "artifacts/**", "mocks/**"],
  "minCompiler": "0.8.20"
}
```

Every key is optional, and without `--config` the defaults apply. `include` lists the files to read and `exclude` the
paths to leave out, as patterns relative to the folder; `rules` sets the level of each rule (`info`, `warning`,
`error` or `off`); `minCompiler` sets the lowest compiler version a pragma may admit (0.8.0 by default); `minSeverity`
sets the lowest level shown and `failOn` the lowest level that fails the run. A key the tool does not know is an error
with its line and a suggestion, and a key named twice is refused. [docs/inputs.md](docs/inputs.md) describes every
key, and `--print-defaults` writes the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the configuration, the rules, the files, the summary, the count of every rule,
  the findings with the file and line and what to change, the notes, the notice and the result. With `--explain` also
  the rule, the points of the public pages and the tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the files, the summary, the counts per rule,
  every finding with its file, line and column, the totals, the result, the notes and the notice.
- `csv`: one record per finding, ready for a sheet: the level, the rule, the file, the line, the column, what was found
  and what to change, with CRLF line ends as RFC 4180 writes. A field that a spreadsheet could read as a formula gets a
  single quote in front. The start of the messy example:

```
level,rule,file,line,column,found,fix
error,unchecked-call,examples/messy/contracts/ClubVault.sol,44,15,"the result of .send in function payBonus of ClubVault is not used, so a failed call goes on as if it worked","check the success value, such as (bool ok, ) = to.call{value: amount}(""""); require(ok, ""transfer failed"");, or use a library call that reverts on failure"
error,tx-origin-auth,examples/messy/contracts/ClubVault.sol,52,17,tx.origin decides who may act in function sweep of ClubVault; a contract the account calls can pass this check in its name,"check msg.sender instead, with an owner or a role, such as require(msg.sender == owner)"
error,delegatecall-untrusted,examples/messy/contracts/upgradeable/ClubVaultV2.sol,33,48,"delegatecall to target, a parameter of function execute of ClubVaultV2: the caller picks the code that runs with the storage and the balance of this contract","delegatecall only to a constant or immutable address, or check the target against a list of trusted addresses that only an authorized party can change"
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/contracts/ClubVault.sol,line=52,col=17,title=solidity-pattern-check tx-origin-auth::tx.origin decides who may act in function sweep of ClubVault; a contract the account calls can pass this check in its name; fix: check msg.sender instead, with an owner or a role, such as require(msg.sender == owner)
::warning file=examples/messy/contracts/ClubVault.sol,line=40,col=9,title=solidity-pattern-check state-write-after-call::function withdraw of ClubVault writes balances at line 40 after the external call .call at line 38; a contract it calls can enter again before the write; fix: follow Checks-Effects-Interactions: make every change of state before the external call, or guard the function with a reentrancy lock such as nonReentrant
```

There is no SARIF format, as in the other checks of this family; the GitHub annotations show each finding on its line
in a pull request.

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, `tx.origin` used to decide who may act, an unchecked low-level call, a `delegatecall` to a target someone else
can choose, or a file the tool could not read; with `--fail-on warning`, the warnings too. `2`: a usage or input error:
no folder named, two folders named, an unknown option, an option given twice, `--explain` with the csv or github
format, a URL in place of a path, a folder that is a file or is missing, a symbolic link, an `--exclude` pattern that is
not valid, or a configuration with an unknown key, a key named twice or a value of the wrong kind. With exit code `2`
the tool gives no result and prints the problems on standard error.

## Limits

The tool reads files; it fetches nothing and connects to nothing. A run reports the forms of docs/method.md that the
folder holds. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 4 MB for a file, 50,000
files and folders listed, folders nested up to 32 deep, 5,000 Solidity files, 400,000 tokens in a file, names of 1,024
characters, braces nested up to 256 deep, 500 findings listed per rule. [docs/threat-model.md](docs/threat-model.md)
lists the risks of reading these files from a pull request and their controls, and
[docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration, lists the folder, reads every file and builds the report of the run |
| `src/walk.js`, `src/files.js` | the listing of the folder with no link followed, and the bounded reading of files by their byte order mark |
| `src/lexer.js` | the Solidity lexer: comments and literals set aside, pragmas whole, one pass, with limits |
| `src/outline.js` | the outline of a file: contracts, bases, state variables, functions, modifiers, locals, statements and blocks |
| `src/version.js` | the version pragma: comparators, ranges, whether it is pinned and the lowest version it admits |
| `src/analyze.js` | the checks of one file, and the tables of names they compare |
| `src/glob.js` | the path patterns |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/csv.js`, `src/json.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, CSV and GitHub output, the strict JSON reader of the configuration, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| Checks-Effects-Interactions, tx.origin, return values of send and call, loops and gas, unchecked arithmetic, randomness | Solidity documentation, https://docs.soliditylang.org/en/latest/security-considerations.html |
| What a version pragma does | Solidity documentation, https://docs.soliditylang.org/en/latest/layout-of-source-files.html |
| block.timestamp, blockhash, block.prevrandao, ecrecover, the low-level calls and selfdestruct | Solidity documentation, https://docs.soliditylang.org/en/latest/units-and-global-variables.html |
| Checked arithmetic since 0.8.0, and low-level calls that return false | Solidity documentation, https://docs.soliditylang.org/en/latest/control-structures.html |
| Inline assembly bypasses safety checks | Solidity documentation, https://docs.soliditylang.org/en/latest/assembly.html |
| Address literals | Solidity documentation, https://docs.soliditylang.org/en/latest/types.html |
| Known bugs of the compiler by version | Solidity documentation, https://docs.soliditylang.org/en/latest/bugs.html |
| Literals, identifiers and the flags of an assembly block | Solidity documentation, https://docs.soliditylang.org/en/latest/grammar.html |
| Overflow, outdated compilers, floating pragmas, unchecked calls, unprotected withdrawals and selfdestruct, reentrancy, delegatecall, tx.origin, malleable signatures, weak randomness, signature verification, loops and the block gas limit | SWC Registry, https://swcregistry.io/docs/SWC-101 and the entries SWC-102, 103, 104, 105, 106, 107, 112, 115, 117, 120, 122 and 128 next to it |
| Initializers, _disableInitializers and no selfdestruct or delegatecall in an implementation | OpenZeppelin, https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable |
| initializer, reinitializer, onlyInitializing and _authorizeUpgrade | OpenZeppelin, https://docs.openzeppelin.com/contracts/5.x/api/proxy |
| Access control, events for critical actions and Checks-Effects-Interactions | ethereum.org, https://ethereum.org/developers/docs/smart-contracts/security/ |
| The most common weaknesses of smart contracts | OWASP, https://owasp.org/www-project-smart-contract-top-10/ |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

A smart contract holds value and runs as written once it is deployed, so the patterns in its source decide what can go
wrong later: who a check lets through, whether a failed call goes unnoticed, whether a contract can be entered again
before it updates its books, whether an upgradeable contract can be taken over at its first call. These patterns are
read side by side when a team prepares its code for an audit or brings in engineers to build or review it. How such
work is staffed and carried out is described on the page
[Blockchain Development Services](https://innerluxes.dev/blockchain/development).

## License

MIT
