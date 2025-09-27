const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { 
  createTask, 
  getTask, 
  getUserTasks, 
  updateTask, 
  deleteTask, 
  assignTask 
} = require('../services/dynamodb');
const { authenticateToken } = require('../middleware/auth');
const { get, set, del } = require('../services/cache');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

router.post('/', async (req, res) => {
  try {
    const { title, description, priority = 'medium', status = 'todo' } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const task = {
      taskId: uuidv4(),
      userId: req.user.userId,
      title,
      description: description || '',
      priority,
      status,
      createdBy: req.user.username
    };

    const result = await createTask(task);
    
    if (result.success) {
      // Invalidate user's task cache
      await del(`tasks:${req.user.userId}`);
      
      res.status(201).json({ task: result.task });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.get('/', async (req, res) => {
  try {
    const cacheKey = `tasks:${req.user.userId}`;
    
    // Check cache first
    const cachedTasks = await get(cacheKey);
    if (cachedTasks) {
      return res.json({ tasks: JSON.parse(cachedTasks), cached: true });
    }

    const result = await getUserTasks(req.user.userId);
    
    if (result.success) {
      // Cache the results
      await set(cacheKey, JSON.stringify(result.tasks), 300);
      
      res.json({ tasks: result.tasks, cached: false });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await getTask(taskId, req.user.userId);
    
    if (result.success) {
      if (result.task) {
        res.json({ task: result.task });
      } else {
        res.status(404).json({ error: 'Task not found' });
      }
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get task' });
  }
});

router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.taskId;
    delete updates.userId;
    delete updates.createdAt;
    delete updates.createdBy;

    const result = await updateTask(taskId, req.user.userId, updates);
    
    if (result.success) {
      // Invalidate caches
      await del(`tasks:${req.user.userId}`);
      
      res.json({ task: result.task });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await deleteTask(taskId, req.user.userId);
    
    if (result.success) {
      // Invalidate caches
      await del(`tasks:${req.user.userId}`);
      
      res.json({ message: 'Task deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

router.post('/:taskId/assign', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { assignedUserId } = req.body;

    if (!assignedUserId) {
      return res.status(400).json({ error: 'Assigned user ID is required' });
    }

    const result = await assignTask(taskId, req.user.userId, assignedUserId);
    
    if (result.success) {
      res.json({ message: 'Task assigned successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

module.exports = router;
