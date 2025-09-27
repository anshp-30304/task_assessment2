const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

async function loadSecrets() {
  try {
    const secrets = [
      'cab432/task-manager/cognito-client-secret',
      'cab432/task-manager/jwt-secret'
    ];
    
    for (const secretName of secrets) {
      try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await secretsClient.send(command);
        
        const key = secretName.split('/').pop().toUpperCase().replace('-', '_');
        if (!process.env[key]) {
          process.env[key] = response.SecretString;
        }
      } catch (error) {
        console.warn(`Could not load secret ${secretName}:`, error.message);
      }
    }
    
    console.log('Secrets loaded from Secrets Manager');
  } catch (error) {
    console.warn('Could not load secrets:', error.message);
  }
}

async function getSecret(secretName) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    return response.SecretString;
  } catch (error) {
    console.error('Error getting secret:', error);
    return null;
  }
}

module.exports = { loadSecrets, getSecret };
