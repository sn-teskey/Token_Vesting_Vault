import { network } from "hardhat";

const { ethers } = await network.connect();

const [signer] = await ethers.getSigners();

const balance = await ethers.provider.getBalance(
  signer.address
);

const chain = await ethers.provider.getNetwork();

console.log("Connected successfully!");
console.log("Network:", chain.name);
console.log("Chain ID:", chain.chainId.toString());
console.log("Account:", signer.address);
console.log("Balance:", ethers.formatEther(balance), "ETH");