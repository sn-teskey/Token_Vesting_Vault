
import { describe, it } from "mocha";
import assert from "node:assert/strict";
import { network } from "hardhat";
import fc from "fast-check";

const { ethers, networkHelpers } = await network.connect();
const { time } = networkHelpers;

describe("VestingVault Fuzz Tests", function () {
    this.timeout(120000);

    async function deployVault() {
        const [owner, beneficiary] = await ethers.getSigners();

        const token = await ethers.deployContract("TestToken");
        await token.waitForDeployment();

        const vault = await ethers.deployContract(
            "VestingVault",
            [await token.getAddress()]
        );

        await vault.waitForDeployment();

        await (
            await token.transfer(
                await vault.getAddress(),
                ethers.parseEther("1000000")
            )
        ).wait();

        return { token, vault, owner, beneficiary };
    }

    const randomSchedule = fc.record({
        amount: fc.integer({ min: 1, max: 1000000 }),
        duration: fc.integer({ min: 1, max: 100000 }),
        cliffSeed: fc.integer({ min: 0, max: 100000 }),
        timeA: fc.integer({ min: 0, max: 200000 }),
        timeB: fc.integer({ min: 0, max: 200000 })
    });

    it("30 - Fuzz: vestedAmount never exceeds total", async function () {
        await fc.assert(
            fc.asyncProperty(randomSchedule, async (data) => {
                const { vault, beneficiary } = await deployVault();

                const total = ethers.parseEther(
                    data.amount.toString()
                );

                const cliff =
                    data.cliffSeed % (data.duration + 1);

                const start = (await time.latest()) + 100;

                await (
                    await vault.createSchedule(
                        beneficiary.address,
                        total,
                        start,
                        cliff,
                        data.duration,
                        true
                    )
                ).wait();

                await time.increaseTo(start + data.timeA);

                const vested = await vault.vestedAmount(1);

                assert.ok(vested >= 0n);
                assert.ok(vested <= total);
            }),
            { numRuns: 100 }
        );
    });

    it("31 - Fuzz: vestedAmount never decreases over time", async function () {
        await fc.assert(
            fc.asyncProperty(randomSchedule, async (data) => {
                const { vault, beneficiary } = await deployVault();

                const total = ethers.parseEther(
                    data.amount.toString()
                );

                const cliff =
                    data.cliffSeed % (data.duration + 1);

                const start = (await time.latest()) + 100;

                await (
                    await vault.createSchedule(
                        beneficiary.address,
                        total,
                        start,
                        cliff,
                        data.duration,
                        true
                    )
                ).wait();

                const firstTime =
                    Math.min(data.timeA, data.timeB);

                const secondTime =
                    Math.max(data.timeA, data.timeB);

                await time.increaseTo(start + firstTime);

                const firstVested =
                    await vault.vestedAmount(1);

                await time.increaseTo(
                    start + Math.max(secondTime, firstTime + 1)
                );

                const secondVested =
                    await vault.vestedAmount(1);

                assert.ok(secondVested >= firstVested);
                assert.ok(secondVested <= total);
            }),
            { numRuns: 100 }
        );
    });

    it("32 - Fuzz: vesting matches the mathematical formula", async function () {
        await fc.assert(
            fc.asyncProperty(randomSchedule, async (data) => {
                const { vault, beneficiary } = await deployVault();

                const total = ethers.parseEther(
                    data.amount.toString()
                );

                const duration = data.duration;
                const cliff = data.cliffSeed % (duration + 1);
                const start = (await time.latest()) + 100;
                const elapsed = data.timeA % (duration + 2);

                await (
                    await vault.createSchedule(
                        beneficiary.address,
                        total,
                        start,
                        cliff,
                        duration,
                        true
                    )
                ).wait();

                await time.increaseTo(start + elapsed);

                let expected: bigint;

                if (elapsed < cliff) {
                    expected = 0n;
                } else if (elapsed >= duration) {
                    expected = total;
                } else {
                    expected =
                        total * BigInt(elapsed) / BigInt(duration);
                }

                assert.equal(
                    await vault.vestedAmount(1),
                    expected
                );
            }),
            { numRuns: 100 }
        );
    });
});
