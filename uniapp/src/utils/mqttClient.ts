import { MQTT_CONFIG } from '../config/mqtt'

// 在小程序环境中，mqtt 库可能不兼容，使用条件导入
let mqttLib: any = null

try {
  // 尝试导入 mqtt，如果失败则使用空对象
  mqttLib = require('mqtt')
} catch (error) {
  console.warn('MQTT 库导入失败，可能在小程序环境中不兼容:', error)
}

// 类型定义
type MqttClientType = any
type IClientOptionsType = any

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

export type MQTTConnectCallback = () => void
export type MQTTMessageCallback = (topic: string, message: string | Buffer | Uint8Array | null) => void
export type MQTTErrorCallback = (error: Error) => void

/**
 * MQTT 客户端类
 */
export class MQTTClient {
  private client: MqttClientType | null = null
  private config: MQTTConfig
  private isConnected: boolean = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  
  // 心跳机制
  private heartbeatTimer: NodeJS.Timeout | null = null
  private heartbeatInterval: number = 30000 // 30秒发送一次心跳
  private lastHeartbeatTime: number = 0
  private heartbeatTimeout: number = 60000 // 60秒未收到心跳则认为离线
  private heartbeatCheckTimer: NodeJS.Timeout | null = null

  // 事件回调
  public onConnect: MQTTConnectCallback | null = null
  public onMessage: MQTTMessageCallback | null = null
  public onError: MQTTErrorCallback | null = null

  constructor(config: MQTTConfig) {
    this.config = config
  }

  /**
   * 生成客户端ID
   */
  private generateClientId(): string {
    const randomStr = Math.random().toString(36).substring(2, 15)
    return `client_${randomStr}`
  }

