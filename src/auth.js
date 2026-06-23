const ADMIN_STATE_KEY = 'padelApp.adminUnlocked';

const readAdminState = () => {
  try {
    return localStorage.getItem(ADMIN_STATE_KEY) === 'true';
  } catch {
    return Boolean(window.__adminUnlocked);
  }
};

const writeAdminState = (value) => {
  window.__adminUnlocked = value;

  try {
    localStorage.setItem(ADMIN_STATE_KEY, value ? 'true' : 'false');
    sessionStorage.setItem(ADMIN_STATE_KEY, value ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
};

window.__adminUnlocked = readAdminState();

export const isAdminUnlocked = () => Boolean(window.__adminUnlocked);

export const unlockAdmin = () => {
  writeAdminState(true);
};

export const lockAdmin = () => {
  writeAdminState(false);
};

export const forceLockAdmin = lockAdmin;
