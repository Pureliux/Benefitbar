import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { hashPassword, verifyPassword, validatePassword, validateEmailFormat } from '../utils/passwordUtils.js';
import {
  createSessionToken,
  escapePbString,
  findEmployeeByEmail,
  generateToken,
  hashToken,
  isSessionConfigured,
  logAuthEvent,
  nextLoginMethodAfterPasswordSet,
  normalizeEmail,
  syncPocketBaseAuthUser,
} from '../utils/tokenUtils.js';
import {
  getEmailConfigStatus,
  logEmailConfigurationFailure,
  sendActivationEmail,
  sendPasswordResetEmail,
} from '../utils/emailService.js';

const router = express.Router();

const TOKEN_EXPIRY_HOURS = 24;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const EMAIL_DOMAIN_MESSAGE = 'Bitte verwende deine @eduscho.at-E-Mail-Adresse.';
const TECHNICAL_LOGIN_MESSAGE = 'Die Anmeldung konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.';
const TECHNICAL_ACTION_MESSAGE = 'Die Anfrage konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.';
const EMAIL_NOT_CONFIGURED_MESSAGE = 'Der E-Mail-Versand ist aktuell nicht konfiguriert. Bitte kontaktiere HR/Prozessmanagement.';
const ACCESS_NEUTRAL_MESSAGE = 'Falls für diese E-Mail-Adresse ein aktiver Zugang besteht, wurde eine E-Mail mit weiteren Schritten versendet.';
const RESET_NEUTRAL_MESSAGE = 'Falls für diese Adresse ein aktiver Zugang besteht, wurde eine E-Mail zum Zurücksetzen des Passworts versendet.';
const MICROSOFT_NOT_CONFIGURED_MESSAGE = 'Microsoft-Anmeldung ist aktuell nicht konfiguriert. Bitte verwende E-Mail und Passwort.';

