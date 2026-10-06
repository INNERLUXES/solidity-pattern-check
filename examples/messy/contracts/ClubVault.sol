// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IClubToken} from "./interfaces/IClubToken.sol";

/// @title Savings vault of the made-up Brindlewood Savings Club
/// @notice A small illustration of patterns for a review, not a contract to deploy.
/// A comment may name tx.origin, selfdestruct or block.timestamp; the checks never read it.
contract ClubVault {
    address public owner;
    address public feeCollector;
    address public constant RESCUE_DESK = 0x4242424242424242424242424242424242424242;
    IClubToken public token;
    address[] public members;
    mapping(address => uint256) public balances;
    string public motto = "we never trust tx.origin == owner";

    event Deposited(address indexed member, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not the owner");
        _;
    }

    constructor(IClubToken clubToken) {
        owner = msg.sender;
        token = clubToken;
    }

    function deposit() external payable {
        if (balances[msg.sender] == 0) members.push(msg.sender);
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "not enough");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount;
    }

    function payBonus(address payable member, uint256 amount) external onlyOwner {
        member.send(amount);
    }

    function rewardMember(address member, uint256 points) external onlyOwner {
        token.mint(member, points);
    }

    function sweep() external {
        require(tx.origin == owner, "not the owner");
        payable(owner).transfer(address(this).balance);
    }

    function isPerson() external view returns (bool) {
        return tx.origin == msg.sender;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function setFeeCollector(address collector) external {
        feeCollector = collector;
    }

    function payAll(uint256 share) external onlyOwner {
        for (uint256 i = 0; i < members.length; i++) {
            balances[members[i]] += share;
        }
    }

    function sum(uint256[] calldata amounts) external pure returns (uint256 total) {
        for (uint256 i = 0; i < amounts.length; ) {
            total += amounts[i];
            unchecked {
                ++i;
            }
        }
    }

    function readSlot(uint256 slot) external view returns (bytes32 value) {
        assembly {
            value := sload(slot)
        }
    }

    function closeClub() external onlyOwner {
        selfdestruct(payable(owner));
    }
}
