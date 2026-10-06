# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for its exact
wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every page in
src/data.js is listed here.
Each page was fetched and read before it was listed.

The tool reads the Solidity files of a project on disk as text and compiles nothing; its result is an input to a smart
contract review before an audit, not a security audit and not a guarantee that the contracts are safe. These notes say
what the pages say so a reader can follow a finding back to its source; they are not advice on any one contract. The
pages were chosen with web addresses that hold no number that reads like a year: the Solidity documentation at its
latest version, the SWC Registry by the number of each entry, the OpenZeppelin documentation by the major version of
the library, and the OWASP Smart Contract Top 10 by the address of the project, not of one edition.

## The Solidity documentation

### Security Considerations (Solidity documentation)

https://docs.soliditylang.org/en/latest/security-considerations.html

The pitfalls page of the language. A call to another contract, or a transfer of Ether to it, hands that contract
control, and it can call back before the first call ends; the Checks-Effects-Interactions pattern does every check
first, then every change of state, and calls other contracts last, and the page says this holds for any call to
another contract, not only for Ether. tx.origin is never to be used for authorization, with the example of a wallet
drained through a contract its owner was led to call. send and the low-level calls return false instead of throwing,
and their return value is always to be checked. Loops with no fixed number of iterations, such as loops over values
in storage, can grow past the gas limit of a block. Arithmetic is checked by default, an unchecked block wraps
silently, and no one should assume they are protected from overflow. Everything a contract uses is public, and block
builders can sway values a contract might use as a source of randomness. `state-write-after-call`, `tx-origin-auth`,
`unchecked-call`, `unbounded-loop`, `unchecked-block` and `weak-randomness` lean on it.

### Layout of a Solidity Source File (Solidity documentation)

https://docs.soliditylang.org/en/latest/layout-of-source-files.html

The version pragma only makes the compiler refuse versions outside the range it names; it does not change the
compiler. With ^ it admits every later version up to the next release that may break the code. `floating-pragma`
leans on it, together with the SWC entry on floating pragmas.

### Units and Globally Available Variables (Solidity documentation)

https://docs.soliditylang.org/en/latest/units-and-global-variables.html

block.timestamp and blockhash are not to be relied on as a source of randomness; blockhash is only known for the
last 256 blocks, and block.prevrandao, the value the beacon chain provides, replaces block.difficulty. ecrecover
returns zero on error, a valid signature can be turned into a different valid one without the private key, and the
page points to the ECDSA library of OpenZeppelin as a wrapper. call, delegatecall and staticcall bypass type checking
and do not check that the account holds code, and send and transfer are deprecated. selfdestruct is deprecated since
Solidity 0.8.18, and on networks with the Cancun upgrade it only sends the balance unless it runs in the transaction
that created the contract. `weak-randomness`, `ecrecover-unchecked`, `delegatecall-untrusted` and `selfdestruct` lean
on it.

### Expressions and Control Structures (Solidity documentation)

https://docs.soliditylang.org/en/latest/control-structures.html

Since Solidity 0.8.0 arithmetic reverts on overflow and underflow by default, and an unchecked block brings back the
wrapping of earlier versions for the operators it lists. The low-level calls return false as their first value when
the call fails, instead of passing the failure up, and return true when the called account does not exist.
`old-compiler`, `unchecked-block` and `unchecked-call` lean on it.

### Inline Assembly (Solidity documentation)

https://docs.soliditylang.org/en/latest/assembly.html

Inline assembly, written in Yul inside an assembly block with an optional memory-safe flag, works close to the virtual
machine and bypasses several important safety features and checks of Solidity, so it is for cases where it is needed
and well understood. `inline-assembly` leans on it, and the outline of src/outline.js reads the flags and the dialect
string of an assembly block as this page writes them.

### Types (Solidity documentation)

https://docs.soliditylang.org/en/latest/types.html

A hexadecimal literal of 40 digits that passes the checksum test is of type address, and an address can be converted
to address payable to send it Ether. `hardcoded-address` reads a literal of exactly 40 hexadecimal digits as an
address.

### List of Known Bugs (Solidity documentation)

https://docs.soliditylang.org/en/latest/bugs.html

The documentation keeps a list of security-relevant bugs of the compiler, with the versions each one affects and the
version that fixed it, and a second list by version. Code built with a version that was not the latest at the time may
carry bugs a later version fixed. `old-compiler` and the advice of `floating-pragma` lean on it.

### Language Grammar (Solidity documentation)

https://docs.soliditylang.org/en/latest/grammar.html

The grammar of the language: string literals in double or single quotes with escapes, unicode and hex string literals,
identifiers of letters, digits, $ and _, hexadecimal numbers, and the flags and dialect string of an assembly block.
The lexer of src/lexer.js follows these rules for the tokens it must set aside or keep; the grammar does not spell out
comments, which the lexer reads as the language reads them, // to the end of a line and /* to */.

## The SWC Registry

The Smart Contract Weakness Classification is a registry of weaknesses of smart contracts, each with a number, a
description, the fixes it advises and the CWE it maps to. The registry says on its pages that its content has not been
updated in a long time, may be incomplete and may contain errors; the tool names an entry for the weakness it
describes, and the advice of each rule is checked against the Solidity documentation and the other pages here.

### SWC-101 Integer Overflow and Underflow (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-101

An arithmetic operation that passes the largest or the smallest value of its type wraps around, and vetted safe
arithmetic is advised throughout. `old-compiler` and `unchecked-block` lean on it.

### SWC-102 Outdated Compiler Version (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-102

An outdated compiler version carries public bugs that later versions fixed, and a recent version is advised.
`old-compiler` leans on it.

### SWC-103 Floating Pragma (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-103