function error(res, status, message, errorCode) {
  return res.status(status).json({
    success: false,
    error: message,
    errorCode,
  });
}

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function isEduschoEmail(email) {
  return normalizeEmail(email).endsWith('@eduscho.at');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function microsoftConfigStatus() {
  const variables = {
    MICROSOFT_CLIENT_ID: Boolean(process.env.MICROSOFT_CLIENT_ID),
    MICROSOFT_CLIENT_SECRET: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
    MICROSOFT_TENANT_ID: Boolean(process.env.MICROSOFT_TENANT_ID),
    MICROSOFT_REDIRECT_URI: Boolean(process.env.MICROSOFT_REDIRECT_URI),
  };

  return {
    configured: Object.values(variables).every(Boolean),
    variables,
  };
}

function safeEmployeeRecord(employee) {
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
}

function frontendRedirect(path, params = {}) {
  const url = new URL(path, FRONTEND_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function findEmployeeByToken(fieldName, token) {
  const tokenHash = hashToken(token);
  return pb.collection('employees').getFirstListItem(`${fieldName} = "${escapePbString(tokenHash)}"`);
}

async function buildSessionResponse(employee, passwordForPocketBaseSync = null) {
  if (!isSessionConfigured()) {
    throw new Error('JWT_SECRET is not configured');
  }

  if (passwordForPocketBaseSync) {
    await syncPocketBaseAuthUser(employee, passwordForPocketBaseSync);
  }

  const token = createSessionToken(employee);
  return {
    token,
    user: {
      id: employee.id,
      email: employee.email,
      isAdmin: Boolean(employee.isAdmin),
    },
    employee: safeEmployeeRecord(employee),
  };
}

router.get('/me', async (req, res) => {
  if (!req.auth?.email) {
    return error(res, 401, 'Authentifizierung erforderlich.', 'not_authenticated');
  }

  try {
    const employee = await findEmployeeByEmail(req.auth.email);
    if (employee.status !== 'active' || employee.authStatus === 'locked') {
      return error(res, 403, 'Dieser Zugang ist aktuell nicht aktiv. Bitte kontaktiere HR/Prozessmanagement.', 'account_inactive');
    }

    return success(res, {
      user: {
        id: employee.id,
        email: employee.email,
        isAdmin: Boolean(employee.isAdmin),
      },
      employee: safeEmployeeRecord(employee),
    });
  } catch (err) {
    return error(res, 401, 'Authentifizierung erforderlich.', 'not_authenticated');
  }
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return error(res, 400, 'Bitte E-Mail-Adresse und Passwort eingeben.', 'missing_credentials');
  }

  if (!validateEmailFormat(email) || !isEduschoEmail(email)) {
    await logAuthEvent({ req, action: 'login_failed', email, status: 'failed', errorCode: 'invalid_domain', errorMessage: EMAIL_DOMAIN_MESSAGE });
    return error(res, 400, EMAIL_DOMAIN_MESSAGE, 'invalid_domain');
  }

  let employee;
  try {
    employee = await findEmployeeByEmail(email);
  } catch {
    await logAuthEvent({ req, action: 'login_failed', email, status: 'failed', errorCode: 'user_not_found' });
    return error(res, 401, 'Für diese E-Mail-Adresse ist kein aktiver Zugang hinterlegt.', 'user_not_found');
  }

  if (employee.status !== 'active' || employee.authStatus === 'locked' || employee.authStatus !== 'active') {
    await logAuthEvent({ req, action: 'login_failed', email, status: 'failed', errorCode: 'account_inactive' });
    return error(res, 403, 'Dieser Zugang ist aktuell nicht aktiv. Bitte kontaktiere HR/Prozessmanagement.', 'account_inactive');
  }

  if (!employee.passwordHash) {
    await logAuthEvent({ req, action: 'login_failed', email, status: 'failed', errorCode: 'no_password_set' });
    return error(res, 401, 'Für diesen Zugang wurde noch kein Passwort gesetzt. Bitte fordere einen Aktivierungslink an.', 'no_password_set');
  }

  if (!verifyPassword(password, employee.passwordHash)) {
    await logAuthEvent({ req, action: 'login_failed', email, status: 'failed', errorCode: 'invalid_password' });
    return error(res, 401, 'E-Mail-Adresse oder Passwort ist falsch.', 'invalid_password');
  }

  try {
    const updatedEmployee = await pb.collection('employees').update(employee.id, {
      lastLoginAt: new Date().toISOString(),
      loginMethod: employee.loginMethod === 'microsoft' ? 'both' : (employee.loginMethod || 'email_password'),
    });

    const session = await buildSessionResponse(updatedEmployee, password);

    await logAuthEvent({ req, action: 'login_successful', email, status: 'success' });
    logger.info(`Login successful for: ${email}`);

    return success(res, {
      message: 'Anmeldung erfolgreich.',
      redirectUrl: '/dashboard',
      ...session,
    });
  } catch (err) {
    logger.error('Login session creation failed:', err);
    await logAuthEvent({ req, action: 'login_failed', email, status: 'failed', errorCode: 'technical_error', errorMessage: err.message });
    return error(res, 500, TECHNICAL_LOGIN_MESSAGE, 'technical_error');
  }
});

router.post('/request-access', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return error(res, 400, 'Bitte gib deine E-Mail-Adresse ein.', 'missing_email');
  }

  if (!validateEmailFormat(email) || !isEduschoEmail(email)) {
    await logAuthEvent({ req, action: 'access_requested', email, status: 'failed', errorCode: 'invalid_domain', errorMessage: EMAIL_DOMAIN_MESSAGE });
    return error(res, 400, EMAIL_DOMAIN_MESSAGE, 'invalid_domain');
  }

  if (!getEmailConfigStatus().configured) {
    await logEmailConfigurationFailure({
      recipient: email,
      subject: 'Tchibo Benefit-Bar - Zugang aktivieren',
      emailType: 'activation_email',
    });
    await logAuthEvent({ req, action: 'access_requested', email, status: 'failed', errorCode: 'email_not_configured', errorMessage: EMAIL_NOT_CONFIGURED_MESSAGE });
    return error(res, 503, EMAIL_NOT_CONFIGURED_MESSAGE, 'email_not_configured');
  }

  let employee;
  try {
    employee = await findEmployeeByEmail(email);
  } catch {
    await logAuthEvent({ req, action: 'access_requested', email, status: 'failed', errorCode: 'user_not_found' });
    return success(res, { message: ACCESS_NEUTRAL_MESSAGE });
  }

  if (employee.status !== 'active' || employee.authStatus === 'locked') {
    await logAuthEvent({ req, action: 'access_requested', email, status: 'failed', errorCode: 'account_inactive' });
    return success(res, { message: ACCESS_NEUTRAL_MESSAGE });
  }

  const activationToken = generateToken();
  const expiresAt = addHours(new Date(), TOKEN_EXPIRY_HOURS);

  try {
    employee = await pb.collection('employees').update(employee.id, {
      activationTokenHash: hashToken(activationToken),
      activationTokenExpiresAt: expiresAt,
      authStatus: employee.authStatus === 'active' ? 'active' : 'invited',
    });
    await logAuthEvent({ req, action: 'activation_link_created', email, status: 'success' });
  } catch (err) {
    logger.error('Failed to create activation token:', err);
    await logAuthEvent({ req, action: 'activation_link_failed', email, status: 'failed', errorCode: 'token_create_failed', errorMessage: err.message });
    return error(res, 500, TECHNICAL_ACTION_MESSAGE, 'technical_error');
  }

  const emailResult = await sendActivationEmail(employee, activationToken);
  if (!emailResult.success) {
    await logAuthEvent({ req, action: 'activation_link_failed', email, status: 'failed', errorCode: emailResult.code || 'email_send_failed', errorMessage: emailResult.error });
    const message = emailResult.code === 'email_not_configured' ? EMAIL_NOT_CONFIGURED_MESSAGE : TECHNICAL_ACTION_MESSAGE;
    return error(res, emailResult.code === 'email_not_configured' ? 503 : 500, message, emailResult.code || 'email_send_failed');
  }

  await logAuthEvent({ req, action: 'activation_link_sent', email, status: 'success' });
  return success(res, { message: ACCESS_NEUTRAL_MESSAGE });
});

