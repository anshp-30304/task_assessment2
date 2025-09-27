const { v4: uuidv4 } = require('uuid');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TASKS_TABLE = process.env.DYNAMODB_TASKS_TABLE;
const ASSIGNMENTS_TABLE = process.env.DYNAMODB_ASSIGNMENTS_TABLE;

async function testDynamoConnection() {
  if (!TASKS_TABLE || !ASSIGNMENTS_TABLE) {
    throw new Error('DynamoDB table names not configured');
  }
  console.log('DynamoDB configuration verified');
}

// Task operations
async function createTask(task) {
  try {
    const now = new Date().toISOString();
    const taskItem = {
      taskId: uuidv4(),       
      userId: task.userId,
      ...task,
      createdAt: now,
      updatedAt: now
    };

    const command = new PutCommand({
      TableName: TASKS_TABLE,
      Item: taskItem
    });

    await docClient.send(command);
    return { success: true, task };
  } catch (error) {
    console.error('Create task error:', error);
    return { success: false, error: error.message };
  }
}

async function getTask(taskId, userId) {
  try {
    const command = new GetCommand({
      TableName: TASKS_TABLE,
      Key: { taskId, userId }
    });

    const result = await docClient.send(command);
    return { success: true, task: result.Item };
  } catch (error) {
    console.error('Get task error:', error);
    return { success: false, error: error.message };
  }
}

async function getUserTasks(userId) {
  try {
    const command = new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: 'userId-index', // You'll need to create this GSI
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    const result = await docClient.send(command);
    return { success: true, tasks: result.Items || [] };
  } catch (error) {
    // Fallback to scan if GSI doesn't exist
    try {
      const scanCommand = new ScanCommand({
        TableName: TASKS_TABLE,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      });

      const result = await docClient.send(scanCommand);
      return { success: true, tasks: result.Items || [] };
    } catch (scanError) {
      console.error('Get user tasks error:', scanError);
      return { success: false, error: scanError.message };
    }
  }
}

async function updateTask(taskId, userId, updates) {
  try {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updates).forEach((key, index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      
      updateExpression.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = updates[key];
    });

    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    updateExpression.push('#updatedAt = :updatedAt');

    const command = new UpdateCommand({
      TableName: TASKS_TABLE,
      Key: { taskId, userId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await docClient.send(command);
    return { success: true, task: result.Attributes };
  } catch (error) {
    console.error('Update task error:', error);
    return { success: false, error: error.message };
  }
}

async function deleteTask(taskId, userId) {
  try {
    const command = new DeleteCommand({
      TableName: TASKS_TABLE,
      Key: { taskId, userId }
    });

    await docClient.send(command);
    return { success: true };
  } catch (error) {
    console.error('Delete task error:', error);
    return { success: false, error: error.message };
  }
}

// Task assignment operations
async function assignTask(taskId, userId, assignedUserId) {
  try {
    const command = new PutCommand({
      TableName: ASSIGNMENTS_TABLE,
      Item: {
        userId: assignedUserId,
        taskId,
        assignedBy: userId,
        assignedAt: new Date().toISOString(),
        status: 'assigned'
      }
    });

    await docClient.send(command);
    return { success: true };
  } catch (error) {
    console.error('Assign task error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  testDynamoConnection,
  createTask,
  getTask,
  getUserTasks,
  updateTask,
  deleteTask,
  assignTask
};
