import { AdminAddUserToGroupCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});

/**
 * Runs after a user confirms their email. Puts every new account in the Client group.
 * Agent and Admin are assigned by an admin, never by sign up.
 * If this fails, the user would be left without a group, so we let the error surface and retry sign in.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  if (event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: 'Client',
    }));
  }
  return event;
};
