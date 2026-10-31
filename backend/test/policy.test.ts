/**
 * Backup and log policy. Real deploys are not run here, so this pins the decisions and
 * guards the one easy-to-break detail: transforms must be registered before components exist.
 * Run: npm run test:backend
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isProduction, logRetention, pointInTimeRecovery, tableDeletionProtection } from '../../infra/policy';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('log retention: short for dev, long for production, never forever', () => {
  assert.equal(logRetention('production'), '3 months');
  for (const stage of ['dev', 'staging', 'pr-42', 'alice']) assert.equal(logRetention(stage), '1 week');
  for (const stage of ['production', 'dev']) assert.notEqual(logRetention(stage) as string, 'forever'); // forever = unbounded cost
});

test('point in time recovery is on for every stage', () => {
  for (const stage of ['production', 'dev', 'staging']) assert.equal(pointInTimeRecovery(stage), true);
});

test('only production gets table deletion protection, so dev can still be removed', () => {
  assert.equal(tableDeletionProtection('production'), true);
  for (const stage of ['dev', 'staging', 'Production', 'production-2']) assert.equal(tableDeletionProtection(stage), false); // exact match only
  assert.equal(isProduction('production'), true);
});

test('sst.config registers log transforms before it loads any infra', () => {
  const cfg = read('sst.config.ts');
  const fn = cfg.indexOf('$transform(sst.aws.Function');
  const api = cfg.indexOf('$transform(sst.aws.ApiGatewayV2');
  const firstInfra = cfg.search(/await import\('\.\/infra\/(storage|auth|api|identity)'\)/);
  assert.ok(fn > -1 && api > -1, 'both transforms must exist');
  assert.ok(firstInfra > -1);
  assert.ok(fn < firstInfra && api < firstInfra, 'transforms registered after components are created would do nothing');
  assert.match(cfg, /logRetention\(\$app\.stage\)/); // uses the stage policy, not a hardcoded value
});

test('the production stage in sst.config matches the policy module', () => {
  // sst.config cannot import the policy at the top level, so keep the two definitions in step.
  assert.match(read('sst.config.ts'), /input\?\.stage === 'production'/);
  assert.equal(isProduction('production'), true);
});

test('storage wires the policy into the table', () => {
  const s = read('infra/storage.ts');
  assert.match(s, /deletionProtection: tableDeletionProtection\(\$app\.stage\)/);
  assert.match(s, /pointInTimeRecovery = \{ enabled: pointInTimeRecovery\(\$app\.stage\) \}/);
});
