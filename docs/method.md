# Method

This document says exactly what the tool reads, how it reads a Solidity file, how it finds contracts, functions and
their scopes, what each rule looks at and cannot see, and how the report is built. The names used here are the
defaults; docs/inputs.md says how the configuration changes them. The tool reads the Solidity files of a project on
disk as text and compiles nothing; its checks are a heuristic. Its result is an input to a smart contract review before
an audit, not a security audit and not a guarantee that the contracts are safe: a finding points at a line that needs
a look, and a clean run says only that the folder holds none of the forms below.

## What is read

The input is one folder. It is listed with a list of folders of the tool's own, with no recursion (src/walk.js), in the
order of the names. Every file whose path, relative to the folder, matches an include pattern (`**/*.sol` by default)
and no exclude pattern is read; paths and patterns are compared in lowercase, so `Vault.SOL` is read too. The default
exclude patterns leave out the folders `lib`, `out`, `cache` and `artifacts` at the top of the folder: Foundry keeps
installed libraries in `lib` and build output in `out` and `cache`, and Hardhat keeps build output in `artifacts` and
`cache`. The folders .git and node_modules are counted and passed over wherever they are, in any case of letters,
because they hold history and installed packages, not the contracts of the project. A symbolic link (or a junction on
Windows) is counted and never followed.

Each file is read once (src/files.js), decoded by its byte order mark: UTF-16 little or big endian with one, UTF-8 with
or without one. A file that holds a null byte, bytes that are not valid UTF-8, or more than 4 MB is an
`unreadable-file` finding and nothing in it is checked. Lines end at LF, CRLF or CR, and every finding has the line
and column of the token it is about.

## The lexer

src/lexer.js is a Solidity lexer of the tool's own. It reads the text once, left to right, and turns it into tokens
with their offsets, so that no check ever looks inside a comment or a literal:

- a line comment (`//`, and the NatSpec `///`) runs to the end of its line, at LF or CR, and a block comment (`/* */`,
  and the NatSpec `/** */`) to its `*/`; neither gives a token, so `tx.origin` in a comment is never read;
- a string literal in double or single quotes, with its backslash escapes, is one token with no text, and so are
  `hex"..."` and `unicode"..."` literals; a string that is not closed ends at the end of its line, as the compiler
  would refuse it, and a comment that is not closed runs to the end of the file;
- a `pragma` is one token with its raw text up to the semicolon, runs of white space read as one space, because a
  version such as `^0.8.19` is not an expression;
- a number keeps its text: a decimal number with `_`, `.` and an exponent, or a hexadecimal number after `0x`, which
  is how an address literal of 40 hexadecimal digits is found;
- an identifier is a run of letters, digits, `$` and `_` that does not start with a digit, as the grammar of the
  language writes it, and keeps its name;
- the operators of Solidity and of Yul are read longest first (`>>>=` before `>>=` before `>>`), and every other ASCII
  character is a punctuation token of its own; a character outside ASCII outside a literal is a token with no text.

`blankText` gives the same text with every comment and literal replaced by spaces, line ends kept, for anyone who wants
to see what the checks see. The lexer never fails on what it reads; it stops only at its limits of tokens and of the
length of a name or a number (docs/limits.md), with a `scan-limit` finding at the place.

## The outline

src/outline.js builds the light structure the checks need from the tokens, with a stack of the tool's own and no
recursion. Every bracket is matched once for the whole file (`brackets`), so a check jumps from an opening bracket to
its closing one in one step.

- At the top of a file it reads the pragmas, the names an `import` brings in (`{A, B as C}`, `as Name`), and every
  `contract`, `abstract contract`, `interface` and `library` with its name and the names of its bases after `is`. A
  `struct`, an `enum`, an `error`, an `event` and a constant of the file are passed over, and so is a function of the
  file, which is read like the functions of a contract with no contract around it.
