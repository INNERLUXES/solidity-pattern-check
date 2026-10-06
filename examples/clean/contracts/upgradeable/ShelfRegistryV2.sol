// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "../../lib/upgrades/Initializable.sol";
import {UUPSUpgradeable} from "../../lib/upgrades/UUPSUpgradeable.sol";

/// @notice The second version of the made-up book swap registry, behind a proxy.
contract ShelfRegistryV2 is Initializable, UUPSUpgradeable {
    address public owner;

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not the owner");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address firstOwner) external initializer {
        owner = firstOwner;
        emit OwnerChanged(address(0), firstOwner);
    }

    function setOwner(address newOwner) external onlyOwner {
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
