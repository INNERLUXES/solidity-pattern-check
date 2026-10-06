# Inputs

## The folder

```
solidity-pattern-check <folder> [--exclude <pattern>]... [--config <file>]
```

Name one folder: the folder of the project, the one that holds its contracts. Every file below it that an include
pattern names is read; the folders .git and node_modules are passed over wherever they are, in any case of letters,
and so is every path that matches an exclude pattern, which by default leaves out `lib`, `out`, `cache` and
`artifacts` at the top of the folder. A folder that is a file, a symbolic link or missing stops the run with exit code
`2`. Check two projects in two runs.

The paths in the report are relative to the folder you run the command in, with forward slashes on every system,
followed by the line.

## The files

| File | What is read |
| --- | --- |
| `*.sol` (the default include pattern) | the tokens of the file outside comments and literals: pragmas, imports, contracts, state variables, functions, modifiers and their bodies |
| any other file an include pattern names | the same, read as Solidity |

Names are compared without regard to case, so `Vault.SOL` is read too. A file is read as UTF-8, with or without a byte
order mark, or as UTF-16 with its byte order mark. Nothing is compiled, no import is followed and no file of the
project other than the Solidity files and the configuration is read: not `foundry.toml`, not `hardhat.config`, not
`remappings.txt`, not the build output.

## The paths left out by default

| Pattern | Why |
| --- | --- |
| `lib/**` | Foundry installs libraries here; they are not the code under review |
| `out/**` | the build output of Foundry |
| `cache/**` | the compiler cache of Foundry and Hardhat |
| `artifacts/**` | the build output of Hardhat |

The patterns match these folders at the top of the folder only, so a folder `contracts/lib` of your own is read. The
folders `.git` and `node_modules` are not patterns: they are never read, wherever they are, and no setting reads them.
To read `lib` too, give `exclude` a list without it, such as `"exclude": []`; to leave out tests, mocks or scripts, add
them, such as `"exclude": ["lib/**", "out/**", "cache/**", "artifacts/**", "test/**", "script/**"]`.

## Exclude patterns

`--exclude <pattern>` and `exclude` of the configuration leave paths of the folder out, and `include` names the files
to read. A pattern is matched against the path relative to the folder, with forward slashes, in lowercase: `*` is any
run of characters but a slash, `?` one character but a slash, `**` any run of characters with slashes, and `**/` any
run of folders, none included. A folder is left out when the pattern matches its path or its path with a slash after
it, so `mocks/**` leaves out the folder mocks and all below it, and `**/mocks/**` every folder named mocks. A pattern
may not be absolute, hold a backslash or `..`, or be longer than 200 characters. The patterns of `--exclude` add to
those of the configuration.

## The configuration file

The configuration is one JSON object, read by a strict reader of RFC 8259 (no comments, no trailing comma, no name
given twice). Every key is optional; without `--config` the defaults apply, and `--print-defaults` writes them out. A
key the tool does not know is an error with its line and a suggestion, and stops the run with exit code `2`.

```json
{
  "name": "Brindlewood Savings Club contracts review",
  "include": ["**/*.sol"],
  "exclude": ["lib/**", "out/**", "cache/**", "artifacts/**", "mocks/**"],
  "rules": { "hardcodedAddress": "off", "accessControl": "warning" },
  "minCompiler": "0.8.20",
  "minSeverity": "info",
  "failOn": "error"
}
```

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `include` | 1 to 200 path patterns of the files to read | `**/*.sol` |
| `exclude` | up to 200 path patterns of paths to leave out | `lib/**`, `out/**`, `cache/**`, `artifacts/**` |
| `rules` | an object of rule keys to `info`, `warning`, `error` or `off` | below |
| `minCompiler` | a version of three numbers, such as `0.8.20`: a pragma that admits a lower version is noted by `old-compiler` | `0.8.0` |
| `minSeverity` | the lowest level shown: `info`, `warning` or `error` | `info` |
| `failOn` | the lowest level that fails the run | `error` |

The lists replace their defaults as a whole, and a value given twice in a list is kept once. `--min-severity` and
`--fail-on` on the command line win over the configuration. No key takes a regular expression.

## The keys of rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.floatingPragma` | `floating-pragma` | warning |
| `rules.oldCompiler` | `old-compiler` | warning |
| `rules.txOrigin` | `tx-origin-auth` | error |
| `rules.uncheckedCall` | `unchecked-call` | error |
| `rules.delegatecallTarget` | `delegatecall-untrusted` | error |
| `rules.selfdestruct` | `selfdestruct` | warning |
| `rules.weakRandomness` | `weak-randomness` | warning |
| `rules.stateWriteAfterCall` | `state-write-after-call` | warning |
| `rules.adminEvent` | `admin-change-without-event` | warning |
| `rules.accessControl` | `missing-access-control` | info |
| `rules.initializer` | `upgradeable-initializer` | warning |
| `rules.unboundedLoop` | `unbounded-loop` | warning |
| `rules.ecrecover` | `ecrecover-unchecked` | warning |
| `rules.assembly` | `inline-assembly` | info |
| `rules.uncheckedBlock` | `unchecked-block` | info |
| `rules.hardcodedAddress` | `hardcoded-address` | info |

`unreadable-file` and `scan-limit` have no key: they are always errors. Setting a rule to `off` leaves it out of the
findings and the counts, and a note names it.

### Why the levels are what they are

The errors are the findings whose form is wrong almost wherever it appears: `tx.origin` deciding who may act, a
low-level call whose failure goes unnoticed, and a `delegatecall` whose target someone else can choose. The warnings
are the findings that are often wrong but can be right in their context, which the tool cannot see: a floating pragma
in a library, an old compiler, `selfdestruct`, a value of the block hashed for something that is not a lottery, a write
after a call to a contract the project trusts, a change of owner logged elsewhere, an initialization guarded in
another way, a loop over an array that cannot grow far, and `ecrecover` checked in another function. The notes are the
findings that ask the review for a look rather than a change: a public function that changes sensitive state with no
guard in sight, inline assembly, unchecked blocks and addresses written into the code.
