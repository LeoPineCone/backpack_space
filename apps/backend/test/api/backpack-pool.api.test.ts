import { describe, inject } from "vitest";
import { DynamoBackpackPool, documentClient } from "../../src/adapters/dynamodb.js";
import { defaultSettings } from "../../src/fakes/index.js";
import { backpackPoolContract } from "../backpack-pool-contract.js";

// Only when the tests started their own DynamoDB Local (not against a deployed backend).
const endpoint = inject("dbEndpoint");

describe.skipIf(!endpoint)("DynamoBackpackPool on DynamoDB Local", () => {
  backpackPoolContract(async () => {
    const values = { ...defaultSettings(), tables: { players: "test-players", backpacks: "test-backpacks", actions: "test-actions" } };
    return new DynamoBackpackPool(documentClient({ endpoint, region: "local" }), { get: async () => values });
  });
});
