/**
 * WebSocket 服务（小程序版）
 * 用于接收后端设备状态实时推送
 *
 * 注意：小程序环境使用 Taro SocketTask API
 */

import Taro from '@tarojs/taro'
import { getBaseURL } from '../config/api'

/**
 * WebSocket 消息接口（完整的设备状态数据）
 */
export interface WebSocketMessage {
  // 基本信息
  deviceId: string
  battery?: number
  batteryRaw?: number
  status?: string
  statusNormalized?: string
  onlineState?: string
  missionState?: string
  controlState?: string
  healthState?: string
  faultState?: string
  deviceType?: string
  companyCode?: string
  productModel?: string
  productId?: string
  updatedAt?: number
  operationMode?: string
  timestamp: number

  // GPS 位置
  location?: {
    lon: number
    lat: number
  }

  // ========== 工作模式参数 ==========
  runControl?: number
  runEnable?: number
  workMode?: number

  // ========== 速度参数 ==========
  speed?: number
  walkSpeed?: number
  brushSpeed?: number
  bridgeSpeed?: number

  // ========== 运行数据 ==========
  runTimeSingle?: number
  runTimeTotal?: number
  mileageSingle?: number
  mileageTotal?: number
  heartbeat?: number

  // ========== T 型状态上报字段 ==========
  voltage?: number
  angle?: number
  heading?: number
  lat?: number
  lon?: number
  tracking?: boolean
  pathPlanning?: string
  leftEdge?: number
  rightEdge?: number
  moveJudge?: boolean
  detectQrcode?: boolean
  enterGarage?: boolean
  mqttMessageType?: string
  action?: string
  taskName?: string
  lastCommandId?: string
  lastCommandStatus?: string
  lastCommandMessage?: string
  localX?: number
  localY?: number
  curTaskIndex?: number
  taskCount?: number
  supportedActions?: string[]
  supportedParams?: string[]
  supportedStatusFields?: string[]
  shadowDetail?: Record<string, any>

  // ========== D12 接驳车特有字段 ==========
  d12WorkWay?: number
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
}

type MessageCallback = (message: WebSocketMessage) => void
type StatusChangeCallback = (isConnected: boolean) => void
type ReconnectStatusCallback = (info: {
  isReconnecting: boolean
  attempt: number
  nextRetryIn: number // 毫秒
  canManualRetry: boolean
}) => void

class WebSocketService {
  private socketTask: any = null
  private isConnectedFlag = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stompConnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = Infinity // 无限重连
  private baseReconnectDelay = 3000 // 基础延迟 3秒
  private maxReconnectDelay = 60000 // 最大延迟 60秒
  private stompConnectTimeoutMs = 8000
  private isManuallyDisconnected = false // 是否手动断开

  // 回调函数
  private onMessageCallback?: MessageCallback
  private onStatusChangeCallback?: StatusChangeCallback
  private onReconnectStatusCallback?: ReconnectStatusCallback

  // 设备订阅列表
  private subscribedDevices = new Set<string>()

  /**
   * 连接 WebSocket（小程序版本 - STOMP协议）
   */
  public connect(
    onMessage?: MessageCallback,
    onStatusChange?: StatusChangeCallback,
    onReconnectStatus?: ReconnectStatusCallback
  ): void {
    console.log('[WebSocket Service] ========== 开始连接 WebSocket (STOMP) ==========')

    this.onMessageCallback = onMessage
    this.onStatusChangeCallback = onStatusChange
    this.onReconnectStatusCallback = onReconnectStatus
    this.isManuallyDisconnected = false

    // 如果是首次连接，重置重连次数
    if (this.reconnectAttempts === 0) {
      console.log('[WebSocket Service] 首次连接，重置状态')
    }

    // 动态获取 WebSocket 地址
    const baseUrl = getBaseURL()
    // 将 http 替换为 ws，https 替换为 wss
    const wsBaseUrl = baseUrl.replace(/^http/, 'ws')
    const wsUrl = `${wsBaseUrl}/ws/native`

    console.log('[WebSocket Service] 连接地址:', wsUrl)

    try {
      this.clearStompConnectTimer()
      this.isConnectedFlag = false
      if (this.socketTask) {
        this.socketTask.close({})
        this.socketTask = null
      }

      // 发起连接
      const socketResult = Taro.connectSocket({
        url: wsUrl,
        header: {
          'content-type': 'application/json',
        },
        fail: (error) => {
          console.error('[WebSocket Service] ❌ WebSocket 连接请求失败:', error)
          this.handleDisconnect()
        },
      }) as any

      if (socketResult && typeof socketResult.then === 'function') {
        socketResult
          .then((socketTask: any) => this.attachSocketTask(socketTask))
          .catch((error: any) => {
            console.error('[WebSocket Service] ❌ WebSocket SocketTask 创建失败:', error)
            this.handleDisconnect()
          })
      } else {
        this.attachSocketTask(socketResult)
      }

    } catch (error) {
      console.error('[WebSocket Service] ❌ WebSocket 连接启动失败:', error)
      this.attemptReconnect()
    }
  }

