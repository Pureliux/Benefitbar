// In-memory store for failed login attempts
const failedAttempts = new Map();

const MAX_ATTEMPTS = 5;
const TIME_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the key for storing failed attempts
 * @param {string} email - User email
 * @returns {string} - Storage key
 */
const getKey = (email) => `login_${email}`;

/**
 * Increment failed login attempts for an email
 * @param {string} email - User email
 * @returns {number} - Current attempt count
 */
const incrementAttempt = (email) => {
  const key = getKey(email);
  const now = Date.now();
  const current = failedAttempts.get(key);

  // Reset if time window has passed
  if (!current || now > current.resetTime) {
    failedAttempts.set(key, { count: 1, resetTime: now + TIME_WINDOW_MS });
    return 1;
  }

  current.count += 1;
  failedAttempts.set(key, current);
  return current.count;
};

/**
 * Get current failed login attempts for an email
 * @param {string} email - User email
 * @returns {number} - Current attempt count
 */
const getAttempts = (email) => {
  const key = getKey(email);
  const current = failedAttempts.get(key);

  if (!current || Date.now() > current.resetTime) {
    return 0;
  }

  return current.count;
};

/**
 * Reset failed login attempts for an email
 * @param {string} email - User email
 */
const resetAttempts = (email) => {
  const key = getKey(email);
  failedAttempts.delete(key);
};

/**
 * Clean up old entries from the Map to prevent memory leaks
 */
const cleanupOldEntries = () => {
  const now = Date.now();
  for (const [key, value] of failedAttempts.entries()) {
    if (now > value.resetTime) {
      failedAttempts.delete(key);
    }
  }
};

// Start cleanup interval
setInterval(cleanupOldEntries, CLEANUP_INTERVAL_MS);

/**
 * Create login rate limiter middleware
 * @returns {Function} - Express middleware
 */
export function createLoginRateLimiter() {
  return (req, res, next) => {
    const { email } = req.body;

    if (!email) {
      return next();
    }

    const attempts = getAttempts(email);

    if (attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        error: 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuche es später erneut.',
      });
    }

    // Wrap res.json to track failed attempts
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // If response is an error (status 401 or 403), increment attempts
      if (res.statusCode === 401 || res.statusCode === 403) {
        incrementAttempt(email);
      } else if (res.statusCode === 200) {
        // Reset on successful login
        resetAttempts(email);
      }
      return originalJson(data);
    };

    next();
  };
}
