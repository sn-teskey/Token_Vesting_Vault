// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title VestingVault — token vesting with cliff, linear unlock and revocation (STUDENT STARTER)
/// @notice One vault holds tokens for many beneficiaries. The owner (e.g. the project team)
///         creates schedules; beneficiaries (team, investors, advisors) receive tokens over time.
contract VestingVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    //  PROVIDED PART
    // ============================================================

    struct Schedule {
        address beneficiary;
        uint256 total;
        uint256 released;
        uint64 start;
        uint64 cliff;
        uint64 duration;
        uint64 revokedAt;
        bool revocable;
        bool revoked;
    }

    IERC20 public immutable token;
    uint256 public scheduleCount;
    uint256 public totalAllocated;

    mapping(uint256 => Schedule) public schedules;
    mapping(address => uint256[]) private _schedulesOf;

    event ScheduleCreated(uint256 indexed id, address indexed beneficiary, uint256 amount, uint64 start, uint64 cliff, uint64 duration, bool revocable);
    event Released(uint256 indexed id, address indexed beneficiary, uint256 amount);
    event Revoked(uint256 indexed id, uint256 returnedToOwner);
    event ScheduleTransferred(uint256 indexed id, address indexed from, address indexed to);

    constructor(IERC20 token_) Ownable(msg.sender) {
        require(address(token_) != address(0), "zero token");
        token = token_;
    }

    // ============================================================
    //  YOUR CODE STARTS HERE
    // ============================================================

    /// @notice Creates a new vesting schedule.
    /// @param beneficiary Address receiving the tokens.
    /// @param amount Total allocated tokens.
    /// @param start Vesting start timestamp.
    /// @param cliff Initial lock period in seconds.
    /// @param duration Total vesting duration in seconds.
    /// @param revocable Whether the owner can revoke the schedule.
    /// @return id Identifier of the created schedule.
    function createSchedule(
        address beneficiary,
        uint256 amount,
        uint64 start,
        uint64 cliff,
        uint64 duration,
        bool revocable
    ) external onlyOwner nonReentrant returns (uint256 id) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Zero amount");
        require(duration > 0, "Zero duration");
        require(cliff <= duration, "Invalid cliff");

        uint256 balance = token.balanceOf(address(this));

        require(balance >= totalAllocated, "Insolvent vault");
        require(balance - totalAllocated >= amount, "Insufficient tokens");

        id = ++scheduleCount;

        schedules[id] = Schedule({
            beneficiary: beneficiary,
            total: amount,
            released: 0,
            start: start,
            cliff: cliff,
            duration: duration,
            revokedAt: 0,
            revocable: revocable,
            revoked: false
        });

        _schedulesOf[beneficiary].push(id);
        totalAllocated += amount;

        emit ScheduleCreated(
            id, beneficiary, amount, start, cliff, duration, revocable
        );
    }

    /// @notice Returns the total vested amount.
    /// @param id Schedule identifier.
    /// @return Total unlocked tokens.
    function vestedAmount(uint256 id) public view returns (uint256) {
        require(id > 0 && id <= scheduleCount, "Unknown schedule");

        return _vested(schedules[id]);
    }

    function _vested(Schedule storage s) internal view returns (uint256) {
        uint256 t = s.revoked ? uint256(s.revokedAt) : block.timestamp;
        uint256 start = uint256(s.start);

        if (t < start + uint256(s.cliff)) {
            return 0;
        }

        if (t >= start + uint256(s.duration)) {
            return s.total;
        }

        return Math.mulDiv(s.total, t - start, uint256(s.duration));
    }

    /// @notice Returns tokens currently available for release.
    /// @param id Schedule identifier.
    /// @return Unreleased vested tokens.
    function releasable(uint256 id) public view returns (uint256) {
        return vestedAmount(id) - schedules[id].released;
    }

    /// @notice Releases available tokens to the beneficiary.
    /// @param id Schedule identifier.
    function release(uint256 id) external nonReentrant {
        uint256 amount = releasable(id);
        require(amount > 0, "Nothing to release");

        Schedule storage s = schedules[id];
        address beneficiary = s.beneficiary;

        s.released += amount;
        totalAllocated -= amount;

        token.safeTransfer(beneficiary, amount);

        emit Released(id, beneficiary, amount);
    }

    /// @notice Revokes unvested tokens and returns them to the owner.
    /// @param id Schedule identifier.
    function revoke(uint256 id) external onlyOwner nonReentrant {
        require(id > 0 && id <= scheduleCount, "Unknown schedule");

        Schedule storage s = schedules[id];

        require(s.revocable, "Not revocable");
        require(!s.revoked, "Already revoked");

        uint256 vested = _vested(s);
        uint256 refund = s.total - vested;

        s.revoked = true;
        s.revokedAt = uint64(block.timestamp);

        totalAllocated -= refund;

        if (refund > 0) {
            token.safeTransfer(owner(), refund);
        }

        emit Revoked(id, refund);
    }

    /// @notice Withdraws tokens not allocated to any schedule.
    /// @param to Address receiving unallocated tokens.
    /// @return amount Number of withdrawn tokens.
    function withdrawUnallocated(address to)
        external
        onlyOwner
        nonReentrant
        returns (uint256 amount)
    {
        require(to != address(0), "Invalid recipient");

        uint256 balance = token.balanceOf(address(this));

        require(balance > totalAllocated, "Nothing to withdraw");

        amount = balance - totalAllocated;

        token.safeTransfer(to, amount);
    }

    /// @notice Lists schedules belonging to a beneficiary.
    /// @param beneficiary Beneficiary address.
    /// @return Array of schedule identifiers.
    function schedulesOf(address beneficiary)
        external
        view
        returns (uint256[] memory)
    {
        return _schedulesOf[beneficiary];
    }

    /// @notice Transfers a schedule to a new beneficiary.
    /// @param id Schedule identifier.
    /// @param newBeneficiary New beneficiary address.
    function transferSchedule(uint256 id, address newBeneficiary)
        external
        nonReentrant
    {
        require(id > 0 && id <= scheduleCount, "Unknown schedule");
        require(newBeneficiary != address(0), "Invalid beneficiary");

        Schedule storage s = schedules[id];

        require(msg.sender == s.beneficiary, "Not beneficiary");

        address oldBeneficiary = s.beneficiary;
        uint256[] storage ids = _schedulesOf[oldBeneficiary];

        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == id) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }

        s.beneficiary = newBeneficiary;
        _schedulesOf[newBeneficiary].push(id);

        emit ScheduleTransferred(id, oldBeneficiary, newBeneficiary);
    }
}
