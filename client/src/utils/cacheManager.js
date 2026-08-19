/**
 * @file cacheManager.js
 * @description LocalStorage caching and invalidation helper for instant UI rendering across sidebar switches.
 */

const CACHE_PREFIX = 'aura_cache_';
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

/**
 * Retrieve cached item from localStorage if valid and unexpired.
 * @param {string} key - Cache identifier key.
 * @param {number} maxAgeMs - Maximum allowed age in milliseconds.
 * @returns {any|null} Cached data payload or null if missing/expired.
 */
export const getLocalStorageCache = (key, maxAgeMs = DEFAULT_TTL_MS) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.timestamp || parsed.data === undefined) return null;
    if (Date.now() - parsed.timestamp > maxAgeMs) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn('Failed to read localStorage cache for key:', key, err);
    return null;
  }
};

/**
 * Store item in localStorage with timestamp.
 * @param {string} key - Cache identifier key.
 * @param {any} data - Data payload to store.
 */
export const setLocalStorageCache = (key, data) => {
  try {
    const payload = {
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to set localStorage cache for key:', key, err);
  }
};

/**
 * Clear all application caches from localStorage.
 */
export const clearLocalStorageCache = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.warn('Failed to clear localStorage cache:', err);
  }
};
