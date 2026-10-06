# 3. Check the files on disk, and fetch nothing

## Status

Accepted

## Context

Some facts about a contract live elsewhere: the code deployed at an address, the source verified on a block explorer,
the storage of a proxy, the list of known compiler bugs, the latest release of a library. A check could fetch the
deployed code, call a node, download the bug list or the libraries. Each would need the network and often a key, would
make the result depend on the state of a chain or a server, and would let a file in a pull request make the pipeline
reach an address it names.

What a team needs first, before it hires an audit, is a list of what to look at and where: the pragmas, the calls, the
writes, the guards, the initializers, as the repository holds them.

## Decision

1. The tool reads the files of the folder and the configuration, and nothing else. It fetches nothing, calls no node,
   needs no key, runs no program and calls no service.
2. The words the checks compare (the words of admin and sensitive names, the access control modifiers and calls, the
   reentrancy guards, the upgradeable bases) are the tool's own and are listed in docs/method.md, and the public pages
   each rule rests on are named in src/data.js and research/sources.md, each fetched and read before it was listed; the
   tool never looks them up while it runs.
3. The tool lists what to look at and what to change; it changes nothing.

## Consequences

- The result depends only on the files, and a run needs no network access, no secret and no node.
- A contract that only exists on a chain is not checked; check out its source.
- When the documentation or a library changes a name the checks compare, the lists in src/analyze.js are updated in a
  release, with a test.
