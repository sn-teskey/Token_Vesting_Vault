
import { ethers } from "./ethers.min.js";
import { CONFIG } from "./config.js";

const VAULT_ABI = [
    "function owner() view returns (address)",
    "function token() view returns (address)",
    "function scheduleCount() view returns (uint256)",
    "function totalAllocated() view returns (uint256)",
    "function schedules(uint256) view returns (address beneficiary, uint256 total, uint256 released, uint64 start, uint64 cliff, uint64 duration, uint64 revokedAt, bool revocable, bool revoked)",
    "function vestedAmount(uint256 id) view returns (uint256)",
    "function releasable(uint256 id) view returns (uint256)",
    "function schedulesOf(address beneficiary) view returns (uint256[])",
    "function createSchedule(address beneficiary, uint256 amount, uint64 start, uint64 cliff, uint64 duration, bool revocable)",
    "function release(uint256 id)",
    "function revoke(uint256 id)",
    "function withdrawUnallocated(address to) returns (uint256)",
    "function transferSchedule(uint256 id, address newBeneficiary)"
];

const TOKEN_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

let provider;
let signer;
let vault;
let token;
let account;
let isOwner = false;
let connected = false;
let busy = false;
let refreshing = false;

const $ = id => document.getElementById(id);

function formatAmount(value) {
    const [whole, fraction = ""] =
        ethers.formatUnits(value, 18).split(".");

    const formatted = BigInt(whole).toLocaleString("en-US");
    const decimal = fraction.slice(0, 4).replace(/0+$/, "");

    return decimal ? `${formatted}.${decimal}` : formatted;
}

function shortAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function sameAddress(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}

function showStatus(message, type = "") {
    const status = $("status");

    status.hidden = false;
    status.className = `status ${type}`;
    status.textContent = message;
}

function showError(error) {
    showStatus(
        error.shortMessage ||
        error.reason ||
        error.message ||
        "Unknown error",
        "error"
    );
    console.error(error);
}

function validateAddress(value) {
    const address = ethers.getAddress(value.trim());

    if (address === ethers.ZeroAddress) {
        throw new Error("Zero address is not allowed");
    }

    return address;
}

function parseAmount(value) {
    const amount = ethers.parseUnits(value.trim(), 18);

    if (amount <= 0n) {
        throw new Error("Amount must be greater than zero");
    }

    return amount;
}

async function connectWallet() {
    try {
        connected = false;

        if (!window.ethereum) {
            throw new Error("MetaMask is not installed.");
        }

        await window.ethereum.request({
            method: "eth_requestAccounts"
        });

        provider = new ethers.BrowserProvider(window.ethereum);

        let network = await provider.getNetwork();

        if (Number(network.chainId) !== CONFIG.chainId) {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{
                    chainId: ethers.toQuantity(CONFIG.chainId)
                }]
            });

            provider = new ethers.BrowserProvider(window.ethereum);
            network = await provider.getNetwork();
        }

        if (Number(network.chainId) !== CONFIG.chainId) {
            throw new Error("Incorrect blockchain network.");
        }

        signer = await provider.getSigner();
        account = await signer.getAddress();

        if (
            await provider.getCode(CONFIG.vaultAddress) === "0x" ||
            await provider.getCode(CONFIG.tokenAddress) === "0x"
        ) {
            throw new Error(
                "Contracts not found. Start Hardhat and deploy again."
            );
        }

        vault = new ethers.Contract(
            CONFIG.vaultAddress, VAULT_ABI, signer
        );

        token = new ethers.Contract(
            CONFIG.tokenAddress, TOKEN_ABI, signer
        );

        const owner = await vault.owner();

        isOwner = sameAddress(owner, account);
        connected = true;

        $("connectBtn").textContent = shortAddress(account);

        $("networkName").textContent =
            CONFIG.chainId === 31337
                ? "Hardhat Localhost"
                : CONFIG.chainId === 11155111
                    ? "Sepolia"
                    : `Chain ${CONFIG.chainId}`;

        $("walletInfo").textContent =
            `${account} | Role: ${isOwner ? "Owner" : "Beneficiary"}`;

        $("ownerPanel").hidden = !isOwner;
        $("withdrawTo").value = account;

        showStatus("Wallet connected successfully.", "success");

        await refreshData();

    } catch (error) {
        connected = false;
        $("ownerPanel").hidden = true;
        showError(error);
    }
}

