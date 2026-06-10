/**
 * MQTT 配置常量
 */
export const MQTT_CONFIG = {
  // 服务器地址
  host: '218.2.130.246',
  // WebSocket 端口
  port: 8083,
  // 协议
  protocol: 'ws' as 'ws' | 'wss',
  // 用户名
  username: 'admin',
  // 密码
  password: 'njzt888',
}

/**
 * MQTT 主题配置
 * 根据交互数据.txt中的定义：
 * - Downlink: RAILCAR/R/-PD1250001 (服务器向小车发送设置控制数据)
 * - Uplink: RAILCAR/S/GG01250001 (小车向服务器发送状态数据)
 */
export const MQTT_TOPICS = {
  // 设备设置控制主题 (服务器向小车发送)
  // 格式: RAILCAR/R/-PD{deviceID} 或 RAILCAR/ID/SET
  deviceSet: (deviceID: string) => `RAILCAR/R/-PD${deviceID}`,
  // 设备状态主题 (小车向服务器发送)
  // 格式: RAILCAR/S/GG0{deviceID} 或 RAILCAR/ID/STATUS
  deviceStatus: (deviceID: string) => `RAILCAR/S/GG0${deviceID}`,

  // 兼容旧的主题格式
  deviceControl: (productId: string) => `robot/${productId}/control`,
  deviceCommand: (productId: string) => `robot/${productId}/command`,
  deviceData: (productId: string) => `robot/${productId}/data`,
}

/**
 * MQTT 消息类型
 */
export enum MQTTMessageType {
  STATUS = 'status',        // 状态消息
  CONTROL = 'control',      // 控制消息
  COMMAND = 'command',      // 命令消息
  DATA = 'data',            // 数据消息
}


/**
 * MQTT 连接状态枚举
 */
export enum MQTTConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * 重连策略配置
 */
export const MQTT_RECONNECT_CONFIG = {
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2
}

/**
 * 消息队列配置
 */
export const MQTT_QUEUE_CONFIG = {
  maxSize: 100,
  retryAttempts: 3,
  retryDelay: 1000
}
