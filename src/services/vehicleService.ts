/**
 * 设备服务
 * 从后端获取真实设备列表
 */

import request from '../utils/request'

interface Vehicle {
  id: number
  companyCode: string
  productType: string
  productId: string
  name: string
  serialNumber: string
  brand: string
  model: string
  status: 'active' | 'working' | 'charging' | 'disabled'
  vehicleType: 'tracklayer' | 'railcar'
  batteryCapacity?: number
  weight?: number
  cleaningWidth?: number
  lastOnlineTime?: string
  createTime: string
  updateTime: string
}

/**
 * 小程序/App 机器人设备响应（从 /api/mini-app/devices 获取）
 */
interface MiniAppRobotResponse {
  id: number
  serialNumber: string | null
  name: string | null
  companyCode: string | null
  productType: string | null
  productId: string | null
  deviceId: string | null
  vehicleType: string | null
  deviceType?: string | null
  online: boolean | null
  status: string | null
  onlineState?: string | null
  missionState?: string | null
  controlState?: string | null
  healthState?: string | null
  faultState?: string | null
  lastCommandId?: string | null
  lastCommandStatus?: string | null
  battery: number | null
  updatedAt?: number | null
  lastOnlineTime?: string | null

  // 工作参数
  runControl?: number
  runEnable?: number
  workMode?: number
  walkSpeed?: number
  brushSpeed?: number
  bridgeSpeed?: number
  runTimeSingle?: number
  runTimeTotal?: number
  mileageSingle?: number
  mileageTotal?: number
  heartbeat?: number

  // T 型状态上报字段
  voltage?: number
  angle?: number
  tracking?: boolean
  pathPlanning?: string
  leftEdge?: number
  rightEdge?: number
  moveJudge?: boolean
  detectQrcode?: boolean
  enterGarage?: boolean
  mqttMessageType?: string

  // GPS
  longitude?: number
  latitude?: number

  // D12 特有字段
  d12WorkWay?: number
  boundDeviceIds?: string[]
  boundDeviceCount?: number
  leftRowStart?: number
  leftRowEnd?: number
  rightRowStart?: number
  rightRowEnd?: number
  walkFastSpeed?: number
  walkSlowSpeed?: number
  currentRowPosition?: number
  batteryLowLimit?: number
  robotInPositionTime?: number
  limitPositionCheckTime?: number
  walkPositionCheckTime?: number
  supportedActions?: string[]
  supportedParams?: string[]
  supportedStatusFields?: string[]
  shadowDetail?: Record<string, any>
}

interface DeviceShadowStatus {
  exists: boolean
  vehicleId?: number
  deviceId: string
  serialNumber?: string
  deviceType?: string
  productType?: string
  productId?: string
  companyCode?: string
  name?: string
  vehicleType?: string
  onlineState?: string
  missionState?: string
  controlState?: string
  healthState?: string
  faultState?: string
  lastCommandId?: string
  lastCommandStatus?: string
  rawStatus?: string
  mqttMessageType?: string
  battery?: number
  voltage?: number
  angle?: number
  updatedAt?: number
  location?: {
    lon?: number
    lat?: number
  }
  supportedActions?: string[]
  supportedParams?: string[]
  supportedStatusFields?: string[]
  detail?: Record<string, any>
}

/**
 * 扫码绑定设备请求
 */
interface DeviceScanRequest {
  companyCode: string
  productType: string
  productId: string
}

/**
 * 扫码绑定设备响应
 */
interface DeviceInfoResponse {
  deviceId: number | null
  companyCode: string | null
  productType: string | null
  productId: string | null
  serialNumber: string | null
  status: string | null
  bound: boolean | null
  boundUsername?: string | null
  userId?: number | null
}

