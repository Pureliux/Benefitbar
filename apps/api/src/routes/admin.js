import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { hashPassword, validatePassword, validateEmailFormat, verifyPassword } from '../utils/passwordUtils.js';
import {
  findEmployeeByEmail,
  generateToken,
  hashToken,
  isSessionConfigured,
  logAuthEvent,
  normalizeEmail,
  syncPocketBaseAuthUser,
} from '../utils/tokenUtils.js';
import {
  getEmailConfigStatus,
  logEmailConfigurationFailure,
  sendActivationEmail,
  sendTestEmail,
} from '../utils/emailService.js';

const router = express.Router();
const TOKEN_EXPIRY_HOURS = 24;
const EMAIL_NOT_CONFIGURED_MESSAGE = 'Der E-Mail-Versand ist aktuell nicht konfiguriert. Bitte kontaktiere HR/Prozessmanagement.';

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function jsonError(res, status, error, errorCode) {
  return res.status(status).json({ success: false, error, errorCode });
}

function isEduschoEmail(email) {
  return normalizeEmail(email).endsWith('@eduscho.at');
}

async function requireAdmin(req, res, next) {
  if (!req.auth?.email) {
    return jsonError(res, 401, 'Authentifizierung erforderlich.', 'not_authenticated');
  }

  try {
    const adminEmployee = await findEmployeeByEmail(req.auth.email);
    if (!adminEmployee?.isAdmin || adminEmployee.status !== 'active') {
      return jsonError(res, 403, 'Nur Admins dürfen diese Aktion ausführen.', 'admin_required');
    }
    req.adminEmployee = adminEmployee;
    return next();
  } catch {
    return jsonError(res, 401, 'Authentifizierung erforderlich.', 'not_authenticated');
  }
}

router.use(requireAdmin);

router.get('/users', async (req, res) => {
  const employees = await pb.collection('employees').getFullList({
    sort: '-created',
  });

  return res.json({
    success: true,
    users: employees.map((employee) => {
      const {
        passwordHash,
        activationTokenHash,
        activationTokenExpiresAt,
        resetTokenHash,
        resetTokenExpiresAt,
        ...safeEmployee
      } = employee;

      return {
        ...safeEmployee,
        passwordSet: Boolean(passwordHash),
      };
    }),
  });
});

router.post('/create-user', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const {
    firstName,
    lastName,
    department,
    status = 'active',
    isAdmin = false,
  } = req.body;
  const password = req.body.password;
  const passwordConfirm = req.body.passwordConfirm || req.body.confirmPassword;
  const adminEmail = req.adminEmployee.email;

  if (!password || !passwordConfirm) {
    return jsonError(res, 400, 'Passwort fehlt.', 'missing_password');
  }

  if (!email || !validateEmailFormat(email) || !isEduschoEmail(email)) {
    return jsonError(res, 400, 'E-Mail-Adresse ist ungültig.', 'invalid_email');
  }

  if (!firstName || !lastName) {
    return jsonError(res, 400, 'Bitte alle Pflichtfelder ausfüllen.', 'missing_fields');
  }

  if (password !== passwordConfirm) {
    return jsonError(res, 400, 'Passwörter stimmen nicht überein.', 'password_mismatch');
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return jsonError(res, 400, passwordValidation.error, 'invalid_password_policy');
  }

  try {
    await findEmployeeByEmail(email);
    return jsonError(res, 409, 'Diese E-Mail-Adresse existiert bereits.', 'email_exists');
  } catch {
    // Expected: no existing employee.
  }

  try {
    const today = new Date().toISOString();
    const employee = await pb.collection('employees').create(cleanRecord({
      email,
      firstName,
      lastName,
      department,
      hireDate: req.body.hireDate || today,
      eligibleFrom: req.body.eligibleFrom || today,
      status,
      isAdmin: Boolean(isAdmin),
      passwordHash: hashPassword(password),
      passwordSetAt: today,
      authStatus: 'active',
      loginMethod: 'email_password',
    }));

    await syncPocketBaseAuthUser(employee, password);
    await logAuthEvent({ req, action: 'user_created_by_admin', email, status: 'success', errorMessage: `created_by=${adminEmail}` });
    logger.info(`User created by admin ${adminEmail}: ${email}`);

    return res.json({
      success: true,
      message: 'User wurde erstellt und kann sich jetzt einloggen.',
      userId: employee.id,
    });
  } catch (err) {
    logger.error('Admin user creation failed:', err);
    await logAuthEvent({ req, action: 'user_created_by_admin', email, status: 'failed', errorCode: 'technical_error', errorMessage: err.message });
    return jsonError(res, 500, 'User konnte nicht erstellt werden. Bitte technische Details im Auth-Log prüfen.', 'technical_error');
  }
});

