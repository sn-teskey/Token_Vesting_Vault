
# Token Vesting Vault

A decentralized Ethereum application for managing secure, time-based ERC-20 token distribution to employees, investors, advisors, and project contributors.

## Features

- Multiple vesting schedules in a single vault.
- Configurable start time, cliff, and vesting duration.
- Linear token unlocking.
- Partial and full token releases.
- Revocation of unvested tokens.
- Transferable vesting schedules.
- Withdrawal of unallocated tokens.
- MetaMask integration.
- Interactive web dashboard.
- Ethereum Sepolia deployment.
- Verified smart contracts.
- Unit and property-based fuzz testing.

## Technology Stack

| Component | Technology |
|---|---|
| Smart contracts | Solidity 0.8.28 compiler |
| Development framework | Hardhat 3 |
| Contract libraries | OpenZeppelin 5.2.0 |
| Blockchain integration | Ethers.js v6 |
| Frontend | HTML, CSS, JavaScript |
| Deployment scripts | TypeScript |
| Wallet | MetaMask |
| Testing | Mocha and fast-check |
| Blockchain network | Ethereum Sepolia |
| Version control | Git |

## Project Structure

```text
token-vesting-vault/
├── src/
│   ├── VestingVault.sol
│   └── TestToken.sol
├── test/
│   ├── VestingVault.test.ts
│   └── VestingVault.fuzz.test.ts
├── scripts/
│   ├── deploy.ts
│   ├── deploy-sepolia-vault.ts
│   └── check-sepolia.ts
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── config.js
├── hardhat.config.ts
├── package.json
├── .gitignore
└── README.md
```

## How Vesting Works

Vesting distributes tokens gradually instead of releasing the entire allocation immediately.

Each schedule contains:

- Beneficiary: the token recipient.
- Total: the total token allocation.
- Start: the starting Unix timestamp.
- Cliff: the initial period during which no tokens can be released.
- Duration: the total vesting period, including the cliff.
- Released: tokens already paid to the beneficiary.
- Revocable: whether the owner can revoke the unvested allocation.

### Vesting Formula

Before the cliff ends:

```text
vested = 0
```

After the cliff and before the end:

```text
vested = total * (currentTime - start) / duration
```

At or after the end:

```text
vested = total
```

The currently available amount is:

```text
releasable = vested - released
```

For revoked schedules, the calculation uses the revocation timestamp instead of the current timestamp.

### Vesting Example

Total allocation: 1,000,000 tokens.

Cliff: 12 months.

Total duration: 48 months, including the cliff.

| Time | Vested Tokens | Percentage |
|---|---:|---:|
| Start | 0 | 0% |
| Month 6 | 0 | 0% |
| Before Month 12 | 0 | 0% |
| Month 12 | 250,000 | 25% |
| Month 24 | 500,000 | 50% |
| Month 36 | 750,000 | 75% |
| Month 48 | 1,000,000 | 100% |

The cliff does not reset the linear vesting calculation. When the cliff ends, the accumulated allocation becomes available immediately.

Calculations use integer arithmetic. Rounding is performed downwards, and the full allocation becomes available at the end.

## Smart Contract Functions

| Function | Description | Access |
|---|---|---|
| createSchedule | Creates a vesting schedule | Owner |
| vestedAmount | Calculates vested tokens | Anyone |
| releasable | Calculates currently claimable tokens | Anyone |
| release | Releases available tokens to the beneficiary | Anyone |
| revoke | Revokes unvested tokens | Owner |
| withdrawUnallocated | Withdraws unallocated tokens | Owner |
| schedulesOf | Returns beneficiary schedule IDs | Anyone |
| transferSchedule | Transfers a schedule to another address | Current beneficiary |

The original provided contract section is preserved. Implemented public functions are documented using NatSpec comments.

## Installation

Requirements:

- Node.js
- npm
- Git
- MetaMask for frontend interaction

Install project dependencies:

```bash
npm ci
```

Compile smart contracts:

```bash
npx hardhat compile
```

## Testing

Run all automated tests:

```bash
npx hardhat test
```

Generate a coverage report:

```bash
npx hardhat test --coverage
```

### Test Results

| Test category | Result |
|---|---:|
| Unit tests | 29 passed |
| Property-based fuzz tests | 3 passed |
| Total automated tests | 32 passed |
| Line coverage | 100% |
| Statement coverage | 100% |

The fuzz tests execute 100 randomized cases per property.

Tested scenarios include:

- Vesting before the start and during the cliff.
- Exact cliff and duration boundaries.
- Linear vesting calculations.
- Multiple token releases.
- Revocation before the cliff, during vesting, and after completion.
- Claims after revocation.
- Prevention of over-allocation.
- Unauthorized operations.
- Transfer of vesting schedules.
- Withdrawal of unallocated tokens.
- Invalid input validation.
- Integer rounding.
- Retroactive vesting.
- Vesting monotonicity.
- Vesting upper-bound validation.

## Local Deployment

Start the local Hardhat blockchain:

```bash
npx hardhat node
```

Open a second terminal and deploy the contracts:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

The deployment script deploys TestToken and VestingVault, funds the vault with 10,000 TST, and generates the frontend configuration.

