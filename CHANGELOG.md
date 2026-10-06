# Changes

## 1.0.0

First release.

- Lists risky smart contract patterns in the Solidity files of a folder, with file, line and column, as an input to a
  smart contract review before an audit: every file that an include pattern names (`**/*.sol` by default), with .git
  and node_modules passed over, `lib`, `out`, `cache` and `artifacts` at the top of the folder left out by default and
  `--exclude` patterns left out. Compiles nothing, runs nothing, fetches nothing, follows no symbolic link and no
  import, and reads no clock.
- A Solidity lexer with no dependency that sets comments, NatSpec, string literals and `hex` and `unicode` literals
  aside before any check runs, keeps a pragma whole, and reads numbers, names and the operators of Solidity and Yul in
  one pass, with limits of tokens and of the length of names.
- An outline of every file with a stack of its own and no recursion: pragmas, imports, contracts, interfaces, libraries
  and abstract contracts with their bases, state variables, functions, modifiers, parameters, locals, statements,
  blocks, call options, assembly blocks and unchecked blocks, with every bracket matched once and a limit of nesting.
- A reader of the version pragma: comparators, ranges, sets joined by `||` and partial versions, whether the pragma is
  pinned, and the lowest version it admits.
- Sixteen rules in three levels: a floating or missing pragma (`floating-pragma`), a pragma that admits a compiler below
  the minimum (`old-compiler`), `tx.origin` used to decide who may act (`tx-origin-auth`), a low-level call whose
  success value is not checked (`unchecked-call`), a `delegatecall` to a parameter or to storage
  (`delegatecall-untrusted`), `selfdestruct` (`selfdestruct`), a value of the block hashed or taken modulo
  (`weak-randomness`), a write to storage after an external call (`state-write-after-call`), a change of owner, admin,
  role or upgrade target with no event (`admin-change-without-event`), a public function that changes sensitive state
  with no access control in sight (`missing-access-control`), an upgradeable contract whose initialization is not
  locked (`upgradeable-initializer`), a loop over a dynamic array in storage (`unbounded-loop`), `ecrecover` with no
  check for `address(0)` or malleable signatures (`ecrecover-unchecked`), inline assembly (`inline-assembly`), unchecked
  blocks (`unchecked-block`) and addresses written into the code (`hardcoded-address`); and two rules of input problems
  that cannot be lowered (`unreadable-file`, `scan-limit`).
- A table of the files with their contracts, functions and findings, and a summary of the contracts, interfaces,
  libraries, functions, public or external functions that change state, modifiers, assembly blocks and pragmas.
- A configuration file in strict JSON over documented defaults: the files to read, the paths left out, the level of
  every rule, the lowest compiler version, the minimum severity and the level that fails the run; a key the tool does
  not know is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON, CSV with one row per finding (`--format csv`) and GitHub workflow commands (`--format github`)
  that show each finding as an annotation; every finding has its file, line and column; `--min-severity`, `--fail-on`,
  `--explain` with the rule, the sources and the tool's own choice, and `--print-defaults`. Exit code `0` when no
  finding is at or above the fail-on level, `1` when one is, `2` for a usage or input error, with no result.
- An input to a smart contract review before an audit, not a security audit and not a guarantee that the contracts are
  safe: every report says so.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
