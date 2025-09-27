const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem');
const axios = require('axios');

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;

let jwks = null;

async function testCognitoConnection() {
  if (!USER_POOL_ID || !CLIENT_ID) {
    throw new Error('Cognito configuration missing');
  }
  console.log('Cognito configuration verified');
}

// Load JWKs for token verification
async function loadJWKs() {
  if (!jwks) {
    try {
      const response = await axios.get(
        `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`
      );
      jwks = response.data.keys;
    } catch (error) {
      console.error('Failed to load JWKs:', error);
    }
  }
  return jwks;
}

async function signUp(username, email, password) {
  try {
    const command = new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
{Name:'name',Value:username}
      ],
      SecretHash: generateSecretHash(username)
    });

    const result = await cognitoClient.send(command);
    return { success: true, userSub: result.UserSub };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function confirmSignUp(username, confirmationCode) {
  try {
    const command = new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: username,
      ConfirmationCode: confirmationCode,
      SecretHash: generateSecretHash(username)
    });

    await cognitoClient.send(command);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function signIn(username, password) {
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: generateSecretHash(username)
      }
    });

    const result = await cognitoClient.send(command);
    
    if (result.AuthenticationResult) {
      return {
        success: true,
        accessToken: result.AuthenticationResult.AccessToken,
        idToken: result.AuthenticationResult.IdToken,
        refreshToken: result.AuthenticationResult.RefreshToken
      };
    }
    
    return { success: false, error: 'Authentication failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyToken(token) {
  try {
    const keys = await loadJWKs();
    if (!keys) return null;

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) return null;

    const key = keys.find(k => k.kid === decoded.header.kid);
    if (!key) return null;

    const pem = jwkToPem(key);
    const verified = jwt.verify(token, pem, { algorithms: ['RS256'] });
    
    return verified;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

async function addUserToGroup(username, groupName) {
  try {
    const command = new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: groupName
    });

    await cognitoClient.send(command);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function generateSecretHash(username) {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(username + CLIENT_ID)
    .digest('base64');
}

module.exports = {
  testCognitoConnection,
  signUp,
  confirmSignUp,
  signIn,
  verifyToken,
  addUserToGroup
};
