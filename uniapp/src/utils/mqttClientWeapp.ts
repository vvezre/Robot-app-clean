import Taro from '@tarojs/taro'
import { MQTT_CONFIG } from '../config/mqtt'

export interface MQTTConfig {
  host: string
  port: number
  protocol: 'ws' | 'wss'
  username: string
  password: string
  clientId?: string
  keepalive?: number
  clean?: boolean
}

export type MQTTConnectCallback = () => void
export type MQTTMessageCallback = (topic: string, message: Uint8Array) => void
export type MQTTErrorCallback = (error: Error) => void

/**
 * MQTT 3.1.1 协议常量
 */
const MQTT_PACKET_TYPE = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  PUBREC: 5,
  PUBREL: 6,
  PUBCOMP: 7,
  SUBSCRIBE: 8,
  SUBACK: 9,
  UNSUBSCRIBE: 10,
  UNSUBACK: 11,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
}

const CONNECT_FLAGS = {
  USERNAME: 0x80,
  PASSWORD: 0x40,
  WILL_RETAIN: 0x20,
  WILL_QOS_1: 0x08,
  WILL_QOS_2: 0x10,
  WILL_FLAG: 0x04,
  CLEAN_SESSION: 0x02,
}

/**
 * 小程序环境 MQTT 客户端类
 * 手动实现 MQTT 3.1.1 协议 over WebSocket
 */
export class MQTTClientWeapp {
  private socketTask: Taro.SocketTask | null = null
  private config: MQTTConfig
  private isConnected: boolean = false
  private packetId: number = 1
  private pingTimer: any = null
  private reconnectTimer: any = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  
  // 消息回调
  public onConnect: MQTTConnectCallback | null = null
  public onMessage: MQTTMessageCallback | null = null
  public onError: MQTTErrorCallback | null = null

  constructor(config: MQTTConfig) {
    this.config = {
      keepalive: 60,
      clean: true,
      ...config
    }
  }

  // ==========================================
  // 协议辅助方法
  // ==========================================

  private getNextPacketId(): number {
    this.packetId = (this.packetId % 65535) + 1
    return this.packetId
  }

  /**
   * 编码剩余长度
   */
  private encodeRemainingLength(length: number): number[] {
    const bytes: number[] = []
    do {
      let encodedByte = length % 128
      length = Math.floor(length / 128)
      if (length > 0) {
        encodedByte |= 0x80
      }
      bytes.push(encodedByte)
    } while (length > 0)
    return bytes
  }

  /**
   * 解码剩余长度
   */
  private decodeRemainingLength(buffer: Uint8Array, startIndex: number): { length: number, bytesUsed: number } {
    let multiplier = 1
    let value = 0
    let bytesUsed = 0
    let encodedByte: number
    
    do {
      if (startIndex + bytesUsed >= buffer.length) {
        throw new Error('Malformed Remaining Length')
      }
      encodedByte = buffer[startIndex + bytesUsed]
      value += (encodedByte & 127) * multiplier
      multiplier *= 128
      bytesUsed++
      if (multiplier > 128 * 128 * 128) {
        throw new Error('Malformed Remaining Length')
      }
    } while ((encodedByte & 128) !== 0)

    return { length: value, bytesUsed }
  }

