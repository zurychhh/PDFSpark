import axios from 'axios';
import { API_URL, API_TIMEOUT } from '../config/config';

// Function to get auth token - needed before AuthService is available
const getAuthToken = (): string | null => {
  return localStorage.getItem('pdfspark_auth_token');
};

// Function to get session ID
const getSessionId = (): string | null => {
  return localStorage.getItem('pdfspark_session_id');
};

// Function to save session ID
const saveSessionId = (sessionId: string): void => {
  localStorage.setItem('pdfspark_session_id', sessionId);
  console.log('Saved sessionId to localStorage:', sessionId);
};

// Define the base URL for API calls
const API_BASE_URL = typeof import.meta !== 'undefined' 
  ? (import.meta.env.VITE_API_BASE_URL || `${API_URL}/api`) 
  : 'http://localhost:5001/api';

// For local development, we might run the backend on a different port
const BACKEND_PORT = typeof import.meta !== 'undefined' ? (import.meta.env.VITE_BACKEND_PORT || 5001) : 5001;
const PROD_API_URL = typeof import.meta !== 'undefined' ? (import.meta.env.VITE_API_URL || 'https://pdfspark-api.up.railway.app/api') : 'https://pdfspark-api.up.railway.app/api';

// Use the correct API URL based on environment
const FINAL_API_URL = typeof import.meta !== 'undefined' && import.meta.env.PROD 
  ? PROD_API_URL 
  : `http://localhost:${BACKEND_PORT}/api`;

console.log('API Base URL:', API_BASE_URL);
console.log('Resolved API URL:', FINAL_API_URL);

// Create axios instance with defaults
const apiClient = axios.create({
  baseURL: FINAL_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: API_TIMEOUT || 30000, // 30 seconds
  withCredentials: true, // Include cookies with cross-origin requests
});

// Keep track of if a token refresh is in progress
let isRefreshingToken = false;
let refreshSubscribers: ((token: string) => void)[] = [];

// Function to be called when token refresh is complete
const onTokenRefreshed = (newToken: string) => {
  refreshSubscribers.forEach(callback => callback(newToken));
  refreshSubscribers = [];
};

// Function to subscribe to token refresh
const addRefreshSubscriber = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

// Add interceptors for handling tokens, errors, etc.
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available (for authenticated endpoints)
    const token = getAuthToken();
    if (token && config.headers && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add session token if available (for guest users)
    const sessionId = getSessionId();
    if (sessionId && config.headers && !config.headers['X-Session-ID']) {
      config.headers['X-Session-ID'] = sessionId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    // Check for session ID in response headers
    const sessionId = response.headers['x-session-id'];
    if (sessionId) {
      saveSessionId(sessionId);
    }
    return response;
  },
  async (error) => {
    const { config, response } = error;
    
    // Skip if this request is for refreshing token (to avoid infinite loop)
    const isRefreshTokenRequest = config.url?.includes('/users/refresh-token');
    
    if (response && response.status === 401 && !isRefreshTokenRequest) {
      // Handle token refresh
      if (!isRefreshingToken) {
        isRefreshingToken = true;
        
        try {
          // Dynamically import to avoid circular dependency
          const authServiceModule = await import('./authService');
          const authService = authServiceModule.default;
          
          // Try to refresh the token
          const refreshSuccess = await authService.refreshToken();
          
          if (refreshSuccess) {
            // Token refreshed successfully
            const newToken = getAuthToken();
            
            if (newToken) {
              // Notify subscribers that the token has been refreshed
              onTokenRefreshed(newToken);
              
              // Retry the original request with the new token
              config.headers['Authorization'] = `Bearer ${newToken}`;
              return axios(config);
            }
          } else {
            // Handle failed refresh - logout user
            authService.clearAuthData();
            
            // Redirect to login page if in a browser context
            if (typeof window !== 'undefined') {
              window.location.href = '/login?session_expired=true';
            }
          }
        } catch (refreshError) {
          console.error('Error refreshing token:', refreshError);
        } finally {
          isRefreshingToken = false;
        }
      } else {
        // Token refresh is already in progress, wait for it to complete
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken) => {
            config.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(axios(config));
          });
        });
      }
    }
    
    // Global error handling
    if (response) {
      // Handle specific error cases
      switch (response.status) {
        case 401:
          // If we got here, token refresh failed or was not attempted
          // Handle unauthorized access - redirect to login
          if (typeof window !== 'undefined' && !isRefreshTokenRequest) {
            window.location.href = '/login?session_expired=true';
          }
          break;
        case 403:
          // Handle forbidden access
          console.error('Forbidden access:', response.data);
          break;
        case 429:
          // Handle rate limiting
          console.error('Rate limited:', response.data);
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          // Handle server errors
          console.error('Server error:', response.data);
          break;
      }
      
      // You can add global notification system here
    } else {
      // Handle network errors (no response)
      console.error('Network error:', error);
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;