A contract is to be deployed with the compiler version and the flags it was tested with, so the pragma is locked; a
floating pragma may be fine for a library that other developers build on. `floating-pragma` leans on it, and says the
rule can be set off for such a library.

### SWC-104 Unchecked Call Return Value (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-104

When the return value of a message call is not checked, execution goes on after the call fails, and the logic after
it can go wrong; the return value of a low-level call is to be checked. `unchecked-call` leans on it.

### SWC-105 Unprotected Ether Withdrawal (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-105

Missing or weak access control lets anyone take Ether out of a contract, as when an initialization function is left
callable by anyone; withdrawals are to be limited to authorized parties. `missing-access-control` leans on it.

### SWC-106 Unprotected SELFDESTRUCT Instruction (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-106

A selfdestruct with too little access control lets anyone remove the contract; the advice is to remove it unless it is
needed, and else to guard it well, for example with approval by several parties. `selfdestruct` and
`missing-access-control` lean on it.

### SWC-107 Reentrancy (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-107

A call to another contract can let it take over the flow and call back before the first function ends; the fixes are
to make every change of state before the call, or to use a reentrancy lock. `state-write-after-call` leans on it.

### SWC-112 Delegatecall to Untrusted Callee (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-112

delegatecall runs the code of the target with the storage and the balance of the caller, keeping the sender and the
value of the message, so a target that comes from user input must be checked against a list of trusted addresses.
`delegatecall-untrusted` leans on it.

### SWC-115 Authorization through tx.origin (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-115

A contract that checks tx.origin can be called by a contract that the authorized account was led to call, and the check
passes; msg.sender is to be used for authorization instead. `tx-origin-auth` leans on it.

### SWC-117 Signature Malleability (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-117

A signature can be changed into another valid one without the private key, by changing its v, r and s, so a signature
must never be the key that marks a message as processed. `ecrecover-unchecked` leans on it.

### SWC-120 Weak Sources of Randomness from Chain Attributes (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-120

block.timestamp, blockhash, block.difficulty and block.number are weak sources of randomness, because the producers of
blocks can choose or influence them; the page names randomness oracles with proofs and commit schemes as the way out.
`weak-randomness` leans on it.

### SWC-122 Lack of Proper Signature Verification (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-122

A contract that acts on signed messages must recover and verify the signer, with ecrecover, rather than trust another
sign such as the sender of the transaction. `ecrecover-unchecked` leans on it for what a check of the result must do.

### SWC-128 DoS With Block Gas Limit (Smart Contract Weakness Classification)

https://swcregistry.io/docs/SWC-128

A loop over a data structure of unknown size, such as an array that grows over time, can come to need more gas than a
block holds, so work on large arrays is to be split over several transactions. `unbounded-loop` leans on it.

## OpenZeppelin

### Writing Upgradeable Contracts (OpenZeppelin Docs)

https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable

A contract behind a proxy cannot use a constructor for its setup: it uses an initializer function, guarded by the
initializer modifier of Initializable so that it runs once, with the initializers of parent contracts marked
onlyInitializing and called by hand. The constructor of the implementation calls _disableInitializers(), so that no one
can initialize the implementation contract itself. An implementation avoids selfdestruct and delegatecall, because a
direct call to it could destroy it and break every proxy that points at it. `upgradeable-initializer`,
`delegatecall-untrusted` and `selfdestruct` lean on it.

### Proxies API: Initializable and UUPSUpgradeable (OpenZeppelin Docs)

https://docs.openzeppelin.com/contracts/5.x/api/proxy

initializer lets a function run at most once, reinitializer runs a later step once for each version, onlyInitializing
limits a function to the time of an initialization, and _disableInitializers in the constructor locks the contract
against any initialization. A UUPS contract overrides _authorizeUpgrade with an access control modifier such as
onlyOwner, so that only an authorized party can upgrade it. `upgradeable-initializer` leans on it.

## ethereum.org

### Smart contract security (ethereum.org)

https://ethereum.org/developers/docs/smart-contracts/security/

The security page of the developer documentation of ethereum.org. Access control comes first: an owner set at
creation with an onlyOwner modifier on the protected functions, or roles shared among several trusted parties. A
contract emits an event whenever a party takes a safety-critical action, so that the action can be tracked and a team
can react fast. Checks first, then the changes of state, then the calls to other contracts, removes the reentrancy
condition, and a lock is a second guard. `missing-access-control`, `admin-change-without-event` and
`state-write-after-call` lean on it.

## OWASP

### OWASP Smart Contract Top 10 (OWASP)

https://owasp.org/www-project-smart-contract-top-10/

The OWASP list of the ten most common weaknesses of smart contracts. Its current edition lists, among others, access
control vulnerabilities first, reentrancy attacks, unchecked external calls, integer overflow and underflow, insecure
randomness and denial of service attacks. The page names an edition by a year; this project cites the address of the
project, which holds no year, and names no edition. `missing-access-control`, `unchecked-call`,
`state-write-after-call`, `weak-randomness` and `unbounded-loop` lean on it.

## Formats

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The CSV format: one record per line ended by CRLF, an optional header line, and a field that holds a comma, a double
quote or a line break put in double quotes, with every double quote inside written twice. The CSV report follows it.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON format. JSON exchanged between systems must be UTF-8. When the names of an object are not unique, the
behavior of the software that reads it is unpredictable, so the JSON reader of the configuration refuses a name given
twice.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

A spreadsheet may read a cell that starts with =, +, -, @, a tab, a carriage return or a line feed as a formula, and no
one escape is safe in every program that opens the file. The CSV report puts a single quote in front of such a field,
and the threat model says to open a report built from files you do not trust with formulas turned off.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The error, warning and notice commands with file, line, col and title parameters create annotations on a file and a
line of the repository. The GitHub format writes one command per finding and escapes what a command gives a meaning
to.