- Inside a contract it reads every state variable up to its semicolon: its name, the first word of its type, whether
  it is a mapping, an array or a value, whether it can grow (an array with `[]`, or a mapping whose values are such
  arrays) and whether it is `constant` or `immutable`. It reads every `function`, `constructor`, `modifier`,
  `fallback` and `receive` header: the name, the parameters with their type, data location and name, the visibility,
  the mutability (`constant` on an old function reads as `view`), `virtual`, and every modifier with its arguments,
  `override(...)` and `returns (...)` left out. A function with no body ends at its semicolon. The old fallback
  function `function()` is read as a function named fallback.
- Inside a body every brace is one of four kinds: a block, an `unchecked` block, an `assembly` block (after the word
  `assembly`, its dialect string and its flags such as `("memory-safe")`), or the brace of an expression: call options
  such as `{value: amount}`, named arguments and struct literals, which are braces inside parentheses or followed by a
  name and a colon. Every token of a body gets the number of its statement: a statement ends at a semicolon outside
  parentheses, so the header of a `for` loop stays one statement, and at the brace of a block. Every token inside an
  assembly block is marked, and the checks of Solidity code pass over them.
- The local variables of a function are the statements that start with a type (a name, perhaps with `.Name` parts,
  `[]` or `[n]` after it, and `address payable`), an optional data location and a name followed by `=` or `;`.

A contract in the same file is a base when its name is listed after `is`, and a contract sees the state variables of
its bases declared in the same file. A base declared in another file is not read.

## The rules

### `floating-pragma`

Every `pragma solidity` is read by src/version.js as the documentation writes a version expression: comparators with
`^`, `~`, `>=`, `>`, `<=`, `<` or `=`, a range `a - b`, sets joined by `||`, and versions such as `0.8.19`, `0.8` or
`0.8.x`. The pragma is pinned when it names one full version with no operator or with `=`; anything else is reported,
and so is an expression the tool does not read. A file that declares a contract, an interface, a library or a function
and has no `pragma solidity` is reported at its first declaration. A library meant for others may float on purpose, as
the SWC entry says; set the rule off for it. The tool does not read the version the project is built with in
`foundry.toml` or `hardhat.config`, only the pragma.

### `old-compiler`

The lowest version a pragma admits is worked out: the highest lower bound of each set of comparators (`^0.8.19` and
`>=0.8.19` give 0.8.19, `>0.8.1` gives 0.8.2, `>0.7` gives 0.8.0, `<0.9.0` alone gives 0.0.0), and the lowest of the
sets. When it is below `minCompiler` (0.8.0 by default) the pragma is reported, and the message says that arithmetic
wraps when the version is below 0.8.0, the first version that checks arithmetic. The known bugs of a version are not
looked up; the list of the documentation names them.

### `tx-origin-auth`

`tx.origin` (outside assembly, and not a member of something else) is reported when it is on one side of `==` or `!=`,
unless the other side is `msg.sender`: `tx.origin == msg.sender` only tells an account from a contract and does not
decide who the caller is. It is also reported as the key of an index (`allowed[tx.origin]`) in a statement that starts
with `require`, `assert`, `if` or `while`. `tx.origin` read for a log, stored, or used as a key outside a check, is not
reported. Modifiers are read like functions, so a check in a modifier is found.

### `unchecked-call`

Every `.call`, `.send`, `.delegatecall` and `.staticcall` with its arguments (and the call options of `call`,
`delegatecall` and `staticcall`) outside assembly is looked at in its statement:

- a call that is a statement of its own, outside any parentheses and with no `=` before it, has its result dropped;
- a call assigned to a tuple whose first slot is empty, such as `(, bytes memory data) = ...`, leaves its success
  value out;
- a call assigned to a name, `(bool ok, ) = ...` or `bool sent = ...`, is reported when that name is never read after
  the call in the function.

A call inside the parentheses of `require`, `if`, another call or any expression counts as checked, and so does a call
after `return`, which hands the result on. `.transfer` reverts on failure and is not reported. A low-level call in
assembly is not read. An interface function that happens to be named `send` is read as `.send` (a heuristic).

