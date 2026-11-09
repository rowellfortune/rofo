/**
 * dynalite implements the DynamoDB API except transactions. This proxy sits in front of it and adds
 * TransactWriteItems with DynamoDB's guarantees, as seen by a caller:
 *   - all or nothing: if one item's condition fails, nothing is written;
 *   - CancellationReasons in item order, so code that reads them (pools.ts) behaves as in AWS.
 *
 * How: every request through the proxy runs one at a time, so nothing interleaves with a transaction.
 * A transaction snapshots its items, applies each write with its own condition, and on the first
 * failure (after trying every item, to collect all the reasons) restores the snapshots.
 */

type Json = Record<string, any>;

let queue: Promise<unknown> = Promise.resolve();
/** Run requests strictly one after another. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export interface DdbResponse { status: number; body: string }

/** Proxy one DynamoDB JSON request. `target` is the X-Amz-Target header. */
export function proxyDynamo(upstream: string, target: string, body: string, headers: Record<string, string>): Promise<DdbResponse> {
  return serial(async () => {
    if (target.endsWith('.TransactWriteItems')) return transactWrite(upstream, headers, JSON.parse(body));
    return forward(upstream, target, body, headers);
  });
}

async function forward(upstream: string, target: string, body: string, headers: Record<string, string>): Promise<DdbResponse> {
  const r = await fetch(upstream, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.0', 'x-amz-target': target, authorization: headers.authorization ?? '', 'x-amz-date': headers['x-amz-date'] ?? '' },
    body,
  });
  return { status: r.status, body: await r.text() };
}

/** Call one DynamoDB operation on dynalite and parse the reply. */
async function call(upstream: string, headers: Record<string, string>, op: string, input: Json) {
  const r = await forward(upstream, `DynamoDB_20120810.${op}`, JSON.stringify(input), headers);
  return { ok: r.status === 200, status: r.status, json: JSON.parse(r.body || '{}') as Json };
}

async function transactWrite(upstream: string, headers: Record<string, string>, req: Json): Promise<DdbResponse> {
  const items: Json[] = req.TransactItems ?? [];
  const keyOf = (t: Json) => (t.Put ? { TableName: t.Put.TableName, Key: { pk: t.Put.Item.pk, sk: t.Put.Item.sk } } : { TableName: (t.Update ?? t.Delete ?? t.ConditionCheck).TableName, Key: (t.Update ?? t.Delete ?? t.ConditionCheck).Key });

  // Snapshot every item first, so a failure can put everything back.
  const before: { TableName: string; Key: Json; Item?: Json }[] = [];
  for (const t of items) {
    const k = keyOf(t);
    const got = await call(upstream, headers, 'GetItem', { ...k, ConsistentRead: true });
    before.push({ ...k, Item: got.json.Item });
  }

  const reasons: { Code: string; Message?: string }[] = items.map(() => ({ Code: 'None' }));
  let failed = -1;
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    let r;
    if (t.Put) r = await call(upstream, headers, 'PutItem', t.Put);
    else if (t.Update) r = await call(upstream, headers, 'UpdateItem', t.Update);
    else if (t.Delete) r = await call(upstream, headers, 'DeleteItem', t.Delete);
    else {
      // A pure condition: probe it with a conditional write of a scratch attribute, undone below.
      const c = t.ConditionCheck;
      r = await call(upstream, headers, 'UpdateItem', {
        TableName: c.TableName, Key: c.Key, ConditionExpression: c.ConditionExpression,
        ExpressionAttributeNames: { ...c.ExpressionAttributeNames, '#__probe': '__probe' },
        ExpressionAttributeValues: { ...c.ExpressionAttributeValues, ':__probe': { BOOL: true } },
        UpdateExpression: 'SET #__probe = :__probe',
      });
    }
    if (!r.ok) {
      const type = String(r.json.__type ?? '');
      if (!type.endsWith('ConditionalCheckFailedException')) return { status: r.status, body: JSON.stringify(r.json) };
      reasons[i] = { Code: 'ConditionalCheckFailed', Message: 'The conditional request failed' };
      failed = i; // keep going: AWS reports a reason for every item, not just the first failure
    }
  }

  // Undo on failure, and always undo condition probes.
  for (let i = 0; i < items.length; i++) {
    if (failed === -1 && !items[i].ConditionCheck) continue;
    const b = before[i];
    if (b.Item) await call(upstream, headers, 'PutItem', { TableName: b.TableName, Item: b.Item });
    else await call(upstream, headers, 'DeleteItem', { TableName: b.TableName, Key: b.Key });
  }

  if (failed === -1) return { status: 200, body: '{}' };
  return {
    status: 400,
    body: JSON.stringify({
      __type: 'com.amazonaws.dynamodb.v20120810#TransactionCanceledException',
      message: `Transaction cancelled, please refer cancellation reasons for specific reasons [${reasons.map((r) => r.Code).join(', ')}]`,
      CancellationReasons: reasons,
    }),
  };
}
