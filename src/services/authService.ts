import apiClient from './api';

// Types
export interface RegisterParams {
  email: string;
  password: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface ResetPasswordRequestParams {
  email: string;
}

export interface ResetPasswordParams {
  token: string;
  password: string;
}

export interface MagicLinkRequestParams {
  email: string;
}

export interface VerifyEmailParams {
  token: string;
}

export interface User {
  id: string;
  email: string;
  sessionId: string;
  isEmailVerified: boolean;
  subscription?: {
    plan: 'free' | 'basic' | 'pro';
    status: 'active' | 'canceled' | 'expired';
  };
  operationCredits: number;
  isGuest: boolean;
  hasOAuthLogins?: boolean;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: User;
  message?: string;
}

class AuthService {
  private tokenKey = 'pdfspark_auth_token';
  private refreshTokenKey = 'pdfspark_refresh_token';
  private userKey = 'pdfspark_user';
  private tokenExpiryKey = 'pdfspark_token_expiry';

  /**
   * Register a new user
   */
  async register(params: RegisterParams): Promise<AuthResponse> {
    const response = await apiClient.post('/users/register', params);
    const data = response.data;

    if (data.success) {
      this.setAuthData(data);
    }

    return data;
  }

  /**
   * Login user with email and password
   */
  async login(params: LoginParams): Promise<AuthResponse> {
    const response = await apiClient.post('/users/login', params);
    const data = response.data;

    if (data.success) {
      this.setAuthData(data);
    }

    return data;
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(params: ResetPasswordRequestParams): Promise<AuthResponse> {
    const response = await apiClient.post('/users/forgot-password', params);
    return response.data;
  }

  /**
   * Reset password with token
   */
  async resetPassword(params: ResetPasswordParams): Promise<AuthResponse> {
    const response = await apiClient.post('/users/reset-password', params);
    return response.data;
  }

  /**
   * Request magic link for passwordless login
   */
  async requestMagicLink(params: MagicLinkRequestParams): Promise<AuthResponse> {
    const response = await apiClient.post('/users/magic-link', params);
    return response.data;
  }

  /**
   * Login with magic link token
   */
  async loginWithMagicLink(token: string): Promise<AuthResponse> {
    const response = await apiClient.post('/users/magic-link/login', { token });
    const data = response.data;

    if (data.success) {
      this.setAuthData(data);
    }

    return data;
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<AuthResponse> {
    const response = await apiClient.get(`/users/verify-email/${token}`);
    return response.data;
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(): Promise<AuthResponse> {
    const token = this.getToken();
    
    if (!token) {
      throw new Error('User not authenticated');
    }
    
    const response = await apiClient.post(
      '/users/resend-verification',
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    return response.data;
  }

  /**
   * Get current user data
   */
  async getCurrentUser(): Promise<User | null> {
    const token = this.getToken();
    
    if (!token) {
      return null;
    }
    
    try {
      const response = await apiClient.get('/users/me', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const { user } = response.data;
      
      if (user) {
        this.setUser(user);
        return user;
      }
      
      return null;
    } catch (error) {
      this.clearAuthData();
      return null;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      return false;
    }
    
    try {
      const response = await apiClient.post('/users/refresh-token', {
        refreshToken
      });
      
      const data = response.data;
      
      if (data.success) {
        // Update tokens
        this.setToken(data.accessToken);
        this.setRefreshToken(data.refreshToken);
        
        // Update token expiry
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (data.expiresIn || 3600));
        this.setTokenExpiry(expiresAt.getTime());
        
        return true;
      }
      
      return false;
    } catch (error) {
      this.clearAuthData();
      return false;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<AuthResponse> {
    const token = this.getToken();
    const refreshToken = this.getRefreshToken();
    
    if (!token || !refreshToken) {
      this.clearAuthData();
      return { success: true, message: 'Logged out successfully' };
    }
    
    try {
      const response = await apiClient.post(
        '/users/logout',
        { refreshToken },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      this.clearAuthData();
      return response.data;
    } catch (error) {
      this.clearAuthData();
      return { success: true, message: 'Logged out successfully' };
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    const expiry = this.getTokenExpiry();
    
    if (!token || !expiry) {
      return false;
    }
    
    // Check if token is expired
    if (new Date().getTime() > expiry) {
      // Token is expired, try to refresh
      this.refreshToken().catch(() => {
        this.clearAuthData();
      });
      return false;
    }
    
    return true;
  }

  /**
   * Get current user from storage
   */
  getUser(): User | null {
    const userJson = localStorage.getItem(this.userKey);
    
    if (!userJson) {
      return null;
    }
    
    try {
      return JSON.parse(userJson);
    } catch (error) {
      return null;
    }
  }

  // Private methods
  
  private setAuthData(data: AuthResponse): void {
    // Set token (prefer accessToken if available, fall back to token)
    if (data.accessToken) {
      this.setToken(data.accessToken);
    } else if (data.token) {
      this.setToken(data.token);
    }
    
    // Set refresh token if available
    if (data.refreshToken) {
      this.setRefreshToken(data.refreshToken);
    }
    
    // Set token expiry
    if (data.expiresIn) {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.expiresIn);
      this.setTokenExpiry(expiresAt.getTime());
    }
    
    // Set user
    if (data.user) {
      this.setUser(data.user);
    }
  }

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  private getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private setRefreshToken(token: string): void {
    localStorage.setItem(this.refreshTokenKey, token);
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  private setUser(user: User): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  private setTokenExpiry(expiry: number): void {
    localStorage.setItem(this.tokenExpiryKey, expiry.toString());
  }

  private getTokenExpiry(): number | null {
    const expiry = localStorage.getItem(this.tokenExpiryKey);
    return expiry ? parseInt(expiry, 10) : null;
  }

  private clearAuthData(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.tokenExpiryKey);
  }
}

export default new AuthService();