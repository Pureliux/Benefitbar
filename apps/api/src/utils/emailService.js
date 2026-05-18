import 'dotenv/config';
import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import pb from './pocketbaseClient.js';
import logger from './logger.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const SMTP_ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
const SMTP_PASSWORD_PLACEHOLDERS = [
  'DAS_PASSWORT_DEINES_HOSTINGER_E_MAIL_KONTOS',
  'DEIN_HOSTINGER',
  'CHANGE_ME',
  'HIER_DAS_ECHTE_PASSWORT',
];
const EMAIL_CONFIGURATION_ERROR_CODES = [
  'email_not_configured',
  'smtp_password_placeholder',
  'smtp_user_invalid',
  'smtp_from_invalid',
  'smtp_port_invalid',
  'smtp_auth_failed',
  'smtp_connection_failed',
  'smtp_tls_failed',
];

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function boolEnv(value) {
  return String(value || '').toLowerCase() === 'true';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function encodeHeader(value) {
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function extractEmailAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match?.[1] || value || '').trim();
}

function getConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
    secure: boolEnv(process.env.SMTP_SECURE) || Number(process.env.SMTP_PORT) === 465,
  };
}

export function getEmailConfigStatus() {
  const variables = Object.fromEntries(SMTP_ENV_KEYS.map((key) => [key, Boolean(process.env[key])]));
  const port = Number(process.env.SMTP_PORT);
  const portValid = Number.isInteger(port) && port > 0 && port <= 65535;
  const password = process.env.SMTP_PASSWORD || '';
  const passwordPlaceholder = SMTP_PASSWORD_PLACEHOLDERS.some((placeholder) => password.toLowerCase().includes(placeholder.toLowerCase()));
  const smtpUserValid = Boolean(process.env.SMTP_USER && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SMTP_USER));
  const smtpFromValid = Boolean(process.env.SMTP_FROM && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extractEmailAddress(process.env.SMTP_FROM)));
  const missingKeys = SMTP_ENV_KEYS.filter((key) => !process.env[key]);
  const configured = missingKeys.length === 0 &&
    portValid &&
    !passwordPlaceholder &&
    smtpUserValid &&
    smtpFromValid;
  const failures = [
    missingKeys.length > 0 && {
      code: 'email_not_configured',
      message: `SMTP configuration missing: ${missingKeys.join(', ')}`,
    },
    !portValid && { code: 'smtp_port_invalid', message: 'SMTP_PORT is invalid' },
    passwordPlaceholder && { code: 'smtp_password_placeholder', message: 'SMTP_PASSWORD still contains a placeholder' },
    !smtpUserValid && { code: 'smtp_user_invalid', message: 'SMTP_USER must be the full mailbox address' },
    !smtpFromValid && { code: 'smtp_from_invalid', message: 'SMTP_FROM must contain a valid sender address' },
  ].filter(Boolean);
  const firstFailure = configured ? null : failures[0];

  return {
    configured,
    error: firstFailure?.message || null,
    errorCode: firstFailure?.code || null,
    variables: {
      ...variables,
      SMTP_PORT_VALID: portValid,
      SMTP_PASSWORD_PLACEHOLDER: passwordPlaceholder,
      SMTP_USER_VALID: smtpUserValid,
      SMTP_FROM_VALID: smtpFromValid,
    },
  };
}

export function isEmailConfigurationErrorCode(code) {
  return EMAIL_CONFIGURATION_ERROR_CODES.includes(code);
}

async function logEmail({ recipient, subject, emailType, status, errorMessage, relatedUserId }) {
  try {
    await pb.collection('emailLog').create(cleanRecord({
      recipient,
      subject,
      emailType,
      status,
      sentAt: status === 'sent' || status === 'failed' ? new Date().toISOString() : undefined,
      errorMessage,
      relatedUserId,
    }));
  } catch (error) {
    logger.warn('Failed to write emailLog entry:', error?.message || error);
  }
}

export async function logEmailConfigurationFailure({ recipient, subject, emailType, relatedUserId }) {
  const errorMessage = getEmailConfigStatus().error || 'SMTP configuration is invalid';
  await logEmail({
    recipient,
    subject,
    emailType,
    relatedUserId,
    status: 'failed',
    errorMessage,
  });
}

function connectSocket(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });

    const eventName = config.secure ? 'secureConnect' : 'connect';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    }, 15000);

    socket.once(eventName, () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP response timed out'));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      if (/^\d{3} /.test(lastLine)) {
        cleanup();
        const code = Number(lastLine.slice(0, 3));
        resolve({ code, message: lines.join('\n') });
      }
    };

    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function command(socket, line, expectedCodes) {
  socket.write(`${line}\r\n`);
  const response = await readResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    const error = new Error(`SMTP command failed (${response.code}): ${response.message}`);
    error.code = response.code;
    throw error;
  }
  return response;
}

async function upgradeToTls(socket, config) {
  await command(socket, 'STARTTLS', [220]);
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: config.host });
    secureSocket.once('secureConnect', () => resolve(secureSocket));
    secureSocket.once('error', reject);
  });
}

