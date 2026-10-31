import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { AppError } from './AppError';

/** CORS headers. The origin comes from the ALLOWED_ORIGIN env var. */
const cors = (): Record<string, string> => ({
  'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? '*',
  'access-control-allow-headers': 'authorization,content-type',
  'content-type': 'application/json',
});

/** Build a JSON response with CORS. */
export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return { statusCode, headers: cors(), body: JSON.stringify(body) };
}

/** Read the Cognito user id from the JWT authorizer. Throws 401 if missing. */
export function getSub(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== 'string') throw new AppError('Sign in required', 401);
  return sub;
}

/**
 * Turn the groups claim from API Gateway into a list.
 * A JWT authorizer hands arrays over as text, for example "[Agent Admin]", "Agent" or "Agent,Admin".
 */
export function parseGroups(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim !== 'string') return [];
  return claim.replace(/^\[|\]$/g, '').split(/[\s,]+/).map((g) => g.replace(/^["']|["']$/g, '')).filter(Boolean);
}

/** Groups of the signed in user, read from the JWT authorizer. */
export const getGroups = (event: APIGatewayProxyEventV2WithJWTAuthorizer): string[] =>
  parseGroups(event.requestContext.authorizer?.jwt?.claims?.['cognito:groups']);

/**
 * Wrap a Lambda so it returns HTTP JSON with CORS and consistent errors.
 * Success: 200 { success: true, data }. Failure: { success: false, error }.
 */
function restHandler<TData>(
  fn: (event: APIGatewayProxyEventV2WithJWTAuthorizer) => Promise<TData>,
) {
  return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      return json(200, { success: true, data: await fn(event) });
    } catch (err) {
      if (err instanceof AppError) return json(err.status, { success: false, error: err.message });
      console.error('Unhandled REST error', err);
      return json(500, { success: false, error: 'Internal error' });
    }
  };
}

export const RestUtil = { restHandler, getSub, getGroups, json };
