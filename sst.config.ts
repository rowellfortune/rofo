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
    // Register these BEFORE any component is created, or they silently do nothing.
    // $transform reaches every Function, including the ones SST creates for API routes and Cognito triggers.
    const { logRetention } = await import('./infra/policy');
    const retention = logRetention($app.stage);
    $transform(sst.aws.Function, (args) => {
      if (args.logging === undefined) args.logging = { retention }; // respect an explicit setting on a function
    });
    $transform(sst.aws.ApiGatewayV2, (args) => {
      // args is undefined if a gateway is created with no options. SST's default of 1 month applies then.
      if (args && args.accessLog === undefined) args.accessLog = { retention };
    });

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
