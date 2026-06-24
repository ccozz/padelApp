const API_BASE = '/api';

let adminUnlocked = false;
let sessionChecked = false;

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const authRequest = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');

  if (!response.ok) {
    const error = new Error(
      (isObject(payload) && (payload.error || payload.message)) ||
        (typeof payload === 'string' && payload.trim()) ||
        `HTTP ${response.status}`,
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export const isAdminUnlocked = () => adminUnlocked;

export const syncAdminSession = async () => {
  try {
    await authRequest('/auth/me', { method: 'GET', headers: {} });
    adminUnlocked = true;
    sessionChecked = true;
    return true;
  } catch (error) {
    if (error?.status === 401) {
      adminUnlocked = false;
      sessionChecked = true;
      return false;
    }

    throw error;
  }
};

export const unlockAdmin = async (username, password) => {
  const payload = await authRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  adminUnlocked = Boolean(payload?.ok);
  sessionChecked = true;
  return adminUnlocked;
};

export const lockAdmin = async () => {
  try {
    await authRequest('/auth/logout', { method: 'POST', headers: {} });
  } catch {
    // ignore logout failures; local state still must lock immediately
  } finally {
    adminUnlocked = false;
    sessionChecked = true;
  }
};

export const forceLockAdmin = () => {
  adminUnlocked = false;
};

export const isAdminSessionChecked = () => sessionChecked;
