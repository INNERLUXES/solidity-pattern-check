# Limits

The tool is not an auditor: it reads the Solidity files of a folder from disk, as text. Its result is an input to a
smart contract review before an audit, not a security audit and not a guarantee that the contracts are safe. It
compiles nothing, runs nothing, deploys nothing, fetches nothing, connects to no node and asks nobody anything. A
finding points at a line that needs a look, and a run without findings says only that the folder holds none of the
forms of docs/method.md. Every report ends with a sentence that says so.

## What it cannot see

- **What the compiler sees.** No compiler runs, so there is no type checking, no name resolution across files and no
  inheritance beyond the bases declared in the same file. A modifier, a base contract or a library in another file is
  not read; the names of interfaces are known from the file, its imports and the habit of starting them with `I`.
- **What the code does at run time.** The order of the tokens stands for the order of execution. A write in an earlier
  branch, a call in a function that this function calls, a check in a modifier of another file, the value of a
  variable, and whether a branch can be reached at all are not seen. The checks are a heuristic over the text.
- **Logic and economics.** Price oracles that can be moved, flash loans, rounding, the order of transactions, front
  running, the design of the token, the rules of the business and every other weakness that needs an understanding of
  what the contracts are for. These are the main work of an audit, and the tool does not try them.
- **The deployment.** The proxy in front of a contract, its storage layout from one version to the next, the addresses
  it is deployed with, the keys that own it, the networks it runs on and the settings of the compiler.
- **Assembly.** The checks of Solidity code pass over assembly blocks: only `delegatecall` to a parameter and
  `selfdestruct` are read inside them, and every block is noted for the review.
- **Words.** Whether a name means what its words say: `isAdminName` and `isSensitiveName` read the words of a name, and
  a variable named `owner` that holds something else, or a sensitive variable with an unusual name, is read by its name.
- **Other files.** Each file is checked on its own, with the contracts it declares. Files outside the folder, the build
  output and installed libraries are not read.
- **The configuration of the build.** The version a project is built with in `foundry.toml` or `hardhat.config` is not
  read, only the pragma.
- **Time.** The tool reads no clock and no dates
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **Whether a finding matters to you.** A project may make up for a finding in a way the tool cannot see. Set the level
  of a rule, or turn it off, in the configuration.

## The readers

- The lexer of src/lexer.js follows the grammar of the language for comments, literals, identifiers, numbers and
  operators. A string that is not closed ends at its line, and a comment that is not closed runs to the end of the
  file; the compiler would refuse both.
- The outline of src/outline.js reads the forms docs/method.md lists. A function type used as a state variable
  (`function(uint256) external f;`) is read as a function header, an old constructor named like its contract is read as
  a function, and declarations the outline does not know are passed over to their semicolon.
- Some checks look at a window of tokens: the arguments of a call, the left side of an assignment and the header of a
  loop are looked at up to 1,024 tokens (`LOOKAHEAD`), so that nested hostile input cannot make the work grow with the
  square of its size. Code written by people never comes near it.
- A file is read as UTF-8, with or without a byte order mark, or as UTF-16 with its byte order mark; UTF-16 with no
  mark, and any other encoding, is an `unreadable-file` finding.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, a file is an error finding, or the listing stops
with a `scan-limit` finding.

| What | Limit |
| --- | --- |
| a Solidity file | 4 MB; a larger one is an `unreadable-file` finding |
| the configuration | 1 MB |
| files and folders of the folder listed | 50,000 |
| folders nested | 32 deep |
| Solidity files | 5,000 |
| tokens of a Solidity file | 400,000 |
| a name or a number | 1,024 characters |
| braces nested in a Solidity file | 256 deep |
| tokens looked at for the arguments of a call, the left side of an assignment or the header of a loop | 1,024 |
| entries of a list of the configuration | 200 |
| exclude patterns | 100, of up to 200 characters |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests check thousands of contracts, functions, calls, writes, loops and addresses, runs of hundreds of thousands of
brackets, quotes, comments, names, calls, headers and operators, braces nested past the limit, long pragmas and names,
and folders nested past the limit, each with a time check.
