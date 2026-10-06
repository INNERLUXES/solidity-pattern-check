// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice A stand-in token for tests. The configuration leaves the mocks folder out.
contract MockClubToken {
    address public minter;
    uint256 public minted;

    function mint(address to, uint256 amount) external {
        require(tx.origin == minter, "not the minter");
        require(to != address(0), "no receiver");
        minted += amount;
    }
}
