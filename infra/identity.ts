/// <reference path="../.sst/platform/config.d.ts" />
import { graphql } from './api';
import { userPool, userPoolClient } from './auth';

/** AppSync field ARNs that IAM (guest) callers may invoke. */
const publicQueries = ['searchListings', 'getListing'].map(
  (field) => $interpolate`${graphql.arn}/types/Query/fields/${field}`,
);

/**
 * Identity pool. Guests get the unauthenticated role, which may call only the
 * public search queries. Writes always use the user pool JWT, never IAM.
 */
export const identityPool = new sst.aws.CognitoIdentityPool('Identity', {
  userPools: [{ userPool: userPool.id, client: userPoolClient.id }],
  permissions: {
    unauthenticated: [{ actions: ['appsync:GraphQL'], resources: publicQueries }],
    authenticated: [{ actions: ['appsync:GraphQL'], resources: publicQueries }],
  },
});
