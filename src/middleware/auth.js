const { verifyToken } = require('../services/cognito');
const { get, set } = require('../services/cache');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Check cache first
    const cacheKey = `token:${token.substring(0, 20)}`;
    const cachedUser = await get(cacheKey);
    
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
      return next();
    }

    // Verify token with Cognito
    const decoded = await verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const user = {
      userId: decoded.sub,
      username: decoded['cognito:username'] || decoded.username,
      email: decoded.email,
      groups: decoded['cognito:groups'] || []
    };

    // Cache the user info
    await set(cacheKey, JSON.stringify(user), 300);

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(403).json({ error: 'Token verification failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user.groups.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin };
