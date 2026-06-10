/**
 * 数据编码/解码工具
 * 用于将配置数据编码为64字节二进制数据，或从二进制数据解码为配置对象
 */

export interface DeviceConfig {
  // 基本信息
  companyCode: string      // 8字节 ASCII
  model: string           // 4字节 ASCII
  deviceID: string        // 6字节 ASCII

  // 工作方式
  workWay: number         // 2字节 UInt16: 0:无效, 1:每日, 2:每月, 3:每年, 4:每周

  // 时间组 (4组)
  time1: { yearWeek: string; monDay: string; hrMin: string }  // 各2字节 BCD/Hex
  time2: { yearWeek: string; monDay: string; hrMin: string }
  time3: { yearWeek: string; monDay: string; hrMin: string }
  time4: { yearWeek: string; monDay: string; hrMin: string }

  // 控制模式
  controlMode: number      // 2字节 UInt16: 0:无效, 1:Auto, 2:Stop, 3:Reset, 4:Loop, 5:Manual
  enableMode: number       // 2字节 UInt16: 0:无效, 1:检+左+单, 2:检+左+双, 3:检+右+单, 4:检+右+双

  // 检测参数
  edgeDelay: number        // 2字节 UInt16: 到边检测延时 (0~1000ms)
  bridgeTime: number       // 2字节 UInt16: 垮桥检测时间 (1=1ms, 如 6000=6s)
  errorReturnTime: number  // 2字节 UInt16: 纠错校正长度控制设置 (单位: 0.01m, 如 1000=10.00m)

  // 速度参数
  walkSpeed: number        // 2字节 UInt16: 行走速度 (800=80.0%)
  brushSpeed: number       // 2字节 UInt16: 滚刷速度 (1000=100.0%)
  bridgeSpeed: number      // 2字节 UInt16: 垮桥速度 (800=80.0%)

  // 其他
  heartbeatSet: number     // 2字节 UInt16: 心跳脉冲设置 (100=1.00s)
  reserved: number         // 2字节 UInt16: 备用 (0)
}

export interface DeviceStatus {
  // 基本信息
  companyCode: string
  model: string
  deviceID: string

  // 状态信息
  curWorkWay: number
  task: { yearWeek: string; monDay: string; hrMin: string }
  runTimeSingle: number    // 单次运行时长 (x 0.01s)
  runTimeTotal: number     // 总运行时长 (秒)
  distSingle: number       // 单次运行里程 (x 0.001km)
  distTotal: number        // 总运行里程 (km)
  gpsLon: number           // GPS经度 (x 0.00001)
  gpsLat: number           // GPS纬度 (x 0.00001)
  modeStatus: number        // 当前运行控制模式
  enableStatus: number      // 当前使能状态
  batteryLevel: number      // 电池电量 (x 0.1%)
  curWalkSpeed: number      // 当前行走速度 (x 0.1%)
  curBrushSpeed: number     // 当前滚刷速度 (x 0.1%)
  curBridgeSpeed: number    // 当前垮桥速度 (x 0.1%)
  heartbeatStat: number     // 心跳脉冲状态 (x 0.01s)
}

/**
 * 验证配置数据有效性
 */
function validateConfig(config: DeviceConfig): void {
  if (!config) throw new Error('配置对象不能为空')

  // 验证字符串长度
  if (config.companyCode.length > 8) console.warn('CompanyCode 超过8字节，将被截断')
  if (config.model.length > 4) console.warn('Model 超过4字节，将被截断')
  if (config.deviceID.length > 6) console.warn('DeviceID 超过6字节，将被截断')

  // 验证数值范围 (UInt16: 0-65535)
  const uint16Fields = [
    'workWay', 'controlMode', 'enableMode', 'edgeDelay', 'bridgeTime',
    'errorReturnTime', 'walkSpeed', 'brushSpeed', 'bridgeSpeed', 'heartbeatSet', 'reserved'
  ]

  for (const field of uint16Fields) {
    const value = (config as any)[field]
    if (typeof value !== 'number' || value < 0 || value > 65535) {
      throw new Error(`字段 ${field} 值无效: ${value} (应为 0-65535)`)
    }
  }

  // 验证BCD时间格式 (简单验证长度)
  const timeGroups = [config.time1, config.time2, config.time3, config.time4]
  timeGroups.forEach((time, index) => {
    if (time.yearWeek.length !== 4 || time.monDay.length !== 4 || time.hrMin.length !== 4) {
      throw new Error(`时间组 ${index + 1} 格式错误 (应为4位字符串)`)
    }
  })
}

/**
 * 将字符串转换为ASCII字节数组
 */
function stringToBytes(str: string, length: number): number[] {
  const bytes: number[] = []
  for (let i = 0; i < length; i++) {
    if (i < str.length) {
      bytes.push(str.charCodeAt(i))
    } else {
      bytes.push(0) // 填充0
    }
  }
  return bytes
}

/**
 * 将BCD/Hex字符串转换为字节
 * 例如: "0725" -> [0x07, 0x25]
 */
function bcdStringToBytes(str: string): number[] {
  if (str.length !== 4) {
    // 容错处理：如果长度不对，尝试补0或截断
    if (str.length < 4) str = str.padStart(4, '0')
    else str = str.substring(0, 4)
  }

  try {
    const high = parseInt(str.substring(0, 2), 16)
    const low = parseInt(str.substring(2, 4), 16)

    if (isNaN(high) || isNaN(low)) throw new Error('非十六进制字符')

    return [high, low]
  } catch (e) {
    console.error(`BCD转换失败: ${str}`, e)
    return [0, 0] // 出错返回默认值
  }
}

/**
 * 将UInt16转换为2字节数组 (大端序)
 */
function uint16ToBytes(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff]
}

/**
 * 将UInt32转换为4字节数组 (大端序)
 */
function uint32ToBytes(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  ]
}

/**
 * 从字节数组读取ASCII字符串
 */
function bytesToString(bytes: number[], start: number, length: number): string {
  let str = ''
  for (let i = 0; i < length; i++) {
    const byte = bytes[start + i]
    if (byte === 0) break
    str += String.fromCharCode(byte)
  }
  return str
}

/**
 * 从字节数组读取BCD/Hex字符串
 */
function bytesToBcdString(bytes: number[], start: number): string {
  try {
    const high = bytes[start].toString(16).padStart(2, '0')
    const low = bytes[start + 1].toString(16).padStart(2, '0')
    return (high + low).toUpperCase()
  } catch (e) {
    return '0000'
  }
}

/**
 * 从字节数组读取UInt16 (大端序)
 */
function bytesToUInt16(bytes: number[], start: number): number {
  return (bytes[start] << 8) | bytes[start + 1]
}

/**
 * 从字节数组读取UInt32 (大端序)
 */
function bytesToUInt32(bytes: number[], start: number): number {
  return (bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]
}

/**
 * 将配置对象编码为64字节二进制数据
 */