async function authenticate(socket, config) {
  const plainToken = Buffer.from(`\0${config.user}\0${config.password}`, 'utf8').toString('base64');
  try {
    await command(socket, `AUTH PLAIN ${plainToken}`, [235]);
    return;
  } catch (plainError) {
    logger.warn('SMTP AUTH PLAIN failed, trying AUTH LOGIN:', plainError?.message || plainError);
  }

  await command(socket, 'AUTH LOGIN', [334]);
  await command(socket, Buffer.from(config.user, 'utf8').toString('base64'), [334]);
  await command(socket, Buffer.from(config.password, 'utf8').toString('base64'), [235]);
}

function buildMessage({ from, to, subject, html }) {
  const messageId = `${crypto.randomBytes(12).toString('hex')}@tchibo-benefit-bar.local`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
  ];

  const dotSafeHtml = html.replace(/^\./gm, '..');
  return `${headers.join('\r\n')}\r\n\r\n${dotSafeHtml}\r\n.`;
}

async function smtpSend({ to, subject, html }) {
  const config = getConfig();
  let socket = await connectSocket(config);

  try {
    await readResponse(socket);
    const ehlo = await command(socket, `EHLO ${config.host}`, [250]);

    if (!config.secure && /STARTTLS/i.test(ehlo.message)) {
      socket = await upgradeToTls(socket, config);
      await command(socket, `EHLO ${config.host}`, [250]);
    }

    await authenticate(socket, config);
    await command(socket, `MAIL FROM:<${extractEmailAddress(config.from)}>`, [250]);
    await command(socket, `RCPT TO:<${to}>`, [250, 251]);
    await command(socket, 'DATA', [354]);
    socket.write(`${buildMessage({ from: config.from, to, subject, html })}\r\n`);
    const dataResponse = await readResponse(socket);
    if (![250].includes(dataResponse.code)) {
      throw new Error(`SMTP DATA failed (${dataResponse.code}): ${dataResponse.message}`);
    }
    await command(socket, 'QUIT', [221, 250]);
  } finally {
    socket.destroy();
  }
}

async function sendEmail({ recipient, subject, html, emailType, relatedUserId }) {
  const configStatus = getEmailConfigStatus();

  if (!configStatus.configured) {
    const errorMessage = configStatus.error || 'SMTP configuration is invalid';
    await logEmail({ recipient, subject, emailType, relatedUserId, status: 'failed', errorMessage });
    return { success: false, code: configStatus.errorCode || 'email_not_configured', error: errorMessage };
  }

  try {
    await smtpSend({ to: recipient, subject, html });
    await logEmail({ recipient, subject, emailType, relatedUserId, status: 'sent' });
    logger.info(`${emailType} sent to: ${recipient}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error?.message || String(error);
    await logEmail({ recipient, subject, emailType, relatedUserId, status: 'failed', errorMessage });
    logger.error(`Failed to send ${emailType} to ${recipient}:`, errorMessage);
    return { success: false, code: classifyEmailSendError(errorMessage), error: errorMessage };
  }
}

function classifyEmailSendError(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('smtp command failed (535') || lower.includes('authentication') || lower.includes('auth')) {
    return 'smtp_auth_failed';
  }
  if (lower.includes('connection failed') || lower.includes('timed out') || lower.includes('network')) {
    return 'smtp_connection_failed';
  }
  if (lower.includes('starttls') || lower.includes('crypto') || lower.includes('certificate')) {
    return 'smtp_tls_failed';
  }
  return 'email_send_failed';
}

export async function sendActivationEmail(user, token) {
  const activationLink = `${FRONTEND_URL}/activate?token=${encodeURIComponent(token)}`;
  const displayName = escapeHtml(user.firstName || user.email);
  const subject = 'Tchibo Benefit-Bar - Zugang aktivieren';
  const html = `
    <p>Hallo ${displayName},</p>
    <p>für die Tchibo Benefit-Bar wurde ein Aktivierungslink angefordert.</p>
    <p><a href="${activationLink}" style="background:#C0A468;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Passwort setzen</a></p>
    <p>Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.</p>
    <p>Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>
    <p>Viele Grüße<br>HR/Prozessmanagement</p>
  `;

  return sendEmail({
    recipient: user.email,
    subject,
    html,
    emailType: 'activation_email',
    relatedUserId: user.id,
  });
}

export async function sendPasswordResetEmail(user, token) {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const displayName = escapeHtml(user.firstName || user.email);
  const subject = 'Tchibo Benefit-Bar - Passwort zurücksetzen';
  const html = `
    <p>Hallo ${displayName},</p>
    <p>du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p>
    <p><a href="${resetLink}" style="background:#C0A468;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Passwort zurücksetzen</a></p>
    <p>Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.</p>
    <p>Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>
    <p>Viele Grüße<br>HR/Prozessmanagement</p>
  `;

  return sendEmail({
    recipient: user.email,
    subject,
    html,
    emailType: 'password_reset_email',
    relatedUserId: user.id,
  });
}

export async function sendTestEmail(email) {
  const subject = 'Tchibo Benefit-Bar - Test-E-Mail';
  const html = `
    <p>Dies ist eine Test-E-Mail der Tchibo Benefit-Bar.</p>
    <p>Wenn du diese E-Mail erhalten hast, funktioniert die SMTP-Konfiguration.</p>
  `;

  return sendEmail({
    recipient: email,
    subject,
    html,
    emailType: 'test_email',
  });
}
