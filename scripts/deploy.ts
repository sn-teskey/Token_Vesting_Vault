import { network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";

const { ethers } = await network.connect();

const [owner, beneficiary, secondBeneficiary] =
  await ethers.getSigners();

console.log("Deploying contracts...");
console.log("Owner:", owner.address);

const token = await ethers.deployContract("TestToken");
await token.waitForDeployment();

const tokenAddress = await token.getAddress();

console.log("TestToken:", tokenAddress);

const vault = await ethers.deployContract(
  "VestingVault",
  [tokenAddress]
);

await vault.waitForDeployment();

const vaultAddress = await vault.getAddress();

console.log("VestingVault:", vaultAddress);

const tx = await token.transfer(
  vaultAddress,
  ethers.parseEther("10000")
);

await tx.wait();

console.log("Vault funded with 10000 TST");

const balance = await token.balanceOf(vaultAddress);

console.log(
  "Vault balance:",
  ethers.formatEther(balance),
  "TST"
);

const chain = await ethers.provider.getNetwork();

const config = {
  chainId: Number(chain.chainId),
  tokenAddress: tokenAddress,
  vaultAddress: vaultAddress
};

mkdirSync("frontend", { recursive: true });

writeFileSync(
  "frontend/config.js",
  `export const CONFIG = ${JSON.stringify(config, null, 2)};\n`
);

console.log("Frontend configuration generated");
console.log("Owner:", owner.address);
console.log("Beneficiary:", beneficiary?.address);
console.log("Second beneficiary:", secondBeneficiary?.address);

console.log("Deployment completed!");