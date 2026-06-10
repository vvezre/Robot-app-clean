import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'

/**
 * 设备配置接口
 * 前端只传递业务参数，后端负责编码为 70 字节协议（或 28 字节交互帧）
 */
export interface DeviceConfig {
  // 基本信息
  deviceId: string          // 设备 ID（完整序列号，如 -D01250001）
  companyCode: string       // 公司代号（8字节 ASCII）
  model: string             // 产品型号（4字节 ASCII）

  // 信息识别码
  infoCommandType?: number  // 高字节：00=设置参数，02=交互指令
  bindStatus?: number       // 低字节：00=未绑定，01-05=绑定数量
  bindDeviceId?: string     // D12 绑定 D01 的完整设备ID
  bindDeviceIds?: string[]  // D12 绑定 D01 列表（最多5台）

  // 工作方式
  workWay?: number          // 工作方式: 0:无效, 1:每日, 2:每月, 3:每年, 4:每周

  // 时间组（4组）
  time1?: TimeGroup
  time2?: TimeGroup
  time3?: TimeGroup
  time4?: TimeGroup

  // 控制模式
  controlMode?: number      // 0:无效, 1:Auto, 2:Stop, 3:Reset, 4:Loop, 5:Manual
  enableMode?: number       // 0:无效, 1:检+左+单, 2:检+左+双, 3:检+右+单, 4:检+右+双

  // 检测参数
  edgeDelay?: number        // 到边检测延时 (单位: ms, 如 1000=1000ms=1s)
  bridgeTime?: number       // 垮桥检测时间 (单位: 0.001s, 如 6000=6.000s)
  errorReturnTime?: number  // 纠错校正长度控制设置 (单位: 0.01m, 如 1000=10.00m)

  // 速度参数
  walkSpeed?: number        // 行走速度 (百分比，如 800=80.0%)
  brushSpeed?: number       // 滚刷速度 (百分比，如 1000=100.0%)
  bridgeSpeed?: number      // 垮桥速度 (百分比，如 800=80.0%)

  // 其他
  heartbeatSet?: number     // 心跳脉冲设置 (如 100=1.00s)
  batteryLowLimit?: number  // 电池低电量警戒线 (如 50=5.0%)
  reserved?: number         // 备用字段 (默认为 0)
  reserved2?: number        // 备用字段2 (默认为 0)

  // D12 参数
  robotInPositionTime?: number
  limitPositionCheckTime?: number
  walkPositionCheckTime?: number
  walkFastSpeed?: number
  walkSlowSpeed?: number
  maxRowCount?: number

  // 交互指令参数（28字节帧）
  faultCode?: number
  currentRowPosition?: number

  // 快捷控制标记
  quickAction?: boolean

  // 小程序按钮点击时间（毫秒）
  clientClickTimestamp?: number

  // 扩展参数 (用于 D12 等特殊设备)
  params?: Record<string, any>
}

/**
 * 时间组接口
 */
export interface TimeGroup {
  yearWeek: string  // 年周或年月 (2字节 BCD/Hex)
  monDay: string    // 月日 (2字节 BCD/Hex)
  hrMin: string     // 时分 (2字节 BCD/Hex)
}

/**
 * 从 deviceId 中提取产品型号
 * deviceId 格式: -D01250001
 * 返回: -D01
 */
export function extractProductTypeFromDeviceId(deviceId: string): string {
  if (!deviceId || deviceId.length < 5) {
    return '-D01' // 默认值
  }
  // 提取前5个字符作为产品型号（如 -D01, -D11, -T01）
  return deviceId.substring(0, 4)
}

/**
 * 从 deviceId 中提取产品编号
 * deviceId 格式: -D01250001
 * 返回: 250001
 */
export function extractProductIdFromDeviceId(deviceId: string): string {
  if (!deviceId || deviceId.length < 5) {
    return '250001' // 默认值
  }
  // 提取从第4个字符开始的部分作为产品编号
  return deviceId.substring(4)
}

/**
 * 设备控制响应接口
 */
export interface DeviceControlResult {
  success: boolean
  message: string
  deviceId: string
  mqttTopic?: string
  timestamp?: string
  operationId?: number
  traceId?: string
  commandId?: string
  commandStatus?: string
  clientToServerMs?: number
  serverToMqttMs?: number
  clientToMqttMs?: number
  serverRequestTotalMs?: number
  clientToResponseMs?: number
}

/**
 * 设备参数配置表记录（railcar_config）
 */
export interface RailcarConfigRecord {
  id?: number
  productModel?: string
  productNumber?: string
  companyCode?: string
  workMode?: number
  operationMode?: number
  operationEnable?: number
  edgeDetectionDelay?: number
  bridgeDetectionTime?: number
  errorReturnTime?: number
  walkingSpeed?: number
  brushSpeed?: number
  bridgeSpeed?: number
  heartbeatPulse?: number
  backup?: number
  batteryLowLimit?: number
  workTimeGroups?: string
  // D12 接驳车专属字段
  robotInPositionTime?: number
  limitPositionCheckTime?: number
  walkPositionCheckTime?: number
  walkFastSpeed?: number
  walkSlowSpeed?: number
  maxRowCount?: number
  createTime?: string
  updateTime?: string
}

