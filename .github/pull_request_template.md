## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a rule is described in docs/method.md, says what it can and cannot see, and has a test with the Solidity written inline and a near miss on each side
- [ ] A change to what the tool cannot see is in docs/limits.md
- [ ] A change to a key of the configuration, to the tables of names of src/analyze.js or to the forms of Solidity that are read is in docs/inputs.md or docs/method.md, and in the README
- [ ] A change to a point of a public page is in src/data.js, research/sources.md and docs/rules-and-sources.md, in this project's own words, with no long quotation
- [ ] Nothing in the change, the README or the output reads as a security audit or a guarantee; the tool reads the files on disk as text and compiles nothing
- [ ] The lexer still sets every comment and literal aside before a check runs, and a test puts the new pattern in a comment and in a string
- [ ] The lexer and the outline still stop at their limits with the place, never recurse, and keep every pass over the tokens bounded
- [ ] No pattern is built from a file or the configuration
- [ ] Text from the input goes through `safeText` before it reaches the output or an error message, the GitHub format escapes what a workflow command gives a meaning to, and the CSV format neutralizes a leading formula character
- [ ] The tool still reads no clock and no locale, opens no network connection, runs nothing it reads, evaluates nothing and writes nothing to disk
- [ ] Work stays bounded: the limits of docs/limits.md hold, and a hostile test has a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that depends on the operating system (a link, a device, file permissions) is guarded with `process.platform`, asserts no line of its own, and builds its paths with `resolve()` from forward-slash names
- [ ] The example contracts stay made up and minimal: no real protocol, company or person, no attack contract, and no number that reads like a year
- [ ] The commit messages of this pull request follow Conventional Commits
