import Taro from '@tarojs/taro'
import { getBaseURL, REQUEST_TIMEOUT } from '../config/api'
import { storage } from './storage'

/**
 * 通用响应接口
 */
export interface ApiResponse<T = any> {
  code?: number
  message?: string
  data: T
  success?: boolean
}

/**
 * 请求配置接口
 */
export interface RequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: Record<string, string>
  timeout?: number
  showLoading?: boolean
  loadingText?: string
}

/**
 * HTTP 请求封装
 * 统一处理请求、响应和错误
 */
class Request {
  private baseURL: string
  private timeout: number

  constructor() {
    this.baseURL = getBaseURL()
    this.timeout = REQUEST_TIMEOUT
  }

  /**
   * 发送请求
   */
  async request<T = any>(config: RequestConfig): Promise<T> {
    const {
      url,
      method = 'GET',
      data,
      header = {},
      timeout = this.timeout,
      showLoading = false,
      loadingText = '加载中...',
    } = config

    // 显示加载提示
    if (showLoading) {
      Taro.showLoading({ title: loadingText, mask: true })
    }

    try {
      // 自动添加 Authorization 头
      const token = storage.getToken()
      const isAuthTokenRequest = url.includes('/auth/login') || url.includes('/auth/refresh')
      const hasCustomAuthHeader = Object.keys(header).some(k => k.toLowerCase() === 'authorization')
      const headers = {
        'Content-Type': 'application/json',
        ...header,
      }

      // 登录/刷新接口不自动带 Access Token；如果调用方已显式传入 Authorization 也不覆盖
      if (token && !isAuthTokenRequest && !hasCustomAuthHeader) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await Taro.request({
        url: `${this.baseURL}${url}`,
        method,
        data,
        header: headers,
        timeout,
      })

      // 隐藏加载提示
      if (showLoading) {
        Taro.hideLoading()
      }

      // 检查 HTTP 状态码
      if (response.statusCode === 401) {
        // 如果是刷新 Token 的请求本身 401，则直接跳去登录，避免死循环
        if (url.includes('/auth/refresh') || url.includes('/auth/login')) {
          storage.clearAll()
          Taro.reLaunch({ url: '/pages/login/login' })
          throw new Error('登录已过期，请重新登录')
        }

        // Token 失效，尝试刷新
        const { authService } = await import('../services/authService')
        const newToken = await authService.refreshToken()

        if (newToken) {
          // 重试原请求
          return this.request(config)
        } else {
          // Refresh Token 也失效，跳转登录
          storage.clearAll()
          Taro.reLaunch({ url: '/pages/login/login' })
          throw new Error('登录已过期，请重新登录')
        }
      }

      if (response.statusCode === 403) {
        Taro.showToast({ title: '权限不足', icon: 'none' })
        throw new Error('权限不足')
      }

      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${response.errMsg || '请求失败'}`)
      }

      // 返回数据
      const result = response.data as ApiResponse<T>

      // 检查业务状态码
      if (result.code !== undefined && result.code !== 200) {
        throw new Error(result.message || '请求失败')
      }

      // 返回数据部分
      return result.data !== undefined ? result.data : (result as any)
    } catch (error: any) {
      // 隐藏加载提示
      if (showLoading) {
        Taro.hideLoading()
      }

      console.error('请求失败:', error)

      // 如果不是 401/403，显示错误提示
      if (!error.message?.includes('登录') && !error.message?.includes('权限')) {
        Taro.showToast({
          title: error.message || '网络请求失败',
          icon: 'none',
          duration: 2000,
        })
      }

      throw error
    }
  }

  /**
   * GET 请求
   */
  get<T = any>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'GET',
      data,
      ...config,
    })
  }

  /**
   * POST 请求
   */
  post<T = any>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'POST',
      data,
      ...config,
    })
  }

  /**
   * PUT 请求
   */
  put<T = any>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'PUT',
      data,
      ...config,
    })
  }

  /**
   * DELETE 请求
   */
  delete<T = any>(url: string, data?: any, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      url,
      method: 'DELETE',
      data,
      ...config,
    })
  }

  /**
   * 设置 baseURL
   */
  setBaseURL(baseURL: string) {
    this.baseURL = baseURL
  }

  /**
   * 获取 baseURL
   */
  getBaseURL() {
    return this.baseURL
  }
}

// 导出单例实例
export const request = new Request()

// 默认导出
export default request
