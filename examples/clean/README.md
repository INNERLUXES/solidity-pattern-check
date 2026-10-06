# Fernmoor Book Swap: contracts that follow every rule

A made-up book swap keeps member deposits in a small registry, and a second version of it behind a proxy. Both pin
their compiler, guard the change of owner with a modifier that checks `msg.sender` and emit an event for it, change
their state before they send Ether and check the result of the call, loop over a calldata array only, and lock the
initialization of the upgradeable version with `_disableInitializers()`, the `initializer` modifier and an
`_authorizeUpgrade` guarded by `onlyOwner`. The report has no finding, and the run passes at every level.

```
node bin/solidity-pattern-check.js examples/clean
```

The imports name a `lib` folder that is not here: the tool reads the files as text and never resolves an import. The
book swap, its contracts and every name are made up. The files are made-up input for the tool, not code of this
repository, and they are never compiled.
