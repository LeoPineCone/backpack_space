import { describe } from "vitest";
import { FakePlayerStore } from "../src/fakes/index.js";
import { playerStoreContract } from "./player-store-contract.js";

describe("FakePlayerStore", () => {
  playerStoreContract(async () => new FakePlayerStore());
});
