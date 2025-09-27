const redis = require('redis');

let redisClient = null;

async function initRedis() {
  if (process.env.REDIS_HOST) {
    try {
      redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.times_connected > 10) {
            return new Error('Redis retry exhausted');
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      await redisClient.connect();
      console.log('Redis connected successfully');
    } catch (error) {
      console.warn('Redis connection failed, continuing without cache:', error.message);
      redisClient = null;
    }
  } else {
    console.log('No Redis configuration found, running without cache');
  }
}

async function get(key) {
  if (!redisClient) return null;
  
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

async function set(key, value, ttl = 300) {
  if (!redisClient) return false;
  
  try {
    await redisClient.setEx(key, ttl, value);
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

async function del(key) {
  if (!redisClient) return false;
  
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
}

module.exports = { initRedis, get, set, del };
