/**
 * Backup and log policy, in one place so it is easy to read, change and test.
 * Pure functions with no SST globals, so tests can import this file.
 *
 * "production" is the only stage that keeps data on removal (see sst.config.ts).
 */

/** Log retention values we use. These are valid SST retention names. */
export type Retention = '1 week' | '1 month' | '3 months';

export const isProduction = (stage: string): boolean => stage === 'production';

/**
 * How long Lambda logs and API access logs are kept.
 * dev: a week is enough to debug and keeps the log list short.
 * production: three months, long enough to investigate a problem found late.
 * SST's own default is "1 month". We set it here so the choice is visible and cannot drift.
 */
export const logRetention = (stage: string): Retention => (isProduction(stage) ? '3 months' : '1 week');

/**
 * Point in time recovery lets you restore the table to any second in the last 35 days.
 * SST turns it on for every table already (3.19 and 4.17). We pin it so an SST upgrade cannot switch it off.
 * It protects against bad writes and deleted items. It does not protect against the table being deleted.
 */
export const pointInTimeRecovery = (_stage: string): boolean => true;

/**
 * Blocks deleting the table, whether by `sst remove`, a console click or a CLI call.
 * Off for dev so `sst remove --stage dev` still cleans up. To intentionally remove production,
 * first set this to false, deploy, then remove.
 */
export const tableDeletionProtection = (stage: string): boolean => isProduction(stage);
