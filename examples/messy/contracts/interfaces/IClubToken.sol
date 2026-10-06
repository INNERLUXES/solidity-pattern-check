// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The points token of the made-up club, as the vault sees it.
interface IClubToken {
    function mint(address to, uint256 amount) external;

    function balanceOf(address account) external view returns (uint256);
}
