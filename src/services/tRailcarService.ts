/**
 * T型号小车控制服务
 * 提供T型号小车的控制API调用
 */

import request from '../utils/request'
import type { LayoutConnector, LayoutRange, LayoutVisitStrategy } from '../utils/taskLayoutModel'

// T型号小车命令请求接口
export interface TRailcarCommandRequest {
  productId: string
  command: string
  params?: Record<string, any>
}

// T型号小车控制响应接口
export interface TRailcarControlResponse {
  success: boolean
  message: string
  deviceId: string
  command: string
  mqttTopic: string
  commandId?: string
  traceId?: string
  commandStatus?: string
  timestamp: string
  operationId: number | null
}

export interface TRailcarPathSegment {
  id: number
  startX: number
  startY: number
  endX: number
  endY: number
  mode?: number
  angle?: number
  heading?: number
  areaNumber?: number
}

export interface TRailcarTaskPathPayload {
  taskId?: string
  taskName?: string
  originLat?: number
  originLon?: number
  yAxisBearing?: number
  updatedAt?: number
  segments: TRailcarPathSegment[]
}

export interface TRailcarTaskPathResponse {
  success: boolean
  message: string
  data: TRailcarTaskPathPayload | null
}

export interface TRailcarTaskOptionsPayload {
  taskNames: string[]
  currentTaskName?: string | null
}

export interface TRailcarTaskOptionsResponse {
  success: boolean
  message: string
  data: TRailcarTaskOptionsPayload | null
}

export interface TRailcarTaskPanelInfo {
  column: number
  isGap?: boolean
  gapLen?: number
}

export interface TRailcarLegacyTaskArea {
  areaNumber: number
  direction: 'left' | 'right'
  lineCount: number
  panelInfo: TRailcarTaskPanelInfo[]
}

export interface TRailcarLayoutV2TaskArea {
  areaNumber: number
  direction: 'left' | 'right'
  layoutVersion: 2
  layout: {
    returnToOrigin?: boolean
    visitStrategy?: LayoutVisitStrategy
    areas: LayoutRange[]
    holes: LayoutRange[]
    extras: LayoutRange[]
    connectors: LayoutConnector[]
  }
}

export type TRailcarTaskArea = TRailcarLegacyTaskArea | TRailcarLayoutV2TaskArea

export interface TRailcarCreateTaskPayload {
  taskName: string
  areaList: TRailcarTaskArea[]
}

export interface TRailcarCreateTaskResponse {
  success: boolean
  message: string
  data: {
    taskName: string
    areaCount: number
    commandId?: string
    traceId?: string
    commandStatus?: string
  } | null
}

export interface TRailcarSetCurrentTaskResponse {
  success: boolean
  message: string
  data: {
    taskName: string
    setCurrentCommandId?: string
    selectCommandId?: string
    saveCommandId?: string
    pathCommandId?: string
    pathCommandStatus?: string
    pathCommandMessage?: string
  } | null
}

export interface TRailcarDeleteCachedTaskResponse {
  success: boolean
  message: string
  data: {
    taskName: string
    removed?: number
    wasCurrentTask?: boolean
  } | null
}

export interface TRailcarSaveParamsPayload {
  goBackLen: number
  goLeftOrRightBackLen: number
  turnBackLen: number
  panelWidth: number
  panelHeight: number
  leftOrRightBridgeLen: number
  voltageWarn: number
  heading: number
  startLat: number
  startLon: number
  garageEntryLat: number
  garageEntryLon: number
  chargingPileLat: number
  chargingPileLon: number
  startToChargingPilePointLength: number
  lastTaskBackLength: number
  panelAngle: number
  panelAngleX: number
  gap: number
  gapX: number
  gapY: number
  originHeading: number
}

/**
 * 发送T型号小车控制命令（统一接口）
 */
export const sendCommand = async (
  commandRequest: TRailcarCommandRequest): Promise<TRailcarControlResponse> => {
  return await request.post<TRailcarControlResponse>('/api/t-railcar/command', commandRequest)
}

/**
 * 基础运动控制接口
 */
export const tRailcarMovement = {
  /**
   * 前进
   * @param productId 产品ID
   * @param distance 距离（mm），0=无限前进
   * @param speed 速度（0-100）
   */
  drive: async (productId: string, distance: number = 0, speed?: number) => {
    const params: any = { distance }
    if (speed !== undefined) params.speed = speed

    return await sendCommand({
      productId,
      command: 'drive',
      params,
    })
  },

  /**
   * 后退
   * @param productId 产品ID
   * @param distance 距离（mm），0=无限后退
   * @param speed 速度（0-100）
   */
  back: async (productId: string, distance: number = 0, speed?: number) => {
    const params: any = { distance }
    if (speed !== undefined) params.speed = speed

    return await sendCommand({
      productId,
      command: 'back',
      params,
    })
  },

  /**
   * 左转
   * @param productId 产品ID
   * @param angle 角度（默认90度）
   */
  turnLeft: async (productId: string, angle: number = 90) => {
    return await sendCommand({
      productId,
      command: 'turn_left',
      params: { angle },
    })
  },

  /**
   * 右转
   * @param productId 产品ID
   * @param angle 角度（默认90度）
   */
  turnRight: async (productId: string, angle: number = 90) => {
    return await sendCommand({
      productId,
      command: 'turn_right',
      params: { angle },
    })
  },

  /**
   * 停止
   * @param productId 产品ID
   */
  stop: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'stop',
    })
  },

  /**
   * 急停
   * @param productId 产品ID
   */
  parking: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'parking',
    })
  },
}