class VehicleService {
  private buildDeviceStatusSummary(device: Partial<MiniAppRobotResponse>) {
    return {
      id: device.id,
      serialNumber: device.serialNumber,
      name: device.name,
      companyCode: device.companyCode,
      productType: device.productType,
      productId: device.productId,
      deviceId: device.deviceId,
      vehicleType: device.vehicleType,
      online: device.online,
      status: device.status,
      battery: device.battery,
      control: {
        runControl: device.runControl,
        runEnable: device.runEnable,
        workMode: device.workMode,
        walkSpeed: device.walkSpeed,
        brushSpeed: device.brushSpeed,
        bridgeSpeed: device.bridgeSpeed,
      },
      runtime: {
        runTimeSingle: device.runTimeSingle,
        runTimeTotal: device.runTimeTotal,
        mileageSingle: device.mileageSingle,
        mileageTotal: device.mileageTotal,
        heartbeat: device.heartbeat,
      },
      location: (device.longitude != null || device.latitude != null)
        ? { longitude: device.longitude, latitude: device.latitude }
        : undefined,
      d12: (device.productType === '-D12' || device.productType === '-T12')
        ? {
          d12WorkWay: device.d12WorkWay,
          leftRowStart: device.leftRowStart,
          leftRowEnd: device.leftRowEnd,
          rightRowStart: device.rightRowStart,
          rightRowEnd: device.rightRowEnd,
          walkFastSpeed: device.walkFastSpeed,
          walkSlowSpeed: device.walkSlowSpeed,
          currentRowPosition: device.currentRowPosition,
          batteryLowLimit: device.batteryLowLimit,
        }
        : undefined,
      shadow: {
        onlineState: device.onlineState,
        missionState: device.missionState,
        controlState: device.controlState,
        healthState: device.healthState,
        faultState: device.faultState,
        lastCommandId: device.lastCommandId,
        lastCommandStatus: device.lastCommandStatus,
        updatedAt: device.updatedAt,
      },
    }
  }

  /**
   * 扫码绑定设备
   */
  async scanAndBindDevice(payload: DeviceScanRequest): Promise<DeviceInfoResponse> {
    try {
      console.log('[VehicleService] 开始扫码绑定设备:', payload)

      const response = await request.post<DeviceInfoResponse>(
        '/device/scan',
        payload,
        { showLoading: true, loadingText: '绑定设备中...' }
      )

      console.log('[VehicleService] 扫码绑定结果:', response)
      return response
    } catch (error: any) {
      console.error('[VehicleService] 扫码绑定失败:', error)
      throw error
    }
  }

