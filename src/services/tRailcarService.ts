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

export interface ModelingPoint {
  id: string
  name: string
  sequence: number
  x: number
  y: number
  lat: number
  lon: number
}

export interface ModelingPointsResponse {
  points: ModelingPoint[]

}
export interface ALLModelingPointsResponse {

  areaPoints: ModelingPoint[]
  linkPoints: ModelingPoint[]
  pathPoints: ModelingPoint[]


}

/**
 * 已保存路线信息
 */
export interface SavedRoute {
  taskName: string
  modelId: string
  current: boolean
  areaPoints: ModelingPoint[]
  linkPoints: ModelingPoint[]
  pathPoints: ModelingPoint[]
}

/**
 * 已保存路线列表载荷
 */
export interface SavedRoutesPayload {
  productId: string
  serialNumber: string
  currentTaskName: string | null
  routes: SavedRoute[]
}
/**
 * 发送T型号小车控制命令（统一接口）
 */
export const sendCommand = async (
  commandRequest: TRailcarCommandRequest): Promise<TRailcarControlResponse> => {
  return await request.post<TRailcarControlResponse>('/api/t-railcar/command', commandRequest)
}

// 命令状态响应接口
export interface CommandStatusResponse {
  exists: boolean
  commandId: string
  deviceId: string
  action: string
  status: string
  message: string
  terminal: boolean
  detail?: {
    result?: {
      data?: {
        areaNumber?: number
        groupCount?: number
        modelId?: string
        groupId?: string
        previousGroupId?: string
        previousAreaNumber?: number
        linkId?: string
        [key: string]: any
      }
      [key: string]: any
    }
    [key: string]: any
  }
}

/**
 * 查询命令状态
 * @param commandId 命令ID
 */
export const getCommandStatus = async (commandId: string): Promise<CommandStatusResponse> => {
  return await request.get<CommandStatusResponse>(`/api/command-status/${commandId}`)
}

/**
 * 轮询命令状态
 * @param commandId 命令ID
 * @param maxAttempts 最大轮询次数
 * @param interval 轮询间隔（毫秒）
 */