  private attachSocketTask(socketTask: any) {
    if (!socketTask) {
      console.error('[WebSocket Service] ❌ WebSocket SocketTask 为空')
      this.handleDisconnect()
      return
    }

    this.socketTask = socketTask

    socketTask.onOpen(() => {
      if (this.socketTask !== socketTask) return
      console.log('[WebSocket Service] ✅ WebSocket Socket 已打开，发送 STOMP CONNECT 帧')
      this.startStompConnectTimer()
      this.sendConnectFrame()
    })

    socketTask.onMessage((res: any) => {
      if (this.socketTask !== socketTask) return
      try {
        const data = res.data
        this.handleStompMessage(data)
      } catch (error) {
        console.error('[WebSocket Service] ❌ 处理消息失败:', error)
      }
    })

    socketTask.onClose((res: any) => {
      if (this.socketTask !== socketTask) return
      console.log('[WebSocket Service] ❌ WebSocket 连接关闭', res)
      this.socketTask = null
      this.clearStompConnectTimer()
      if (this.isManuallyDisconnected) {
        return
      }
      this.handleDisconnect()
    })

    socketTask.onError((error: any) => {
      if (this.socketTask !== socketTask) return
      console.error('[WebSocket Service] ❌ WebSocket 错误:', error)
      if (!this.isConnectedFlag) {
        this.socketTask = null
        this.clearStompConnectTimer()
        this.handleDisconnect()
      }
    })
  }

  private startStompConnectTimer() {
    this.clearStompConnectTimer()
    this.stompConnectTimer = setTimeout(() => {
      if (this.isConnectedFlag) return
      console.error('[WebSocket Service] ❌ STOMP CONNECTED 超时，准备重连')
      this.socketTask?.close({})
    }, this.stompConnectTimeoutMs)
  }

  private clearStompConnectTimer() {
    if (this.stompConnectTimer) {
      clearTimeout(this.stompConnectTimer)
      this.stompConnectTimer = null
    }
  }

  /**
   * 发送 STOMP CONNECT 帧
   */
  private sendConnectFrame() {
    const frame = this.buildStompFrame('CONNECT', {
      'accept-version': '1.1,1.0',
      'heart-beat': '10000,10000'
    })
    this.sendRaw(frame)
  }

  /**
   * 处理 STOMP 消息
   */
  private handleStompMessage(data: string | ArrayBuffer) {
    if (typeof data !== 'string') {
      console.warn('[WebSocket Service] 收到非字符串数据，暂不处理')
      return
    }

    // 简单解析 STOMP 帧
    // 格式：
    // COMMAND
    // header1:value1
    // ...
    //
    // Body...
    // \0

    const lines = data.split('\n')
    if (lines.length === 0) return

    const command = lines[0].trim()

    // 提取 headers 和 body
    let i = 1
    const headers: Record<string, string> = {}
    while (i < lines.length) {
      const line = lines[i]
      if (line === '') break // 空行分隔 headers 和 body
      const parts = line.split(':')
      if (parts.length >= 2) {
        headers[parts[0].trim()] = parts.slice(1).join(':').trim()
      }
      i++
    }

    // 提取 Body (去掉末尾的 NULL 字符)
    // 注意：Body 可能会包含换行符，所以应该是从空行之后的所有内容
    const bodyStartIndex = data.indexOf('\n\n')
    let body = ''
    if (bodyStartIndex !== -1) {
      body = data.substring(bodyStartIndex + 2)
      // 去掉末尾的 NULL 字符 (ASCII 0)
      body = body.replace(/\u0000/g, '')
    }

    console.log(`[WebSocket Service] 收到 STOMP 命令: ${command}`)

    switch (command) {
      case 'CONNECTED':
        console.log('[WebSocket Service] ✅ STOMP 连接成功')
        this.clearStompConnectTimer()
        this.isConnectedFlag = true
        this.reconnectAttempts = 0

        // 通知上层已连接
        if (this.onStatusChangeCallback) {
          this.onStatusChangeCallback(true)
        }

        // 重新订阅之前订阅的设备
        this.resubscribeDevices()
        break

      case 'MESSAGE':
        // 处理消息推送
        console.log('[WebSocket Service] 收到推送消息')
        try {
          if (body && body.trim()) {
            const message: WebSocketMessage = JSON.parse(body)
            if (this.onMessageCallback) {
              this.onMessageCallback(message)
            }
          }
        } catch (e) {
          console.error('[WebSocket Service] JSON 解析失败:', e)
        }
        break

      case 'ERROR':
        console.error('[WebSocket Service] STOMP 错误:', headers['message'], body)
        break

      case 'PONG':
        // 心跳响应，暂时忽略
        break
    }
  }