router.post('/activate', async (req, res) => {
  const { token, password, passwordConfirm } = req.body;

  if (!token || !password || !passwordConfirm) {
    return error(res, 400, 'Aktivierungslink und Passwort sind erforderlich.', 'missing_fields');
  }

  if (password !== passwordConfirm) {
    return error(res, 400, 'Passwörter stimmen nicht überein.', 'password_mismatch');
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return error(res, 400, passwordValidation.error, 'invalid_password_policy');
  }

  let employee;
  try {
    employee = await findEmployeeByToken('activationTokenHash', token);
  } catch {
    await logAuthEvent({ req, action: 'password_set', status: 'failed', errorCode: 'invalid_token' });
    return error(res, 400, 'Aktivierungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen Zugang an.', 'invalid_token');
  }

  if (!employee.activationTokenExpiresAt || new Date() > new Date(employee.activationTokenExpiresAt)) {
    await logAuthEvent({ req, action: 'password_set', email: employee.email, status: 'failed', errorCode: 'expired_token' });
    return error(res, 400, 'Aktivierungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen Zugang an.', 'invalid_token');
  }

  try {
    const updatedEmployee = await pb.collection('employees').update(employee.id, {
      passwordHash: hashPassword(password),
      passwordSetAt: new Date().toISOString(),
      authStatus: 'active',
      loginMethod: nextLoginMethodAfterPasswordSet(employee.loginMethod),
      activationTokenHash: '',
      activationTokenExpiresAt: '',
    });

    await syncPocketBaseAuthUser(updatedEmployee, password);
    await logAuthEvent({ req, action: 'password_set', email: employee.email, status: 'success' });
    return success(res, { message: 'Passwort wurde gesetzt. Du kannst dich jetzt einloggen.' });
  } catch (err) {
    logger.error('Failed to activate account:', err);
    await logAuthEvent({ req, action: 'password_set', email: employee.email, status: 'failed', errorCode: 'technical_error', errorMessage: err.message });
    return error(res, 500, TECHNICAL_ACTION_MESSAGE, 'technical_error');
  }
});