export const pollCommandStatus = async (
  commandId: string,
  maxAttempts: number = 10,
  interval: number = 1000
): Promise<CommandStatusResponse> => {
  let lastStatus: CommandStatusResponse | null = null

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await getCommandStatus(commandId) as any
      console.log(`[pollCommandStatus] 第${i + 1}次查询:`, status)

      // 保存最后一次状态
      if (status) {
        lastStatus = status
      }

      // terminal 为 true 或 status 为终态时返回
      if (status && (status.terminal === true || status.status === 'SUCCEEDED' || status.status === 'FAILED')) {
        return status
      }
    } catch (error) {
      console.warn(`[pollCommandStatus] 第${i + 1}次查询失败:`, error)
      // 如果查询失败，继续尝试
    }

    // 等待下一次查询
    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }

  // 如果达到最大尝试次数，返回最后一次状态或抛出错误
  if (lastStatus) {
    console.warn('[pollCommandStatus] 达到最大轮询次数，返回最后状态:', lastStatus)
    return lastStatus
  }

  throw new Error('命令状态查询超时')
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
  turnLeft: async (productId: string, angle: number) => {
    return await sendCommand({
      productId,
      command: 'turn_left',
      params: { "angle": angle }
      // params: { angle },
    })
  },

  /**
   * 右转
   * @param productId 产品ID
   * @param angle 角度（默认90度）
   */
  turnRight: async (productId: string, angle: number) => {
    return await sendCommand({
      productId,
      command: 'turn_right',
      // params: { angle },
      params: { "angle": angle }
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

  /**
   * 自动清扫
   * @param productId 产品ID
   */
  auto_drive: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'auto_drive',
      params: {}
    })
  },

  /**
   * 记录区域点
   * @param productId 产品ID
   */
  sample_modeling_point: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'sample_modeling_point',
    })
  },



  /**
   * 记录连接点
   * @param productId 产品ID
   */
  sample_modeling_link_point: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'sample_modeling_link_point',
    })
  },
  /**
   * 删除连接点
   * @param productId 产品ID
   */
  delete_modeling_point: async (productId: string, id: string) => {
    return await sendCommand({
      productId,
      command: 'delete_modeling_point',
      params: { "id": id }
    })
  },
  /**
   * 删除连接点
   * @param productId 产品ID
   */
  delete_link_point: async (productId: string, id: string) => {
    return await sendCommand({
      productId,
      command: 'delete_modeling_link_point',
      params: { "id": id }
    })
  },
  /**
  * 确认开始建模
  * @param productId 产品ID
  */
  finish_modeling: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'finish_modeling',
      params: {}
    })
  },
  /**
   * 新增区域块（结束当前区域，开始新区域）
   * @param productId 产品ID
   */
  new_modeling_area: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'new_modeling_area',
      params: {}
    })
  },
  /**
    * 开始建图（清空后重新开始）
    * @param productId 产品ID
    */
  start_modeling: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'start_modeling',
      params: {}
    })
  },
  /**
    * 保存路径名称
    * @param productId 产品ID
    */
  save_modeling_task: async (productId: string, name: string) => {
    return await sendCommand({
      productId,
      command: 'save_modeling_task',
      params: { "taskName": name }
    })
  },



  /**
   * 清空当前区域点
   * @param productId 产品ID
   */
  clear_area_point: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'clear_modeling_area_points',
      params: {}
    })
  },



  /**
   * 清空当前连接点
   * @param productId 产品ID
   */
  clear_link_point: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'clear_modeling_link_points',
      params: {}
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
  //  * 保存任务
  //  * @param productId 产品ID
  //  * @param taskName 任务名称
  //  */
  // saveTask: async (productId: string, taskName: string) => {
  //   return await sendCommand({
  //     productId,
  //     command: 'save_task',
  //     params: { taskName },
  //   })
  // },
  // saveTask: async (productId: string, taskName: string): Promise<TRailcarSetCurrentTaskResponse> => {
  //   return await request.post<TRailcarSetCurrentTaskResponse>('/api/t-railcar/modeling-task/save', {
  //     productId,
  //     taskName,
  //   })
  // },
  getTaskPath: async (productId: string) => {
    return await sendCommand({
      productId,
      command: 'get_task_path',
    })
  },

  fetchTaskPath: async (productId: string): Promise<TRailcarTaskPathResponse> => {
    return await request.get<TRailcarTaskPathResponse>(`/api/t-railcar/task-path/${productId}`)
  },

  fetchTaskOptions: async (productId: string): Promise<SavedRoutesPayload | null> => {
    return await request.get<SavedRoutesPayload | null>(`/api/t-railcar/saved-routes/${productId}`, undefined, { silent: true })
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

/**
 * 建模点查询接口
 */
export const tRailcarModeling = {
  /**
   * 查询区域点列表
   * @param productId 产品ID
   */
  getModelingPoints: async (productId: string): Promise<ModelingPointsResponse> => {
    return await request.get<ModelingPointsResponse>(`/api/t-railcar/modeling-points/${productId}`)
  },

  /**
   * 查询连接点列表
   * @param productId 产品ID
   */
  getLinkingPoints: async (productId: string): Promise<ModelingPointsResponse> => {
    return await request.get<ModelingPointsResponse>(`/api/t-railcar/modeling-link-points/${productId}`)
  },

  /**
   * 规划清扫路径列表
   * @param productId 产品ID
   */
  planCleaningPath: async (productId: string): Promise<ALLModelingPointsResponse> => {
    return await request.get(`/api/t-railcar/modeling-result/${productId}`)
  },
}

// 默认导出
export default {
  sendCommand,
  getCommandStatus,
  pollCommandStatus,
  movement: tRailcarMovement,
  joystick: tRailcarJoystick,
  advanced: tRailcarAdvanced,
  parameters: tRailcarParameters,
  task: tRailcarTask,
  config: tRailcarConfig,
  status: tRailcarStatus,
  modeling: tRailcarModeling,
}