/**
 * 摇杆控制接口
 */
export const tRailcarJoystick = {
  /**
   * 摇杆移动
   * @param productId 产品ID
   * @param distance 移动距离/强度（0-100）
   * @param dirX X方向（-1.0到1.0）
   * @param dirY Y方向（-1.0到1.0）
   */
  move: async (productId: string, distance: number, dirX: number, dirY: number) => {
    return await sendCommand({
      productId,
      command: 'joystick_move',
      params: { distance, dirX, dirY },
    })
  },
}

/**
 * 高级功能接口
 */
export const tRailcarAdvanced = {
  /**
   * 自动清扫
   * @param productId 产品ID
   */
  autoDrive: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'auto_drive',
    })
  },

  /**
   * 继续清扫
   * @param productId 产品ID
   */
  goOn: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'go_on',
    })
  },

  /**
   * 返回原点
   * @param productId 产品ID
   */
  returnToPoint: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'return_to_point',
    })
  },

  /**
   * 入库
   * @param productId 产品ID
   */
  enterGarage: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'enter_garage',
    })
  },

  /**
   * 出库
   * @param productId 产品ID
   */
  exitGarage: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'exit_garage',
    })
  },
}

/**
 * 参数调整接口
 */
export const tRailcarParameters = {
  /**
   * 调整移动速度
   * @param productId 产品ID
   * @param speed 速度（0-100）
   */
  adjustSpeed: async (productId: string, speed: number) => {
    return await sendCommand({
      productId,
      command: 'adjust_speed',
      params: { speed },
    })
  },

  /**
   * 调整滚刷速度
   * @param productId 产品ID
   * @param speed 速度（0-100）
   */
  adjustBrushSpeed: async (productId: string, speed: number) => {
    return await sendCommand({
      productId,
      command: 'adjust_brush_speed',
      params: { speed },
    })
  },

  /**
   * 切换纠偏功能
   * @param productId 产品ID
   * @param tracking 是否开启纠偏
   */
  toggleTracking: async (productId: string, tracking: boolean) => {
    return await sendCommand({
      productId,
      command: 'toggle_tracking',
      params: { tracking },
    })
  },

  /**
   * 切换路径规划模式
   * @param productId 产品ID
   * @param path 路径规划模式（"left" / "right"）
   */
  togglePathPlanning: async (productId: string, path: 'left' | 'right') => {
    return await sendCommand({
      productId,
      command: 'toggle_path_planning',
      params: { path },
    })
  },
}

/**
 * 任务管理接口
 */
export const tRailcarTask = {
  /**
   * 创建任务
   * @param productId 产品ID
   * @param taskData 任务数据
   */
  createTask: async (
    productId: string,
    taskData: TRailcarCreateTaskPayload
  ): Promise<TRailcarCreateTaskResponse> => {
    return await request.post<TRailcarCreateTaskResponse>('/api/t-railcar/tasks/generate', {
      productId,
      ...taskData,
    })
  },

  /**
   * 选择任务
   * @param productId 产品ID
   * @param taskName 任务名称
   */
  selectTask: async (productId: string, taskName: string) => {
    return await sendCommand({
      productId,
      command: 'select_task',
      params: { taskName },
    })
  },

  /**
   * 保存任务
   * @param productId 产品ID
   * @param taskName 任务名称
   */
  saveTask: async (productId: string, taskName: string) => {
    return await sendCommand({
      productId,
      command: 'save_task',
      params: { taskName },
    })
  },

  getTaskPath: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'get_task_path',
    })
  },

  fetchTaskPath: async (productId: string): Promise<TRailcarTaskPathResponse> => {
    return await request.get<TRailcarTaskPathResponse>(`/api/t-railcar/task-path/${productId}`)
  },

  fetchTaskOptions: async (productId: string): Promise<TRailcarTaskOptionsResponse> => {
    return await request.get<TRailcarTaskOptionsResponse>(`/api/t-railcar/tasks/${productId}`)
  },

  setCurrentTask: async (productId: string, taskName: string): Promise<TRailcarSetCurrentTaskResponse> => {
    return await request.post<TRailcarSetCurrentTaskResponse>('/api/t-railcar/tasks/current', {
      productId,
      taskName,
    })
  },

  deleteCachedTask: async (productId: string, taskName: string): Promise<TRailcarDeleteCachedTaskResponse> => {
    return await request.delete<TRailcarDeleteCachedTaskResponse>('/api/t-railcar/tasks/cache', {
      productId,
      taskName,
    })
  },
}

/**
 * 参数配置接口
 */
export const tRailcarConfig = {
  /**
   * 保存系统参数
   * @param productId 产品ID
   * @param params 系统参数
   */
  saveParams: async (
    productId: string,
    params: TRailcarSaveParamsPayload
  ) => {
    return await sendCommand({
      productId,
      command: 'save_params',
      params,
    })
  },

  setGarageEntry: async (productId: string, lat: number, lon: number) => {
    return await sendCommand({
      productId,
      command: 'set_garage_entry',
      params: { lat, lon },
    })
  },
}

/**
 * 状态查询接口
 */
export const tRailcarStatus = {
  /**
   * 获取车辆状态
   * @param productId 产品ID
   */
  getStatus: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'get_status',
    })
  },
}

// 默认导出
export default {
  sendCommand,
  movement: tRailcarMovement,
  joystick: tRailcarJoystick,
  advanced: tRailcarAdvanced,
  parameters: tRailcarParameters,
  task: tRailcarTask,
  config: tRailcarConfig,
  status: tRailcarStatus,
}
