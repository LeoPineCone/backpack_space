/**
 * The table ports on DynamoDB. The same code runs against DynamoDB Local (npm run db) and the cloud.
 * Table names come from the settings on every call, so a restored table can be switched to without a deployment.
 */
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { ActionStore, BackpackPool, Item, Page, PlayerStore, Settings, Write } from "../ports/index.js";

export interface DynamoOptions {
  region: string;
  /** only locally: the address of DynamoDB Local */
  endpoint?: string;
}

export function documentClient(opts: DynamoOptions): DynamoDBDocumentClient {
  const local = opts.endpoint !== undefined;
  const client = new DynamoDBClient({
    region: opts.region,
    ...(local ? { endpoint: opts.endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
  });
  return DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
}

/** One write of a transaction with its condition (same rules as FakePlayerStore). */
function transactItem(table: string, w: Write) {
  if ("put" in w) {
    if (w.ifNotExists) return { Put: { TableName: table, Item: w.put, ConditionExpression: "attribute_not_exists(pk)" } };
    if (w.ifVersion !== undefined) {
      // a missing item counts as version 0
      const cond = w.ifVersion === 0 ? "attribute_not_exists(#v) OR #v = :v" : "#v = :v";
      return {
        Put: {
          TableName: table,
          Item: w.put,
          ConditionExpression: cond,
          ExpressionAttributeNames: { "#v": "version" },
          ExpressionAttributeValues: { ":v": w.ifVersion },
        },
      };
    }
    return { Put: { TableName: table, Item: w.put } };
  }
  if (w.ifVersion !== undefined)
    return {
      Delete: {
        TableName: table,
        Key: w.delete,
        ConditionExpression: "#v = :v",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: { ":v": w.ifVersion },
      },
    };
  return { Delete: { TableName: table, Key: w.delete, ...(w.ifExists ? { ConditionExpression: "attribute_exists(pk)" } : {}) } };
}

export class DynamoPlayerStore implements PlayerStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly settings: Settings,
  ) {}
  private async table() {
    return (await this.settings.get()).tables.players;
  }
  async get(pk: string, sk: string): Promise<Item | null> {
    const out = await this.doc.send(new GetCommand({ TableName: await this.table(), Key: { pk, sk }, ConsistentRead: true }));
    return (out.Item as Item | undefined) ?? null;
  }
  async query(pk: string): Promise<Item[]> {
    const table = await this.table();
    const items: Item[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ConsistentRead: true,
          ExclusiveStartKey: start,
        }),
      );
      items.push(...((out.Items ?? []) as Item[]));
      start = out.LastEvaluatedKey;
    } while (start);
    return items;
  }
  async scan(sk: string, next?: string): Promise<Page> {
    return scanPage(this.doc, {
      TableName: await this.table(),
      FilterExpression: "sk = :sk",
      ExpressionAttributeValues: { ":sk": sk },
      ...cursor(next),
    });
  }
  async transact(writes: Write[]): Promise<boolean> {
    if (writes.length === 0) return true;
    const table = await this.table();
    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: writes.map((w) => transactItem(table, w)) }));
      return true;
    } catch (e) {
      if (e instanceof TransactionCanceledException && e.CancellationReasons?.some((r) => r.Code === "ConditionalCheckFailed")) return false;
      throw e;
    }
  }
}

export class DynamoBackpackPool implements BackpackPool {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly settings: Settings,
  ) {}
  async put(item: Item): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: (await this.settings.get()).tables.backpacks, Item: item }));
  }
  async remove(pk: string, sk: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: (await this.settings.get()).tables.backpacks, Key: { pk, sk } }));
  }
  async range(pk: string, from: string, to: string, limit: number): Promise<Item[]> {
    const out = await this.doc.send(
      new QueryCommand({
        TableName: (await this.settings.get()).tables.backpacks,
        KeyConditionExpression: "pk = :pk AND sk BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":pk": pk, ":from": from, ":to": to },
        Limit: limit,
      }),
    );
    return (out.Items as Item[] | undefined) ?? [];
  }
}

export class DynamoActionStore implements ActionStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly settings: Settings,
  ) {}
  async put(item: Item): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: (await this.settings.get()).tables.actions, Item: item }));
  }
  async expired(nowSec: number, next?: string): Promise<Page> {
    return scanPage(this.doc, {
      TableName: (await this.settings.get()).tables.actions,
      FilterExpression: "expiresAt < :now",
      ProjectionExpression: "pk, sk",
      ExpressionAttributeValues: { ":now": nowSec },
      ...cursor(next),
    });
  }
  async remove(pk: string, sk: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: (await this.settings.get()).tables.actions, Key: { pk, sk } }));
  }
}

/** The cursor of a page is DynamoDB's last evaluated key as JSON. */
const cursor = (next?: string) => (next ? { ExclusiveStartKey: JSON.parse(next) as Record<string, unknown> } : {});

/** One scan call; a page can be empty while the table goes on (the filter is applied after reading). */
async function scanPage(doc: DynamoDBDocumentClient, input: ConstructorParameters<typeof ScanCommand>[0]): Promise<Page> {
  const out = await doc.send(new ScanCommand(input));
  const items = (out.Items ?? []) as Item[];
  return out.LastEvaluatedKey ? { items, next: JSON.stringify(out.LastEvaluatedKey) } : { items };
}
