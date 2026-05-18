const DEFAULT_ALLOWED_LOGIN_EMAILS = ['amirtirana@outlook.de'];

export const loginEmailErrorMessage = 'Bitte verwende deine @eduscho.at-Adresse oder eine freigegebene E-Mail-Adresse.';

export function normalizeLoginEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isAllowedLoginEmail(email) {
  const normalized = normalizeLoginEmail(email);
  const configured = import.meta.env.VITE_ALLOWED_LOGIN_EMAILS || DEFAULT_ALLOWED_LOGIN_EMAILS.join(',');
  const allowedEmails = configured
    .split(',')
    .map((value) => normalizeLoginEmail(value))
    .filter(Boolean);
  return normalized.endsWith('@eduscho.at') || allowedEmails.includes(normalized);
}

export function validateAllowedLoginEmail(email, emptyMessage = 'Bitte gib deine E-Mail-Adresse ein.') {
  const normalized = normalizeLoginEmail(email);
  if (!normalized) {
    return emptyMessage;
  }
  return isAllowedLoginEmail(normalized) ? null : loginEmailErrorMessage;
}
