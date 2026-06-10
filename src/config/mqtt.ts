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
 * 新的主题格式：
 * - 发布主题: RAILCAR/R/-D01{deviceID} (小车型号+小车编号)
 * - 订阅主题: RAILCAR/S/-D01{deviceID} (小车型号+小车编号)
 */
export const MQTT_TOPICS = {
  // 设备设置控制主题 (服务器向小车发送)
  // 格式: RAILCAR/R/{model}{deviceID}
  deviceSet: (model: string, deviceID: string) => `RAILCAR/R/${model}${deviceID}`,
  // 设备状态主题 (小车向服务器发送)
  // 格式: RAILCAR/S/{model}{deviceID}
  deviceStatus: (model: string, deviceID: string) => `RAILCAR/S/${model}${deviceID}`,

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
