const { testDynamoConnection } = require('./dynamodb');
const { testS3Connection } = require('./s3');
const { testCognitoConnection } = require('./cognito');
const { initRedis } = require('./cache');
const { loadParameters } = require('./parameters');
const { loadSecrets } = require('./secrets');

async function initializeServices() {
  console.log('Initializing AWS services...');
  
  try {
    // Load configuration from Parameter Store and Secrets Manager
    await loadParameters();
    await loadSecrets();
    
    // Initialize services
    await testDynamoConnection();
    await testS3Connection();
    await testCognitoConnection();
    await initRedis();
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Service initialization failed:', error);
    throw error;
  }
}

module.exports = { initializeServices };
