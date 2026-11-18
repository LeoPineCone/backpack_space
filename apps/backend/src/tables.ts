/**
 * The three tables (docs/backend.md "Data"), defined once. The local script (`npm run db`) and the cloud setup both
 * read this file, so local and cloud tables never differ. Plain data: no AWS library here.
 *
 * Every table has a string partition key `pk` and a string sort key `sk`; the meaning of the keys is in backend.md.
 */

export type TableName = "players" | "backpacks" | "actions";

export interface TableIndex {
  name: string;
  partitionKey: string;
  sortKey: string;
}

export interface TableDefinition {
  /** what the table holds, for the cloud setup's description */
  purpose: string;
  /** secondary indexes (all string keys, all fields projected) */
  indexes: TableIndex[];
  /** field with an expiry time in seconds since 1970; DynamoDB removes the item after it */
  expiresField?: string;
  /** restore to any second of the last 35 days (cloud only) */
  pointInTimeRestore: boolean;
}

export const TABLES: Record<TableName, TableDefinition> = {
  players: {
    purpose: "everything about a player that must stay consistent: profile, ownership, open run, rounds, handled purchase events",
    indexes: [],
    pointInTimeRestore: true,
  },
  backpacks: {
    purpose: "the opponent pool: bot backpacks and collected player backpacks",
    // all backpacks of one player: "never your own backpack" checks and account deletion
    indexes: [{ name: "byPlayer", partitionKey: "playerId", sortKey: "sk" }],
    expiresField: "expiresAt",
    pointInTimeRestore: true,
  },
  actions: {
    purpose: "the recorded shop actions of every round",
    indexes: [],
    expiresField: "expiresAt",
    pointInTimeRestore: false,
  },
};

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** The create request for one table, in the shape of DynamoDB's CreateTable (billed per request). */
export function createTableRequest(table: TableName, physicalName: string) {
  const def = TABLES[table];
  const attrs = new Set(["pk", "sk", ...def.indexes.flatMap((i) => [i.partitionKey, i.sortKey])]);
  return {
    TableName: physicalName,
    BillingMode: "PAY_PER_REQUEST" as const,
    AttributeDefinitions: [...attrs].map((a) => ({ AttributeName: a, AttributeType: "S" as const })),
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" as const },
      { AttributeName: "sk", KeyType: "RANGE" as const },
    ],
    ...(def.indexes.length > 0
      ? {
          GlobalSecondaryIndexes: def.indexes.map((i) => ({
            IndexName: i.name,
            KeySchema: [
              { AttributeName: i.partitionKey, KeyType: "HASH" as const },
              { AttributeName: i.sortKey, KeyType: "RANGE" as const },
            ],
            Projection: { ProjectionType: "ALL" as const },
          })),
        }
      : {}),
  };
}
