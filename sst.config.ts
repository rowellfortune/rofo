/// <reference path="./.sst/platform/config.d.ts" />

/**
 * RoFo estate backend (SST v3).
 * Infra is split by concern under /infra and imported in order.
 */
export default $config({
  app(input) {
    const isProd = input?.stage === 'production';
    return {
      name: 'rofo',
      removal: isProd ? 'retain' : 'remove', // never delete prod data
      protect: isProd,
      home: 'aws',
      providers: { aws: { region: 'us-east-1' } },
    };
  },
  async run() {
    const { table, images, cdn } = await import('./infra/storage');
    const { userPool, userPoolClient } = await import('./infra/auth');
    const { graphql, rest } = await import('./infra/api');
    const { identityPool } = await import('./infra/identity');

    return {
      region: 'us-east-1',
      tableName: table.name,
      imagesBucket: images.name,
      cdnUrl: $interpolate`https://${cdn.domainName}`,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      identityPoolId: identityPool.id,
      graphqlUrl: graphql.uris.apply((u) => u['GRAPHQL']),
      restUrl: rest.url,
    };
  },
});