  private handleDisconnect() {
    this.isConnectedFlag = false
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(false)
    }
    this.attemptReconnect()
  }

  /**
   * 订阅设备状态
   */
  public subscribeDevice(deviceId: string): void {
    console.log(`[WebSocket Service] 订阅设备状态: ${deviceId}`)
    this.subscribedDevices.add(deviceId)

    if (this.isConnectedFlag) {
      const frame = this.buildStompFrame('SUBSCRIBE', {
        destination: `/topic/device/status/${deviceId}`,
        id: `sub-${deviceId}`
      })
      this.sendRaw(frame)
    }
  }

  /**
   * 取消订阅设备状态
   */
  public unsubscribeDevice(deviceId: string): void {
    console.log(`[WebSocket Service] 取消订阅设备状态: ${deviceId}`)
    this.subscribedDevices.delete(deviceId)

    if (this.isConnectedFlag) {
      const frame = this.buildStompFrame('UNSUBSCRIBE', {
        id: `sub-${deviceId}`
      })
      this.sendRaw(frame)
    }
  }

  /**
   * 重新订阅所有设备
   */
  private resubscribeDevices(): void {
    if (this.subscribedDevices.size > 0) {
      console.log(`[WebSocket Service] 重新订阅 ${this.subscribedDevices.size} 个设备`)
      this.subscribedDevices.forEach((deviceId) => {
        this.subscribeDevice(deviceId)
      })
    }
  }

  /**
   * 构建STOMP帧
   */
  private buildStompFrame(command: string, headers: Record<string, string>, body: string = ''): string {
    let frame = command + '\n'
    for (const key in headers) {
      frame += `${key}:${headers[key]}\n`
    }
    frame += '\n' // Empty line
    frame += body
    frame += '\u0000' // Null byte
    return frame
  }

  /**
   * 发送原始数据
   */
  private sendRaw(data: string) {
    if (!this.socketTask) {
      console.warn('[WebSocket Service] WebSocket 未创建，无法发送数据')
      return
    }

    this.socketTask?.send({
      data: data,
      fail: (err) => {
        console.error('[WebSocket Service] 发送数据失败:', err)
      }
    })
  }

  /**
   * 尝试重连（指数退避）
   */
  private attemptReconnect(): void {
    if (this.isManuallyDisconnected) {
      console.log('[WebSocket Service] 手动断开，不自动重连')
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket Service] 已达到最大重连次数，停止重连')
      return
    }

    this.reconnectAttempts++

    // 计算指数退避延迟: min(baseDelay * 2^(attempt-1), maxDelay)
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    )

    console.log(
      `[WebSocket Service] ${delay / 1000}秒后尝试第 ${this.reconnectAttempts} 次重连...`
    )

    // 通知上层重连状态
    if (this.onReconnectStatusCallback) {
      this.onReconnectStatusCallback({
        isReconnecting: true,
        attempt: this.reconnectAttempts,
        nextRetryIn: delay,
        canManualRetry: true
      })
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      console.log(`[WebSocket Service] 开始第 ${this.reconnectAttempts} 次重连...`)
      this.connect(this.onMessageCallback, this.onStatusChangeCallback, this.onReconnectStatusCallback)
    }, delay)
  }

  /**
   * 断开连接
   */
  public disconnect(): void {
    console.log('[WebSocket Service] 断开 WebSocket 连接')

    this.isManuallyDisconnected = true // 标记为手动断开

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.clearStompConnectTimer()

    this.socketTask?.close({
      success: () => {
        console.log('[WebSocket Service] WebSocket 已关闭')
      }
    })
    this.socketTask = null

    this.isConnectedFlag = false
    this.subscribedDevices.clear()
  }

  /**
   * 手动触发重连（重置重连计数器）
   */
  public manualReconnect(): void {
    console.log('[WebSocket Service] 手动触发重连')

    // 清除现有定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // 重置状态
    this.reconnectAttempts = 0
    this.isManuallyDisconnected = false

    // 通知上层
    if (this.onReconnectStatusCallback) {
      this.onReconnectStatusCallback({
        isReconnecting: true,
        attempt: 0,
        nextRetryIn: 0,
        canManualRetry: false
      })
    }

    // 立即重连
    this.connect(this.onMessageCallback, this.onStatusChangeCallback, this.onReconnectStatusCallback)
  }

  /**
   * 获取重连次数
   */
  public getReconnectAttempts(): number {
    return this.reconnectAttempts
  }

  /**
   * 获取连接状态
   */
  public isConnected(): boolean {
    return this.isConnectedFlag
  }
}

// 导出单例
export default new WebSocketService()
