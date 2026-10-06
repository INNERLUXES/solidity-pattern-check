# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "solidity-pattern-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up contract or configuration that shows the problem, the command you ran, what you expected and
what happened. Use made-up projects, contracts and people, never the code of a live protocol that holds funds, never an
attack contract, and never a real key, mnemonic or token, even an old one.

## Scope

In scope:

- an input that makes the tool read a file outside the folder and the configuration it was given, follow an import, or
  follow a symbolic link or a junction
- an input that makes the tool open a network connection, fetch a URL it reads, call a node, compile or run any part of
  a file, run any other program, or evaluate anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as very large
  files, folders with very many files or folders, braces nested deep, calls nested in calls, or long runs of brackets,
  quotes, comments or names
- binary or invalid input that the tool reads as if it were Solidity
- a file the tool fails to read and passes over without an error finding
- a comment or a string literal whose text a check reads as code
- a form that docs/method.md says is reported but that a form of code it says it reads hides from the tool
- a run that passes at a `failOn` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, starts or ends a
  GitHub workflow command, is shown unescaped in the output, or starts a formula in the CSV report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether the contracts are safe (a clean result is
not a security audit and not a guarantee that the contracts are safe), who may change the configuration in your
repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