interface RailcarConfigQueryResponse {
  success: boolean
  message?: string
  config?: RailcarConfigRecord
}

/**
 * 设备控制服务（安全模式）
 *
 * ⚠️ 重要：此服务调用后端 API，后端负责：
 * 1. 参数验证
 * 2. 编码为 70 字节设置协议（或 28 字节交互协议）
 * 3. MQTT 发送
 * 4. 审计日志记录
 *
 * 前端不再直接处理 MQTT 和二进制编码，提高安全性
 */
export const deviceControlService = {
  /**
   * 发送设备控制命令
   *
   * @param config 设备配置（业务参数）
   * @returns 控制结果
   *
   * @example
   * ```typescript
   * const result = await deviceControlService.sendCommand({
   *   deviceId: '-D01250001',    // 设备ID（产品型号+产品编号）
   *   companyCode: 'ZTZN-PVC',   // 公司代号（8字节）
   *   model: '-D01',             // 产品型号（4字节）
   *   workWay: 1,
   *   controlMode: 4,
   *   enableMode: 4,
   *   walkSpeed: 800,
   *   brushSpeed: 1000,
   *   bridgeSpeed: 800
   * })
   * ```
   */
  async sendCommand(config: DeviceConfig): Promise<DeviceControlResult> {
    try {
      const requestPayload = {
        ...config,
        clientClickTimestamp: config.clientClickTimestamp ?? Date.now(),
      }

      console.log('[设备控制服务] 发送控制命令:', requestPayload)

      const result = await request.post<DeviceControlResult>(
        API_ENDPOINTS.deviceControl.sendCommand,
        requestPayload
      )

      console.log('[设备控制服务] 控制命令响应:', result)
      console.log('[设备控制服务] 链路耗时(ms):', {
        traceId: result.traceId,
        clientToServerMs: result.clientToServerMs,
        serverToMqttMs: result.serverToMqttMs,
        clientToMqttMs: result.clientToMqttMs,
        clientToResponseMs: result.clientToResponseMs,
      })

      return result
    } catch (error: any) {
      console.error('[设备控制服务] 控制命令失败:', error)
      throw error
    }
  },

  /**
   * 交互帧专用模式设置（0x02）
   * 注意：快捷按钮应使用 sendCommand 发送完整参数帧
   *
   * @param deviceId 设备 ID
   * @param controlMode 控制模式
   * @param enableMode 使能模式
   * @returns 控制结果
   *
   * @example
   * ```typescript
   * const result = await deviceControlService.setMode(
   *   '-D01250001',
   *   1,  // Auto 模式
   *   1   // 检+左+单
   * )
   * ```
   */
  async setMode(
    deviceId: string,
    controlMode: number,
    enableMode: number
  ): Promise<DeviceControlResult> {
    try {
      console.log('[设备控制服务] 设置工作模式:', { deviceId, controlMode, enableMode })

      // 从 deviceId 中提取产品型号
      const productType = extractProductTypeFromDeviceId(deviceId)

      const result = await request.post<DeviceControlResult>(
        API_ENDPOINTS.deviceControl.setMode,
        {
          deviceId,
          controlMode,
          enableMode,
          infoCommandType: 0x02,  // 交互帧：仅切换模式，不覆盖完整参数
          quickAction: true,
          clientClickTimestamp: Date.now(),
          faultCode: 0,
          currentRowPosition: 0,
          // 使用从 deviceId 提取的产品型号
          companyCode: 'ZTZN-PVC',  // 公司代号
          model: productType,       // 产品型号（从 deviceId 提取）
        }
      )

      console.log('[设备控制服务] 工作模式设置响应:', result)

      return result
    } catch (error: any) {
      console.error('[设备控制服务] 工作模式设置失败:', error)
      throw error
    }
  },

  /**
   * 获取设备实时状态
   *
   * @param deviceId 设备 ID
   * @returns 设备状态
   */
  async getDeviceStatus(deviceId: string): Promise<any> {
    try {
      console.log('[设备控制服务] 获取设备状态:', deviceId)

      const result = await request.get<any>(
        API_ENDPOINTS.deviceControl.getStatus,
        { deviceId }
      )

      console.log('[设备控制服务] 设备状态:', result)

      return result
    } catch (error: any) {
      console.error('[设备控制服务] 获取设备状态失败:', error)
      throw error
    }
  },

  /**
   * 从设备参数配置表读取已保存参数
   *
   * @param productModel 产品型号（如 -D01）
   * @param productNumber 产品编号（如 250001）
   * @returns 配置表记录，不存在时返回 null
   */
  async getSavedConfig(
    productModel: string,
    productNumber: string
  ): Promise<RailcarConfigRecord | null> {
    try {
      console.log('[设备控制服务] 查询设备配置表:', { productModel, productNumber })

      const result = await request.get<RailcarConfigQueryResponse>(
        API_ENDPOINTS.railcarControl.getConfig,
        { productModel, productNumber }
      )

      if (!result?.success || !result?.config) {
        console.log('[设备控制服务] 配置表中未找到记录:', { productModel, productNumber })
        return null
      }

      console.log('[设备控制服务] 读取设备配置成功:', result.config)
      return result.config
    } catch (error: any) {
      console.error('[设备控制服务] 读取设备配置失败:', error)
      throw error
    }
  },
}

export default deviceControlService
