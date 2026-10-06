# 2. Read Solidity with a lexer of its own, and compile nothing

## Status

Accepted

## Context

The facts the checks need sit in the text of the contracts: the pragma, the names of contracts and their bases, the
state variables, the headers of functions and modifiers, the calls, the writes, the loops. A compiler would see more:
the types of every expression, the full inheritance, the order of execution. But a compiler in a pipeline that checks
pull requests needs the exact version the pragma asks for, which is downloaded, needs every import and remapping of
the project, fails on a contract that does not build, and gives a syntax tree whose shape changes from version to
version. A general parser library would bring code the project does not review.

Regular expressions over the raw text break in the places that matter: a `tx.origin` in a comment, a
`selfdestruct` in a NatSpec line, a `.call` in a string, a brace inside call options such as `{value: amount}`. They
also take a very long time on hostile input.

## Decision

1. Files are read by src/lexer.js, a lexer of the tool's own that turns the text into tokens in one pass and sets every
   comment and every literal aside before any check runs: line and block comments, NatSpec, string literals with their
   escapes, `hex` and `unicode` literals. A pragma is kept whole.
2. src/outline.js builds the light structure the checks need from the tokens (contracts, bases, state variables,
   functions, modifiers, parameters, locals, statements, blocks, assembly and unchecked blocks) with a stack of its own
   and no recursion, and matches every bracket once for the file.
3. The tool compiles nothing, resolves no import, runs no test and connects to no node. A check reads the tokens of the
   file and the outline, and nothing else.
4. The checks are a heuristic over the text as written, and every report says so; docs/method.md says what each rule
   reads and docs/limits.md what it cannot see.

## Consequences

- The tool needs no compiler, no install and no network, reads a contract that does not build, runs in seconds on a
  large project, and the same files give the same report on Linux, Windows and macOS.
- What only the compiler knows (types across files, inheritance from other files, the order of execution) is not seen;
  a clean result is not a security audit and not a guarantee that the contracts are safe.
- Unusual code may give an outline that differs from the syntax tree of the compiler in places the checks rarely depend
  on; docs/limits.md lists them.
