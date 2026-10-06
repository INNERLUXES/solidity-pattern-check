// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Deposits of the made-up Fernmoor Book Swap
/// @notice A small illustration of patterns for a review, not a contract to deploy.
contract ShelfRegistry {
    address public owner;
    mapping(address => uint256) public deposits;

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event Deposited(address indexed member, uint256 amount);
    event Withdrawn(address indexed member, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerChanged(address(0), msg.sender);
    }

    function deposit() external payable {
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "not enough");
        deposits[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "no owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function total(uint256[] calldata amounts) external pure returns (uint256 sum) {
        for (uint256 i = 0; i < amounts.length; i++) {
            sum += amounts[i];
        }
    }
}