router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return error(res, 400, 'Bitte gib deine E-Mail-Adresse ein.', 'missing_email');
  }

  if (!validateEmailFormat(email) || !isEduschoEmail(email)) {
    await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'failed', errorCode: 'invalid_domain', errorMessage: EMAIL_DOMAIN_MESSAGE });
    return error(res, 400, EMAIL_DOMAIN_MESSAGE, 'invalid_domain');
  }

  if (!getEmailConfigStatus().configured) {
    await logEmailConfigurationFailure({
      recipient: email,
      subject: 'Tchibo Benefit-Bar - Passwort zurücksetzen',
      emailType: 'password_reset_email',
    });
    await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'failed', errorCode: 'email_not_configured', errorMessage: EMAIL_NOT_CONFIGURED_MESSAGE });
    return error(res, 503, EMAIL_NOT_CONFIGURED_MESSAGE, 'email_not_configured');
  }

  let employee;
  try {
    employee = await findEmployeeByEmail(email);
  } catch {
    await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'failed', errorCode: 'user_not_found' });
    return success(res, { message: RESET_NEUTRAL_MESSAGE });
  }

  if (employee.status !== 'active' || employee.authStatus !== 'active') {
    await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'failed', errorCode: 'account_inactive' });
    return success(res, { message: RESET_NEUTRAL_MESSAGE });
  }

  const resetToken = generateToken();
  const expiresAt = addHours(new Date(), TOKEN_EXPIRY_HOURS);

  try {
    employee = await pb.collection('employees').update(employee.id, {
      resetTokenHash: hashToken(resetToken),
      resetTokenExpiresAt: expiresAt,
    });
  } catch (err) {
    logger.error('Failed to create reset token:', err);
    await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'failed', errorCode: 'token_create_failed', errorMessage: err.message });
    return error(res, 500, TECHNICAL_ACTION_MESSAGE, 'technical_error');
  }

  const emailResult = await sendPasswordResetEmail(employee, resetToken);
  if (!emailResult.success) {
    await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'failed', errorCode: emailResult.code || 'email_send_failed', errorMessage: emailResult.error });
    const message = emailResult.code === 'email_not_configured' ? EMAIL_NOT_CONFIGURED_MESSAGE : TECHNICAL_ACTION_MESSAGE;
    return error(res, emailResult.code === 'email_not_configured' ? 503 : 500, message, emailResult.code || 'email_send_failed');
  }

  await logAuthEvent({ req, action: 'password_reset_requested', email, status: 'success' });
  return success(res, { message: RESET_NEUTRAL_MESSAGE });
});

router.post('/reset-password', async (req, res) => {
  const { token, password, passwordConfirm } = req.body;

  if (!token || !password || !passwordConfirm) {
    return error(res, 400, 'Reset-Link und Passwort sind erforderlich.', 'missing_fields');
  }

  if (password !== passwordConfirm) {
    return error(res, 400, 'Passwörter stimmen nicht überein.', 'password_mismatch');
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return error(res, 400, passwordValidation.error, 'invalid_password_policy');
  }

  let employee;
  try {
    employee = await findEmployeeByToken('resetTokenHash', token);
  } catch {
    await logAuthEvent({ req, action: 'password_reset_completed', status: 'failed', errorCode: 'invalid_token' });
    return error(res, 400, 'Reset-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.', 'invalid_token');
  }

  if (!employee.resetTokenExpiresAt || new Date() > new Date(employee.resetTokenExpiresAt)) {
    await logAuthEvent({ req, action: 'password_reset_completed', email: employee.email, status: 'failed', errorCode: 'expired_token' });
    return error(res, 400, 'Reset-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.', 'invalid_token');
  }

  try {
    const updatedEmployee = await pb.collection('employees').update(employee.id, {
      passwordHash: hashPassword(password),
      passwordSetAt: new Date().toISOString(),
      authStatus: 'active',
      loginMethod: nextLoginMethodAfterPasswordSet(employee.loginMethod),
      resetTokenHash: '',
      resetTokenExpiresAt: '',
    });

    await syncPocketBaseAuthUser(updatedEmployee, password);
    await logAuthEvent({ req, action: 'password_reset_completed', email: employee.email, status: 'success' });
    return success(res, { message: 'Passwort wurde gesetzt. Du kannst dich jetzt einloggen.' });
  } catch (err) {
    logger.error('Failed to reset password:', err);
    await logAuthEvent({ req, action: 'password_reset_completed', email: employee.email, status: 'failed', errorCode: 'technical_error', errorMessage: err.message });
    return error(res, 500, TECHNICAL_ACTION_MESSAGE, 'technical_error');
  }
});

