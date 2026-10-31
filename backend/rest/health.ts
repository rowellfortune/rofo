import { RestUtil } from '../utils/RestUtil';

/** Liveness check. No auth. */
export const handler = RestUtil.restHandler(async () => ({ status: 'ok', time: new Date().toISOString() }));
