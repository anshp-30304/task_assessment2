const express = require('express');
const { signUp, confirmSignUp, signIn, addUserToGroup } = require('../services/cognito');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const result = await signUp(username, email, password);
    
    if (result.success) {
      res.status(201).json({
        message: 'User registered successfully. Please check your email for confirmation code.',
        userSub: result.userSub
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const { username, confirmationCode } = req.body;

    if (!username || !confirmationCode) {
      return res.status(400).json({ error: 'Username and confirmation code are required' });
    }

    const result = await confirmSignUp(username, confirmationCode);
    
    if (result.success) {
      res.json({ message: 'Email confirmed successfully. You can now sign in.' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Confirmation failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await signIn(username, password);
    
    if (result.success) {
      res.json({
        message: 'Login successful',
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken
      });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/admin/add-to-group', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, groupName } = req.body;

    if (!username || !groupName) {
      return res.status(400).json({ error: 'Username and group name are required' });
    }

    const result = await addUserToGroup(username, groupName);
    
    if (result.success) {
      res.json({ message: `User ${username} added to group ${groupName}` });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to add user to group' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
