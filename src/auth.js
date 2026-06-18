import { ADMIN_PASSWORD, ADMIN_SESSION_KEY } from './constants.js';

export const isAdminUnlocked = () => sessionStorage.getItem(ADMIN_SESSION_KEY) === 'unlocked';

export const unlockAdmin = (password) => {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, 'unlocked');
    return true;
  }

  return false;
};

export const lockAdmin = () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
};
