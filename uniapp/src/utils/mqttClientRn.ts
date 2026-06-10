/**
 * React Native 环境下的 MQTT 客户端
 * 使用 WebSocket 实现 MQTT over WebSocket
 */

import Taro from '@tarojs/taro'

export interface MQTTConfig {
  host: string
  port: number
  protocol: 'ws' | 'wss'
  username: string
  password: string
  clientId?: string
}

export interface MQTTMessage {
  topic: string
  message: string | Buffer
  qos?: 0 | 1 | 2
  retain?: boolean
}

class MQTTClientRN {
  private config: MQTTConfig
  private socketTask: Taro.SocketTask | null = null
  private isConnected: boolean = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null
  private subscriptions: Map<string, number> = new Map() // topic -> qos
  private messageHandlers: Map<string, (topic: string, message: string | Buffer) => void> = new Map()
  private connectTimeout: NodeJS.Timeout | null = null
  private lastHeartbeatTime: number = 0
  private readonly HEARTBEAT_INTERVAL = 30000 // 30秒
  private readonly HEARTBEAT_TIMEOUT = 60000 // 60秒超时
  private readonly CONNECT_TIMEOUT = 15000 // 15秒连接超时

  constructor(config: MQTTConfig) {
    this.config = config
  }

  /**
   * 连接到 MQTT 服务器
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve()
        return
      }

      // 设置连接超时
      this.connectTimeout = setTimeout(() => {
        if (!this.isConnected) {
          this.cleanup()
          reject(new Error('MQTT 连接超时'))
        }
      }, this.CONNECT_TIMEOUT)

      const protocol = this.config.protocol === 'wss' ? 'wss' : 'ws'
      const url = `${protocol}://${this.config.host}:${this.config.port}/mqtt`

      console.log('RN MQTT 连接:', url)

      try {
        // 使用 Taro 的 WebSocket API（在 RN 中会映射到 react-native 的 WebSocket）
        this.socketTask = Taro.connectSocket({
          url,
          protocols: ['mqtt'],
          header: {
            'User-Agent': 'Taro-RN-MQTT-Client'
          }
        })

        // 监听连接打开
        this.socketTask.onOpen(() => {
          console.log('RN MQTT WebSocket 连接已打开')
          this.isConnected = true
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout)
            this.connectTimeout = null
          }
          this.startHeartbeat()
          resolve()
        })

        // 监听消息
        this.socketTask.onMessage((res) => {
          this.handleMessage(res.data)
        })

        // 监听错误
        this.socketTask.onError((error) => {
          console.error('RN MQTT WebSocket 错误:', error)
          this.isConnected = false
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout)
            this.connectTimeout = null
          }
          reject(error)
        })

        // 监听关闭
        this.socketTask.onClose(() => {
          console.log('RN MQTT WebSocket 连接已关闭')
          this.isConnected = false
          this.stopHeartbeat()
          // 自动重连逻辑可以在这里实现
        })

      } catch (error) {
        console.error('RN MQTT 连接异常:', error)
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout)
          this.connectTimeout = null
        }
        reject(error)
      }
    })
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string | ArrayBuffer): void {
    try {
      // 这里需要实现 MQTT 协议的消息解析
      // 简化版本：假设服务器发送的是 JSON 格式
      let message: string
      if (typeof data === 'string') {
        message = data
      } else {
        // ArrayBuffer 转字符串
        const decoder = new TextDecoder('utf-8')
        message = decoder.decode(data)
      }

      // 解析 MQTT 消息（简化版）
      // 实际应该按照 MQTT 协议解析
      const parsed = JSON.parse(message)
      const topic = parsed.topic || ''
      const payload = parsed.payload || ''

      // 调用注册的消息处理器
      this.messageHandlers.forEach((handler, handlerTopic) => {
        if (this.matchTopic(topic, handlerTopic)) {
          handler(topic, payload)
        }
      })
    } catch (error) {
      console.error('RN MQTT 消息处理错误:', error)
    }
  }

  /**
   * 主题匹配（支持通配符）
   */
  private matchTopic(topic: string, pattern: string): boolean {
    if (pattern === topic) return true
    if (pattern.includes('+') || pattern.includes('#')) {
      // 简单的通配符匹配实现
      const regex = new RegExp(
        '^' + pattern.replace(/\+/g, '[^/]+').replace(/#/g, '.*') + '$'
      )
      return regex.test(topic)
    }
    return false
  }

  /**
   * 订阅主题
   */
  async subscribe(topic: string, qos: 0 | 1 | 2 = 1): Promise<void> {
    if (!this.isConnected || !this.socketTask) {
      throw new Error('MQTT 未连接')
    }

    this.subscriptions.set(topic, qos)

    // 发送订阅消息（需要按照 MQTT 协议格式）
    // 这里简化处理，实际需要构造 MQTT SUBSCRIBE 包
    const subscribeMsg = JSON.stringify({
      type: 'subscribe',
      topic,
      qos
    })

    try {
      this.socketTask.send({
        data: subscribeMsg
      })
      console.log('RN MQTT 订阅:', topic, 'QoS:', qos)
    } catch (error) {
      console.error('RN MQTT 订阅失败:', error)
      throw error
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(topic: string): Promise<void> {
    if (!this.isConnected || !this.socketTask) {
      throw new Error('MQTT 未连接')
    }

    this.subscriptions.delete(topic)

    const unsubscribeMsg = JSON.stringify({
      type: 'unsubscribe',
      topic
    })

    try {
      this.socketTask.send({
        data: unsubscribeMsg
      })
      console.log('RN MQTT 取消订阅:', topic)
    } catch (error) {
      console.error('RN MQTT 取消订阅失败:', error)
      throw error
    }
  }

  /**
   * 发布消息
   */
  async publish(topic: string, message: string | Buffer, qos: 0 | 1 | 2 = 1): Promise<void> {
    if (!this.isConnected || !this.socketTask) {
      throw new Error('MQTT 未连接')
    }

    // 验证消息长度（64字节对齐）
    let buffer: Buffer
    if (typeof message === 'string') {
      buffer = Buffer.from(message, 'hex')
    } else {
      buffer = message as Buffer
    }

    if (buffer.length !== 64) {
      throw new Error(`消息长度必须是 64 字节，当前: ${buffer.length} 字节`)
    }

    const publishMsg = JSON.stringify({
      type: 'publish',
      topic,
      payload: buffer.toString('hex'),
      qos
    })

    try {
      this.socketTask.send({
        data: publishMsg
      })
      console.log('RN MQTT 发布:', topic, 'QoS:', qos)
    } catch (error) {
      console.error('RN MQTT 发布失败:', error)
      throw error
    }
  }

  /**
   * 监听消息
   */
  on(topic: string, callback: (topic: string, message: string | Buffer) => void): void {
    this.messageHandlers.set(topic, callback)
  }

  /**
   * 取消监听
   */
  off(topic: string): void {
    this.messageHandlers.delete(topic)
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.lastHeartbeatTime = Date.now()

    // 定期发送心跳
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.socketTask) {
        try {
          const heartbeatMsg = JSON.stringify({
            type: 'ping'
          })
          this.socketTask.send({
            data: heartbeatMsg
          })
          this.lastHeartbeatTime = Date.now()
        } catch (error) {
          console.error('RN MQTT 心跳发送失败:', error)
        }
      }
    }, this.HEARTBEAT_INTERVAL)

    // 检查心跳超时
    this.heartbeatTimeoutTimer = setInterval(() => {
      const now = Date.now()
      if (now - this.lastHeartbeatTime > this.HEARTBEAT_TIMEOUT) {
        console.warn('RN MQTT 心跳超时，连接可能已断开')
        this.isConnected = false
        // 可以触发重连逻辑
      }
    }, 10000) // 每10秒检查一次
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.heartbeatTimeoutTimer) {
      clearInterval(this.heartbeatTimeoutTimer)
      this.heartbeatTimeoutTimer = null
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.cleanup()
    if (this.socketTask) {
      try {
        this.socketTask.close({})
      } catch (error) {
        console.error('RN MQTT 断开连接失败:', error)
      }
      this.socketTask = null
    }
    this.isConnected = false
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.stopHeartbeat()
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = null
    }
  }

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this.isConnected
  }
}

export default MQTTClientRN