export function encodeConfig(config: DeviceConfig): Uint8Array {
  // 验证配置
  validateConfig(config)

  const buffer = new Uint8Array(64)
  let offset = 0

  try {
    // 1. CompanyCode (1-8, 8字节)
    const companyCodeBytes = stringToBytes(config.companyCode, 8)
    buffer.set(companyCodeBytes, offset)
    offset += 8

    // 2. Model (9-12, 4字节)
    const modelBytes = stringToBytes(config.model, 4)
    buffer.set(modelBytes, offset)
    offset += 4

    // 3. DeviceID (13-18, 6字节)
    const deviceIDBytes = stringToBytes(config.deviceID, 6)
    buffer.set(deviceIDBytes, offset)
    offset += 6

    // 4. WorkWay (19-20, 2字节)
    const workWayBytes = uint16ToBytes(config.workWay)
    buffer.set(workWayBytes, offset)
    offset += 2

    // 5-16. 时间组 (21-44, 24字节)
    const timeGroups = [config.time1, config.time2, config.time3, config.time4]
    for (const time of timeGroups) {
      const yearWeekBytes = bcdStringToBytes(time.yearWeek)
      buffer.set(yearWeekBytes, offset)
      offset += 2

      const monDayBytes = bcdStringToBytes(time.monDay)
      buffer.set(monDayBytes, offset)
      offset += 2

      const hrMinBytes = bcdStringToBytes(time.hrMin)
      buffer.set(hrMinBytes, offset)
      offset += 2
    }

    // 17. ControlMode (45-46, 2字节)
    const controlModeBytes = uint16ToBytes(config.controlMode)
    buffer.set(controlModeBytes, offset)
    offset += 2

    // 18. EnableMode (47-48, 2字节)
    const enableModeBytes = uint16ToBytes(config.enableMode)
    buffer.set(enableModeBytes, offset)
    offset += 2

    // 19. EdgeDelay (49-50, 2字节)
    const edgeDelayBytes = uint16ToBytes(config.edgeDelay)
    buffer.set(edgeDelayBytes, offset)
    offset += 2

    // 20. BridgeTime (51-52, 2字节)
    const bridgeTimeBytes = uint16ToBytes(config.bridgeTime)
    buffer.set(bridgeTimeBytes, offset)
    offset += 2

    // 21. ErrorReturnTime (53-54, 2字节)
    const errorReturnTimeBytes = uint16ToBytes(config.errorReturnTime)
    buffer.set(errorReturnTimeBytes, offset)
    offset += 2

    // 22. WalkSpeed (55-56, 2字节)
    const walkSpeedBytes = uint16ToBytes(config.walkSpeed)
    buffer.set(walkSpeedBytes, offset)
    offset += 2

    // 23. BrushSpeed (57-58, 2字节)
    const brushSpeedBytes = uint16ToBytes(config.brushSpeed)
    buffer.set(brushSpeedBytes, offset)
    offset += 2

    // 24. BridgeSpeed (59-60, 2字节)
    const bridgeSpeedBytes = uint16ToBytes(config.bridgeSpeed)
    buffer.set(bridgeSpeedBytes, offset)
    offset += 2

    // 25. HeartbeatSet (61-62, 2字节)
    const heartbeatSetBytes = uint16ToBytes(config.heartbeatSet)
    buffer.set(heartbeatSetBytes, offset)
    offset += 2

    // 26. Reserved (63-64, 2字节)
    const reservedBytes = uint16ToBytes(config.reserved)
    buffer.set(reservedBytes, offset)

    return buffer
  } catch (error) {
    console.error('配置编码失败:', error)
    throw new Error(`配置编码失败: ${(error as Error).message}`)
  }
}

/**
 * 将64字节二进制数据解码为配置对象
 */
export function decodeConfig(buffer: Uint8Array): DeviceConfig {
  if (!buffer || buffer.length !== 64) {
    throw new Error(`缓冲区长度无效: 期望64字节，实际为${buffer ? buffer.length : 0}字节`)
  }

  try {
    const bytes = Array.from(buffer)
    let pos = 0

    const companyCode = bytesToString(bytes, pos, 8)
    pos += 8

    const model = bytesToString(bytes, pos, 4)
    pos += 4

    const deviceID = bytesToString(bytes, pos, 6)
    pos += 6

    const workWay = bytesToUInt16(bytes, pos)
    pos += 2

    const time1 = {
      yearWeek: bytesToBcdString(bytes, pos),
      monDay: bytesToBcdString(bytes, pos + 2),
      hrMin: bytesToBcdString(bytes, pos + 4),
    }
    pos += 6

    const time2 = {
      yearWeek: bytesToBcdString(bytes, pos),
      monDay: bytesToBcdString(bytes, pos + 2),
      hrMin: bytesToBcdString(bytes, pos + 4),
    }
    pos += 6

    const time3 = {
      yearWeek: bytesToBcdString(bytes, pos),
      monDay: bytesToBcdString(bytes, pos + 2),
      hrMin: bytesToBcdString(bytes, pos + 4),
    }
    pos += 6

    const time4 = {
      yearWeek: bytesToBcdString(bytes, pos),
      monDay: bytesToBcdString(bytes, pos + 2),
      hrMin: bytesToBcdString(bytes, pos + 4),
    }
    pos += 6

    const controlMode = bytesToUInt16(bytes, pos)
    pos += 2

    const enableMode = bytesToUInt16(bytes, pos)
    pos += 2

    const edgeDelay = bytesToUInt16(bytes, pos)
    pos += 2

    const bridgeTime = bytesToUInt16(bytes, pos)
    pos += 2

    const errorReturnTime = bytesToUInt16(bytes, pos)
    pos += 2

    const walkSpeed = bytesToUInt16(bytes, pos)
    pos += 2

    const brushSpeed = bytesToUInt16(bytes, pos)
    pos += 2

    const bridgeSpeed = bytesToUInt16(bytes, pos)
    pos += 2

    const heartbeatSet = bytesToUInt16(bytes, pos)
    pos += 2

    const reserved = bytesToUInt16(bytes, pos)

    return {
      companyCode,
      model,
      deviceID,
      workWay,
      time1,
      time2,
      time3,
      time4,
      controlMode,
      enableMode,
      edgeDelay,
      bridgeTime,
      errorReturnTime,
      walkSpeed,
      brushSpeed,
      bridgeSpeed,
      heartbeatSet,
      reserved,
    }
  } catch (error) {
    console.error('配置解码失败:', error)
    throw new Error(`配置解码失败: ${(error as Error).message}`)
  }
}