### `delegatecall-untrusted`

`x.delegatecall(...)` and `address(x).delegatecall(...)` are reported when `x` is a parameter of the function, or a
state variable of the contract (or of a base in the file) that is neither `constant` nor `immutable`. In assembly,
`delegatecall(gas, x, ...)` is reported when `x` is a parameter. A target held in a local variable is not traced back,
and `address(this)` is not reported. Whether the parameter or the variable is checked against a list before the call
is not seen.

### `selfdestruct`

Every call of `selfdestruct` or of its old name `suicide`, in Solidity or in assembly, that is not a member of
something else. The rule says only that it is there; whether the caller is checked is the business of
`missing-access-control`.

### `weak-randomness`

`block.timestamp`, `block.number`, `block.prevrandao`, `block.difficulty`, `blockhash(...)` and the old
`block.blockhash(...)` are reported when they sit inside the arguments of `keccak256`, `sha256`, `sha3` or
`ripemd160`, or in a statement that uses `%`. One finding is given for each statement. It is a heuristic: a deadline
such as `block.timestamp >= end` is not reported, and a `%` on a span of time is. The old `now` and the Yul builtins
`timestamp()` and `number()` are not read.

### `state-write-after-call`

A function that does not only read (not `view` or `pure`), with no modifier of GUARD_MODIFIERS (`nonReentrant`,
`noReentrancy`, `nonReentrantView`, `lock`, `mutex`, `reentrancyGuard`), is reported when it writes to storage after
its first external call. An external call is:

- a `.call`, `.send` or `.transfer` (a `.delegatecall` runs in this contract, and a `.staticcall` cannot change state);
- a call through a contract type, `T(x).f(...)`, where `T` is a contract or an interface of the file, a name an import
  brings in, or a name that starts with `I` and a capital letter;
- a call on a variable, `v.f(...)`, whose type is such a name.

A write is an assignment (`=`, `+=` and the other compound forms), `++`, `--`, `delete`, `.push(...)` or `.pop()` on a
state variable or on a local storage reference, through any `[index]` and `.member` after it, and not shadowed by a
parameter or a local of the same name. The order of the tokens stands for the order of execution, as
Checks-Effects-Interactions is written: a write in an earlier branch of an `if` is not told apart, and calls and writes
in other functions or modifiers are not followed. One finding is given for each function, at its first write after
the call.

### `admin-change-without-event`

A function that does not only read is reported when it writes a state variable whose name holds a word of ADMIN_WORDS
and has no `emit` statement in its body. A name is split into words at a change from lower to upper case and at `_`,
and each word is compared whole: `_pendingOwner` holds owner, `ownership` does not. ADMIN_WORDS are owner, owners,
admin, admins, administrator, governance, governor, guardian, operator, operators, implementation, impl, role, roles,
minter, minters, pauser, upgrader, authority, controller, manager and keeper. Constructors and initializers (a name that
starts with `initialize` or `init`, or the modifiers `initializer`, `reinitializer` and `onlyInitializing`) are left
out, and an event emitted by a function it calls is not seen.

### `missing-access-control`

A `public` or `external` function of a contract (a function with no visibility in old code reads as public) that does
not only read, and that writes a state variable whose name holds a word of SENSITIVE_WORDS or uses `selfdestruct` or
`delegatecall`, is reported when no access control is in sight. SENSITIVE_WORDS are the ADMIN_WORDS and paused, fee,
fees, treasury, oracle, signer, signers, whitelist, whitelisted, allowlist, allowlisted, blacklist, blacklisted,
blocklist, beneficiary and collector. Access control is:

- a modifier whose name starts with `only` (`onlyOwner`, `onlyRole(...)`), or one of AUTH_MODIFIERS: auth,
  requiresAuth, restricted, authorized, ownerOnly, adminOnly, isOwner and isAdmin;
