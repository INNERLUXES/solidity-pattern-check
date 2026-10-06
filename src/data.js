// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists every page with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

const SOL = 'https://docs.soliditylang.org/en/latest';
const SWC = 'https://swcregistry.io/docs';

export const SOURCES = [
  { id: 'solSecurity', title: 'Security Considerations (Solidity documentation)', url: `${SOL}/security-considerations.html` },
  { id: 'solLayout', title: 'Layout of a Solidity Source File (Solidity documentation)', url: `${SOL}/layout-of-source-files.html` },
  { id: 'solGlobals', title: 'Units and Globally Available Variables (Solidity documentation)', url: `${SOL}/units-and-global-variables.html` },
  { id: 'solControl', title: 'Expressions and Control Structures (Solidity documentation)', url: `${SOL}/control-structures.html` },
  { id: 'solAssembly', title: 'Inline Assembly (Solidity documentation)', url: `${SOL}/assembly.html` },
  { id: 'solTypes', title: 'Types (Solidity documentation)', url: `${SOL}/types.html` },
  { id: 'solBugs', title: 'List of Known Bugs (Solidity documentation)', url: `${SOL}/bugs.html` },
  { id: 'solGrammar', title: 'Language Grammar (Solidity documentation)', url: `${SOL}/grammar.html` },
  { id: 'swc101', title: 'SWC-101 Integer Overflow and Underflow (Smart Contract Weakness Classification)', url: `${SWC}/SWC-101` },
  { id: 'swc102', title: 'SWC-102 Outdated Compiler Version (Smart Contract Weakness Classification)', url: `${SWC}/SWC-102` },
  { id: 'swc103', title: 'SWC-103 Floating Pragma (Smart Contract Weakness Classification)', url: `${SWC}/SWC-103` },
  { id: 'swc104', title: 'SWC-104 Unchecked Call Return Value (Smart Contract Weakness Classification)', url: `${SWC}/SWC-104` },
  { id: 'swc105', title: 'SWC-105 Unprotected Ether Withdrawal (Smart Contract Weakness Classification)', url: `${SWC}/SWC-105` },
  { id: 'swc106', title: 'SWC-106 Unprotected SELFDESTRUCT Instruction (Smart Contract Weakness Classification)', url: `${SWC}/SWC-106` },
  { id: 'swc107', title: 'SWC-107 Reentrancy (Smart Contract Weakness Classification)', url: `${SWC}/SWC-107` },
  { id: 'swc112', title: 'SWC-112 Delegatecall to Untrusted Callee (Smart Contract Weakness Classification)', url: `${SWC}/SWC-112` },
  { id: 'swc115', title: 'SWC-115 Authorization through tx.origin (Smart Contract Weakness Classification)', url: `${SWC}/SWC-115` },
  { id: 'swc117', title: 'SWC-117 Signature Malleability (Smart Contract Weakness Classification)', url: `${SWC}/SWC-117` },
  { id: 'swc120', title: 'SWC-120 Weak Sources of Randomness from Chain Attributes (Smart Contract Weakness Classification)', url: `${SWC}/SWC-120` },
  { id: 'swc122', title: 'SWC-122 Lack of Proper Signature Verification (Smart Contract Weakness Classification)', url: `${SWC}/SWC-122` },
  { id: 'swc128', title: 'SWC-128 DoS With Block Gas Limit (Smart Contract Weakness Classification)', url: `${SWC}/SWC-128` },
  { id: 'ozWriting', title: 'Writing Upgradeable Contracts (OpenZeppelin Docs)', url: 'https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable' },
  { id: 'ozProxy', title: 'Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs)', url: 'https://docs.openzeppelin.com/contracts/5.x/api/proxy' },
  { id: 'ethSecurity', title: 'Smart contract security (ethereum.org)', url: 'https://ethereum.org/developers/docs/smart-contracts/security/' },
  { id: 'owaspTop10', title: 'OWASP Smart Contract Top 10 (OWASP)', url: 'https://owasp.org/www-project-smart-contract-top-10/' },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  cei: { source: 'solSecurity', text: 'a call to another contract hands it control, and it can call back before the first call ends; the Checks-Effects-Interactions pattern does every check, then every change of state, and only then calls other contracts' },
  txOriginNever: { source: 'solSecurity', text: 'tx.origin is never to be used for authorization: a contract the owner calls can call the wallet in the name of the owner and pass a check on tx.origin' },
  checkReturn: { source: 'solSecurity', text: 'send and the low-level call functions return false instead of throwing when they fail, and their return value is always to be checked' },
  loopsGas: { source: 'solSecurity', text: 'loops with no fixed number of iterations, such as loops that depend on values in storage, can grow past the gas limit of a block and stall the contract' },
  overflowWraps: { source: 'solSecurity', text: 'arithmetic is checked by default and reverts on overflow, but an unchecked block wraps silently, so no one should assume they are protected from overflow bugs' },
  randomnessPublic: { source: 'solSecurity', text: 'everything a contract uses is public, and block builders can sway values a contract might use as a source of randomness' },
  versionPragma: { source: 'solLayout', text: 'a version pragma only makes the compiler refuse versions outside the range it names; with ^ it admits every later version before the next breaking release' },
  timestampNotRandom: { source: 'solGlobals', text: 'block.timestamp and blockhash are not to be relied on as a source of randomness; blockhash is only known for the last 256 blocks and block.prevrandao replaces block.difficulty' },
  ecrecoverZero: { source: 'solGlobals', text: 'ecrecover returns zero on error, a valid signature can be turned into a different valid signature without the private key, and a wrapper such as the ECDSA library of OpenZeppelin is advised' },
  lowLevelNoChecks: { source: 'solGlobals', text: 'call, delegatecall and staticcall bypass type checking, do not check that the account holds code, and send and transfer are deprecated' },
  selfdestructDeprecated: { source: 'solGlobals', text: 'selfdestruct is deprecated since Solidity 0.8.18, and on networks with the Cancun upgrade it only sends the balance unless it runs in the transaction that created the contract' },
  checkedSince08: { source: 'solControl', text: 'since Solidity 0.8.0 arithmetic reverts on overflow and underflow by default, and an unchecked block brings back the wrapping of earlier versions' },
  lowLevelFalse: { source: 'solControl', text: 'the low-level calls return false as their first value on an exception instead of passing it up, and return true when the called account does not exist' },
  assemblyBypasses: { source: 'solAssembly', text: 'inline assembly works close to the virtual machine and bypasses several important safety features and checks of Solidity, so it is for cases where it is needed and well understood' },
  addressLiterals: { source: 'solTypes', text: 'a hexadecimal literal of 40 digits that passes the checksum test is of type address, and an address can be converted to address payable to send it Ether' },
  knownBugs: { source: 'solBugs', text: 'the documentation keeps a list of security-relevant bugs of the compiler with the versions each affects, and code built with an old version may carry bugs a later version fixed' },
  lexical: { source: 'solGrammar', text: 'the grammar defines string literals in double or single quotes with escapes, unicode and hex string literals, identifiers of letters, digits, $ and _, and the flags and dialect of an assembly block' },
  swcOverflow: { source: 'swc101', text: 'an arithmetic operation that passes the largest or the smallest value of its type wraps around, and vetted safe arithmetic is advised throughout' },
  swcOutdated: { source: 'swc102', text: 'an outdated compiler version carries bugs that later versions fixed, and a recent version is advised' },
  swcFloating: { source: 'swc103', text: 'a contract is to be deployed with the compiler version and flags it was tested with, so the pragma is locked; a floating pragma may be fine for a library others build on' },
  swcUncheckedCall: { source: 'swc104', text: 'when the return value of a message call is not checked, execution goes on after the call fails, and the logic after it can go wrong' },
  swcUnprotected: { source: 'swc105', text: 'missing or weak access control lets anyone take Ether out of a contract; withdrawals are to be limited to authorized parties' },
  swcSelfdestruct: { source: 'swc106', text: 'a selfdestruct that lacks access control lets anyone remove the contract; the advice is to remove it unless it is needed, and else to guard it well' },
  swcReentrancy: { source: 'swc107', text: 'a call to another contract can let it take over the flow and call back before the first function ends; the fixes are to change all state before the call, or a reentrancy lock' },
  swcDelegatecall: { source: 'swc112', text: 'delegatecall runs the code of the target with the storage and the balance of the caller, so a target the user can choose must be checked against a list of trusted addresses' },
  swcTxOrigin: { source: 'swc115', text: 'authorization through tx.origin lets a contract the authorized account calls pass the check; msg.sender is to be used instead' },
  swcMalleability: { source: 'swc117', text: 'a signature can be changed into another valid one without the private key, so a signature must never be the key that marks a message as processed' },
  swcVerification: { source: 'swc122', text: 'a contract that acts on signed messages must recover and verify the signer with ecrecover rather than trust another sign' },
  swcRandomness: { source: 'swc120', text: 'block.timestamp, blockhash, block.difficulty and block.number are weak sources of randomness because the producers of blocks can choose or influence them' },
  swcGasLimit: { source: 'swc128', text: 'a loop over a data structure of unknown size can grow past the block gas limit, so work on large arrays is to be split over several transactions' },
  ozInitializer: { source: 'ozWriting', text: 'an upgradeable contract uses an initializer function in place of a constructor, guarded by the initializer modifier so that it runs once, with onlyInitializing on the initializers of parent contracts' },
  ozDisable: { source: 'ozWriting', text: 'the constructor of an implementation calls _disableInitializers() so that no one can initialize the implementation contract itself' },
  ozNoDelegatecall: { source: 'ozWriting', text: 'an implementation contract avoids selfdestruct and delegatecall, because a direct call to it could destroy it and break every proxy that points at it' },
  ozAuthorizeUpgrade: { source: 'ozProxy', text: 'a UUPS contract overrides _authorizeUpgrade with an access control modifier such as onlyOwner, so that only an authorized party can upgrade it' },
  ozInitializerOnce: { source: 'ozProxy', text: 'initializer lets a function run at most once, reinitializer runs a later step once for each version, and _disableInitializers in the constructor locks the contract against any initialization' },
  ethAccessControl: { source: 'ethSecurity', text: 'access control comes first: an owner set at creation with an onlyOwner modifier on the protected functions, or roles shared among several trusted parties' },
  ethEvents: { source: 'ethSecurity', text: 'a contract emits an event whenever a party takes a safety-critical action, so that the action can be tracked and a team can react fast' },
  ethCei: { source: 'ethSecurity', text: 'checks first, then the changes of state, then the calls to other contracts, removes the reentrancy condition; a lock is a second guard' },
  owaspAccess: { source: 'owaspTop10', text: 'the OWASP Smart Contract Top 10 lists access control vulnerabilities as its first category' },
  owaspUnchecked: { source: 'owaspTop10', text: 'the OWASP Smart Contract Top 10 lists unchecked external calls and reentrancy attacks among its categories' },
  owaspRandomness: { source: 'owaspTop10', text: 'the OWASP Smart Contract Top 10 lists insecure randomness and integer overflow and underflow among its categories' },
  owaspDos: { source: 'owaspTop10', text: 'the OWASP Smart Contract Top 10 lists denial of service attacks among its categories' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab, a carriage return or a line feed as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the JSON reader of this tool refuses a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This check reads the Solidity files on disk as text and compiles nothing, runs nothing and fetches nothing; the checks are a heuristic. A finding is a lead with a file and a line for a smart contract review before an audit, and a clean result is not a security audit and not a guarantee that the contracts are safe (docs/limits.md).';
