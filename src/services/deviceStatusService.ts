/**
 * 设备状态服务
 * 提供 HTTP 轮询方式获取设备状态
 */

import { request } from '../utils/request'

interface DeviceStatus {
  deviceId: string
  exists: boolean
  battery?: number
  status?: string
  operationMode?: string
  location?: {
    lon: number
    lat: number
  }
  lastUpdateTime?: number
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

class DeviceStatusService {
  /**
   * 查询单个设备状态
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    try {
      const response = await request.get<DeviceStatus>(`/api/device-status/${deviceId}`)

      console.log(`[DeviceStatusService] 设备状态查询成功 - 设备: ${deviceId}`, response)
      return response
    } catch (error) {
      console.error(`[DeviceStatusService] 设备状态查询失败 - 设备: ${deviceId}`, error)
      throw error
    }
  }

  /**
   * 批量查询设备状态
   */
  async getDeviceStatusBatch(deviceIds: string[]): Promise<Record<string, DeviceStatus>> {
    try {
      const response = await request.post<Record<string, DeviceStatus>>('/api/device-status/batch', { deviceIds })

      console.log('[DeviceStatusService] 批量设备状态查询成功', response)
      return response
    } catch (error) {
      console.error('[DeviceStatusService] 批量设备状态查询失败', error)
      throw error
    }
  }

  /**
   * 查询单个设备标准状态
   */
  async getDeviceShadow(deviceId: string): Promise<DeviceShadowStatus> {
    try {
      const response = await request.get<DeviceShadowStatus>(`/api/device-status/${deviceId}/shadow`)

      console.log(`[DeviceStatusService] 设备标准状态查询成功 - 设备: ${deviceId}`, response)
      return response
    } catch (error) {
      console.error(`[DeviceStatusService] 设备标准状态查询失败 - 设备: ${deviceId}`, error)
      throw error
    }
  }

  /**
   * 批量查询设备标准状态
   */
  async getDeviceShadowBatch(deviceIds: string[]): Promise<Record<string, DeviceShadowStatus>> {
    try {
      const response = await request.post<Record<string, DeviceShadowStatus>>(
        '/api/device-status/shadow/batch',
        { deviceIds }
      )

      console.log('[DeviceStatusService] 批量设备标准状态查询成功', response)
      return response
    } catch (error) {
      console.error('[DeviceStatusService] 批量设备标准状态查询失败', error)
      throw error
    }
  }

  /**
   * 轮询设备状态（自动刷新）
   *
   * @param deviceId 设备ID
   * @param interval 轮询间隔（毫秒）
   * @param callback 状态更新回调
   * @returns 清除函数（调用可停止轮询）
   */
  startPolling(
    deviceId: string,
    interval: number,
    callback: (status: DeviceStatus) => void
  ): () => void {
    console.log(
      `[DeviceStatusService] 开始轮询设备状态 - 设备: ${deviceId}, 间隔: ${interval}ms`
    )

    // 立即查询一次
    this.getDeviceStatus(deviceId).then(callback).catch((error) => {
      console.error('[DeviceStatusService] 初始查询失败', error)
    })

    // 设置定时轮询
    const timer = setInterval(() => {
      this.getDeviceStatus(deviceId)
        .then(callback)
        .catch((error) => {
          console.error('[DeviceStatusService] 轮询查询失败', error)
        })
    }, interval)

    // 返回清除函数
    return () => {
      console.log(`[DeviceStatusService] 停止轮询设备状态 - 设备: ${deviceId}`)
      clearInterval(timer)
    }
  }

  /**
   * 批量轮询设备状态
   */
  startBatchPolling(
    deviceIds: string[],
    interval: number,
    callback: (statuses: Record<string, DeviceStatus>) => void
  ): () => void {
    console.log(
      `[DeviceStatusService] 开始批量轮询设备状态 - 设备数量: ${deviceIds.length}, 间隔: ${interval}ms`
    )

    // 立即查询一次
    this.getDeviceStatusBatch(deviceIds).then(callback).catch((error) => {
      console.error('[DeviceStatusService] 初始批量查询失败', error)
    })

    // 设置定时轮询
    const timer = setInterval(() => {
      this.getDeviceStatusBatch(deviceIds)
        .then(callback)
        .catch((error) => {
          console.error('[DeviceStatusService] 批量轮询查询失败', error)
        })
    }, interval)

    // 返回清除函数
    return () => {
      console.log('[DeviceStatusService] 停止批量轮询设备状态')
      clearInterval(timer)
    }
  }

  /**
   * 轮询设备标准状态
   */
  startShadowPolling(
    deviceId: string,
    interval: number,
    callback: (status: DeviceShadowStatus) => void
  ): () => void {
    this.getDeviceShadow(deviceId).then(callback).catch((error) => {
      console.error('[DeviceStatusService] 初始标准状态查询失败', error)
    })

    const timer = setInterval(() => {
      this.getDeviceShadow(deviceId)
        .then(callback)
        .catch((error) => {
          console.error('[DeviceStatusService] 标准状态轮询查询失败', error)
        })
    }, interval)

    return () => {
      clearInterval(timer)
    }
  }
}

export default new DeviceStatusService()
export type { DeviceStatus, DeviceShadowStatus }