async function refreshData() {
    if (!connected || refreshing || busy) return;

    refreshing = true;

    try {
        const block = await provider.getBlock("latest");

        const options = { blockTag: block.number };

        const [balance, allocated, walletBalance, count] =
            await Promise.all([
                token.balanceOf(CONFIG.vaultAddress, options),
                vault.totalAllocated(options),
                token.balanceOf(account, options),
                vault.scheduleCount(options)
            ]);

        $("vaultBalance").textContent = formatAmount(balance);
        $("allocated").textContent = formatAmount(allocated);
        $("unallocated").textContent = formatAmount(balance - allocated);
        $("walletBalance").textContent = formatAmount(walletBalance);

        $("scheduleCount").textContent = `${count} schedules`;

        await loadSchedules(count, block);

    } catch (error) {
        showError(error);
    } finally {
        refreshing = false;
    }
}

async function loadSchedules(count, block) {
    const list = $("scheduleList");

    const filter = $("scheduleFilter").value;
    const options = { blockTag: block.number };

    let ids = [];

    if (filter === "mine") {
        ids = Array.from(
            await vault.schedulesOf(account, options)
        );
    } else {
        for (let i = 1n; i <= count; i++) {
            ids.push(i);
        }
    }

    if (ids.length === 0) {
        list.innerHTML =
            '<div class="empty">No vesting schedules found.</div>';
        return;
    }

    const cards = [];

    for (const id of ids.reverse()) {
        const [schedule, vested, available] =
            await Promise.all([
                vault.schedules(id, options),
                vault.vestedAmount(id, options),
                vault.releasable(id, options)
            ]);

        const now = BigInt(block.timestamp);
        const cliffEnd = schedule.start + schedule.cliff;
        const end = schedule.start + schedule.duration;

        let status = "Active";

        if (schedule.revoked) {
            status = "Revoked";
        } else if (now < schedule.start) {
            status = "Pending";
        } else if (now < cliffEnd) {
            status = "Cliff Locked";
        } else if (now >= end) {
            status = "Fully Vested";
        }

        const progress = schedule.total === 0n
            ? 0
            : Number(vested * 10000n / schedule.total) / 100;

        const remaining = schedule.revoked
            ? vested - schedule.released
            : schedule.total - schedule.released;

        const canTransfer = sameAddress(
            account, schedule.beneficiary
        );

        const canRevoke =
            isOwner && schedule.revocable && !schedule.revoked;

        const startDate = new Date(
            Number(schedule.start) * 1000
        ).toLocaleString();

        const endDate = new Date(
            Number(end) * 1000
        ).toLocaleString();

        cards.push(`
            <article class="schedule-card">
                <div class="schedule-header">
                    <h3>Schedule #${id}</h3>
                    <span class="badge">${status}</span>
                </div>

                <div class="address">
                    Beneficiary: ${schedule.beneficiary}
                </div>

                <p style="margin-top:15px">
                    Vesting Progress: ${progress.toFixed(2)}%
                </p>

                <div class="progress-bar">
                    <div class="progress-fill"
                         style="width:${progress}%"></div>
                </div>

                <div class="schedule-amounts">
                    <div>
                        <span>Total</span>
                        <strong>${formatAmount(schedule.total)}</strong>
                    </div>

                    <div>
                        <span>Released</span>
                        <strong>${formatAmount(schedule.released)}</strong>
                    </div>

                    <div>
                        <span>Claimable</span>
                        <strong>${formatAmount(available)}</strong>
                    </div>

                    <div>
                        <span>Remaining</span>
                        <strong>${formatAmount(remaining)}</strong>
                    </div>
                </div>

                <div class="schedule-details">
                    Start: ${startDate}<br>
                    End: ${endDate}<br>
                    Cliff: ${schedule.cliff} seconds<br>
                    Duration: ${schedule.duration} seconds<br>
                    Revocable: ${schedule.revocable ? "Yes" : "No"}
                </div>

                <div class="actions">
                    <button data-action="release" data-id="${id}"
                        ${available === 0n ? "disabled" : ""}>
                        Release Tokens
                    </button>

                    ${canTransfer ? `
                        <button class="secondary"
                                data-action="transfer"
                                data-id="${id}">
                            Transfer Schedule
                        </button>
                    ` : ""}

                    ${canRevoke ? `
                        <button class="danger"
                                data-action="revoke"
                                data-id="${id}">
                            Revoke
                        </button>
                    ` : ""}
                </div>
            </article>
        `);
    }

    list.innerHTML = cards.join("");
}

