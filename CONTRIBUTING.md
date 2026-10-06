# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux,
Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure
development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`,
with `!` for a breaking change.

This tool reads the Solidity files on disk as text and compiles nothing; its result is an input to a smart contract
review before an audit, not a security audit and not a guarantee that the contracts are safe. A change must keep it
that way: a rule reports what a file holds, and the tool never fetches, compiles, runs, deploys or evaluates what it
reads.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule looks at and what it can and cannot see, and add what it
   cannot see to docs/limits.md. Where the tool makes its own choice, say so in `own` in src/rules.js and say why.
2. Keep the rules to what is written. A finding must point at something a reader can check in a file: a line and a
   column. Never add a rule that needs the network, a compiler, a node or the clock.
3. A rule says what to change, in `fix` in src/rules.js, and names the points of the public pages it rests on in
   `basis`; a new page goes into src/data.js and research/sources.md, and docs/rules-and-sources.md lists it.
4. A run must never pass because something could not be read: a file that cannot be read and input past the limits
   are error findings, and those two rules keep no key in the configuration.
5. Add a test with the Solidity written inline (`sol()`, `findingsIn()`, `ofRule()`, `rulesIn()`, `SITE`, `siteWith()`,
   `reportOf()` and `run()` in test/helpers.js), small enough to work out by hand, with a near miss on each side: the
   form that is reported and the form next to it that is not.
6. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON output, the CSV report
   and the GitHub annotations.

## Changing the readers

1. The lexer (src/lexer.js), the outline (src/outline.js), the pattern matcher (src/glob.js) and the listing of the
   folder (src/walk.js) keep lists of their own, never recursion, and read each character a bounded number of times;
   the JSON reader of the configuration (src/json.js) stops at 32 levels of nesting. Every check of src/analyze.js is a loop over the tokens of the file or of a
   body, with the brackets matched once for the file and the statements, depths, hashes and names read worked out once;
   a look ahead or back stops at `LOOKAHEAD` tokens. A test in test/repo.test.js fails when a function of these files
   calls itself.
2. The readers stop at their limits with the place; they never guess past them. A form of code that is read is listed
   in docs/method.md, and a form that is not in docs/limits.md.
3. No pattern is built from a file or the configuration, and no key of the configuration takes a regular expression.
   A test fails when `new RegExp` appears in src outside src/text.js.
4. The tables of names in src/analyze.js are the tool's own and are listed in docs/method.md; a change to them is a
   change to the rules.
5. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only
   when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold
   the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
6. A file written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must
   give the same output. The example files are stored as written (`.gitattributes`), and a test reads them with CRLF
   line ends and as UTF-16.

## Changing the configuration file

A new key is added to `KEYS` in src/config.js, documented in docs/inputs.md and tested with a good value and a bad one.
Every key the tool does not know stays an error, and a key named twice stays refused.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the page it comes from. A
   short phrase of a page may be named; a long quotation may not.
2. research/sources.md lists every page with a note on what it says, and docs/rules-and-sources.md lists every rule
   with its points and what to change. A test checks all three against each other. Fetch and read a page before it is
   listed, leave out a web address that holds a number that reads like a year, and never write a publication date or
   the year of an edition.

## The examples

The contracts under `examples/` are made-up input for the tool: minimal illustrations of the patterns, never compiled,
with made-up names and no real protocol, company or person. They hold no attack contract and no code that drains,
locks or harms anything; a pattern is shown in the fewest lines that show it. A change to them goes with the real
output that `npm run example` writes to `examples/output`.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, file permissions) is guarded with
`process.platform`, says why in its `t.skip`, and asserts no line of its own: a line is asserted only in a test that
runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written
by hand. `test/repo.test.js` fails when a guarded test asserts a line. Every other test builds its paths with
`resolve()` from names with forward slashes.

A test never reads the clock, the time zone of the machine or the locale.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network
  connection, runs no program and evaluates nothing it reads.
- Text from the input, file names and pragmas included, goes through `safeText` before it reaches the output or an
  error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, Solidity 0.8.24,
  RFC 4180, SWC-120) are fine (decision 1).
- Examples and tests use made-up projects, contracts and people, with hosts on the reserved `.test` domain.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
