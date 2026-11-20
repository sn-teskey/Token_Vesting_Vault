import { network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";

const { ethers } = await network.connect();

const [owner] = await ethers.getSigners();

const chain = await ethers.provider.getNetwork();

if (chain.chainId !== 11155111n) {
  throw new Error("Expected Sepolia network");
}

const tokenAddress =
  "0xa8749531FB7646817a229758b9c3d604fccFbdbf";

const code = await ethers.provider.getCode(tokenAddress);

if (code === "0x") {
  throw new Error("TestToken contract not found");
}

const token = await ethers.getContractAt(
  "TestToken",
  tokenAddress
);

console.log("Owner:", owner.address);
console.log("Existing TestToken:", tokenAddress);

console.log("Deploying VestingVault...");

const vault = await ethers.deployContract(
  "VestingVault",
  [tokenAddress]
);

await vault.waitForDeployment();

const vaultAddress = await vault.getAddress();

console.log("VestingVault:", vaultAddress);

const deployTx = vault.deploymentTransaction();

if (deployTx) {
  await deployTx.wait(3);
}

console.log("Funding vault...");

const tx = await token.transfer(
  vaultAddress,
  ethers.parseEther("10000")
);

await tx.wait(3);

const balance = await token.balanceOf(vaultAddress);

console.log(
  "Vault balance:",
  ethers.formatEther(balance),
  "TST"
);

const config = {
  chainId: Number(chain.chainId),
  tokenAddress,
  vaultAddress
};

mkdirSync("frontend", { recursive: true });

writeFileSync(
  "frontend/config.js",
  `export const CONFIG = ${JSON.stringify(config, null, 2)};\n`
);

console.log("Frontend configuration generated");
console.log("Deployment completed!");