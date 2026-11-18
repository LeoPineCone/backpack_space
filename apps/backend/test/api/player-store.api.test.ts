import { describe, inject } from "vitest";
import { DynamoPlayerStore, documentClient } from "../../src/adapters/dynamodb.js";
import { defaultSettings } from "../../src/fakes/index.js";
import { playerStoreContract } from "../player-store-contract.js";

// Only when the tests started their own DynamoDB Local (not against a deployed backend).
const endpoint = inject("dbEndpoint");

describe.skipIf(!endpoint)("DynamoPlayerStore on DynamoDB Local", () => {
  playerStoreContract(async () => {
    const values = { ...defaultSettings(), tables: { players: "test-players", backpacks: "test-backpacks", actions: "test-actions" } };
    return new DynamoPlayerStore(documentClient({ endpoint, region: "local" }), { get: async () => values });
  });
});
