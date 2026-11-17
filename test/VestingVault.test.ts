
import { describe, it, beforeEach } from "mocha";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();
const { time } = networkHelpers;

describe("VestingVault", function () {
    let token: any;
    let vault: any;

    let owner: any;
    let beneficiary: any;
    let secondBeneficiary: any;
    let stranger: any;

    let start: number;

    const TOTAL = ethers.parseEther("1000");
    const FUNDING = ethers.parseEther("10000");
    const CLIFF = 200;
    const DURATION = 1000;

    beforeEach(async function () {
        [owner, beneficiary, secondBeneficiary, stranger] =
            await ethers.getSigners();

        token = await ethers.deployContract("TestToken");
        await token.waitForDeployment();

        vault = await ethers.deployContract(
            "VestingVault",
            [await token.getAddress()]
        );

        await vault.waitForDeployment();

        await (
            await token.transfer(
                await vault.getAddress(),
                FUNDING
            )
        ).wait();

        start = (await time.latest()) + 100;
    });

    async function createSchedule(revocable = true) {
        await (
            await vault.createSchedule(
                beneficiary.address,
                TOTAL,
                start,
                CLIFF,
                DURATION,
                revocable
            )
        ).wait();
    }

    it("01 - Creates a valid vesting schedule", async function () {
        await createSchedule();

        const schedule = await vault.schedules(1);

        assert.equal(await vault.scheduleCount(), 1n);
        assert.equal(schedule.beneficiary, beneficiary.address);
        assert.equal(schedule.total, TOTAL);
        assert.equal(schedule.released, 0n);
        assert.equal(await vault.totalAllocated(), TOTAL);
    });

    it("02 - Returns zero before vesting starts", async function () {
        await createSchedule();

        await time.increaseTo(start - 1);

        assert.equal(await vault.vestedAmount(1), 0n);
    });

    it("03 - Returns zero during the cliff", async function () {
        await createSchedule();

        await time.increaseTo(start + CLIFF - 1);

        assert.equal(await vault.vestedAmount(1), 0n);
    });

    it("04 - Unlocks accumulated tokens at the cliff", async function () {
        await createSchedule();

        await time.increaseTo(start + CLIFF);

        assert.equal(
            await vault.vestedAmount(1),
            ethers.parseEther("200")
        );
    });

    it("05 - Calculates linear vesting correctly", async function () {
        await createSchedule();

        await time.increaseTo(start + 500);

        assert.equal(
            await vault.vestedAmount(1),
            ethers.parseEther("500")
        );
    });

    it("06 - Fully vests tokens at the end", async function () {
        await createSchedule();

        await time.increaseTo(start + DURATION);

        assert.equal(await vault.vestedAmount(1), TOTAL);
    });

    it("07 - Never vests more than the total", async function () {
        await createSchedule();

        await time.increaseTo(start + DURATION + 5000);

        assert.equal(await vault.vestedAmount(1), TOTAL);
    });

    it("08 - Releases tokens multiple times until fully paid", async function () {
        await createSchedule();

        await time.setNextBlockTimestamp(start + 250);
        await (await vault.release(1)).wait();

        assert.equal(
            await token.balanceOf(beneficiary.address),
            ethers.parseEther("250")
        );

        await time.setNextBlockTimestamp(start + 500);
        await (await vault.release(1)).wait();

        assert.equal(
            await token.balanceOf(beneficiary.address),
            ethers.parseEther("500")
        );

        await time.setNextBlockTimestamp(start + DURATION);
        await (await vault.release(1)).wait();

        const schedule = await vault.schedules(1);

        assert.equal(
            await token.balanceOf(beneficiary.address),
            TOTAL
        );

        assert.equal(schedule.released, TOTAL);
        assert.equal(await vault.releasable(1), 0n);
        assert.equal(await vault.totalAllocated(), 0n);
    });

    it("09 - Rejects release before the cliff", async function () {
        await createSchedule();

        await assert.rejects(async () => {
            await (await vault.release(1)).wait();
        });
    });

    it("10 - Revokes a schedule before the cliff", async function () {
        await createSchedule();

        const ownerBefore =
            await token.balanceOf(owner.address);

        await time.setNextBlockTimestamp(start + 100);
        await (await vault.revoke(1)).wait();

        const schedule = await vault.schedules(1);

        assert.equal(schedule.revoked, true);
        assert.equal(await vault.vestedAmount(1), 0n);
        assert.equal(await vault.totalAllocated(), 0n);

        assert.equal(
            await token.balanceOf(owner.address),
            ownerBefore + TOTAL
        );
    });

    it("11 - Revokes a schedule during linear vesting", async function () {
        await createSchedule();

        const ownerBefore =
            await token.balanceOf(owner.address);

        await time.setNextBlockTimestamp(start + 500);
        await (await vault.revoke(1)).wait();

        const schedule = await vault.schedules(1);

        assert.equal(schedule.revoked, true);

        assert.equal(
            await vault.vestedAmount(1),
            ethers.parseEther("500")
        );

        assert.equal(
            await token.balanceOf(owner.address),
            ownerBefore + ethers.parseEther("500")
        );

        assert.equal(
            await vault.totalAllocated(),
            ethers.parseEther("500")
        );
    });

    it("12 - Revocation after full vesting returns nothing", async function () {
        await createSchedule();

        const ownerBefore =
            await token.balanceOf(owner.address);

        await time.setNextBlockTimestamp(
            start + DURATION + 100
        );

        await (await vault.revoke(1)).wait();

        assert.equal(await vault.vestedAmount(1), TOTAL);

        assert.equal(
            await token.balanceOf(owner.address),
            ownerBefore
        );

        assert.equal(await vault.totalAllocated(), TOTAL);
    });

    it("13 - Freezes vesting time after revocation", async function () {
        await createSchedule();

        await time.setNextBlockTimestamp(start + 500);
        await (await vault.revoke(1)).wait();

        const vestedBefore = await vault.vestedAmount(1);

        await time.increaseTo(start + DURATION + 5000);

        assert.equal(
            await vault.vestedAmount(1),
            vestedBefore
        );
    });

    it("14 - Releases only vested tokens after revocation", async function () {
        await createSchedule();

        await time.setNextBlockTimestamp(start + 500);
        await (await vault.revoke(1)).wait();

        await time.increaseTo(start + DURATION);

        await (
            await vault.connect(beneficiary).release(1)
        ).wait();

        assert.equal(
            await token.balanceOf(beneficiary.address),
            ethers.parseEther("500")
        );

        assert.equal(await vault.releasable(1), 0n);
        assert.equal(await vault.totalAllocated(), 0n);
    });

    it("15 - Rejects allocation exceeding available funds", async function () {
        await createSchedule();

        await assert.rejects(async () => {
            await (
                await vault.createSchedule(
                    beneficiary.address,
                    ethers.parseEther("9001"),
                    start,
                    CLIFF,
                    DURATION,
                    true
                )
            ).wait();
        });
    });

    it("16 - Rejects schedule creation by non-owner", async function () {
        await assert.rejects(async () => {
            await (
                await vault.connect(stranger).createSchedule(
                    stranger.address,
                    TOTAL,
                    start,
                    CLIFF,
                    DURATION,
                    true
                )
            ).wait();
        });
    });

    it("17 - Rejects revocation by non-owner", async function () {
        await createSchedule();

        await assert.rejects(async () => {
            await (
                await vault.connect(stranger).revoke(1)
            ).wait();
        });
    });

    it("18 - Anyone can release but cannot steal tokens", async function () {
        await createSchedule();

        await time.increaseTo(start + DURATION);

        await (
            await vault.connect(stranger).release(1)
        ).wait();

        assert.equal(
            await token.balanceOf(beneficiary.address),
            TOTAL
        );

        assert.equal(
            await token.balanceOf(stranger.address),
            0n
        );
    });

    it("19 - Cannot revoke a non-revocable schedule", async function () {
        await createSchedule(false);

        await assert.rejects(async () => {
            await (await vault.revoke(1)).wait();
        });
    });

    it("20 - Cannot revoke a schedule twice", async function () {
        await createSchedule();

        await (await vault.revoke(1)).wait();

        await assert.rejects(async () => {
            await (await vault.revoke(1)).wait();
        });
    });

    it("21 - Transfers a schedule to another beneficiary", async function () {
        await createSchedule();

        await (
            await vault.connect(beneficiary).transferSchedule(
                1,
                secondBeneficiary.address
            )
        ).wait();

        const schedule = await vault.schedules(1);

        assert.equal(
            schedule.beneficiary,
            secondBeneficiary.address
        );

        assert.deepEqual(
            Array.from(
                await vault.schedulesOf(beneficiary.address)
            ),
            []
        );

        assert.deepEqual(
            Array.from(
                await vault.schedulesOf(secondBeneficiary.address)
            ),
            [1n]
        );
    });

    it("22 - Rejects unauthorized schedule transfer", async function () {
        await createSchedule();

        await assert.rejects(async () => {
            await (
                await vault.connect(stranger).transferSchedule(
                    1,
                    stranger.address
                )
            ).wait();
        });
    });

    it("23 - Withdraws only unallocated tokens", async function () {
        await createSchedule();

        const ownerBefore =
            await token.balanceOf(owner.address);

        await (
            await vault.withdrawUnallocated(owner.address)
        ).wait();

        assert.equal(
            await token.balanceOf(await vault.getAddress()),
            TOTAL
        );

        assert.equal(await vault.totalAllocated(), TOTAL);

        assert.equal(
            await token.balanceOf(owner.address),
            ownerBefore + FUNDING - TOTAL
        );
    });

    it("24 - Rejects withdrawal by non-owner", async function () {
        await assert.rejects(async () => {
            await (
                await vault.connect(stranger).withdrawUnallocated(
                    stranger.address
                )
            ).wait();
        });
    });

    it("25 - Rejects invalid schedule parameters", async function () {
        const invalid = [
            [ethers.ZeroAddress, TOTAL, CLIFF, DURATION],
            [beneficiary.address, 0n, CLIFF, DURATION],
            [beneficiary.address, TOTAL, 0, 0],
            [beneficiary.address, TOTAL, 2000, 1000]
        ] as const;

        for (const [address, amount, cliff, duration] of invalid) {
            await assert.rejects(async () => {
                await (
                    await vault.createSchedule(
                        address,
                        amount,
                        start,
                        cliff,
                        duration,
                        true
                    )
                ).wait();
            });
        }

        assert.equal(await vault.scheduleCount(), 0n);
    });

    it("26 - Rejects unknown schedule IDs", async function () {
        await assert.rejects(async () => {
            await vault.vestedAmount(999);
        });

        await assert.rejects(async () => {
            await vault.releasable(999);
        });
    });

    it("27 - Supports cliff equal to duration", async function () {
        await (
            await vault.createSchedule(
                beneficiary.address,
                TOTAL,
                start,
                DURATION,
                DURATION,
                true
            )
        ).wait();

        await time.increaseTo(start + DURATION - 1);

        assert.equal(await vault.vestedAmount(1), 0n);

        await time.increaseTo(start + DURATION);

        assert.equal(await vault.vestedAmount(1), TOTAL);
    });

    it("28 - Rounds down and releases remainder at the end", async function () {
        await (
            await vault.createSchedule(
                beneficiary.address,
                1000n,
                start,
                0,
                3,
                true
            )
        ).wait();

        await time.increaseTo(start + 1);
        assert.equal(await vault.vestedAmount(1), 333n);

        await time.increaseTo(start + 2);
        assert.equal(await vault.vestedAmount(1), 666n);

        await time.increaseTo(start + 3);
        assert.equal(await vault.vestedAmount(1), 1000n);
    });

    it("29 - Supports a vesting start in the past", async function () {
        const now = await time.latest();
        const pastStart = now - 500;

        await time.setNextBlockTimestamp(now + 1);

        await (
            await vault.createSchedule(
                beneficiary.address,
                TOTAL,
                pastStart,
                CLIFF,
                DURATION,
                true
            )
        ).wait();

        assert.equal(
            await vault.vestedAmount(1),
            ethers.parseEther("501")
        );
    });
});
