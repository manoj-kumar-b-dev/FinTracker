/**
 * @file axiosInstance.js
 * @description Central Axios HTTP client with request and response interceptors, in-memory caching, and request deduplication.
 */

import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Cache store & request deduplication maps
const cacheStore = new Map();
const pendingRequests = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Clear all API response caches.
 */
export const clearApiCache = () => {
  cacheStore.clear();
  pendingRequests.clear();
};

/**
 * Invalidate API cache matching a specific URL pattern.
 */
export const invalidateApiCache = (pattern) => {
  if (!pattern) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.includes(pattern)) {
      cacheStore.delete(key);
    }
  }
};

// Helpers for caching
const getCacheKey = (config) => {
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `GET:${url}?${params}`;
};

const isCacheable = (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') return false;
  if (config.responseType === 'blob') return false;
  if (config.url && config.url.includes('/auth/')) return false;
  return true;
};

const isMutation = (config) => {
  const method = (config.method || 'get').toLowerCase();
  return ['post', 'put', 'delete', 'patch'].includes(method);
};

// Save reference to original api.request method
const originalRequest = api.request.bind(api);

// Wrap api.request to inject caching and request deduplication
api.request = async function (config) {
  if (typeof config === 'string') {
    config = { url: arguments[0], ...arguments[1] };
  }

  // Clear cache on successful mutation requests (POST/PUT/DELETE/PATCH)
  if (isMutation(config)) {
    try {
      const response = await originalRequest(config);
      // Invalidate GET cache on write operations
      clearApiCache();
      return response;
    } catch (err) {
      throw err;
    }
  }

  // Handle cacheable GET requests
  if (isCacheable(config)) {
    const cacheKey = getCacheKey(config);

    // If skipCache is not explicitly requested, check cache
    if (!config.skipCache) {
      const cached = cacheStore.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return Promise.resolve({ ...cached.response });
      }

      // Check if an identical request is already in-flight (deduplication)
      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey).then((res) => ({ ...res }));
      }
    }

    // Execute network request
    const requestPromise = originalRequest(config)
      .then((response) => {
        cacheStore.set(cacheKey, {
          timestamp: Date.now(),
          response: {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            config: response.config,
          },
        });
        pendingRequests.delete(cacheKey);
        return response;
      })
      .catch((err) => {
        pendingRequests.delete(cacheKey);
        throw err;
      });

    pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  return originalRequest(config);
};

// 1. Request Interceptor: Inject Bearer JWT token if stored in local storage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 2. Response Interceptor: Catch generic errors, 401 sessions expiration, and toast alerts
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const originalReq = error.config;

    // Skip auto-logout for auth endpoints — they legitimately return 401
    const isAuthEndpoint = originalReq?.url?.includes('/auth/');

    // Auto logout and clear storage on 401 Unauthorized (non-auth routes only)
    if (
      error.response &&
      error.response.status === 401 &&
      !originalReq._retry &&
      !isAuthEndpoint
    ) {
      console.warn('⚠️ Session expired or invalid. Logging out...');

      clearApiCache();
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Prevent infinite redirect loops
      if (
        !window.location.pathname.includes('/login') &&
        !window.location.pathname.includes('/register')
      ) {
        toast.error('Session expired. Please log in again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }
    }

    // Toast alert on 500 Internal Server Errors
    if (error.response && error.response.status === 500) {
      toast.error('Server error. Please try again later.');
    }

    return Promise.reject(error);
  }
);

export default api;