async function executeTransaction(action, message) {
    if (!connected) {
        showStatus("Connect your wallet first.", "error");
        return;
    }

    if (busy) return;

    busy = true;
    showStatus("Confirm transaction in MetaMask...");

    try {
        const tx = await action();

        showStatus(
            `Transaction pending: ${tx.hash}`
        );

        await tx.wait();

        showStatus(
            `${message} Transaction: ${tx.hash}`,
            "success"
        );

    } catch (error) {
        showError(error);
    } finally {
        busy = false;
        await refreshData();
    }
}

$("connectBtn").addEventListener("click", connectWallet);
$("refreshBtn").addEventListener("click", refreshData);
$("scheduleFilter").addEventListener("change", refreshData);

$("createForm").addEventListener("submit", async event => {
    event.preventDefault();

    await executeTransaction(async () => {
        const beneficiary = validateAddress($("beneficiary").value);
        const amount = parseAmount($("amount").value);

        const delay = BigInt($("startDelay").value);
        const cliff = BigInt($("cliff").value);
        const duration = BigInt($("duration").value);

        if (delay < 0n || cliff < 0n || duration <= 0n) {
            throw new Error("Invalid vesting parameters");
        }

        if (cliff > duration) {
            throw new Error("Cliff cannot exceed duration");
        }

        const block = await provider.getBlock("latest");
        const start = BigInt(block.timestamp) + delay;

        return vault.createSchedule(
            beneficiary,
            amount,
            start,
            cliff,
            duration,
            $("revocable").checked
        );
    }, "Vesting schedule created!");
});

$("fundForm").addEventListener("submit", async event => {
    event.preventDefault();

    await executeTransaction(async () => {
        const amount = parseAmount($("fundAmount").value);

        return token.transfer(CONFIG.vaultAddress, amount);
    }, "Vault funded successfully!");
});

$("withdrawForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!confirm("Withdraw all unallocated tokens?")) return;

    await executeTransaction(async () => {
        const recipient = validateAddress($("withdrawTo").value);
        return vault.withdrawUnallocated(recipient);
    }, "Unallocated tokens withdrawn!");
});

$("scheduleList").addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button || !connected || busy) return;

    const id = BigInt(button.dataset.id);
    const action = button.dataset.action;

    if (action === "release") {
        await executeTransaction(
            () => vault.release(id),
            "Tokens released successfully!"
        );
    }

    if (action === "revoke") {
        if (!confirm(`Revoke schedule #${id}?`)) return;

        await executeTransaction(
            () => vault.revoke(id),
            "Schedule revoked!"
        );
    }

    if (action === "transfer") {
        const recipient = prompt("New beneficiary address:");

        if (!recipient) return;

        await executeTransaction(
            () => vault.transferSchedule(
                id, validateAddress(recipient)
            ),
            "Schedule transferred!"
        );
    }
});

if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
        window.location.reload();
    });

    window.ethereum.on("chainChanged", () => {
        window.location.reload();
    });

    window.ethereum.request({
        method: "eth_accounts"
    }).then(accounts => {
        if (accounts.length > 0) {
            connectWallet();
        }
    }).catch(console.error);
}

setInterval(refreshData, 5000);
