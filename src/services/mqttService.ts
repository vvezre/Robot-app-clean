import { MQTTClient, createMQTTClient, MQTTMessageCallback, MQTTErrorCallback, MQTTConnectCallback } from '../utils/mqttClient'
import { MQTTConnectionState, MQTT_QUEUE_CONFIG } from '../config/mqtt'

interface QueuedMessage {
  topic: string
  message: string | object | Uint8Array | Buffer
  qos: 0 | 1 | 2
  retain: boolean
  timestamp: number
}

/**
 * MQTT 服务类
 * 单例模式，管理全局 MQTT 连接
 *
 * ⚠️ 部分已弃用 (PARTIALLY DEPRECATED) ⚠️
 *
 * 直接设备控制功能已迁移到后端 API 以提高安全性。
 * 此服务保留用于：
 * - 接收设备状态消息（订阅）
 * - 降级模式（后端故障时，需要特殊权限）
 * - 调试和监控
 *
 * 迁移说明：
 * - ❌ 不要使用 publish() 发送设备控制命令
 * - ✅ 使用 deviceControlService.sendCommand() 代替
 * - ✅ 可以继续使用 subscribe() 接收设备状态
 *
 * @deprecated 设备控制功能已迁移到 deviceControlService
 * @see deviceControlService
 */
class MQTTService {
  private static instance: MQTTService
  private client: MQTTClient | null = null
  private connectionState: MQTTConnectionState = MQTTConnectionState.DISCONNECTED
  private messageQueue: QueuedMessage[] = []

  // 外部回调
  private onConnectCallback?: MQTTConnectCallback
  private onMessageCallback?: MQTTMessageCallback
  private onErrorCallback?: MQTTErrorCallback

  private constructor() { }

  /**
   * 获取单例实例
   */
  public static getInstance(): MQTTService {
    if (!MQTTService.instance) {
      MQTTService.instance = new MQTTService()
    }
    return MQTTService.instance
  }