router.get('/system-check', async (req, res) => {
  let databaseConnected = false;
  try {
    await pb.collection('employees').getList(1, 1);
    databaseConnected = true;
  } catch (err) {
    logger.error('Database connection check failed:', err);
  }

  const emailStatus = getEmailConfigStatus();
  const microsoftVariables = {
    MICROSOFT_CLIENT_ID: Boolean(process.env.MICROSOFT_CLIENT_ID),
    MICROSOFT_CLIENT_SECRET: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
    MICROSOFT_TENANT_ID: Boolean(process.env.MICROSOFT_TENANT_ID),
    MICROSOFT_REDIRECT_URI: Boolean(process.env.MICROSOFT_REDIRECT_URI),
  };
  const microsoftOAuthConfigured = Object.values(microsoftVariables).every(Boolean);

  const allEmployees = await pb.collection('employees').getFullList();
  const activeUsers = allEmployees.filter((employee) => employee.status === 'active');
  const usersWithPassword = allEmployees.filter((employee) => Boolean(employee.passwordHash));
  const usersWithoutPassword = allEmployees.filter((employee) => !employee.passwordHash);
  const recentLoginErrors = await pb.collection('authLog').getList(1, 10, {
    filter: 'status = "failed" && action ~ "login"',
    sort: '-timestamp',
  }).catch(() => ({ items: [] }));
  const recentEmailErrors = await pb.collection('emailLog').getList(1, 10, {
    filter: 'status = "failed"',
    sort: '-sentAt',
  }).catch(() => ({ items: [] }));

  return res.json({
    success: true,
    databaseConnected,
    authSystemActive: databaseConnected && isSessionConfigured(),
    emailServiceConfigured: emailStatus.configured,
    smtp: emailStatus.variables,
    microsoftOAuthConfigured,
    microsoft: microsoftVariables,
    activeUserCount: activeUsers.length,
    usersWithPassword: usersWithPassword.length,
    usersWithoutPassword: usersWithoutPassword.length,
    recentLoginErrors: recentLoginErrors.items,
    recentEmailErrors: recentEmailErrors.items,
  });
});

router.post('/send-test-email', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email || !validateEmailFormat(email)) {
    return jsonError(res, 400, 'E-Mail-Adresse ist ungültig.', 'invalid_email');
  }

  const emailResult = await sendTestEmail(email);
  if (!emailResult.success) {
    await logAuthEvent({ req, action: 'test_email_failed', email, status: 'failed', errorCode: emailResult.code || 'email_send_failed', errorMessage: emailResult.error });
    return jsonError(res, 500, 'Test-E-Mail konnte nicht versendet werden. Bitte E-Mail-Konfiguration prüfen.', emailResult.code || 'email_send_failed');
  }

  await logAuthEvent({ req, action: 'test_email_sent', email, status: 'success' });
  return res.json({ success: true, message: 'Test-E-Mail wurde versendet.' });
});

router.post('/resend-activation-link', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email || !validateEmailFormat(email) || !isEduschoEmail(email)) {
    return jsonError(res, 400, 'E-Mail-Adresse ist ungültig.', 'invalid_email');
  }

  if (!getEmailConfigStatus().configured) {
    await logEmailConfigurationFailure({
      recipient: email,
      subject: 'Tchibo Benefit-Bar - Zugang aktivieren',
      emailType: 'activation_email',
    });
    await logAuthEvent({ req, action: 'activation_link_failed', email, status: 'failed', errorCode: 'email_not_configured', errorMessage: EMAIL_NOT_CONFIGURED_MESSAGE });
    return jsonError(res, 503, EMAIL_NOT_CONFIGURED_MESSAGE, 'email_not_configured');
  }

  let employee;
  try {
    employee = await findEmployeeByEmail(email);
  } catch {
    return jsonError(res, 404, 'User nicht gefunden.', 'user_not_found');
  }

  if (employee.status !== 'active' || employee.authStatus === 'locked') {
    return jsonError(res, 403, 'Dieser Zugang ist aktuell nicht aktiv. Bitte kontaktiere HR/Prozessmanagement.', 'account_inactive');
  }

  const activationToken = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  employee = await pb.collection('employees').update(employee.id, {
    activationTokenHash: hashToken(activationToken),
    activationTokenExpiresAt: expiresAt,
    authStatus: employee.authStatus === 'active' ? 'active' : 'invited',
  });

  const emailResult = await sendActivationEmail(employee, activationToken);
  if (!emailResult.success) {
    await logAuthEvent({ req, action: 'activation_link_failed', email, status: 'failed', errorCode: emailResult.code || 'email_send_failed', errorMessage: emailResult.error });
    return jsonError(res, 500, 'Aktivierungslink konnte nicht versendet werden.', emailResult.code || 'email_send_failed');
  }

  await logAuthEvent({ req, action: 'activation_link_sent', email, status: 'success' });
  return res.json({ success: true, message: 'Aktivierungslink wurde erneut versendet.' });
});

router.post('/test-login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return jsonError(res, 400, 'Bitte E-Mail-Adresse und Passwort eingeben.', 'missing_credentials');
  }

  try {
    const employee = await findEmployeeByEmail(email);
    const passed = employee.status === 'active' &&
      employee.authStatus === 'active' &&
      Boolean(employee.passwordHash) &&
      verifyPassword(password, employee.passwordHash);

    await logAuthEvent({
      req,
      action: 'test_login_checked',
      email,
      status: passed ? 'success' : 'failed',
      errorCode: passed ? undefined : 'test_login_failed',
    });

    return res.json({ success: true, passed });
  } catch (err) {
    await logAuthEvent({ req, action: 'test_login_checked', email, status: 'failed', errorCode: 'user_not_found' });
    return res.json({ success: true, passed: false });
  }
});

router.get('/auth-logs', async (req, res) => {
  const logs = await pb.collection('authLog').getList(1, 100, {
    sort: '-timestamp',
  });
  return res.json({ success: true, logs: logs.items });
});

router.get('/email-logs', async (req, res) => {
  const logs = await pb.collection('emailLog').getList(1, 100, {
    sort: '-sentAt',
  });
  return res.json({ success: true, logs: logs.items });
});

export default router;
