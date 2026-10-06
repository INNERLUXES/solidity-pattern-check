# Brindlewood Savings Club: contracts to review

A made-up savings club keeps its money in a few small contracts: a vault, a raffle, a second version of the vault
behind a proxy, and the interface of its points token. The team wants a list of what to look at before it hires an
audit. The contracts are minimal illustrations of the patterns, not contracts to deploy, and there is no attack code
here. They hold what such a list finds:

- in `contracts/ClubVault.sol`, a floating pragma that also admits a version below the minimum of `../config.json`,
  an address written into the code, a withdrawal that writes the balance after it sends the Ether, a bonus paid with
  `send` and its result dropped, a sweep that checks `tx.origin`, a change of owner with no event, a fee collector that
  anyone can set, a loop over the list of members in storage, an unchecked block, an assembly block and a
  `selfdestruct`;
- in `contracts/RaffleDraw.sol`, a range pragma that admits 0.7.0, a winner drawn from `keccak256` of
  `block.timestamp` and `block.prevrandao`, and a prize claimed with `ecrecover` and no check for `address(0)` or for
  malleable signatures;
- in `contracts/upgradeable/ClubVaultV2.sol`, an upgradeable contract with no constructor that calls
  `_disableInitializers()`, an `initialize` with no `initializer` modifier, an `_authorizeUpgrade` anyone can call, a
  `delegatecall` to a parameter, and a `delegatecall` to a state variable from a function anyone can call, with its
  success value left out of the tuple.

It also holds what must not be reported: `tx.origin`, `selfdestruct` and `block.timestamp` in comments and a string,
`tx.origin == msg.sender`, a deadline checked with `block.timestamp`, a loop over a calldata array, a call whose result
is checked, a change of admin that emits an event, an installed package under `node_modules`, stand-ins for installed
libraries under `lib`, which the default exclude patterns leave out, and the folder `mocks`, which `../config.json`
leaves out with `"exclude": [..., "mocks/**"]`. `../config.json` also raises `minCompiler` to 0.8.20, so `^0.8.19` is
noted as an old compiler too.

```
node bin/solidity-pattern-check.js examples/messy --config examples/config.json
```

The club, its contracts and every name are made up. The files are made-up input for the tool, not code of this
repository, and they are never compiled.
