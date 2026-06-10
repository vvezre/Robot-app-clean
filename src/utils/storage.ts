import Taro from '@tarojs/taro'

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_INFO_KEY = 'user_info'
const LAST_USERNAME_KEY = 'last_username'
const LAST_PASSWORD_KEY = 'last_password'

export const storage = {
  // Token 相关
  setToken(token: string) {
    Taro.setStorageSync(TOKEN_KEY, token)
  },

  getToken(): string | null {
    return Taro.getStorageSync(TOKEN_KEY) || null
  },

  clearToken() {
    Taro.removeStorageSync(TOKEN_KEY)
  },

  // Refresh Token 相关
  setRefreshToken(token: string) {
    Taro.setStorageSync(REFRESH_TOKEN_KEY, token)
  },

  getRefreshToken(): string | null {
    return Taro.getStorageSync(REFRESH_TOKEN_KEY) || null
  },

  clearRefreshToken() {
    Taro.removeStorageSync(REFRESH_TOKEN_KEY)
  },

  // 用户信息相关
  setUserInfo(userInfo: any) {
    Taro.setStorageSync(USER_INFO_KEY, JSON.stringify(userInfo))
  },

  getUserInfo(): any | null {
    const userInfo = Taro.getStorageSync(USER_INFO_KEY)
    return userInfo ? JSON.parse(userInfo) : null
  },

  clearUserInfo() {
    Taro.removeStorageSync(USER_INFO_KEY)
  },

  // 上次登录凭据（登出时不清除）
  setLastCredentials(username: string, password: string) {
    Taro.setStorageSync(LAST_USERNAME_KEY, username)
    Taro.setStorageSync(LAST_PASSWORD_KEY, password)
  },

  getLastCredentials(): { username: string; password: string } {
    return {
      username: Taro.getStorageSync(LAST_USERNAME_KEY) || '',
      password: Taro.getStorageSync(LAST_PASSWORD_KEY) || ''
    }
  },

  // 清除所有认证信息（不清除记住的凭据）
  clearAll() {
    this.clearToken()
    this.clearRefreshToken()
    this.clearUserInfo()
  }
}
