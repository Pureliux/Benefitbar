import crypto from 'crypto';
import pb from './pocketbaseClient.js';
import logger from './logger.js';

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const FALLBACK_LOG_EMAIL = 'unknown@eduscho.at';

/**
 * Generate a random token
 * @returns {string} - Random token (64 hex characters)
 */
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA256
 * @param {string} token - Token to hash
 * @returns {string} - Hashed token
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

export function isSessionConfigured() {
  return Boolean(getJwtSecret());
}

export function createSessionToken(employee) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: employee.id,
    email: employee.email,
    isAdmin: Boolean(employee.isAdmin),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');

  return `${unsignedToken}.${signature}`;
}

export function verifySessionToken(token) {
  const secret = getJwtSecret();
  if (!secret || !token) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const unsignedToken = `${header}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decodedPayload = base64UrlDecode(payload);
    if (!decodedPayload.exp || decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decodedPayload;
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
}

export function attachAuth(req, res, next) {
  const token = getBearerToken(req);
  const session = verifySessionToken(token);

  if (session) {
    req.auth = session;
  }

  next();
}

export async function logAuthEvent({
  req,
  action,
  email,
  status,
  errorCode,
  errorMessage,
}) {
  try {
    await pb.collection('authLog').create(cleanRecord({
      action,
      email: email || FALLBACK_LOG_EMAIL,
      status,
      errorCode,
      errorMessage,
      userAgent: req?.headers?.['user-agent'],
      ipAddress: req?.ip,
    }));
  } catch (error) {
    logger.warn('Failed to write authLog entry:', error?.message || error);
  }
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function escapePbString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function employeeName(employee) {
  return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
}

export async function findEmployeeByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return pb.collection('employees').getFirstListItem(`email = "${escapePbString(normalizedEmail)}"`);
}

export async function syncPocketBaseAuthUser(employee, password) {
  try {
    const data = {
      email: employee.email,
      emailVisibility: true,
      verified: true,
      name: employeeName(employee) || employee.email,
      isAdmin: Boolean(employee.isAdmin),
    };

    if (password) {
      data.password = password;
      data.passwordConfirm = password;
    }

    try {
      const user = await pb.collection('users').getFirstListItem(`email = "${escapePbString(employee.email)}"`);
      await pb.collection('users').update(user.id, data);
    } catch {
      if (!password) {
        const generatedPassword = `Tchibo-${crypto.randomBytes(18).toString('hex')}aA1`;
        data.password = generatedPassword;
        data.passwordConfirm = generatedPassword;
      }
      await pb.collection('users').create(data);
    }

    return { success: true };
  } catch (error) {
    logger.warn(`PocketBase auth user sync failed for ${employee.email}:`, error?.message || error);
    return { success: false, error: error?.message || String(error) };
  }
}
