// The built-in configuration: the level of every rule, the files that are read, the paths left out, the lowest compiler
// version that is not noted, the lowest level shown and the level that fails the run. docs/inputs.md describes every
// key, and --print-defaults writes the configuration out.

// The level of every rule that the configuration can set. The two rules of input problems are always errors.
export const DEFAULT_RULES = {
  floatingPragma: 'warning',
  oldCompiler: 'warning',
  txOrigin: 'error',
  uncheckedCall: 'error',
  delegatecallTarget: 'error',
  selfdestruct: 'warning',
  weakRandomness: 'warning',
  stateWriteAfterCall: 'warning',
  adminEvent: 'warning',
  accessControl: 'info',
  initializer: 'warning',
  unboundedLoop: 'warning',
  ecrecover: 'warning',
  assembly: 'info',
  uncheckedBlock: 'info',
  hardcodedAddress: 'info'
};

// The files that are read, as patterns relative to the folder, compared in lowercase.
export const DEFAULT_INCLUDE = ['**/*.sol'];

// Paths of the folder that are not read: the folders of installed libraries (Foundry keeps them in lib), of build output
// (out, artifacts) and of compiler caches, at the top of the folder. The folders .git and node_modules are never read.
export const DEFAULT_EXCLUDE = ['lib/**', 'out/**', 'cache/**', 'artifacts/**'];

// A pragma that admits a compiler version below this one is noted by old-compiler. 0.8.0 is the first version whose
// arithmetic reverts on overflow and underflow.
export const DEFAULT_MIN_COMPILER = '0.8.0';

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
