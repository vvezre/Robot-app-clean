/**
 * API 数据类型定义
 */

// ============ 用户相关 ============
export interface User {
  userId?: number
  username: string
  password?: string
  roleId?: number
  realName?: string
  status?: string
}

export interface Role {
  roleId?: number
  name: string
  permissions?: string
}

// ============ 任务日志相关 ============
export interface TaskLog {
  id?: string // 对应 taskID
  droneId?: string
  vehicleId?: string // 对应 deviceId
  areaId?: number
  routeId?: string
  startTime?: Date | string
  endTime?: Date | string
  status?: string
  cleaningArea?: number
  efficiency?: number
  powerRestored?: number
  cleaningMode?: string
  taskType?: string
}

// 城市任务统计
export interface CityTaskStats {
  city?: string
  taskCount?: number
  completedCount?: number
  failedCount?: number
  successRate?: number
}

// 月度失败统计
export interface MonthlyFailStats {
  month?: string
  failCount?: number
  totalCount?: number
  failRate?: number
}

// 城市任务排名
export interface CityTaskRank {
  city?: string
  taskCount?: number
  rank?: number
}

// ============ 充电站相关 ============
export interface ChargingStation {
  id?: number
  name: string
  location?: string
  status?: string
  stationType?: string
  voltageLevel?: number
}

// ============ 清洁区域相关 ============
export interface CleanArea {
  id?: number
  name: string
  description?: string
  location?: string
  size?: number
  status?: string
  siteId?: number
  priority?: number
  region_code?: string
}

// ============ 清洁路线相关 ============
export interface CleanRoute {
  id?: number
  name: string
  pathPoints?: string
}

// ============ 轨道车消息相关 ============
export interface RailcarMessage {
  // 基本信息
  deviceId?: string
  timestamp?: Date | string

  // 公司代号
  companyCode?: string
  serialNumber?: string

  // 产品型号和编号
  productModel?: string
  productNumber?: string

  // 工作方式
  workMode?: string
  workModeDescription?: string

  // 工作任务时间
  weekYear?: string
  monthDay?: string
  hourMinute?: string

  // GPS定位
  longitude?: number
  latitude?: number

  // 工作运行时长
  singleRunTime?: number
  totalRunTime?: number

  // 工作运行里程
  singleRunDistance?: number
  totalRunDistance?: number

  // 工作模式
  operationMode?: string
  operationModeDescription?: string
  operationEnable?: string
  operationEnableDescription?: string

  // 电池电量
  batteryLevel?: number

  // 备用设置
  backup1?: string
  backup2?: string
  backup3?: string
  backup4?: string

  // 速度信息
  currentSpeed?: number
  heartbeat?: number
  brushSpeed?: number
  bridgeSpeed?: number

  // 原始数据
  rawData?: string
}

// ============ 轨道车控制相关 ============
export interface RailcarControlMessage {
  deviceId: string
  command: string
  params?: Record<string, any>
}

export interface RailcarConfig {
  deviceId?: string
  config?: Record<string, any>
}

// ============ 分页相关 ============
export interface PageRequest {
  page?: number
  size?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PageResponse<T> {
  records: T[]
  total: number
  page: number
  size: number
}