/**
 * 将64字节二进制数据解码为状态对象
 */
export function decodeStatus(buffer: Uint8Array): DeviceStatus {
  if (!buffer || buffer.length !== 64) {
    throw new Error(`缓冲区长度无效: 期望64字节，实际为${buffer ? buffer.length : 0}字节`)
  }

  try {
    const bytes = Array.from(buffer)
    let pos = 0

    const companyCode = bytesToString(bytes, pos, 8)
    pos += 8

    const model = bytesToString(bytes, pos, 4)
    pos += 4

    const deviceID = bytesToString(bytes, pos, 6)
    pos += 6

    const curWorkWay = bytesToUInt16(bytes, pos)
    pos += 2

    const task = {
      yearWeek: bytesToBcdString(bytes, pos),
      monDay: bytesToBcdString(bytes, pos + 2),
      hrMin: bytesToBcdString(bytes, pos + 4),
    }
    pos += 6

    const runTimeSingle = bytesToUInt16(bytes, pos)
    pos += 2

    const runTimeTotal = bytesToUInt32(bytes, pos)
    pos += 4

    const distSingle = bytesToUInt16(bytes, pos)
    pos += 2

    const distTotal = bytesToUInt32(bytes, pos)
    pos += 4

    const gpsLon = bytesToUInt32(bytes, pos)
    pos += 4

    const gpsLat = bytesToUInt32(bytes, pos)
    pos += 4

    const modeStatus = bytesToUInt16(bytes, pos)
    pos += 2

    const enableStatus = bytesToUInt16(bytes, pos)
    pos += 2

    const batteryLevel = bytesToUInt16(bytes, pos)
    pos += 2

    // Reserved1 (53-54)
    pos += 2

    const curWalkSpeed = bytesToUInt16(bytes, pos)
    pos += 2

    const curBrushSpeed = bytesToUInt16(bytes, pos)
    pos += 2

    const curBridgeSpeed = bytesToUInt16(bytes, pos)
    pos += 2

    const heartbeatStat = bytesToUInt16(bytes, pos)

    return {
      companyCode,
      model,
      deviceID,
      curWorkWay,
      task,
      runTimeSingle,
      runTimeTotal,
      distSingle,
      distTotal,
      gpsLon,
      gpsLat,
      modeStatus,
      enableStatus,
      batteryLevel,
      curWalkSpeed,
      curBrushSpeed,
      curBridgeSpeed,
      heartbeatStat,
    }
  } catch (error) {
    console.error('状态解码失败:', error)
    throw new Error(`状态解码失败: ${(error as Error).message}`)
  }
}

/**
 * 将二进制数据转换为十六进制字符串
 */
export function bufferToHex(buffer: Uint8Array): string {
  if (!buffer) return ''
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

/**
 * 将十六进制字符串转换为二进制数据
 */
export function hexToBuffer(hex: string): Uint8Array {
  if (!hex) return new Uint8Array(0)
  const cleanHex = hex.replace(/\s+/g, '')
  const bytes = []
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substring(i, i + 2), 16))
  }
  return new Uint8Array(bytes)
}
