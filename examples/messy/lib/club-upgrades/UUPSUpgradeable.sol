// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice A made-up stand-in for an installed library. lib is left out by default and is never read.
abstract contract UUPSUpgradeable {
    function _authorizeUpgrade(address newImplementation) internal virtual;
}