  /**
   * 初始化并连接 MQTT
   */
  public async init(
    onConnect?: MQTTConnectCallback,
    onMessage?: MQTTMessageCallback,
    onError?: MQTTErrorCallback
  ): Promise<void> {
    console.log('[MQTT Service] ===== 开始初始化 MQTT 服务 =====')

    this.onConnectCallback = onConnect
    this.onMessageCallback = onMessage
    this.onErrorCallback = onError

    if (this.connectionState === MQTTConnectionState.CONNECTED ||
      this.connectionState === MQTTConnectionState.CONNECTING) {
      console.log('[MQTT Service] ⏳ MQTT 正在连接或已连接，跳过重复初始化')
      return
    }

    try {
      this.setConnectionState(MQTTConnectionState.CONNECTING)
      console.log('[MQTT Service] 📦 创建 MQTT 客户端实例...')

      // 创建客户端
      this.client = createMQTTClient()
      console.log('[MQTT Service] ✅ MQTT 客户端实例创建成功')

      // 设置回调
      this.setupClientCallbacks()

      // 连接
      console.log('[MQTT Service] 🔌 开始连接 MQTT 服务器...')
      await this.client.connect()
      // 注意：实际连接成功会在 onConnect 回调中处理
    } catch (error) {
      console.error('[MQTT Service] ❌ MQTT 初始化失败:', error)
      this.setConnectionState(MQTTConnectionState.ERROR)
      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error)
      }
    }
  }

  private setupClientCallbacks() {
    if (!this.client) return

    this.client.onConnect = () => {
      console.log('[MQTT Service] 🔔 MQTT 连接成功')
      this.setConnectionState(MQTTConnectionState.CONNECTED)

      // 处理消息队列
      this.processMessageQueue()

      if (this.onConnectCallback) {
        this.onConnectCallback()
      }
    }

    this.client.onMessage = (topic, message) => {
      const msgLen = message
        ? (typeof message === 'string' ? message.length : message.length)
        : 0
      console.log(`[MQTT Service] 📨 收到消息 - 主题: ${topic}, 长度: ${msgLen}`)

      if (this.onMessageCallback) {
        this.onMessageCallback(topic, message)
      }
    }

    this.client.onError = (error) => {
      console.error('[MQTT Service] ❌ MQTT 错误:', error)
      this.setConnectionState(MQTTConnectionState.ERROR)

      if (this.onErrorCallback) {
        this.onErrorCallback(error)
      }
    }
  }

  /**
   * 设置连接状态
   */
  private setConnectionState(state: MQTTConnectionState) {
    this.connectionState = state
    console.log(`[MQTT Service] 📊 连接状态更新: ${state}`)
  }

  /**
   * 处理消息队列
   */
  private async processMessageQueue() {
    if (this.messageQueue.length === 0) return

    console.log(`[MQTT Service] 📥 开始处理消息队列，当前堆积: ${this.messageQueue.length}`)

    // 复制队列并清空，防止死循环
    const queueToProcess = [...this.messageQueue]
    this.messageQueue = []

    for (const item of queueToProcess) {
      try {
        // 检查消息是否过期 (例如 1小时)
        if (Date.now() - item.timestamp > 3600000) {
          console.warn('[MQTT Service] ⚠️ 消息已过期，丢弃:', item.topic)
          continue
        }

        await this.publish(item.topic, item.message, item.qos, item.retain)
      } catch (error) {
        console.error('[MQTT Service] ❌ 队列消息重发失败:', error)
        // 如果发送失败，重新加入队列头部（或者根据策略丢弃）
        // 这里简单策略：如果是连接断开导致的，重新入队；否则丢弃
        if (this.connectionState !== MQTTConnectionState.CONNECTED) {
          this.messageQueue.unshift(item)
          break // 停止处理后续消息
        }
      }
    }
  }

  /**
   * 订阅主题
   */
  public async subscribe(topic: string, qos: 0 | 1 | 2 = 1): Promise<void> {
    console.log(`[MQTT Service] 📡 订阅主题: ${topic}, QoS: ${qos}`)

    if (!this.client || this.connectionState !== MQTTConnectionState.CONNECTED) {
      console.warn('[MQTT Service] ⚠️ 客户端未连接，无法订阅')
      // 可以考虑将订阅请求也加入队列，或者直接抛出错误
      throw new Error('MQTT 客户端未连接')
    }

    try {
      await this.client.subscribe(topic, qos)
      console.log(`[MQTT Service] ✅ 订阅成功: ${topic}`)
    } catch (error) {
      console.error(`[MQTT Service] ❌ 订阅失败: ${topic}`, error)
      throw error
    }
  }

  /**
   * 取消订阅
   */
  public async unsubscribe(topic: string): Promise<void> {
    console.log(`[MQTT Service] 📤 取消订阅主题: ${topic}`)
    if (!this.client) return

    try {
      await this.client.unsubscribe(topic)
      console.log(`[MQTT Service] ✅ 取消订阅成功: ${topic}`)
    } catch (error) {
      console.error(`[MQTT Service] ❌ 取消订阅失败: ${topic}`, error)
      throw error
    }
  }

  /**
   * 发布消息
   */
  public async publish(
    topic: string,
    message: string | object | Uint8Array | Buffer,
    qos: 0 | 1 | 2 = 1,
    retain: boolean = false
  ): Promise<void> {
    const messageLength = typeof message === 'string'
      ? message.length
      : (message instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(message)))
        ? message.length
        : JSON.stringify(message).length

    console.log(`[MQTT Service] 📤 发布消息 - 主题: ${topic}, 长度: ${messageLength}, QoS: ${qos}`)

    // 如果未连接，加入消息队列
    if (!this.client || this.connectionState !== MQTTConnectionState.CONNECTED) {
      console.warn('[MQTT Service] ⚠️ 客户端未连接，消息加入队列')

      if (this.messageQueue.length >= MQTT_QUEUE_CONFIG.maxSize) {
        console.warn('[MQTT Service] ⚠️ 消息队列已满，丢弃最早的消息')
        this.messageQueue.shift()
      }

      this.messageQueue.push({
        topic,
        message,
        qos,
        retain,
        timestamp: Date.now()
      })
      return
    }

    try {
      await this.client.publish(topic, message, qos, retain)
      console.log(`[MQTT Service] ✅ 消息发布成功: ${topic}`)
    } catch (error) {
      console.error(`[MQTT Service] ❌ 消息发布失败: ${topic}`, error)
      // 发送失败也加入队列
      this.messageQueue.push({
        topic,
        message,
        qos,
        retain,
        timestamp: Date.now()
      })
      throw error
    }
  }

  /**
   * 断开连接
   */
  public disconnect(): void {
    console.log('[MQTT Service] 🔌 断开 MQTT 连接')
    if (this.client) {
      this.client.disconnect()
      this.client = null
      this.setConnectionState(MQTTConnectionState.DISCONNECTED)
      console.log('[MQTT Service] ✅ MQTT 连接已断开')
    }
  }

  /**
   * 获取连接状态
   */
  public isConnected(): boolean {
    return this.connectionState === MQTTConnectionState.CONNECTED
  }

  /**
   * 获取当前连接状态枚举
   */
  public getConnectionState(): MQTTConnectionState {
    return this.connectionState
  }
}

export default MQTTService.getInstance()