  /**
   * 获取小程序设备列表（含实时状态）
   * 使用新的 /api/mini-app/devices 接口
   */
  async getAllVehicles(): Promise<MiniAppRobotResponse[]> {
    try {
      console.log('[VehicleService] ========== 开始获取设备列表 ==========')

      const response = await request.get<MiniAppRobotResponse[]>('/api/mini-app/devices')

      console.log(`[VehicleService] ✅ 获取到 ${response.length} 个设备`)

      response.forEach((device, index) => {
        console.log(`[VehicleService] 设备 ${index + 1} 状态摘要:`, this.buildDeviceStatusSummary(device))
      })

      return response

    } catch (error: any) {
      console.error('[VehicleService] ❌ 获取设备列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取设备
   */
  async getVehicleById(id: number): Promise<MiniAppRobotResponse> {
    try {
      console.log(`[VehicleService] 获取设备详情 - ID: ${id}`)

      const response = await request.get<MiniAppRobotResponse>(`/api/mini-app/devices/${id}`)

      console.log('[VehicleService] ✅ 获取设备详情成功')
      console.log('[VehicleService] 设备详情:', response)

      return response

    } catch (error: any) {
      console.error('[VehicleService] ❌ 获取设备详情失败:', error)
      throw error
    }
  }

  /**
   * 获取设备标准状态快照
   */
  async getDeviceShadowById(id: number): Promise<DeviceShadowStatus> {
    try {
      console.log(`[VehicleService] 获取设备标准状态 - ID: ${id}`)

      return await request.get<DeviceShadowStatus>(`/api/mini-app/devices/${id}/shadow`)
    } catch (error: any) {
      console.error('[VehicleService] ❌ 获取设备标准状态失败:', error)
      throw error
    }
  }

  /**
   * 获取 D12 绑定的 D01 列表
   */
  async getD12Bindings(d12SerialNumber: string): Promise<string[]> {
    return request.get<string[]>(`/api/mini-app/d12/${encodeURIComponent(d12SerialNumber)}/bindings`)
  }

  /**
   * D12 新增绑定 D01
   */
  async bindD12Device(d12SerialNumber: string, d01SerialNumber: string): Promise<string[]> {
    return request.post<string[]>(
      `/api/mini-app/d12/${encodeURIComponent(d12SerialNumber)}/bindings`,
      { d01SerialNumber }
    )
  }

  /**
   * D12 解绑 D01
   */
  async unbindD12Device(d12SerialNumber: string, d01SerialNumber: string): Promise<string[]> {
    return request.delete<string[]>(
      `/api/mini-app/d12/${encodeURIComponent(d12SerialNumber)}/bindings/${encodeURIComponent(d01SerialNumber)}`
    )
  }

  /**
   * 转换为前端使用的 Robot 格式
   */
  convertToRobot(device: MiniAppRobotResponse): any {
    console.log(`[VehicleService] 转换设备 ${device.deviceId} 为 Robot 格式`)

    const normalizedOnlineState = (device.onlineState || '').toUpperCase()
    const normalizedStatus = normalizedOnlineState === 'OFFLINE'
      ? 'offline'
      : this.mapStatus(device.status)
    const normalizedOnline = normalizedOnlineState === 'ONLINE'
      ? true
      : normalizedOnlineState === 'OFFLINE'
        ? false
        : normalizedStatus === 'offline'
          ? false
          : normalizedStatus != null
            ? true
            : (device.online ?? false)

    const robot = {
      id: device.id,
      companyCode: device.companyCode ?? null,
      productType: device.productType ?? null,
      productId: device.productId ?? null,
      serialNumber: device.serialNumber ?? null,
      name: device.name ?? null,

      // 状态 - 没获取到就是 null
      status: normalizedStatus,
      online: normalizedOnline,
      battery: device.battery ?? null,
      deviceType: device.deviceType ?? null,
      onlineState: device.onlineState ?? null,
      missionState: device.missionState ?? null,
      controlState: device.controlState ?? null,
      healthState: device.healthState ?? null,
      faultState: device.faultState ?? null,
      lastCommandId: device.lastCommandId ?? null,
      lastCommandStatus: device.lastCommandStatus ?? null,
      updatedAt: device.updatedAt ?? null,

      // 工作参数 - 没获取到就是 null
      runControl: device.runControl ?? null,
      runEnable: device.runEnable ?? null,
      workMode: device.workMode ?? null,
      walkSpeed: device.walkSpeed ?? null,
      brushSpeed: device.brushSpeed ?? null,
      bridgeSpeed: device.bridgeSpeed ?? null,

      // 运行数据
      runTimeSingle: device.runTimeSingle ?? null,
      runTimeTotal: device.runTimeTotal ?? null,
      mileageSingle: device.mileageSingle ?? null,
      mileageTotal: device.mileageTotal ?? null,
      heartbeat: device.heartbeat ?? null,

      // T 型状态上报字段
      voltage: device.voltage ?? null,
      angle: device.angle ?? null,
      tracking: device.tracking ?? null,
      pathPlanning: device.pathPlanning ?? null,
      leftEdge: device.leftEdge ?? null,
      rightEdge: device.rightEdge ?? null,
      moveJudge: device.moveJudge ?? null,
      detectQrcode: device.detectQrcode ?? null,
      enterGarage: device.enterGarage ?? null,
      mqttMessageType: device.mqttMessageType ?? null,

      // GPS
      longitude: device.longitude ?? null,
      latitude: device.latitude ?? null,

      // D12 特有字段
      boundDeviceIds: device.boundDeviceIds ?? [],
      boundDeviceCount: device.boundDeviceCount ?? 0,
      leftRowStart: device.leftRowStart ?? null,
      leftRowEnd: device.leftRowEnd ?? null,
      rightRowStart: device.rightRowStart ?? null,
      rightRowEnd: device.rightRowEnd ?? null,
      walkFastSpeed: device.walkFastSpeed ?? null,
      walkSlowSpeed: device.walkSlowSpeed ?? null,
      currentRowPosition: device.currentRowPosition ?? null,
      batteryLowLimit: device.batteryLowLimit ?? null,
      robotInPositionTime: device.robotInPositionTime ?? null,
      limitPositionCheckTime: device.limitPositionCheckTime ?? null,
      walkPositionCheckTime: device.walkPositionCheckTime ?? null,
      supportedActions: device.supportedActions ?? [],
      supportedParams: device.supportedParams ?? [],
      supportedStatusFields: device.supportedStatusFields ?? [],
      shadowDetail: device.shadowDetail ?? null,
    }

    console.log('[VehicleService] ✅ 转换完成:', {
      deviceId: robot.productType && robot.productId ? `${robot.productType}${robot.productId}` : null,
      status: robot.status,
      battery: robot.battery,
      onlineState: robot.onlineState,
      missionState: robot.missionState,
      controlState: robot.controlState,
      lastCommandId: robot.lastCommandId,
      lastCommandStatus: robot.lastCommandStatus,
    })

    return robot
  }

  /**
   * 映射状态（保留向后兼容）
   */
  mapStatus(status: string | null): string | null {
    if (status == null) return 'offline'
    switch (status) {
      case 'working':
      case 'cleaning':
      case 'running':
        return 'running'
      case 'charging':
        return 'charging'
      case 'active':
      case 'idle':
      case 'stopped':
      case 'manual':
      case 'resetting':
      case 'unknown':
      case 'disabled':
        return 'idle'
      case 'offline':
        return 'offline'
      default:
        return 'idle'
    }
  }
}

export default new VehicleService()
export type { Vehicle, MiniAppRobotResponse, DeviceScanRequest, DeviceInfoResponse, DeviceShadowStatus }