- a modifier defined in the same file whose body checks the caller;
- `msg.sender` or `_msgSender()` in a statement that starts with `require`, `assert`, `if` or `while`, or a call of
  AUTH_CALLS: `_checkOwner`, `_checkRole`, `hasRole`, `_onlyOwner`, `_requireOwner`, `_authorize`, `isAuthorized` and
  `_requireCallerIsOwner`.

Initializers are left out, because the `initializer` modifier guards them. It is a note: a modifier from another file
is not read, and a function may be open on purpose.

### `upgradeable-initializer`

A contract is upgradeable when it inherits `Initializable`, `UUPSUpgradeable` or a base whose name ends in
`Upgradeable`, or when one of its functions uses the `initializer` or `reinitializer` modifier. In such a contract:

- a contract that is not abstract and has no constructor, or whose constructor does not call
  `_disableInitializers()`, is reported, because anyone can initialize its implementation;
- a `public` or `external` function named `initialize` or `init`, or a name that goes on from them with a capital
  letter, a digit or `_`, with no `initializer` or `reinitializer` modifier, is reported;
- an internal function named `__Name_init` or `__Name_init_unchained` with no `onlyInitializing` (or `initializer`) is
  reported;
- an `_authorizeUpgrade` with a body and no access control, as `missing-access-control` reads it, is reported.

The proxy, the storage layout and the order of the initializers of parent contracts are not checked.

### `unbounded-loop`

In a function that does not only read, a `for` loop whose condition (between its two semicolons) or a `while` loop
whose condition reads `x.length`, where `x` is a state variable or a local storage reference that is an array of no
fixed length, or `m[key].length`, where `m` is a mapping whose values are such arrays, is reported at the word `for` or
`while`. A loop over a parameter in memory or calldata, over an array of fixed length, or up to a number is not. Whether
the array can really grow without bound, and who can make it grow, is not known.

### `ecrecover-unchecked`

Every call of `ecrecover` outside assembly is looked at twice. When its result is assigned to a name, the function must
compare that name with `address(0)` (`who != address(0)`, `address(0) == who` and the like) anywhere in its body; when
it is not assigned, the comparison must be in the same statement. And the file must hold the upper bound of `s`, half
the order of the curve secp256k1 (`0x7fff...20a0`, in any case of letters), which is how a check against malleable
signatures is written. A finding lists what is missing. It is a heuristic: a check in a function the tool does not
follow is not seen, and a call of `ECDSA.recover` or another library is not reported.

### `inline-assembly`

Every `assembly` block of a function or a modifier, with or without its flags, is noted once at the word `assembly`.

### `unchecked-block`

Every `unchecked` block is noted once at the word `unchecked`. A note, because an unchecked counter of a loop below a
length is common and safe.

### `hardcoded-address`

Every hexadecimal number of exactly 40 digits outside comments and literals is noted, the zero address left out. A
64-digit hexadecimal number (a hash or a slot) is not an address and is not noted.

### `unreadable-file`

A file that cannot be read: over 4 MB, binary, not valid UTF-8, or UTF-16 with a problem. Nothing in it is checked.
This rule cannot be set lower or off.

### `scan-limit`

The folder holds more files, folders or Solidity files than the limits of docs/limits.md, or folders nested deeper, or
a file holds more tokens, a longer name or more nested braces. The rest is not read, so the run fails. This rule cannot
be set lower or off.

## The report

The findings are sorted by level (errors first), then by file, line, column and the order of the rules. Each finding
has its rule, level, file, line, column, what was found and what to change; with `--explain`, the points of the public
pages it rests on and the tool's own choice. At most 500 findings of one rule are listed; the rest are counted in a
note and still count for the result. The report lists every file with its contracts and functions and its findings by
level, a summary of the contracts, interfaces, libraries, functions, public or external functions that change state,
modifiers, assembly blocks and pragmas, and the number of findings of every rule. Every report ends with the notice that
a clean result is not a security audit and not a guarantee that the contracts are safe, and with the result: `FAIL`
when a finding is at or above the fail-on level, `PASS` otherwise.
