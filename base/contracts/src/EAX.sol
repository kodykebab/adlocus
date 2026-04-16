// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint8, euint64, InEuint64, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract EAX is Ownable {
    struct Advertiser {
        uint64[5] vector;
        uint64 bid;
        uint256 balance;
        address addr;
        bool active;
    }

    Advertiser[10] public advertisers;
    uint256 public nextAdvertiserId;

    IERC20 public token;

    // --- Match task (encrypted state awaiting threshold decryption) ---
    struct MatchTask {
        euint8 winnerIndex;
        address user;
        bool exists;
        bool revealed;
    }

    uint256 public taskCount;
    mapping(uint256 => MatchTask) public tasks;

    // --- Cross-site ad serving state ---
    mapping(address => uint8)   public activeAdvertiser;   // user → winning advertiser ID
    mapping(address => bool)    public hasActiveMatch;      // user has a pending ad to view
    mapping(address => uint256) public lastMatchTask;       // taskId for reference

    euint64 private EUINT64_ZERO;
    euint8 private EUINT8_ZERO;

    // --- Events ---
    event AdvertisersInitialized();
    event AdvertiserRegistered(uint256 indexed id, address indexed addr, uint64 bid);
    event MatchSubmitted(uint256 indexed taskId, address indexed user);
    event MatchRevealed(address indexed user, uint8 advertiserId);
    event ImpressionRecorded(address indexed user, uint8 advertiserId, uint64 payout);

    constructor(address _token) Ownable(msg.sender) {
        token = IERC20(_token);
        EUINT64_ZERO = FHE.asEuint64(0);
        EUINT8_ZERO = FHE.asEuint8(0);
    }

    // --- Advertiser Management ---

    function initializeAdvertisers() external onlyOwner {
        require(nextAdvertiserId == 0, "Already initialized");
        advertisers[0] = Advertiser([uint64(1), 0, 1, 0, 0], 10, 1000 * 10**18, msg.sender, true);
        advertisers[1] = Advertiser([uint64(0), 1, 1, 0, 1], 15, 1000 * 10**18, msg.sender, true);
        advertisers[2] = Advertiser([uint64(1), 1, 0, 1, 0], 12, 1000 * 10**18, msg.sender, true);
        nextAdvertiserId = 3;
        emit AdvertisersInitialized();
    }

    function registerAdvertiser(uint64[5] calldata _vector, uint64 _bid, uint256 _budgetInAttn) external {
        require(nextAdvertiserId < 10, "Max advertisers reached");
        uint256 budgetAmount = _budgetInAttn * 10**18;
        
        // Transfer budget from advertiser to this contract
        require(token.transferFrom(msg.sender, address(this), budgetAmount), "Budget transfer failed");

        uint256 id = nextAdvertiserId++;
        advertisers[id] = Advertiser(_vector, _bid, budgetAmount, msg.sender, true);
        emit AdvertiserRegistered(id, msg.sender, _bid);
    }

    function depositFunds(uint256 _advertiserId, uint256 _amountInAttn) external {
        require(_advertiserId < nextAdvertiserId, "Invalid advertiser");
        uint256 depositAmount = _amountInAttn * 10**18;
        require(token.transferFrom(msg.sender, address(this), depositAmount), "Deposit transfer failed");
        advertisers[_advertiserId].balance += depositAmount;
    }

    // --- Phase 1: Encrypted Matching ---
    // User submits encrypted interest vector. Contract computes FHE dot products
    // against all advertisers and selects the winner (highest score * bid).
    // Only the winnerIndex is stored encrypted — payout is read from the advertiser's bid at claim time.

    function matchIntent(InEuint64[] calldata _encVec) external returns (uint256) {
        require(_encVec.length == 5, "Vector must be size 5");
        
        euint64[5] memory userVector;
        for (uint i = 0; i < 5; i++) {
            userVector[i] = FHE.asEuint64(_encVec[i]);
            FHE.allowThis(userVector[i]);
        }

        euint64 maxValue = EUINT64_ZERO;
        euint8 winnerIndex = EUINT8_ZERO;

        for (uint8 a = 0; a < nextAdvertiserId; a++) {
            // Skip disabled advertisers or those out of budget
            if (!advertisers[a].active || advertisers[a].balance < uint256(advertisers[a].bid) * 10**18) continue;

            euint64 score = EUINT64_ZERO;
            
            // Dot product: sum user vector elements where advertiser targets
            for (uint i = 0; i < 5; i++) {
                if (advertisers[a].vector[i] == 1) {
                    score = FHE.add(score, userVector[i]);
                }
            }

            // Value = score * bid (determines auction winner)
            euint64 bidValue = FHE.mul(score, FHE.asEuint64(advertisers[a].bid));
            
            ebool isHigher = FHE.gt(bidValue, maxValue);
            maxValue = FHE.select(isHigher, bidValue, maxValue);
            winnerIndex = FHE.select(isHigher, FHE.asEuint8(a), winnerIndex);
        }

        uint256 taskId = taskCount++;
        MatchTask storage task = tasks[taskId];
        task.winnerIndex = winnerIndex;
        task.user = msg.sender;
        task.exists = true;
        task.revealed = false;

        // Allow threshold network to decrypt the winner
        FHE.allowPublic(task.winnerIndex);
        FHE.allowThis(task.winnerIndex);

        emit MatchSubmitted(taskId, msg.sender);
        return taskId;
    }

    // --- Phase 2: Reveal Match (after threshold decryption) ---
    // User brings the decrypted winnerIndex + threshold signature.
    // Contract verifies via CoFHE publishDecryptResult and stores the winner assignment.
    // NO PAYMENT — user must be served an ad first.

    function revealMatch(
        uint256 _taskId,
        uint8 _winnerIndex,
        bytes calldata _winnerSig
    ) external {
        MatchTask storage task = tasks[_taskId];
        require(task.exists, "Task not found");
        require(!task.revealed, "Already revealed");
        require(msg.sender == task.user, "Not your task");

        // Verify the threshold decryption result on-chain
        FHE.publishDecryptResult(task.winnerIndex, _winnerIndex, _winnerSig);

        task.revealed = true;

        // Assign the winning advertiser to this user — any site can now serve the ad
        activeAdvertiser[msg.sender] = _winnerIndex;
        hasActiveMatch[msg.sender] = true;
        lastMatchTask[msg.sender] = _taskId;

        emit MatchRevealed(msg.sender, _winnerIndex);
    }

    // --- Phase 3: Record Impression (triggered when ad is actually shown) ---
    // Called by the SDK on ANY website when the winning ad is displayed.
    // This is where payout happens — advertiser's bid is transferred to the user.

    function recordImpression() external {
        require(hasActiveMatch[msg.sender], "No active match");

        uint8 advId = activeAdvertiser[msg.sender];
        require(advertisers[advId].active, "Advertiser inactive");

        uint64 payout = advertisers[advId].bid;
        uint256 payoutInWei = uint256(payout) * 10**18;

        require(advertisers[advId].balance >= payoutInWei, "Advertiser budget exhausted");

        // Reset state — one payout per match
        hasActiveMatch[msg.sender] = false;
        activeAdvertiser[msg.sender] = 0;

        // Deduct from advertiser balance and transfer payout to user
        if (payoutInWei > 0) {
            advertisers[advId].balance -= payoutInWei;
            require(token.transfer(msg.sender, payoutInWei), "Payout transfer failed");
        }

        emit ImpressionRecorded(msg.sender, advId, payout);
    }
}
