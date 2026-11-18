import { describe, expect, it } from "vitest";
import { createTableRequest, TABLE_NAMES } from "../src/tables.js";

describe("table definitions", () => {
  it("defines the three tables of docs/backend.md", () => {
    expect(TABLE_NAMES).toEqual(["players", "backpacks", "actions"]);
  });

  it("gives every table string keys pk and sk, billed per request", () => {
    for (const t of TABLE_NAMES) {
      const req = createTableRequest(t, `x-${t}`);
      expect(req.TableName).toBe(`x-${t}`);
      expect(req.BillingMode).toBe("PAY_PER_REQUEST");
      expect(req.KeySchema.map((k) => k.AttributeName)).toEqual(["pk", "sk"]);
    }
  });

  it("finds all backpacks of a player through the byPlayer index", () => {
    const req = createTableRequest("backpacks", "b");
    expect(req.GlobalSecondaryIndexes?.[0]?.IndexName).toBe("byPlayer");
    expect(req.AttributeDefinitions.map((a) => a.AttributeName)).toContain("playerId");
  });
});