  /**
   * 编码 UTF-8 字符串 (2字节长度 + 内容)
   */
  private encodeString(str: string): number[] {
    // 小程序环境通常支持 TextEncoder，如果不支持需要 polyfill
    // 这里假设基础 ASCII 或使用简单转换，生产环境建议使用 TextEncoder
    const bytes: number[] = []
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code < 0x80) {
        bytes.push(code)
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6))
        bytes.push(0x80 | (code & 0x3f))
      } else {
        bytes.push(0xe0 | (code >> 12))
        bytes.push(0x80 | ((code >> 6) & 0x3f))
        bytes.push(0x80 | (code & 0x3f))
      }
    }
    return [bytes.length >> 8, bytes.length & 0xff, ...bytes]
  }

  /**
   * 解码 UTF-8 字符串
   */
  private decodeString(buffer: Uint8Array, startIndex: number): { value: string, bytesUsed: number } {
    if (startIndex + 2 > buffer.length) return { value: '', bytesUsed: 0 }
    
    const length = (buffer[startIndex] << 8) | buffer[startIndex + 1]
    const end = startIndex + 2 + length
    
    if (end > buffer.length) return { value: '', bytesUsed: 0 }

    // 简单解码，生产环境建议使用 TextDecoder
    let str = ''
    for (let i = startIndex + 2; i < end; i++) {
      str += String.fromCharCode(buffer[i])
    }
    
    return { value: str, bytesUsed: 2 + length }
  }

  // ==========================================
  // 数据包构建
  // ==========================================

  private buildConnectPacket(): ArrayBuffer {
    const protocolName = this.encodeString('MQTT')
    const protocolLevel = 4 // 3.1.1
    
    let connectFlags = 0
    if (this.config.clean) connectFlags |= CONNECT_FLAGS.CLEAN_SESSION
    if (this.config.username) connectFlags |= CONNECT_FLAGS.USERNAME
    if (this.config.password) connectFlags |= CONNECT_FLAGS.PASSWORD

    const keepAlive = [this.config.keepalive! >> 8, this.config.keepalive! & 0xff]

    const payload: number[] = []
    // Client ID
    payload.push(...this.encodeString(this.config.clientId || `wx_${Date.now()}`))
    // Username
    if (this.config.username) {
      payload.push(...this.encodeString(this.config.username))
    }
    // Password
    if (this.config.password) {
      payload.push(...this.encodeString(this.config.password))
    }

    const variableHeader = [...protocolName, protocolLevel, connectFlags, ...keepAlive]
    const remainingLength = this.encodeRemainingLength(variableHeader.length + payload.length)
    
    const fixedHeader = [MQTT_PACKET_TYPE.CONNECT << 4, ...remainingLength]
    
    return new Uint8Array([...fixedHeader, ...variableHeader, ...payload]).buffer
  }

  private buildSubscribePacket(topic: string, qos: number): ArrayBuffer {
    const packetId = this.getNextPacketId()
    const variableHeader = [packetId >> 8, packetId & 0xff]
    
    const payload: number[] = []
    payload.push(...this.encodeString(topic))
    payload.push(qos)

    const remainingLength = this.encodeRemainingLength(variableHeader.length + payload.length)
    // SUBSCRIBE 固定头: 0x82 (Type: 8, Reserved: 0010)
    const fixedHeader = [0x82, ...remainingLength]

    return new Uint8Array([...fixedHeader, ...variableHeader, ...payload]).buffer
  }

  private buildPublishPacket(topic: string, message: Uint8Array, qos: number): ArrayBuffer {
    let firstByte = MQTT_PACKET_TYPE.PUBLISH << 4
    // QoS
    firstByte |= (qos << 1)
    
    const variableHeader: number[] = []
    variableHeader.push(...this.encodeString(topic))
    
    if (qos > 0) {
      const packetId = this.getNextPacketId()
      variableHeader.push(packetId >> 8, packetId & 0xff)
    }

    const remainingLength = this.encodeRemainingLength(variableHeader.length + message.length)
    
    const packet = new Uint8Array(1 + remainingLength.length + variableHeader.length + message.length)
    let offset = 0
    
    packet[offset++] = firstByte
    remainingLength.forEach(b => packet[offset++] = b)
    variableHeader.forEach(b => packet[offset++] = b)
    packet.set(message, offset)

    return packet.buffer
  }

  private buildPingReqPacket(): ArrayBuffer {
    return new Uint8Array([0xC0, 0x00]).buffer
  }

  private buildDisconnectPacket(): ArrayBuffer {
    return new Uint8Array([0xE0, 0x00]).buffer
  }

  private buildPubAckPacket(packetId: number): ArrayBuffer {
    return new Uint8Array([0x40, 0x02, packetId >> 8, packetId & 0xff]).buffer
  }

  // ==========================================
  // 核心逻辑
  // ==========================================

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve()
        return
      }

      const url = `${this.config.protocol}://${this.config.host}:${this.config.port}/mqtt`
      console.log(`[MQTT Weapp] Connecting to ${url}`)

      this.socketTask = Taro.connectSocket({
        url: url,
        protocols: ['mqtt'],
        success: () => console.log('[MQTT Weapp] Socket connecting...'),
        fail: (err) => {
          console.error('[MQTT Weapp] Socket connect failed', err)
          this.handleConnectionFailure()
          reject(err)
        }
      })

      this.socketTask.onOpen(() => {
        console.log('[MQTT Weapp] Socket Open. Sending CONNECT...')
        this.sendPacket(this.buildConnectPacket())
      })

      this.socketTask.onMessage((res) => {
        this.handlePacket(res.data)
        // 如果收到 CONNACK，且连接成功，则 resolve
        // 这里为了简化，假设连接建立后会立即收到 CONNACK
      })

      this.socketTask.onError((err) => {
        console.error('[MQTT Weapp] Socket Error', err)
        if (this.onError) this.onError(new Error('Socket Error'))
      })

      this.socketTask.onClose((res) => {
        console.log('[MQTT Weapp] Socket Closed', res)
        this.isConnected = false
        this.stopPing()
        
        // 只有非主动断开才重连
        if (res.code !== 1000) {
          this.handleConnectionFailure()
        }
      })

      // 临时解决 Promise 问题，实际应该在 CONNACK 中 resolve
      // 这里设置一个超时
      setTimeout(() => {
        if (this.isConnected) resolve()
        // else reject(new Error('Connection Timeout')) 
        // 不 reject，让重连机制处理
      }, 2000)
    })
  }

  private handlePacket(data: ArrayBuffer) {
    const buffer = new Uint8Array(data)
    if (buffer.length < 2) return

    const firstByte = buffer[0]
    const packetType = firstByte >> 4
    // const flags = firstByte & 0x0F

    try {
      const { length: remainingLength, bytesUsed: lengthBytesCount } = this.decodeRemainingLength(buffer, 1)
      const variableHeaderStart = 1 + lengthBytesCount
      
      switch (packetType) {
        case MQTT_PACKET_TYPE.CONNACK:
          this.handleConnAck(buffer, variableHeaderStart)
          break
        case MQTT_PACKET_TYPE.PUBLISH:
          this.handlePublish(buffer, firstByte, variableHeaderStart, remainingLength)
          break
        case MQTT_PACKET_TYPE.PINGRESP:
          console.log('[MQTT Weapp] PINGRESP')
          break
        case MQTT_PACKET_TYPE.SUBACK:
          console.log('[MQTT Weapp] SUBACK')
          break
        case MQTT_PACKET_TYPE.PUBACK:
          console.log('[MQTT Weapp] PUBACK')
          break
        default:
          console.log(`[MQTT Weapp] Ignored packet type: ${packetType}`)
      }
    } catch (e) {
      console.error('[MQTT Weapp] Packet parse error', e)
    }
  }

  private handleConnAck(buffer: Uint8Array, start: number) {
    // Variable Header (2 bytes)
    // Byte 1: Connect Acknowledge Flags
    // Byte 2: Connect Return code
    const returnCode = buffer[start + 1]
    
    if (returnCode === 0) {
      console.log('[MQTT Weapp] Connected (CONNACK)')
      this.isConnected = true
      this.reconnectAttempts = 0
      this.startPing()
      if (this.onConnect) this.onConnect()
    } else {
      console.error(`[MQTT Weapp] Connection refused: ${returnCode}`)
      this.disconnect()
      if (this.onError) this.onError(new Error(`Connection refused: ${returnCode}`))
    }
  }

  private handlePublish(buffer: Uint8Array, firstByte: number, start: number, remainingLength: number) {
    let offset = start
    const qos = (firstByte >> 1) & 0x03
    
    // Topic Name
    const { value: topic, bytesUsed } = this.decodeString(buffer, offset)
    offset += bytesUsed
    
    let packetId = 0
    if (qos > 0) {
      packetId = (buffer[offset] << 8) | buffer[offset + 1]
      offset += 2
    }

    // Payload
    // Remaining Length 包含了 Variable Header + Payload
    // Variable Header 长度 = (offset - start)
    const payloadLength = remainingLength - (offset - start)
    const payload = buffer.slice(offset, offset + payloadLength)

    console.log(`[MQTT Weapp] Received PUBLISH: ${topic} (${payload.length} bytes)`)

    if (this.onMessage) {
      this.onMessage(topic, payload)
    }

    // Send PUBACK if QoS 1
    if (qos === 1) {
      this.sendPacket(this.buildPubAckPacket(packetId))
    }
  }

  private sendPacket(buffer: ArrayBuffer) {
    if (this.socketTask && this.socketTask.readyState === 1) { // OPEN
      this.socketTask.send({
        data: buffer,
        fail: (err) => console.error('[MQTT Weapp] Send failed', err)
      })
    } else {
      console.warn('[MQTT Weapp] Socket not open, cannot send')
    }
  }

  // ==========================================
  // 功能方法
  // ==========================================

  public subscribe(topic: string, qos: number = 0): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        console.warn('[MQTT Weapp] Cannot subscribe, not connected')
        return
      }
      console.log(`[MQTT Weapp] Subscribing to ${topic}`)
      this.sendPacket(this.buildSubscribePacket(topic, qos))
      // 简化处理，直接 resolve，实际应等待 SUBACK
      resolve()
    })
  }

  public publish(topic: string, message: Uint8Array | string, qos: number = 0, retain: boolean = false): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        console.warn('[MQTT Weapp] Cannot publish, not connected')
        return
      }
      
      let payload: Uint8Array
      if (typeof message === 'string') {
        const encoder = new TextEncoder() // 需要确保环境支持或使用 polyfill
        payload = encoder.encode(message)
      } else {
        payload = message
      }

      this.sendPacket(this.buildPublishPacket(topic, payload, qos))
      resolve()
    })
  }

  public unsubscribe(topic: string) {
    // TODO: Implement UNSUBSCRIBE
    console.log(`[MQTT Weapp] Unsubscribe not fully implemented for ${topic}`)
  }

  public disconnect() {
    this.stopPing()
    this.isConnected = false
    if (this.socketTask) {
      this.sendPacket(this.buildDisconnectPacket())
      this.socketTask.close({})
      this.socketTask = null
    }
  }

  // ==========================================
  // 维护逻辑
  // ==========================================

  private startPing() {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendPacket(this.buildPingReqPacket())
      }
    }, (this.config.keepalive || 60) * 1000)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private handleConnectionFailure() {
    if (this.reconnectTimer) return
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      console.log(`[MQTT Weapp] Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`)
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect().catch(() => {}) // Catch to prevent unhandled promise rejection
      }, delay)
    } else {
      console.error('[MQTT Weapp] Max reconnect attempts reached')
    }
  }
}

/**
 * 创建小程序 MQTT 客户端实例
 */
export function createMQTTClientWeapp(config?: Partial<MQTTConfig>): MQTTClientWeapp {
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

  return new MQTTClientWeapp(finalConfig)
}
