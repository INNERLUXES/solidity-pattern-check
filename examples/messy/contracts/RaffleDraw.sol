// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

/// @notice A raffle of the made-up club, kept small to show the patterns.
contract RaffleDraw {
    address public organizer;
    address[] public tickets;
    mapping(bytes32 => bool) public usedClaims;
    uint256 public closesAt;

    constructor(uint256 openFor) {
        organizer = msg.sender;
        closesAt = block.timestamp + openFor;
    }

    function buy() external payable {
        require(block.timestamp < closesAt, "closed");
        tickets.push(msg.sender);
    }

    function drawWinner() external view returns (address) {
        uint256 pick = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao))) % tickets.length;
        return tickets[pick];
    }

    function claim(bytes32 prize, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 digest = keccak256(abi.encodePacked(prize, msg.sender));
        address signer = ecrecover(digest, v, r, s);
        require(signer == organizer, "bad signature");
        bytes32 claimId = keccak256(abi.encodePacked(v, r, s));
        require(!usedClaims[claimId], "already claimed");
        usedClaims[claimId] = true;
    }
}
