import { describe } from "vitest";
import { FakeBackpackPool } from "../src/fakes/index.js";
import { backpackPoolContract } from "./backpack-pool-contract.js";

describe("FakeBackpackPool", () => {
  backpackPoolContract(async () => new FakeBackpackPool());
});
