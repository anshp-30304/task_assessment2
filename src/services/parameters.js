const { SSMClient, GetParameterCommand, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

async function loadParameters() {
  try {
    const command = new GetParametersByPathCommand({
      Path: '/cab432/task-manager/',
      Recursive: true,
      WithDecryption: false
    });
    
    const response = await ssmClient.send(command);
    
    response.Parameters?.forEach(param => {
      const key = param.Name.split('/').pop().toUpperCase().replace('-', '_');
      if (!process.env[key]) {
        process.env[key] = param.Value;
      }
    });
    
    console.log('Parameters loaded from Parameter Store');
  } catch (error) {
    console.warn('Could not load parameters:', error.message);
  }
}

async function getParameter(name) {
  try {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: false
    });
    
    const response = await ssmClient.send(command);
    return response.Parameter?.Value;
  } catch (error) {
    console.error('Error getting parameter:', error);
    return null;
  }
}

module.exports = { loadParameters, getParameter };
