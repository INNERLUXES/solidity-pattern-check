# Threat model

## What the tool touches

- It reads the files below the folder named on the command line that the include patterns name (`*.sol` by default),
  and the configuration named with `--config`. It lists the folders to find them. Nothing else is opened: no import is
  followed and no build file is read.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, connects to no node, fetches no URL it reads, follows no symbolic link, compiles
  nothing, runs nothing it reads, evaluates nothing and reads no clock.

## What the input may hold

The contracts come from a repository, and in a pipeline that checks every pull request they may be written by whoever
opened the pull request. Through them, a person can try to:

- make the tool read outside the folder or fetch something: a symbolic link or a junction in the folder, a link named
  on the command line, a file swapped for a link between the listing and the read, an import of a path outside the
  folder or of a web address, a folder path written as a web address;
- make the tool run something: code in a contract, a pragma or a string built to look like a command, an assembly
  block;
- exhaust the memory, the stack or the time: files of megabytes, folders with tens of thousands of files, folders
  nested very deep, braces nested very deep, runs of hundreds of thousands of brackets, quotes, comments, names or
  calls, calls nested inside calls, loop headers that are never closed, thousands of functions and findings;
- move the result: a rule set to off, `failOn` raised, `minCompiler` lowered, an exclude pattern that leaves out the
  contract with the problem, code written in a form the heuristic does not read, a comment or a string that looks like
  code;
- slip in something that is not text: a binary file named `*.sol`, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators in
  a file name or a pragma;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV report: a file name or a pragma that starts with `=`, `+`, `-` or `@`, which a spreadsheet
  may run when the report is opened;
- change how objects behave: a contract, a function, a variable or a key of the JSON named `__proto__`, `constructor`
  or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read outside the folder or walk a loop | Every link met in the listing is counted and none is followed, and a link named on the command line is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle. Imports are read as names and never resolved. Tests put links to a file and to a folder in the folder |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated or compiled, and a path that looks like an address is refused. A test checks the imports of src |
| A comment or a string hides code from the checks, or looks like code to them | The lexer turns every comment and literal into one token with no text, or no token, before any check runs; tests put the patterns of every rule in comments and strings |
| The memory, the stack or the time is exhausted | Files have a size limit checked on the open handle before they are read; the listing has limits of entries, depth and files; the lexer reads each character once and has limits of tokens and of the length of names; the outline keeps a stack of its own, with no recursion and a limit of nesting, and matches every bracket once for the file; the checks work out the statement, the depth, the hashes and the names read once for the file or the function, and look at the arguments of a call and the header of a loop up to 1,024 tokens; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input or the configuration; include and exclude patterns are matched by a small matcher of the tool's own. A test looks for `new RegExp` in src |
| The result is moved through the input or the configuration | A file that cannot be read and input past the limits are error findings that cannot be set off; a rule set to off and every include and exclude pattern are named in the report. Review a change to the configuration like a change to code (docs/secure-defaults.md) |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes or a broken pair in UTF-16, and bytes that are not valid make the file an error finding |
| Text from the input rewrites the terminal | Every text, file names and pragmas included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts escapes, direction controls and line separators in a pragma, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error file=` and a line break with `::warning::` into a pragma |
| A formula runs when the CSV report is opened | A field that starts with `=`, `+`, `-`, `@`, a tab, a carriage return or a line feed gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a report built from files you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | Names are kept in Map objects and sets, keys are looked up with `Object.hasOwn`, and the JSON reader defines own properties. A test uses `__proto__`, `constructor` and `toString` as names of contracts, variables and functions and as keys |
| A device or a pipe hangs the tool | A path that is not a regular file or folder is refused before it is read, and the listing passes over every entry that is not a file or a folder |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the contracts are safe, what they do when they run, the forms of code docs/limits.md leaves out, who may change
the configuration in your repository, and where your pipeline keeps the output.

A clean result is not a security audit and not a guarantee that the contracts are safe.
