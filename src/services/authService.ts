import request from '../utils/request'
import { storage } from '../utils/storage'

interface LoginRequest {
  username: string
  password: string
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    userId: number
    username: string
    realName: string
    roleId: number
    roleName: string
  }
}

export const authService = {
  /**
   * 登录
   */
  login: async (username: string, password: string): Promise<void> => {
    const data = await request.post<LoginResponse>(
      '/auth/login',
      { username, password } as LoginRequest,
      { showLoading: true, loadingText: '登录中...', timeout: 30000 }
    )

    console.log('[AuthService] Login Response Data:', data)
    if (!data || !data.accessToken) {
      console.error('[AuthService] ❌ Login response missing accessToken!', data)
      throw new Error('登录响应异常：未获取到 Token')
    } else {
      console.log('[AuthService] ✅ Got AccessToken:', data.accessToken)
      // 保存 Token 和用户信息
      storage.setToken(data.accessToken)
      storage.setRefreshToken(data.refreshToken)
      storage.setUserInfo(data.user)
    }
  },

  /**
   * 注册
   */
  register: async (username: string, password: string): Promise<void> => {
    const data = await request.post<LoginResponse>(
      '/auth/register',
      { username, password } as LoginRequest,
      { showLoading: true, loadingText: '注册中...', timeout: 30000 }
    )

    console.log('[AuthService] Register Response Data:', data)
    if (!data || !data.accessToken) {
      console.error('[AuthService] ❌ Register response missing accessToken!', data)
      throw new Error('注册响应异常：未获取到 Token')
    } else {
      console.log('[AuthService] ✅ Register success, got AccessToken')
      storage.setToken(data.accessToken)
      storage.setRefreshToken(data.refreshToken)
      storage.setUserInfo(data.user)
    }
  },

  /**
   * 登出
   */
  logout: async (): Promise<void> => {
    try {
      await request.post('/auth/logout')
    } finally {
      // 无论接口是否成功，都清除本地数据
      storage.clearAll()
    }
  },

  /**
   * 刷新 Token
   */
  refreshToken: async (): Promise<string | null> => {
    const refreshToken = storage.getRefreshToken()
    if (!refreshToken) {
      return null
    }

    try {
      const data = await request.post<LoginResponse>(
        '/auth/refresh',
        {},
        { header: { Authorization: `Bearer ${refreshToken}` }, timeout: 20000 }
      )

      // 更新 Token
      storage.setToken(data.accessToken)
      storage.setUserInfo(data.user)

      return data.accessToken
    } catch (error) {
      // Refresh Token 也失效了，清除所有数据
      storage.clearAll()
      return null
    }
  },

  /**
   * 检查是否已登录
   */
  isAuthenticated: (): boolean => {
    return !!storage.getToken()
  },

  /**
   * 获取当前用户信息
   */
  getCurrentUser: () => {
    return storage.getUserInfo()
  }
}

export default authService
