// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "../../lib/club-upgrades/Initializable.sol";
import {UUPSUpgradeable} from "../../lib/club-upgrades/UUPSUpgradeable.sol";

/// @notice The second version of the made-up club vault, behind a proxy.
contract ClubVaultV2 is Initializable, UUPSUpgradeable {
    address public admin;
    address public plugin;
    uint256 public release;

    event AdminChanged(address previousAdmin, address newAdmin);

    function initialize(address firstAdmin) external {
        admin = firstAdmin;
        release = 2;
    }

    function setAdmin(address newAdmin) external {
        require(msg.sender == admin, "not the admin");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    function setPlugin(address newPlugin) external {
        require(msg.sender == admin, "not the admin");
        plugin = newPlugin;
    }

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == admin, "not the admin");
        (bool ok, bytes memory result) = target.delegatecall(data);
        require(ok, "call failed");
        return result;
    }

    function runPlugin(bytes calldata data) external returns (bytes memory) {
        (, bytes memory output) = plugin.delegatecall(data);
        return output;
    }

    function _authorizeUpgrade(address newImplementation) internal override {}
}
