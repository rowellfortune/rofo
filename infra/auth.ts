/// <reference path="../.sst/platform/config.d.ts" />
/** Cognito groups. Admin manages everything, Agent owns listings, Client browses and saves. */
export const GROUPS = ['Admin', 'Agent', 'Client'] as const;

export const userPool = new sst.aws.CognitoUserPool('Users', {
  usernames: ['email'],
  mfa: 'optional',
  softwareToken: true,
  transform: {
    userPool: (args) => {
      args.passwordPolicy = {
        minimumLength: 10,
        requireLowercase: true,
        requireNumbers: true,
        requireUppercase: true,
        requireSymbols: false,
      };
      args.autoVerifiedAttributes = ['email'];
    },
  },
});

export const userPoolClient = userPool.addClient('Web', {
  transform: {
    client: (args) => {
      args.generateSecret = false; // browser app, no secret
      args.explicitAuthFlows = ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'];
      args.preventUserExistenceErrors = 'ENABLED';
    },
  },
});

// One aws.cognito.UserGroup per group. The group name lands in the JWT `cognito:groups` claim.
GROUPS.forEach((name) => {
  new aws.cognito.UserGroup(`Group${name}`, {
    name,
    userPoolId: userPool.id,
    description: `RoFo ${name} users`,
  });
});
