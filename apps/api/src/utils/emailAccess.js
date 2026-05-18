const DEFAULT_ALLOWED_LOGIN_EMAILS = ['amirtirana@outlook.de'];

export const LOGIN_EMAIL_ERROR_MESSAGE = 'Bitte verwende deine @eduscho.at-Adresse oder eine freigegebene E-Mail-Adresse.';

export function normalizeLoginEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function allowedLoginEmails() {
  const configured = process.env.ALLOWED_LOGIN_EMAILS || DEFAULT_ALLOWED_LOGIN_EMAILS.join(',');
  return configured
    .split(',')
    .map((email) => normalizeLoginEmail(email))
    .filter(Boolean);
}

export function isAllowedLoginEmail(email) {
  const normalized = normalizeLoginEmail(email);
  return normalized.endsWith('@eduscho.at') || allowedLoginEmails().includes(normalized);
}

export function deriveNamesFromEmail(email) {
  const localPart = normalizeLoginEmail(email).split('@')[0] || 'user';
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  const titleCase = (value) => value
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : '';

  return {
    firstName: titleCase(parts[0] || localPart),
    lastName: titleCase(parts[1] || 'User'),
  };
}