Configure MetaMask:

- Network: Hardhat Localhost
- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337
- Currency symbol: ETH

Hardhat development accounts must never be used to store real funds.

## Frontend

On Windows PowerShell, copy the Ethers.js browser library:

```powershell
Copy-Item node_modules\ethers\dist\ethers.min.js frontend\ethers.min.js
```

Start the frontend server:

```bash
npx http-server frontend -p 8080 -a 127.0.0.1 -c-1
```

Open:

http://127.0.0.1:8080/

Connect MetaMask using the network specified in frontend/config.js.

The dashboard provides:

- Wallet connection.
- Vault and wallet balances.
- Allocated and unallocated token balances.
- Owner management panel.
- Vesting schedule creation.
- Vesting progress visualization.
- Token release.
- Schedule revocation.
- Schedule transfer.
- Personal schedule filtering.

## Sepolia Deployment

Network: Ethereum Sepolia.

Chain ID: 11155111.

### Verified Contracts

TestToken (TST):

`0xa8749531FB7646817a229758b9c3d604fccFbdbf`

[View verified TestToken on Etherscan](https://sepolia.etherscan.io/address/0xa8749531FB7646817a229758b9c3d604fccFbdbf#code)

VestingVault:

`0xb11E6B03e202e5cbacbd34d98d90cb82d28A8C34`

[View verified VestingVault on Etherscan](https://sepolia.etherscan.io/address/0xb11E6B03e202e5cbacbd34d98d90cb82d28A8C34#code)

Both contracts are verified on Etherscan and Sourcify.

### Sepolia Configuration

Store deployment credentials using the encrypted Hardhat Keystore:

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY
```

Check the network connection:

```bash
npx hardhat run scripts/check-sepolia.ts --network sepolia
```

For a fresh deployment:

```bash
npx hardhat run scripts/deploy.ts --network sepolia --build-profile production
```

The deploy-sepolia-vault.ts script was used to complete the existing Sepolia deployment after an RPC transaction limit interrupted the initial deployment.

Do not rerun deployment scripts simply to interact with the existing contracts.

For the existing deployment, use the Sepolia contract addresses listed above in frontend/config.js and select Sepolia in MetaMask.

## Manual Testing

The application was tested locally and on Ethereum Sepolia using MetaMask.

Sepolia scenarios successfully tested:

- Creating vesting schedules.
- Releasing vested tokens.
- Transferring a vesting schedule.
- Revoking a schedule.
- Releasing vested tokens after revocation.

In one Sepolia test, a schedule containing 2,000 TST was revoked at 6% vesting progress. The beneficiary retained 120 TST, while 1,880 TST was returned to the owner.

[Example schedule creation transaction](https://sepolia.etherscan.io/tx/0x9d5fba1d6250ba1a4e6ea59519b0326a725d02ee799d3adaf3fb3080e5058069)

## Security Model

### Owner Permissions

The owner can:

- Create new vesting schedules.
- Revoke schedules marked as revocable.
- Withdraw unallocated tokens.
- Transfer or renounce contract ownership.

The owner cannot directly withdraw tokens reserved for beneficiaries through withdrawUnallocated.

Revoking a schedule does not remove tokens that have already vested.

### Beneficiary Permissions

The beneficiary can:

- Receive vested tokens.
- Transfer a vesting schedule to another valid address.

Anyone can trigger release, but tokens are always sent to the beneficiary rather than the transaction sender.

### Malicious or Compromised Owner

If the owner's private key is compromised, an attacker can revoke revocable schedules, withdraw unallocated tokens, create new schedules using available funds, and transfer contract ownership.

However, the intended contract logic protects vested allocations and prevents revocation of irrevocable schedules.

A production deployment should use multisignature ownership and consider additional administrative protections.

### Implemented Security Measures

- OpenZeppelin Ownable for access control.
- ReentrancyGuard for reentrancy protection.
- SafeERC20 for safer token transfers.
- Checks-Effects-Interactions pattern.
- Solidity checked arithmetic.
- Math.mulDiv for precise vesting calculations.
- Input validation.
- Prevention of token over-allocation.
- Protection of allocated token balances.
- Frozen vesting calculations after revocation.

The main accounting requirement for supported standard ERC-20 tokens is:

```text
vault token balance >= totalAllocated
```

## Known Limitations

- Fee-on-transfer and rebasing tokens are not supported.
- Malicious or non-standard ERC-20 tokens may violate accounting assumptions.
- Vesting depends on blockchain timestamps.
- Large beneficiary schedule lists may increase gas costs during schedule transfers.
- The frontend is designed for the 18-decimal TestToken.
- The frontend does not expose retroactive start dates, although the contract supports them.
- The owner remains a trusted administrator for revocable schedules.
- No multisignature wallet or timelock is configured.
- No independent professional security audit has been performed.
- High test coverage does not guarantee the absence of vulnerabilities.

This project is intended for educational and portfolio purposes. It should not be used with real funds without additional security review.

## Conclusion

Token Vesting Vault demonstrates Solidity development, ERC-20 integration, access control, secure token accounting, automated testing, property-based fuzzing, frontend integration, and public Ethereum testnet deployment.
