/**
 * API 配置常量
 */

// 后端服务器地址配置
export const API_CONFIG = {
  // 开发环境
  development: {
    // 开发工具联调走本地云平台
    baseURL: 'https://vvrj.top',
  },
  // 生产环境（恢复 Cloudflare 域名链路）
  production: {
    baseURL: 'https://vvrj.top',
  },
}

// 获取当前环境的 API 基础 URL
// dev:weapp → development（开发工具调试用）
// build:weapp → production（上传体验版/手机用）
// 当前策略：
// dev:weapp / build:weapp 都统一走 https://vvrj.top（Cloudflare 链路）
export const getBaseURL = (): string => {
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  return API_CONFIG[env].baseURL
}

// API 端点路径
export const API_ENDPOINTS = {
  // 用户相关
  user: {
    list: '/user/list',
    add: '/user/add',
    update: '/user/update',
    delete: (id: number) => `/user/${id}`,
    getById: (id: number) => `/user/${id}`,
  },
  // 任务日志相关
  taskLog: {
    list: '/task-log/list',
    add: '/task-log/add',
    update: '/task-log/update',
    delete: (id: string) => `/task-log/${id}`,
    getById: (id: string) => `/task-log/${id}`,
    cityStats: '/task-log/city-stats',
    monthlyFailStats: '/task-log/monthly-fail-stats',
    cityTaskRank: '/task-log/city-task-rank',
  },
  // 充电站相关
  chargingStation: {
    list: '/charging-station/list',
    add: '/charging-station/add',
    update: '/charging-station/update',
    delete: (id: number) => `/charging-station/${id}`,
    getById: (id: number) => `/charging-station/${id}`,
  },
  // 清洁区域相关
  cleanArea: {
    list: '/clean-area/list',
    add: '/clean-area/add',
    update: '/clean-area/update',
    delete: (id: number) => `/clean-area/${id}`,
    getById: (id: number) => `/clean-area/${id}`,
  },
  // 清洁路线相关
  cleanRoute: {
    list: '/clean-route/list',
    add: '/clean-route/add',
    update: '/clean-route/update',
    delete: (id: number) => `/clean-route/${id}`,
    getById: (id: number) => `/clean-route/${id}`,
  },
  // 轨道车控制相关（旧版，直接控制 MQTT - 已弃用）
  railcarControl: {
    sendControl: '/api/railcar/control',
    setMode: '/api/railcar/mode',
    getConfig: '/api/railcar/config',
  },
  // 设备控制相关（新版，通过后端 API - 安全模式）
  deviceControl: {
    sendCommand: '/api/device-control/send-command',
    setMode: '/api/device-control/set-mode',
    getStatus: '/api/device-control/status',
  },
  // 设备计划任务
  devicePlan: {
    list: '/api/plans',
    add: '/api/plans',
    update: (id: number) => `/api/plans/${id}`,
    delete: (id: number) => `/api/plans/${id}`,
  }
}

// HTTP 超时配置
// 当前域名链路经 Cloudflare Tunnel，公网抖动时可能超过 10 秒。
// 统一提高到 30 秒，避免登录/首屏请求被前端过早超时。
export const REQUEST_TIMEOUT = 30000 // 30秒