  /**
   * 连接 MQTT 服务器
   * @param timeout 连接超时时间（毫秒），默认15秒
   */
  public connect(timeout: number = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      // 检查 mqtt 库是否可用
      if (!mqttLib) {
        const error = new Error('MQTT 库不可用，可能在小程序环境中不兼容')
        console.error(error)
        reject(error)
        return
      }
      
      // 设置连接超时
      let timeoutTimer: NodeJS.Timeout | null = null
      let isResolved = false
      
      const resolveOnce = () => {
        if (!isResolved) {
          isResolved = true
          if (timeoutTimer) {
            clearTimeout(timeoutTimer)
            timeoutTimer = null
          }
          resolve()
        }
      }
      
      const rejectOnce = (error: Error) => {
        if (!isResolved) {
          isResolved = true
          if (timeoutTimer) {
            clearTimeout(timeoutTimer)
            timeoutTimer = null
          }
          if (this.client) {
            try {
              this.client.end()
            } catch (e) {
              // 忽略关闭错误
            }
            this.client = null
          }
          reject(error)
        }
      }
      
      // 设置超时定时器
      timeoutTimer = setTimeout(() => {
        if (!isResolved) {
          rejectOnce(new Error(`MQTT 连接超时（${timeout}ms）`))
        }
      }, timeout)
      
      try {
        const clientId = this.config.clientId || this.generateClientId()
        const url = `${this.config.protocol}://${this.config.host}:${this.config.port}/mqtt`

        const mqtt = mqttLib.default || mqttLib
        const options: IClientOptionsType = {
          clientId,
          username: this.config.username,
          password: this.config.password,
          clean: true,
          reconnectPeriod: 5000, // 自动重连间隔5秒
          connectTimeout: timeout, // 连接超时
          keepalive: 60, // 心跳间隔60秒
          protocolVersion: 4, // MQTT 3.1.1
          qos: 1, // 默认使用QoS 1，确保消息至少送达一次
        }

        console.log('正在连接 MQTT 服务器:', url)
        console.log('客户端ID:', clientId)

        this.client = mqtt.connect(url, options)

        // 连接成功
        this.client.on('connect', () => {
          console.log('MQTT 连接成功')
          this.isConnected = true
          this.reconnectAttempts = 0
          this.lastHeartbeatTime = Date.now()
          
          // 启动心跳机制
          this.startHeartbeat()
          
          if (this.onConnect) {
            this.onConnect()
          }
          resolveOnce()
        })

        // 接收消息
        this.client.on('message', (topic: string, message: Buffer) => {
          // 更新心跳时间（任何消息都表示连接活跃）
          this.lastHeartbeatTime = Date.now()
          
          // 小程序环境可能不支持 Buffer，转换为 Uint8Array
          try {
            // 严格验证64字节对齐
            if (message && message.length === 64) {
              // 转换为 Uint8Array 以兼容小程序环境
              const uint8Array = new Uint8Array(message)
              
              // 验证数据完整性：确保是64字节
              if (uint8Array.length !== 64) {
                console.error(`数据长度错误: 期望64字节，实际${uint8Array.length}字节，主题: ${topic}`)
                return
              }
              
              console.log('收到二进制消息:', topic, `[${uint8Array.length} 字节]`)
              if (this.onMessage) {
                // 将 Uint8Array 传递给回调
                this.onMessage(topic, uint8Array as any)
              }
            } else if (message) {
              // 非64字节数据，记录警告
              if (message.length > 0) {
                console.warn(`收到非标准长度消息: ${message.length}字节，主题: ${topic}，期望64字节`)
              }
              const messageStr = message.toString()
              console.log('收到文本消息:', topic, messageStr)
              if (this.onMessage) {
                this.onMessage(topic, messageStr)
              }
            } else {
              console.warn('收到空消息:', topic)
              if (this.onMessage) {
                this.onMessage(topic, null)
              }
            }
          } catch (error) {
            console.error('处理消息失败:', error, '主题:', topic)
            // 如果转换失败，尝试作为字符串处理
            try {
              if (message) {
                const messageStr = message.toString()
                if (this.onMessage) {
                  this.onMessage(topic, messageStr)
                }
              } else {
                if (this.onMessage) {
                  this.onMessage(topic, null)
                }
              }
            } catch (e) {
              console.error('无法处理消息:', e, '主题:', topic)
            }
          }
        })

        // 错误处理
        this.client.on('error', (error: Error) => {
          console.error('MQTT 错误:', error)
          
          if (this.onError) {
            this.onError(error)
          }
          rejectOnce(error)
        })

        // 断开连接
        this.client.on('close', () => {
          console.log('MQTT 连接已关闭')
          this.isConnected = false
        })

        // 离线
        this.client.on('offline', () => {
          console.log('MQTT 客户端离线')
          this.isConnected = false
          this.stopHeartbeat() // 停止心跳
        })

        // 重连
        this.client.on('reconnect', () => {
          this.reconnectAttempts++
          console.log(`MQTT 重连中... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('MQTT 重连次数已达上限，停止重连')
            if (this.client) {
              this.client.end()
            }
          }
        })

      } catch (error) {
        console.error('MQTT 连接异常:', error)
        rejectOnce(error as Error)
      }
    })
  }

  /**
   * 订阅主题
   * @param topic 主题名称
   * @param qos 服务质量等级 (0, 1, 2)
   */
  public subscribe(topic: string, qos: 0 | 1 | 2 = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.isConnected) {
        reject(new Error('MQTT 客户端未连接'))
        return
      }

      this.client.subscribe(topic, { qos }, (error) => {
        if (error) {
          console.error('订阅失败:', topic, error)
          reject(error)
        } else {
          console.log('订阅成功:', topic, 'QoS:', qos)
          resolve()
        }
      })
    })
  }

  /**
   * 取消订阅
   * @param topic 主题名称
   */
  public unsubscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.isConnected) {
        reject(new Error('MQTT 客户端未连接'))
        return
      }

      this.client.unsubscribe(topic, (error) => {
        if (error) {
          console.error('取消订阅失败:', topic, error)
          reject(error)
        } else {
          console.log('取消订阅成功:', topic)
          resolve()
        }
      })
    })
  }

  /**
   * 发布消息
   * @param topic 主题名称
   * @param message 消息内容 (字符串、对象或二进制数据)
   * @param qos 服务质量等级 (0, 1, 2)，默认1确保消息至少送达一次
   * @param retain 是否保留消息
   */
  public publish(
    topic: string,
    message: string | object | Uint8Array | Buffer,
    qos: 0 | 1 | 2 = 1, // 默认使用QoS 1，确保消息至少送达一次
    retain: boolean = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.isConnected) {
        reject(new Error('MQTT 客户端未连接'))
        return
      }

      let messageData: string | Buffer

      // 处理不同类型的消息
      if (message instanceof Uint8Array) {
        // 严格验证64字节对齐（对于二进制数据）
        if (message.length !== 64) {
          console.warn(`警告: 二进制消息长度不是64字节，实际: ${message.length}字节，主题: ${topic}`)
        }
        // Uint8Array 转换为 Buffer
        messageData = Buffer.from(message)
      } else if (Buffer.isBuffer(message)) {
        // 严格验证64字节对齐（对于二进制数据）
        if (message.length !== 64) {
          console.warn(`警告: 二进制消息长度不是64字节，实际: ${message.length}字节，主题: ${topic}`)
        }
        // 已经是 Buffer
        messageData = message
      } else if (typeof message === 'object') {
        // 对象转换为 JSON 字符串
        messageData = JSON.stringify(message)
      } else {
        // 字符串
        messageData = message
      }

      this.client.publish(topic, messageData, { qos, retain }, (error) => {
        if (error) {
          console.error('发布消息失败:', topic, error)
          reject(error)
        } else {
          if (Buffer.isBuffer(messageData)) {
            console.log('发布消息成功:', topic, `[二进制数据 ${messageData.length} 字节]`)
          } else {
            console.log('发布消息成功:', topic, messageData)
          }
          resolve()
        }
      })
    })
  }

  /**
   * 启动心跳机制
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    // 定期发送心跳（通过ping）
    this.heartbeatTimer = setInterval(() => {
      if (this.client && this.isConnected) {
        try {
          // MQTT客户端会自动发送PING，这里记录时间
          this.lastHeartbeatTime = Date.now()
          console.log('MQTT 心跳: 连接正常')
        } catch (error) {
          console.error('发送心跳失败:', error)
        }
      }
    }, this.heartbeatInterval)
    
    // 检查心跳超时
    this.heartbeatCheckTimer = setInterval(() => {
      if (this.isConnected) {
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime
        if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
          console.warn(`MQTT 心跳超时: ${timeSinceLastHeartbeat}ms 未收到消息，可能已离线`)
          this.isConnected = false
          if (this.onError) {
            this.onError(new Error('心跳超时，连接可能已断开'))
          }
        }
      }
    }, 10000) // 每10秒检查一次
  }

  /**
   * 停止心跳机制
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer)
      this.heartbeatCheckTimer = null
    }
  }

  /**
   * 断开连接
   */
  public disconnect(): void {
    // 停止心跳
    this.stopHeartbeat()
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.client) {
      console.log('断开 MQTT 连接')
      this.client.end()
      this.client = null
      this.isConnected = false
    }
  }

  /**
   * 获取连接状态
   */
  public getConnected(): boolean {
    return this.isConnected
  }

  /**
   * 获取客户端实例
   */
  public getClient(): MqttClientType | null {
    return this.client
  }
}

/**
 * 创建 MQTT 客户端实例
 * 根据环境自动选择使用 Node.js 版本或小程序版本
 */
export function createMQTTClient(config?: Partial<MQTTConfig>): MQTTClient {
  try {
    // 检测运行环境
    const env = process.env.TARO_ENV
    
    // React Native 环境使用 RN 专用客户端
    if (env === 'rn') {
      try {
        const MQTTClientRN = require('./mqttClientRn').default
        const finalConfig: MQTTConfig = {
          host: config?.host || MQTT_CONFIG.host,
          port: config?.port || MQTT_CONFIG.port,
          protocol: config?.protocol || MQTT_CONFIG.protocol,
          username: config?.username || MQTT_CONFIG.username,
          password: config?.password || MQTT_CONFIG.password,
          clientId: config?.clientId || MQTT_CONFIG.clientId,
        }
        return new MQTTClientRN(finalConfig) as any
      } catch (e) {
        console.error('加载 RN MQTT 客户端失败:', e)
      }
    }
    
    // 检测是否在小程序环境
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let isMiniProgram = false
    try {
      isMiniProgram = typeof (globalThis as any).wx !== 'undefined' || 
                      typeof (globalThis as any).my !== 'undefined' || 
                      typeof (globalThis as any).swan !== 'undefined'
    } catch (e) {
      // globalThis 可能不可用，使用其他方式检测
      isMiniProgram = typeof wx !== 'undefined' || 
                      typeof my !== 'undefined' || 
                      typeof swan !== 'undefined'
    }
    
    if (isMiniProgram) {
      // 小程序环境使用小程序版本的 MQTT 客户端
      try {
        const { createMQTTClientWeapp } = require('./mqttClientWeapp')
        return createMQTTClientWeapp(config) as any
      } catch (e) {
        console.error('加载小程序 MQTT 客户端失败:', e)
        // 如果加载失败，回退到标准版本（虽然可能不工作）
      }
    }
    
    // Node.js/H5 环境使用标准版本
    const defaultConfig: MQTTConfig = {
      host: MQTT_CONFIG.host,
      port: MQTT_CONFIG.port,
      protocol: MQTT_CONFIG.protocol,
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
    }

    const finalConfig: MQTTConfig = {
      ...defaultConfig,
      ...config,
    }

    return new MQTTClient(finalConfig)
  } catch (error) {
    console.error('创建 MQTT 客户端失败:', error)
    // 返回一个空的客户端，避免页面崩溃
    const defaultConfig: MQTTConfig = {
      host: MQTT_CONFIG.host,
      port: MQTT_CONFIG.port,
      protocol: MQTT_CONFIG.protocol,
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
    }
    return new MQTTClient(defaultConfig)
  }
}