router.get('/validate-token', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ valid: false, error: 'Token is required' });
  }

  const tokenHash = hashToken(token);
  let employee;
  try {
    employee = await pb.collection('employees').getFirstListItem(
      `activationTokenHash = "${escapePbString(tokenHash)}" || resetTokenHash = "${escapePbString(tokenHash)}"`
    );
  } catch {
    return res.json({ valid: false });
  }

  const now = new Date();
  const activationValid = employee.activationTokenHash === tokenHash &&
    employee.activationTokenExpiresAt &&
    now <= new Date(employee.activationTokenExpiresAt);
  const resetValid = employee.resetTokenHash === tokenHash &&
    employee.resetTokenExpiresAt &&
    now <= new Date(employee.resetTokenExpiresAt);

  if (!activationValid && !resetValid) {
    return res.json({ valid: false });
  }

  return res.json({
    valid: true,
    email: employee.email,
    type: activationValid ? 'activation' : 'reset',
    expiresAt: activationValid ? employee.activationTokenExpiresAt : employee.resetTokenExpiresAt,
  });
});

router.get('/microsoft/status', async (req, res) => {
  const status = microsoftConfigStatus();
  if (!status.configured) {
    await logAuthEvent({
      req,
      action: 'microsoft_login_not_configured',
      status: 'failed',
      errorCode: 'microsoft_not_configured',
      errorMessage: MICROSOFT_NOT_CONFIGURED_MESSAGE,
    });
  }
  return res.json(status);
});

router.get('/microsoft', async (req, res) => {
  const status = microsoftConfigStatus();
  if (!status.configured) {
    await logAuthEvent({
      req,
      action: 'microsoft_login_not_configured',
      status: 'failed',
      errorCode: 'microsoft_not_configured',
      errorMessage: MICROSOFT_NOT_CONFIGURED_MESSAGE,
    });
    return res.redirect(frontendRedirect('/login', { authError: 'microsoft_not_configured' }));
  }

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
  });

  await logAuthEvent({ req, action: 'microsoft_login_started', status: 'success' });
  return res.redirect(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`);
});

router.get('/microsoft/callback', async (req, res) => {
  const { code } = req.query;

  if (!code || !microsoftConfigStatus().configured) {
    await logAuthEvent({ req, action: 'microsoft_login_failed', status: 'failed', errorCode: 'missing_code_or_config' });
    return res.redirect(frontendRedirect('/login', { authError: 'microsoft_failed' }));
  }

  try {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Microsoft token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      throw new Error(`Microsoft profile fetch failed: ${profileResponse.status}`);
    }

    const profile = await profileResponse.json();
    const email = normalizeEmail(profile.mail || profile.userPrincipalName);

    if (!isEduschoEmail(email)) {
      await logAuthEvent({ req, action: 'microsoft_login_failed', email, status: 'failed', errorCode: 'invalid_domain' });
      return res.redirect(frontendRedirect('/login', { authError: 'microsoft_failed' }));
    }

    let employee;
    try {
      employee = await findEmployeeByEmail(email);
    } catch {
      await logAuthEvent({ req, action: 'microsoft_login_failed', email, status: 'failed', errorCode: 'user_not_found' });
      return res.redirect(frontendRedirect('/login', { authError: 'microsoft_failed' }));
    }

    if (employee.status !== 'active' || employee.authStatus === 'locked') {
      await logAuthEvent({ req, action: 'microsoft_login_failed', email, status: 'failed', errorCode: 'account_inactive' });
      return res.redirect(frontendRedirect('/login', { authError: 'microsoft_failed' }));
    }

    employee = await pb.collection('employees').update(employee.id, {
      lastLoginAt: new Date().toISOString(),
      authStatus: 'active',
      loginMethod: employee.passwordHash ? 'both' : 'microsoft',
    });

    await syncPocketBaseAuthUser(employee);
    const session = await buildSessionResponse(employee);
    await logAuthEvent({ req, action: 'microsoft_login_successful', email, status: 'success' });

    return res.redirect(frontendRedirect('/dashboard', { authToken: session.token }));
  } catch (err) {
    logger.error('Microsoft login failed:', err);
    await logAuthEvent({ req, action: 'microsoft_login_failed', status: 'failed', errorCode: 'technical_error', errorMessage: err.message });
    return res.redirect(frontendRedirect('/login', { authError: 'microsoft_failed' }));
  }
});

export default router;
