import crypto from 'crypto';

/**
 * Hash password using PBKDF2
 * @param {string} password - Plain text password
 * @returns {string} - Hashed password with salt (format: salt:hash)
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against hash
 * @param {string} password - Plain text password
 * @param {string} passwordHash - Stored hash (format: salt:hash)
 * @returns {boolean} - True if password matches
 */
export function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  const [salt, hash] = passwordHash.split(':');
  if (!salt || !hash) return false;
  const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  const computed = Buffer.from(computedHash, 'hex');
  const stored = Buffer.from(hash, 'hex');
  return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
}

/**
 * Validate password requirements
 * @param {string} password - Password to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
export function validatePassword(password) {
  if (!password) {
    return { valid: false, error: 'Passwort ist erforderlich.' };
  }

  if (password.length < 10) {
    return { valid: false, error: 'Passwort muss mindestens 10 Zeichen lang sein.' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Passwort muss mindestens einen Großbuchstaben enthalten.' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Passwort muss mindestens einen Kleinbuchstaben enthalten.' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Passwort muss mindestens eine Zahl enthalten.' };
  }

  return { valid: true };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export function validateEmailFormat(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email || '').trim());
}
