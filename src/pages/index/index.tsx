import React, { useState, useEffect, useRef } from 'react'
import { View, Button, Input, Text, Picker, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Battery, Back, Home, Settings, Send, Refresh, ChevronRight, Bell } from '../../components/Icons'
import RobotModel from '../../components/RobotModel'
import { deviceControlService, type DeviceConfig, type RailcarConfigRecord } from '../../services/deviceControlService'
import commandStatusService from '../../services/commandStatusService'
import { authService } from '../../services/authService'
import { devicePlanService, DevicePlan } from '../../services/devicePlanService'
import websocketService from '../../services/websocketService'
import vehicleService from '../../services/vehicleService'
import { APP_VERSION_INFO } from '../../config/version'
// 条件导入样式
if (process.env.TARO_ENV === 'rn') {
  require('./index.rn.scss')
} else {
  require('./index.scss')
}

// 配置选项
const runControlOptions = [
  { value: 0, label: '无效', short: '无效' },
  { value: 1, label: 'AUTO 启动', short: 'AUTO' },
  { value: 2, label: 'STOP 停止', short: 'STOP' },
  { value: 3, label: 'RESET 复位', short: 'RESET' },
  { value: 4, label: 'CONT 循环', short: 'CONT' },
  { value: 5, label: 'MAN 手动', short: 'MAN' },
]

const runEnableOptions = [
  { value: 0, label: '无效' },
  { value: 1, label: '左侧开始-单趟运行' },
  { value: 2, label: '左侧开始-双趟运行' },
  { value: 3, label: '右侧开始-单趟运行' },
  { value: 4, label: '右侧开始-双趟运行' },
]

// D12 接驳车工作方式选项
const d12WorkWayOptions = [
  { value: 0, label: '无效' },
  { value: 1, label: '接左' },
  { value: 2, label: '接右' },
  { value: 3, label: '接左右' },
]

const productTypeOptions = [
  { value: '-D01', label: 'D01 干挂基本型' },
  { value: '-D11', label: 'D11 干挂带扭' },
  { value: '-D21', label: 'D21 干挂带跨' },
  { value: '-D12', label: 'D12 干挂接驳车' },
  { value: '-T01', label: 'T01 履带基本型' },
  { value: '-T11', label: 'T11 履带无人值守' },
  { value: '-T21', label: 'T21 履带操控看守' },
  { value: '-T12', label: 'T12 履带充电仓' },
]

const productTypeLabelMap: Record<string, string> = {
  '-D01': '干挂式',
  '-D11': '干挂带扭',
  '-D21': '干挂带跨',
  '-D12': '干挂接驳车',
  '-T01': '履带式',
  '-T11': '履带无人值守',
  '-T21': '履带操控看守',
  '-T12': '履带充电仓',
}

interface Robot {
  id: number
  companyCode: string | null
  productType: string | null
  productId: string | null
  status: string | null
  battery: number | null
  online: boolean | null
  onlineState?: string | null
  missionState?: string | null
  controlState?: string | null
  healthState?: string | null
  faultState?: string | null
  updatedAt?: number | null
  runControl: number | null
  runEnable: number | null
  workMode: number | null
  walkSpeed: number | null
  brushSpeed: number | null
  bridgeSpeed: number | null
  runTimeSingle: number | null    // 单次运行时长 (秒)
  runTimeTotal: number | null     // 总运行时长 (秒)
  mileageSingle: number | null    // 单次运行里程 (km)
  mileageTotal: number | null     // 总运行里程 (km)
  heartbeat: number | null
  // T 型状态上报字段
  voltage?: number | null
  angle?: number | null
  tracking?: boolean | null
  pathPlanning?: string | null
  leftEdge?: number | null
  rightEdge?: number | null
  moveJudge?: boolean | null
  detectQrcode?: boolean | null
  enterGarage?: boolean | null
  mqttMessageType?: string | null
  lastCommandId?: string | null
  lastCommandStatus?: string | null
  longitude?: number | null
  latitude?: number | null
  // D12 接驳车特有字段
  boundDeviceIds?: string[] | null
  boundDeviceCount?: number | null
  leftRowStart?: number | null
  leftRowEnd?: number | null
  rightRowStart?: number | null
  rightRowEnd?: number | null
  walkFastSpeed?: number | null
  walkSlowSpeed?: number | null
  currentRowPosition?: number | null
  waitStopRowPosition?: number | null
  batteryLowLimit?: number | null
  robotInPositionTime?: number | null
  limitPositionCheckTime?: number | null
  walkPositionCheckTime?: number | null
  d12WorkWay?: number | null
  supportedActions?: string[] | null
  supportedParams?: string[] | null
  supportedStatusFields?: string[] | null
  shadowDetail?: Record<string, any> | null
}

interface Settings {
  companyCode: string
  productType: string
  productId: string
  infoCommandType: number
  bindStatus: number
  bindDeviceId: string
  bindDeviceIds: string[]
  workMode: number
  runControl: number
  runEnable: number
  timeGroup1: { weekYear: string; monthDay: string; hourMin: string }
  timeGroup2: { weekYear: string; monthDay: string; hourMin: string }
  timeGroup3: { weekYear: string; monthDay: string; hourMin: string }
  timeGroup4: { weekYear: string; monthDay: string; hourMin: string }
  edgeDetectDelay: number
  bridgeDetectTime: number
  errorReturnTime: number
  walkSpeed: number
  brushSpeed: number
  bridgeSpeed: number
  heartbeat: number
  reserved: number
  reserved2: number
  maxRowCount?: number
  faultCode?: number
  currentRowPosition?: number
  // D12 接驳车特有字段
  leftRowStart?: number
  leftRowEnd?: number
  rightRowStart?: number
  rightRowEnd?: number
  walkFastSpeed?: number
  walkSlowSpeed?: number
  waitStopRowPosition?: number
  batteryLowLimit?: number
  robotInPositionTime?: number
  limitPositionCheckTime?: number
  walkPositionCheckTime?: number
}

// 二维码数据结构（18字节）
interface QRCodeData {
  companyCode: string  // 8字节：公司代号
  productType: string  // 4字节：产品型号
  productId: string    // 6字节：产品编号（作为deviceID）
}

export default function Index() {
  const [currentPage, setCurrentPage] = useState<'scan' | 'home' | 'detail' | 'settings' | 'stats' | 'profile'>('home')
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null)
  const [selectedDeviceFamily, setSelectedDeviceFamily] = useState<'D' | 'T' | null>(null)
  const [toast, setToast] = useState({ show: false, message: '' })
  const [isSending, setIsSending] = useState(false)
  const [isBindingUpdating, setIsBindingUpdating] = useState(false)
  const [pendingD01Binding, setPendingD01Binding] = useState<string>('')
  const [isOpeningConsole, setIsOpeningConsole] = useState(false)
  const isOpeningConsoleRef = useRef(false)
  const isConsolePagePreheatedRef = useRef(false)
  const consolePagePreheatPromiseRef = useRef<Promise<any> | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [, setLoading] = useState(true)
  const [scannedDevice, setScannedDevice] = useState<QRCodeData | null>(null)
  const [settingsTab, setSettingsTab] = useState<'basic' | 'range' | 'detect' | 'time'>('basic')
  const [isConfigLoading, setIsConfigLoading] = useState(false)

  // 计划任务状态
  const [plans, setPlans] = useState<DevicePlan[]>([])
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Partial<DevicePlan>>({})
  const [isPlanSaving, setIsPlanSaving] = useState(false)
  const [planRepeatTab, setPlanRepeatTab] = useState<'once' | 'repeat'>('repeat')
  const [, setIsEditingSettings] = useState(false) // 标记是否正在编辑设置
  const [searchKeyword, setSearchKeyword] = useState<string>('') // 搜索关键词
  const [showHelpModal, setShowHelpModal] = useState(false) // 帮助中心模态框
  const [showAboutModal, setShowAboutModal] = useState(false) // 关于我们模态框
  const [alarmSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')
  const [alarmStatusFilter, setAlarmStatusFilter] = useState<'all' | 'unhandled' | 'handled' | 'ignored'>('all')
  const isInputFocusedRef = useRef(false) // 使用 ref 存储焦点状态，避免闭包问题
  // 使用 ref 存储当前页面，以便在 MQTT 回调中获取最新值
  const currentPageRef = useRef<'scan' | 'home' | 'detail' | 'settings' | 'stats' | 'profile'>('home')
  const [robots, setRobots] = useState<Robot[]>([])
  const commandPollingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({})

  const isTerminalCommandStatus = (status?: string | null) => {
    return ['SUCCEEDED', 'FAILED', 'TIMEOUT', 'REJECTED'].includes((status || '').toUpperCase())
  }

  const getCommandStatusLabel = (status?: string | null) => {
    switch ((status || '').toUpperCase()) {
      case 'CREATED':
        return '已创建'
      case 'DISPATCHED':
        return '已下发'
      case 'ACCEPTED':
        return '已接收'
      case 'RUNNING':
        return '执行中'
      case 'SUCCEEDED':
        return '已完成'
      case 'FAILED':
        return '执行失败'
      case 'TIMEOUT':
        return '已超时'
      case 'REJECTED':
        return '已拒绝'
      default:
        return status || '未知'
    }
  }

  const hasAnySupportedAction = (robot: Robot | null | undefined, actions: string[]) => {
    const supportedActions = robot?.supportedActions
    if (!supportedActions || supportedActions.length === 0) {
      return true
    }
    return actions.some(action => supportedActions.includes(action))
  }

  const normalizeSupportedStatusField = (field: string) =>
    field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase()

  const hasAnySupportedStatusField = (robot: Robot | null | undefined, fields: string[]) => {
    const supportedFields = robot?.supportedStatusFields
    if (!supportedFields || supportedFields.length === 0) {
      return true
    }
    const normalizedSupported = supportedFields.map(normalizeSupportedStatusField)
    return fields.some(field => normalizedSupported.includes(normalizeSupportedStatusField(field)))
  }

  const normalizeSupportedParamField = (field: string) =>
    field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase()

  const hasAnySupportedParam = (robot: Robot | null | undefined, fields: string[]) => {
    const supportedParams = robot?.supportedParams
    if (!supportedParams || supportedParams.length === 0) {
      return true
    }
    const normalizedSupported = supportedParams.map(normalizeSupportedParamField)
    return fields.some(field => normalizedSupported.includes(normalizeSupportedParamField(field)))
  }

  const CONFIG_CAPABILITY_FIELD_ALIASES: Partial<Record<keyof DeviceConfig, string[]>> = {
    bindStatus: ['bindDeviceIds'],
    bindDeviceId: ['bindDeviceIds'],
    bindDeviceIds: ['bindDeviceIds'],
    workWay: ['workWay'],
    time1: ['time1'],
    time2: ['time2'],
    time3: ['time3'],
    time4: ['time4'],
    controlMode: ['controlMode'],
    enableMode: ['enableMode'],
    edgeDelay: ['edgeDelay'],
    bridgeTime: ['bridgeTime'],
    errorReturnTime: ['errorReturnTime'],
    walkSpeed: ['walkSpeed', 'speed'],
    brushSpeed: ['brushSpeed', 'brush_speed'],
    bridgeSpeed: ['bridgeSpeed', 'bridge_speed'],
    heartbeatSet: ['heartbeat'],
    batteryLowLimit: ['batteryLowLimit'],
    robotInPositionTime: ['robotInPositionTime'],
    limitPositionCheckTime: ['limitPositionCheckTime'],
    walkPositionCheckTime: ['walkPositionCheckTime'],
    walkFastSpeed: ['walkFastSpeed'],
    walkSlowSpeed: ['walkSlowSpeed'],
    maxRowCount: ['maxRowCount'],
    faultCode: ['faultCode', 'fault_code'],
    currentRowPosition: ['currentRowPosition', 'current_row_position'],
  }

  const filterDeviceConfigByCapabilities = (robot: Robot | null | undefined, config: DeviceConfig): DeviceConfig => {
    const supportedParams = robot?.supportedParams
    if (!supportedParams || supportedParams.length === 0) {
      return config
    }

    const normalizedSupported = new Set(supportedParams.map(normalizeSupportedParamField))
    const alwaysIncludedKeys = new Set<keyof DeviceConfig>([
      'deviceId',
      'companyCode',
      'model',
      'infoCommandType',
      'quickAction',
      'clientClickTimestamp',
      'params',
    ])

    const filteredEntries = Object.entries(config).filter(([rawKey, value]) => {
      if (value === undefined) {
        return false
      }

      const key = rawKey as keyof DeviceConfig
      if (alwaysIncludedKeys.has(key)) {
        return true
      }

      const aliases = CONFIG_CAPABILITY_FIELD_ALIASES[key]
      if (!aliases || aliases.length === 0) {
        return false
      }

      return aliases.some(field => normalizedSupported.has(normalizeSupportedParamField(field)))
    })

    return Object.fromEntries(filteredEntries) as DeviceConfig
  }

  const applyCommandStatusToRobot = (deviceId: string, commandId?: string | null, commandStatus?: string | null) => {
    setRobots(prev =>
      prev.map(robot => {
        const serial = `${robot.productType || ''}${robot.productId || ''}`
        if (serial !== deviceId) {
          return robot
        }
        return {
          ...robot,
          lastCommandId: commandId ?? robot.lastCommandId ?? null,
          lastCommandStatus: commandStatus ?? robot.lastCommandStatus ?? null,
        }
      })
    )

    setSelectedRobot(prev => {
      if (!prev) return prev
      const serial = `${prev.productType || ''}${prev.productId || ''}`
      if (serial !== deviceId) {
        return prev
      }
      return {
        ...prev,
        lastCommandId: commandId ?? prev.lastCommandId ?? null,
        lastCommandStatus: commandStatus ?? prev.lastCommandStatus ?? null,
      }
    })
  }

  const clearCommandStatusPolling = (deviceId?: string) => {
    if (deviceId) {
      const timer = commandPollingTimersRef.current[deviceId]
      if (timer) {
        clearTimeout(timer)
        delete commandPollingTimersRef.current[deviceId]
      }
      return
    }

    Object.values(commandPollingTimersRef.current).forEach(timer => {
      if (timer) clearTimeout(timer)
    })
    commandPollingTimersRef.current = {}
  }

  const pollCommandStatus = async (deviceId: string, commandId?: string, attempt: number = 0): Promise<void> => {
    try {
      const snapshot = commandId
        ? await commandStatusService.getCommandStatus(commandId)
        : await commandStatusService.getLatestCommandStatusByDevice(deviceId)

      const resolvedCommandId = snapshot.commandId || commandId
      const resolvedStatus = snapshot.status
      if (resolvedCommandId || resolvedStatus) {
        applyCommandStatusToRobot(deviceId, resolvedCommandId, resolvedStatus)
      }

      if (isTerminalCommandStatus(resolvedStatus) || attempt >= 7) {
        clearCommandStatusPolling(deviceId)
        return
      }

      commandPollingTimersRef.current[deviceId] = setTimeout(() => {
        void pollCommandStatus(deviceId, resolvedCommandId || commandId, attempt + 1)
      }, 2000)
    } catch (error) {
      console.error('[Index Page] 查询命令状态失败:', { deviceId, commandId, attempt, error })
      if (attempt >= 7) {
        clearCommandStatusPolling(deviceId)
        return
      }
      commandPollingTimersRef.current[deviceId] = setTimeout(() => {
        void pollCommandStatus(deviceId, commandId, attempt + 1)
      }, 2000)
    }
  }

  const startCommandStatusPolling = (deviceId: string, commandId?: string, commandStatus?: string | null) => {
    applyCommandStatusToRobot(deviceId, commandId, commandStatus)
    clearCommandStatusPolling(deviceId)
    if (isTerminalCommandStatus(commandStatus)) {
      return
    }
    commandPollingTimersRef.current[deviceId] = setTimeout(() => {
      void pollCommandStatus(deviceId, commandId, 0)
    }, 1200)
  }

  // 获取计划列表
  const fetchPlans = async (deviceId: string) => {
    try {
      const p = await devicePlanService.getPlans(deviceId)
      setPlans(p)
    } catch (err) {
      console.error('Fetch plans error:', err)
    }
  }

  // 监听Tab或者选中的机器人，刷新计划列表
  useEffect(() => {
    if (settingsTab === 'time' && selectedRobot) {
      const deviceId = selectedRobot.productType + '' + selectedRobot.productId
      fetchPlans(deviceId)
    }
  }, [settingsTab, selectedRobot])

  const parseWorkTimeGroups = (workTimeGroups?: string) => {
    const emptyResult: Array<{ weekYear: string; monthDay: string; hourMin: string } | null> = [null, null, null, null]

    if (!workTimeGroups) return emptyResult

    try {
      const parsed = JSON.parse(workTimeGroups)
      if (!Array.isArray(parsed)) return emptyResult

      return emptyResult.map((_, index) => {
        const current = parsed[index]
        if (!current || typeof current !== 'object') {
          return null
        }
        return {
          weekYear: typeof current.yearWeek === 'string' ? current.yearWeek : '0000',
          monthDay: typeof current.monDay === 'string' ? current.monDay : '0000',
          hourMin: typeof current.hrMin === 'string' ? current.hrMin : '0000',
        }
      })
    } catch (error) {
      console.warn('[Index Page] 解析工作时间组失败，使用默认时间组:', error)
      return emptyResult
    }
  }

  const mergeConfigToSettings = (config: RailcarConfigRecord, productModel: string, productNumber: string) => {
    const [time1, time2, time3, time4] = parseWorkTimeGroups(config.workTimeGroups)

    setSettings(prev => {
      const next = {
        ...prev,
        companyCode: config.companyCode || prev.companyCode,
        productType: productModel,
        productId: productNumber,
        ...(config.workMode != null && { workMode: config.workMode }),
        ...(config.operationMode != null && { runControl: config.operationMode }),
        ...(config.operationEnable != null && { runEnable: config.operationEnable }),
        ...(config.edgeDetectionDelay != null && { edgeDetectDelay: config.edgeDetectionDelay }),
        ...(config.bridgeDetectionTime != null && { bridgeDetectTime: config.bridgeDetectionTime }),
        ...(config.errorReturnTime != null && { errorReturnTime: config.errorReturnTime }),
        ...(config.walkingSpeed != null && { walkSpeed: config.walkingSpeed }),
        ...(config.brushSpeed != null && { brushSpeed: config.brushSpeed }),
        ...(config.bridgeSpeed != null && { bridgeSpeed: config.bridgeSpeed }),
        ...(config.heartbeatPulse != null && { heartbeat: config.heartbeatPulse }),
        ...(config.backup != null && { reserved: config.backup }),
        ...(config.batteryLowLimit != null && { batteryLowLimit: config.batteryLowLimit }),
        // D12 接驳车专属参数
        ...(config.robotInPositionTime != null && { robotInPositionTime: config.robotInPositionTime }),
        ...(config.limitPositionCheckTime != null && { limitPositionCheckTime: config.limitPositionCheckTime }),
        ...(config.walkPositionCheckTime != null && { walkPositionCheckTime: config.walkPositionCheckTime }),
        ...(config.walkFastSpeed != null && { walkFastSpeed: config.walkFastSpeed }),
        ...(config.walkSlowSpeed != null && { walkSlowSpeed: config.walkSlowSpeed }),
        ...(config.maxRowCount != null && { maxRowCount: config.maxRowCount }),
      }

      if (time1) next.timeGroup1 = time1
      if (time2) next.timeGroup2 = time2
      if (time3) next.timeGroup3 = time3
      if (time4) next.timeGroup4 = time4
      return next
    })
  }

  const mapMissionStateToDisplayStatus = (missionState?: string | null): Robot['status'] | null => {
    switch ((missionState || '').toUpperCase()) {
      case 'RUNNING':
      case 'RETURNING':
      case 'DOCKING':
        return 'running'
      case 'CHARGING':
        return 'charging'
      case 'IDLE':
      case 'READY':
      case 'PAUSED':
      case 'COMPLETED':
        return 'idle'
      default:
        return null
    }
  }

  const resolveRealtimeDisplayStatus = (message: any, fallbackStatus?: string | null): Robot['status'] => {
    const byMission = mapMissionStateToDisplayStatus(message.missionState)
    if (byMission) return byMission
    if ((message.onlineState || '').toUpperCase() === 'OFFLINE') return 'offline'
    if (message.status) return mapStatus(message.status)
    if (fallbackStatus) return fallbackStatus
    return 'idle'
  }

  const mergeRealtimeRobotState = (robot: Robot, message: any): Robot => {
    const normalizedStatus = resolveRealtimeDisplayStatus(message, robot.status)
    const normalizedOnline = message.onlineState
      ? message.onlineState === 'ONLINE'
      : normalizedStatus !== 'offline'

    return {
      ...robot,
      battery: message.battery ?? robot.battery,
      status: normalizedStatus,
      online: normalizedOnline,
      onlineState: message.onlineState ?? robot.onlineState ?? null,
      missionState: message.missionState ?? robot.missionState ?? null,
      controlState: message.controlState ?? robot.controlState ?? null,
      healthState: message.healthState ?? robot.healthState ?? null,
      faultState: message.faultState ?? robot.faultState ?? null,
      updatedAt: message.updatedAt ?? message.timestamp ?? robot.updatedAt ?? null,
      supportedActions: message.supportedActions ?? robot.supportedActions ?? [],
      supportedParams: message.supportedParams ?? robot.supportedParams ?? [],
      supportedStatusFields: message.supportedStatusFields ?? robot.supportedStatusFields ?? [],
      shadowDetail: message.shadowDetail ?? robot.shadowDetail ?? null,
      runControl: message.runControl ?? robot.runControl,
      runEnable: message.runEnable ?? robot.runEnable,
      workMode: message.workMode ?? robot.workMode,
      walkSpeed: message.walkSpeed ?? robot.walkSpeed,
      brushSpeed: message.brushSpeed ?? robot.brushSpeed,
      bridgeSpeed: message.bridgeSpeed ?? robot.bridgeSpeed,
      runTimeSingle: message.runTimeSingle ?? robot.runTimeSingle,
      runTimeTotal: message.runTimeTotal ?? robot.runTimeTotal,
      mileageSingle: message.mileageSingle ?? robot.mileageSingle,
      mileageTotal: message.mileageTotal ?? robot.mileageTotal,
      heartbeat: message.heartbeat ?? robot.heartbeat,
      voltage: message.voltage ?? robot.voltage,
      angle: message.angle ?? robot.angle,
      tracking: message.tracking ?? robot.tracking,
      pathPlanning: message.pathPlanning ?? robot.pathPlanning,
      leftEdge: message.leftEdge ?? robot.leftEdge,
      rightEdge: message.rightEdge ?? robot.rightEdge,
      moveJudge: message.moveJudge ?? robot.moveJudge,
      detectQrcode: message.detectQrcode ?? robot.detectQrcode,
      enterGarage: message.enterGarage ?? robot.enterGarage,
      mqttMessageType: message.mqttMessageType ?? robot.mqttMessageType,
      lastCommandId: message.lastCommandId ?? robot.lastCommandId,
      lastCommandStatus: message.lastCommandStatus ?? robot.lastCommandStatus,
      longitude: message.location?.lon ?? robot.longitude,
      latitude: message.location?.lat ?? robot.latitude,
      d12WorkWay: message.d12WorkWay ?? robot.d12WorkWay,
      leftRowStart: message.leftRowStart ?? robot.leftRowStart,
      leftRowEnd: message.leftRowEnd ?? robot.leftRowEnd,
      rightRowStart: message.rightRowStart ?? robot.rightRowStart,
      rightRowEnd: message.rightRowEnd ?? robot.rightRowEnd,
      walkFastSpeed: message.walkFastSpeed ?? robot.walkFastSpeed,
      walkSlowSpeed: message.walkSlowSpeed ?? robot.walkSlowSpeed,
      currentRowPosition: message.currentRowPosition ?? robot.currentRowPosition,
      batteryLowLimit: message.batteryLowLimit ?? robot.batteryLowLimit,
    }
  }

  const buildRealtimeDeviceStatusSummary = (message: any) => ({
    deviceId: message.deviceId,
    status: message.status,
    onlineState: message.onlineState,
    missionState: message.missionState,
    controlState: message.controlState,
    healthState: message.healthState,
    faultState: message.faultState,
    battery: message.battery,
    timestamp: message.timestamp,
    command: {
      id: message.lastCommandId,
      status: message.lastCommandStatus,
      type: message.mqttMessageType,
    },
    capabilities: {
      actions: message.supportedActions?.length ?? 0,
      params: message.supportedParams?.length ?? 0,
      statusFields: message.supportedStatusFields?.length ?? 0,
    },
    control: {
      runControl: message.runControl,
      runEnable: message.runEnable,
      workMode: message.workMode,
      walkSpeed: message.walkSpeed,
      brushSpeed: message.brushSpeed,
      bridgeSpeed: message.bridgeSpeed,
    },
    runtime: {
      runTimeSingle: message.runTimeSingle,
      runTimeTotal: message.runTimeTotal,
      mileageSingle: message.mileageSingle,
      mileageTotal: message.mileageTotal,
      heartbeat: message.heartbeat,
    },
    tStatus: {
      voltage: message.voltage,
      angle: message.angle,
      tracking: message.tracking,
      pathPlanning: message.pathPlanning,
      leftEdge: message.leftEdge,
      rightEdge: message.rightEdge,
      moveJudge: message.moveJudge,
      detectQrcode: message.detectQrcode,
      enterGarage: message.enterGarage,
    },
    location: message.location,
    d12: {
      d12WorkWay: message.d12WorkWay,
      leftRowStart: message.leftRowStart,
      leftRowEnd: message.leftRowEnd,
      rightRowStart: message.rightRowStart,
      rightRowEnd: message.rightRowEnd,
      walkFastSpeed: message.walkFastSpeed,
      walkSlowSpeed: message.walkSlowSpeed,
      currentRowPosition: message.currentRowPosition,
      batteryLowLimit: message.batteryLowLimit,
    },
  })

  // 进入详情页或参数页时，从 railcar_config 表加载配置参数
  useEffect(() => {
    if ((currentPage !== 'settings' && currentPage !== 'detail') || !selectedRobot?.productType || !selectedRobot?.productId) {
      return
    }

    let cancelled = false
    const productModel = selectedRobot.productType
    const productNumber = selectedRobot.productId

    const loadSavedConfig = async () => {
      setIsConfigLoading(true)
      try {
        let config = await deviceControlService.getSavedConfig(productModel, productNumber)

        // 兼容历史数据：旧表中可能保存为 D01 / T01（无前导“-”）
        if (!config && productModel.startsWith('-')) {
          config = await deviceControlService.getSavedConfig(productModel.substring(1), productNumber)
        }

        if (!config) {
          console.log('[Index Page] 配置表无记录，保留当前设备参数显示:', { productModel, productNumber })
          return
        }

        if (!cancelled) {
          mergeConfigToSettings(config, productModel, productNumber)
        }
      } catch (error) {
        console.error('[Index Page] 加载设备参数配置失败:', error)
        if (!cancelled) {
          showToast('加载配置失败，已显示当前参数')
        }
      } finally {
        if (!cancelled) {
          setIsConfigLoading(false)
        }
      }
    }

    void loadSavedConfig()
    return () => {
      cancelled = true
    }
  }, [currentPage, selectedRobot?.productType, selectedRobot?.productId])

  // WebSocket 连接进度模拟
  const [connectProgress, setConnectProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(true)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 重连状态
  const [reconnectInfo, setReconnectInfo] = useState<{
    isReconnecting: boolean
    attempt: number
    nextRetryIn: number
    canManualRetry: boolean
  }>({
    isReconnecting: false,
    attempt: 0,
    nextRetryIn: 0,
    canManualRetry: true
  })

  useEffect(() => {
    // 清理函数
    const cleanup = () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }

    if (!wsConnected) {
      // 未连接时：进度增长到80%
      setShowProgress(true)

      // 如果正在重连，显示重连状态，进度根据重连次数调整
      if (reconnectInfo.isReconnecting && reconnectInfo.attempt > 0) {
        // 重连时进度在60-80之间波动
        const baseProgress = 60 + Math.min(reconnectInfo.attempt * 2, 15)
        setConnectProgress(baseProgress)
      } else {
        // 初始连接：逐渐增长到80%
        setConnectProgress(0)
        progressTimerRef.current = setInterval(() => {
          setConnectProgress(prev => {
            if (prev >= 80) {
              cleanup()
              return 80 // 停在80%，等待连接成功
            }
            return prev + Math.random() * 6 + 2
          })
        }, 250)
      }
    } else {
      // 连接成功：快速完成到100%
      cleanup()

      let reachedEnd = false
      progressTimerRef.current = setInterval(() => {
        setConnectProgress(prev => {
          if (prev >= 100) {
            cleanup()
            if (!reachedEnd) {
              reachedEnd = true
              setTimeout(() => setShowProgress(false), 1300)
            }
            return 100
          }
          return prev + 5 // 加速完成
        })
      }, 60)
    }

    return cleanup
  }, [wsConnected, reconnectInfo.isReconnecting, reconnectInfo.attempt])

  const [settings, setSettings] = useState<Settings>({
    companyCode: 'ZTZN-PVC', productType: '-D01', productId: '250001',
    infoCommandType: 0, bindStatus: 0, bindDeviceId: '', bindDeviceIds: [],
    workMode: 1, runControl: 0, runEnable: 0,
    timeGroup1: { weekYear: '0528', monthDay: '0204', hourMin: '0630' },
    timeGroup2: { weekYear: '0622', monthDay: '1221', hourMin: '1130' },
    timeGroup3: { weekYear: '0521', monthDay: '1217', hourMin: '0120' },
    timeGroup4: { weekYear: '0724', monthDay: '1120', hourMin: '1020' },
    edgeDetectDelay: 1000, bridgeDetectTime: 6000, errorReturnTime: 1000,
    walkSpeed: 503, brushSpeed: 1000, bridgeSpeed: 800,
    heartbeat: 113, reserved: 0, reserved2: 0,
    // D12 接驳车字段默认值
    leftRowStart: 1, leftRowEnd: 25,
    rightRowStart: 1, rightRowEnd: 25,
    walkFastSpeed: 800, walkSlowSpeed: 300,
    waitStopRowPosition: 25,
    maxRowCount: 25,
    batteryLowLimit: 50,
    robotInPositionTime: 500,
    limitPositionCheckTime: 500,
    walkPositionCheckTime: 500,
    faultCode: 0,
    currentRowPosition: 0,
  })

  const showToast = (message: string) => {
    setToast({ show: true, message })
    setTimeout(() => setToast({ show: false, message: '' }), 2000)
  }

  // 获取当前登录用户信息
  const currentUser = authService.getCurrentUser()

  // 处理登出
  const handleLogout = async () => {
    try {
      await authService.logout()
      Taro.reLaunch({ url: '/pages/login/login' })
    } catch (error) {
      console.error('登出失败:', error)
      // 即使失败也跳转到登录页
      Taro.reLaunch({ url: '/pages/login/login' })
    }
  }

  // 封装页面切换函数，同时更新 state 和 ref
  const navigateTo = (page: 'scan' | 'home' | 'detail' | 'settings' | 'stats' | 'profile') => {
    const previousPage = currentPageRef.current
    currentPageRef.current = page
    setCurrentPage(page)

    // 进入设置页面时，标记为正在编辑
    if (page === 'settings') {
      setIsEditingSettings(true)
      setSettingsTab('basic')
      isInputFocusedRef.current = false
    } else if (previousPage === 'settings') {
      // 离开设置页面时，取消编辑标记
      setIsEditingSettings(false)
      isInputFocusedRef.current = false
    }
  }

  // 状态映射函数
  const mapStatus = (status: string): Robot['status'] => {
    switch (status) {
      case 'working':
      case 'running':
      case 'cleaning':
      case 'returning':
      case 'docking':
        return 'running'
      case 'active':
      case 'idle':
      case 'stopped':
      case 'manual':
      case 'resetting':
      case 'unknown':
      case 'disabled':
        return 'idle'
      case 'charging':
        return 'charging'
      case 'offline':
        return 'offline'
      default: return 'idle'
    }
  }

  const isRobotOnline = (robot: Pick<Robot, 'status' | 'online'>): boolean => {
    const normalizedStatus = mapStatus(robot.status || 'offline')
    if (normalizedStatus === 'offline') {
      return false
    }
    if (robot.online != null) {
      return robot.online
    }
    return true
  }

  // 加载设备列表
  const loadVehicles = async (): Promise<Robot[]> => {
    try {
      console.log('[Index Page] 开始加载设备列表')
      setLoading(true)

      const vehicles = await vehicleService.getAllVehicles()
      const robotList = vehicles.map(v => vehicleService.convertToRobot(v))

      setRobots(robotList)
      console.log(`[Index Page] 加载了 ${robotList.length} 个设备`)

      // 无设备时显示扫码引导
      if (robotList.length === 0) {
        currentPageRef.current = 'scan'
        setCurrentPage('scan')
      }

      return robotList

    } catch (error: any) {
      console.error('[Index Page] 加载设备列表失败:', error)
      showToast('加载设备列表失败: ' + error.message)
      return []
    } finally {
      setLoading(false)
    }
  }

  // 手动重连处理函数
  const handleManualReconnect = () => {
    console.log('[Index Page] 用户点击手动重连')
    setConnectProgress(0)
    setShowProgress(true)
    websocketService.manualReconnect()
  }

  // 监听应用前后台切换
  useEffect(() => {
    // 监听应用回到前台
    const handleAppShow = (data: { timeSinceHide: number }) => {
      console.log('[Index Page] 应用回到前台，后台时间:', data.timeSinceHide)

      // 重置进度条显示
      if (!wsConnected) {
        setShowProgress(true)
        setConnectProgress(0)
      }
    }

    // 监听应用进入后台
    const handleAppHide = () => {
      console.log('[Index Page] 应用进入后台')
    }

    Taro.eventCenter.on('app:show', handleAppShow)
    Taro.eventCenter.on('app:hide', handleAppHide)

    return () => {
      Taro.eventCenter.off('app:show', handleAppShow)
      Taro.eventCenter.off('app:hide', handleAppHide)
    }
  }, [wsConnected])

  // WebSocket 初始化
  const initWebSocket = () => {
    console.log('[Index Page] ===== 开始初始化 WebSocket =====')

    websocketService.connect(
      // onMessage - 接收设备状态更新（完整数据）
      (message) => {
        console.log('[Index Page] 收到 WebSocket 设备状态:', buildRealtimeDeviceStatusSummary(message))
        const shouldFreezeSettingsPage = currentPageRef.current === 'settings'

        // 更新设备列表中的对应设备
        setRobots(prevRobots =>
          prevRobots.map(robot => {
            const deviceId = robot.productType + robot.productId
            if (deviceId === message.deviceId) {
              console.log(`[Index Page] ✅ 更新设备 ${deviceId}`)
              return mergeRealtimeRobotState(robot, message)
            }
            return robot
          })
        )

        // 同步更新 selectedRobot
        setSelectedRobot(prevSelected => {
          if (prevSelected) {
            const deviceId = prevSelected.productType + prevSelected.productId
            if (deviceId === message.deviceId) {
              if (shouldFreezeSettingsPage) {
                return prevSelected
              }
              console.log(`[Index Page] ✅ 更新选中设备 ${deviceId}`)
              return mergeRealtimeRobotState(prevSelected, message)
            }
          }
          return prevSelected
        })
      },

      // onStatusChange - WebSocket连接状态变化
      (isConnected) => {
        console.log('[Index Page] ========== WebSocket 状态: {} ==========', isConnected ? '已连接' : '未连接')
        setWsConnected(isConnected)

        if (isConnected) {
          // 重置重连信息
          setReconnectInfo({
            isReconnecting: false,
            attempt: 0,
            nextRetryIn: 0,
            canManualRetry: true
          })

          // 订阅所有设备的状态
          setRobots(currentRobots => {
            console.log('[Index Page] 开始订阅设备状态...')
            currentRobots.forEach(robot => {
              const deviceId = robot.productType + robot.productId
              console.log(`[Index Page] 📡 订阅设备: ${deviceId}`)
              websocketService.subscribeDevice(deviceId)
            })
            console.log(`[Index Page] ✅ 已订阅 ${currentRobots.length} 个设备`)
            return currentRobots
          })
        }
      },

      // onReconnectStatus - 重连状态变化（新增回调）
      (info) => {
        console.log('[Index Page] 重连状态:', info)
        setReconnectInfo(info)
      }
    )
  }

  // 页面初始化
  useEffect(() => {
    // 检查登录状态
    const user = authService.getCurrentUser()
    if (!user) {
      Taro.reLaunch({ url: '/pages/login/login' })
      return
    }

    console.log('[Index Page] 已登录用户:', user.username)

    // 加载设备列表
    loadVehicles()

    // ✅ 启用 WebSocket（使用实时数据推送）
    console.log('[Index Page] ========== 启用 WebSocket ==========')
    initWebSocket()

    // 页面卸载时断开连接
    return () => {
      console.log('[Index Page] 页面卸载，断开 WebSocket')
      clearCommandStatusPolling()
      websocketService.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const normalizeD01BindingIds = (rawList: string[] | null | undefined): string[] => {
    const unique: string[] = []
      ; (rawList || []).forEach(item => {
        const serial = (item || '').trim()
        if (!serial) return
        if (!serial.startsWith('-D01')) return
        if (!unique.includes(serial)) {
          unique.push(serial)
        }
      })
    return unique.slice(0, 5)
  }

  const syncD12BindingState = (d12Serial: string, rawBindings: string[]) => {
    const bindings = normalizeD01BindingIds(rawBindings)
    const bindStatus = bindings.length

    setSettings(prev => {
      if (`${prev.productType}${prev.productId}` !== d12Serial) {
        return prev
      }
      return {
        ...prev,
        bindStatus,
        bindDeviceId: bindings[0] || '',
        bindDeviceIds: bindings,
      }
    })

    setRobots(prev =>
      prev.map(robot => {
        const serial = `${robot.productType || ''}${robot.productId || ''}`
        if (serial !== d12Serial) {
          return robot
        }
        return {
          ...robot,
          boundDeviceIds: bindings,
          boundDeviceCount: bindStatus,
        }
      })
    )

    setSelectedRobot(prev => {
      if (!prev) return prev
      const serial = `${prev.productType || ''}${prev.productId || ''}`
      if (serial !== d12Serial) {
        return prev
      }
      return {
        ...prev,
        boundDeviceIds: bindings,
        boundDeviceCount: bindStatus,
      }
    })
  }

  // 构建后端配置参数（后端负责编码为70字节协议）
  const buildApiConfig = (overrideControlMode?: number) => {
    const isD12Device = settings.productType === '-D12' || settings.productType === '-T12'
    const normalizedBindDeviceIds = isD12Device
      ? normalizeD01BindingIds(settings.bindDeviceIds)
      : []
    const bindStatus = normalizedBindDeviceIds.length
    const bindDeviceId = bindStatus > 0 ? normalizedBindDeviceIds[0] : ''
    const normalizedEnableMode = isD12Device
      ? (settings.runEnable >= 0 && settings.runEnable <= 3 ? settings.runEnable : 1)
      : settings.runEnable

    const rawConfig: DeviceConfig = {
      // 基本信息 + 信息识别码
      deviceId: `${settings.productType}${settings.productId}`,
      companyCode: settings.companyCode,
      model: settings.productType,
      infoCommandType: 0, // 设置参数指令
      bindStatus,
      bindDeviceId,
      bindDeviceIds: normalizedBindDeviceIds,

      // 70字节设置帧字段（标准/D12统一提交）
      workWay: settings.workMode,
      time1: {
        yearWeek: settings.timeGroup1.weekYear,
        monDay: settings.timeGroup1.monthDay,
        hrMin: settings.timeGroup1.hourMin,
      },
      time2: {
        yearWeek: settings.timeGroup2.weekYear,
        monDay: settings.timeGroup2.monthDay,
        hrMin: settings.timeGroup2.hourMin,
      },
      time3: {
        yearWeek: settings.timeGroup3.weekYear,
        monDay: settings.timeGroup3.monthDay,
        hrMin: settings.timeGroup3.hourMin,
      },
      time4: {
        yearWeek: settings.timeGroup4.weekYear,
        monDay: settings.timeGroup4.monthDay,
        hrMin: settings.timeGroup4.hourMin,
      },
      controlMode: overrideControlMode ?? 0, // 手动下发时默认0，快捷按钮通过 overrideControlMode 传入
      enableMode: normalizedEnableMode,
      edgeDelay: settings.edgeDetectDelay,
      bridgeTime: settings.bridgeDetectTime,
      errorReturnTime: settings.errorReturnTime,
      walkSpeed: settings.walkSpeed,
      brushSpeed: settings.brushSpeed,
      bridgeSpeed: settings.bridgeSpeed,
      heartbeatSet: settings.heartbeat,
      batteryLowLimit: settings.batteryLowLimit,
      reserved: settings.reserved,
      reserved2: settings.reserved2,

      // D12专用字段
      robotInPositionTime: settings.robotInPositionTime,
      limitPositionCheckTime: settings.limitPositionCheckTime,
      walkPositionCheckTime: settings.walkPositionCheckTime,
      walkFastSpeed: settings.walkFastSpeed,
      walkSlowSpeed: settings.walkSlowSpeed,
      maxRowCount: settings.maxRowCount ?? settings.waitStopRowPosition,

      // 交互帧字段（设置帧下不会使用，统一传0）
      faultCode: settings.faultCode,
      currentRowPosition: settings.currentRowPosition,
      params: {},
    }

    return filterDeviceConfigByCapabilities(selectedRobot, rawConfig)
  }

  const handleSend = async () => {
    setIsSending(true)

    try {
      if (selectedRobot) {
        console.log(`[Index Page] 📤 准备下发配置数据 - 设备ID: ${selectedRobot.productId}`)

        try {
          const apiConfig = buildApiConfig()

          console.log(`[Index Page] 📡 调用后端 API - 设备ID: ${selectedRobot.productId}`)

          // 调用后端 API
          const result = await deviceControlService.sendCommand(apiConfig)
          startCommandStatusPolling(apiConfig.deviceId, result.commandId, result.commandStatus)

          if (result.success) {
            console.log(`[Index Page] ✅ 配置数据下发成功 - 设备ID: ${selectedRobot.productId}, 操作ID: ${result.operationId}`)
            showToast('数据已下发')
          } else {
            console.error(`[Index Page] ❌ 配置数据下发失败 - 设备ID: ${selectedRobot.productId}, 错误: ${result.message}`)
            showToast('下发失败: ' + result.message)
          }
        } catch (error) {
          console.error(`[Index Page] ❌ 下发数据失败 - 设备ID: ${selectedRobot.productId}`, error)
          showToast('下发失败: ' + (error as Error).message)
        }
      } else {
        showToast('请先选择设备')
      }
    } catch (error) {
      console.error('下发数据失败:', error)
      showToast('下发失败')
    } finally {
      setIsSending(false)
    }
  }

  const getStatusLabel = (s: string | null) => {
    if (s == null) return '-'
    const map: Record<string, string> = {
      running: '运行',
      charging: '充电',
      idle: '待机',
      offline: '离线'
    }
    return map[s] || s
  }

  const getControlLabel = (v: number | null) => {
    if (v == null) return '-'
    return runControlOptions.find(o => o.value === v)?.label || '-'
  }

  const formatRobotRuntime = (seconds?: number | null) => {
    if (seconds == null) return '-'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `${h}.${Math.floor(m / 6)}h` : `${m}min`
  }

  const getRobotSpeedLabel = (robot: Robot) => {
    if (robot.walkSpeed != null) {
      return `${(robot.walkSpeed / 10).toFixed(1)}%`
    }
    if (robot.walkFastSpeed != null || robot.walkSlowSpeed != null) {
      const fast = robot.walkFastSpeed != null ? `${(robot.walkFastSpeed / 10).toFixed(1)}%` : '-'
      const slow = robot.walkSlowSpeed != null ? `${(robot.walkSlowSpeed / 10).toFixed(1)}%` : '-'
      return `${fast}/${slow}`
    }
    return '-'
  }

  const getRobotPrimaryMetricLabel = (robot: Robot) => {
    const family = getRobotFamily(robot)
    if (family === 'T') return '速度'
    return '运动模式'
  }

  const getRobotPrimaryMetricValue = (robot: Robot) => {
    const family = getRobotFamily(robot)
    if (family === 'T') return getRobotSpeedLabel(robot)
    return getControlLabel(robot.runControl)
  }

  // ========== 解析18字节二维码数据 ==========
  const parseQRCodeData = (data: string | Uint8Array | ArrayBuffer): QRCodeData | null => {
    try {
      let bytes: Uint8Array

      if (typeof data === 'string') {
        const trimmed = data.trim()

        if (trimmed.length !== 18) {
          console.error('二维码字符串长度不是18字节:', trimmed.length, trimmed)
          return null
        }

        bytes = new Uint8Array(18)
        for (let i = 0; i < 18; i++) {
          bytes[i] = trimmed.charCodeAt(i)
        }
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data)
      } else {
        bytes = data
      }

      if (bytes.length !== 18) {
        console.error('二维码数据长度不是18字节:', bytes.length)
        return null
      }

      // 解析18字节数据
      // 公司代号：8字节（ASCII字符串）
      const companyCodeBytes = bytes.slice(0, 8)
      const companyCode = Array.from(companyCodeBytes)
        .map(b => b === 0 ? '' : String.fromCharCode(b))
        .join('')
        .replace(/\0/g, '')
        .trim()

      // 产品型号：4字节（ASCII字符串）
      const productTypeBytes = bytes.slice(8, 12)
      const productType = Array.from(productTypeBytes)
        .map(b => b === 0 ? '' : String.fromCharCode(b))
        .join('')
        .replace(/\0/g, '')
        .trim()

      // 产品编号：6字节（ASCII字符串，作为deviceID）
      const productIdBytes = bytes.slice(12, 18)
      const productId = Array.from(productIdBytes)
        .map(b => b === 0 ? '' : String.fromCharCode(b))
        .join('')
        .replace(/\0/g, '')
        .trim()

      console.log('解析二维码数据:', { companyCode, productType, productId })

      return {
        companyCode,
        productType,
        productId
      }
    } catch (error) {
      console.error('解析二维码数据失败:', error)
      return null
    }
  }

  // ========== 扫描二维码 ==========
  const handleScanQRCode = async () => {
    try {
      const res = await Taro.scanCode({
        scanType: ['qrCode', 'barCode'],
        onlyFromCamera: false
      })

      console.log('扫描结果:', res)

      // 解析扫描结果
      let qrData: QRCodeData | null = null

      if (res.result) {
        // 尝试解析为18字节数据
        // 可能是Base64、十六进制字符串或直接是字节数据
        qrData = parseQRCodeData(res.result)
      }

      if (!qrData || !qrData.productId) {
        showToast('二维码格式错误，请扫描正确的设备二维码')
        return
      }

      // 保存扫描结果
      setScannedDevice(qrData)

      // 调用后端绑定设备，确保小程序和App都是真实绑定而非本地临时添加
      const bindResult = await vehicleService.scanAndBindDevice(qrData)
      if (!bindResult.bound) {
        const owner = bindResult.boundUsername || '其他用户'
        showToast(`该设备已被 ${owner} 绑定`)
        return
      }

      // 绑定成功后，重新拉取后端设备列表
      const robotList = await loadVehicles()
      const boundRobot = robotList.find(
        r => r.productType === bindResult.productType && r.productId === bindResult.productId
      )
      if (boundRobot) {
        openRobotDetail(boundRobot)
        return
      }

      // 更新设置页面的默认值
      setSettings({
        companyCode: bindResult.companyCode,
        productType: bindResult.productType,
        productId: bindResult.productId,
        infoCommandType: 0,
        bindStatus: 0,
        bindDeviceId: '',
        bindDeviceIds: [],
        workMode: 0,
        runControl: 0,
        runEnable: 0,
        timeGroup1: { weekYear: '0000', monthDay: '0000', hourMin: '0000' },
        timeGroup2: { weekYear: '0000', monthDay: '0000', hourMin: '0000' },
        timeGroup3: { weekYear: '0000', monthDay: '0000', hourMin: '0000' },
        timeGroup4: { weekYear: '0000', monthDay: '0000', hourMin: '0000' },
        edgeDetectDelay: 0,
        bridgeDetectTime: 0,
        errorReturnTime: 0,
        walkSpeed: 0,
        brushSpeed: 0,
        bridgeSpeed: 0,
        heartbeat: 0,
        reserved: 0,
        reserved2: 0,
        maxRowCount: 25,
        batteryLowLimit: 50,
        robotInPositionTime: 500,
        limitPositionCheckTime: 500,
        walkPositionCheckTime: 500,
        walkFastSpeed: 800,
        walkSlowSpeed: 300,
        faultCode: 0,
        currentRowPosition: 0,
      })

      // 如果WebSocket已连接，订阅该设备的状态
      if (wsConnected) {
        const deviceId = bindResult.productType + bindResult.productId
        console.log(`[Index Page] 扫描添加设备后订阅: ${deviceId}`)
        websocketService.subscribeDevice(deviceId)
        showToast(`设备 ${bindResult.productId} 绑定成功并已订阅`)
      } else {
        console.log(`[Index Page] WebSocket 未连接，跳过订阅 - 设备ID: ${bindResult.productId}`)
        showToast(`设备 ${bindResult.productId} 绑定成功`)
      }

      setSelectedDeviceFamily(null)
      setSearchKeyword('')
      navigateTo('home')
    } catch (error: any) {
      console.error('扫描二维码失败:', error)
      if (error.errMsg && error.errMsg.includes('cancel')) {
        // 用户取消扫描，不显示错误
        return
      }
      showToast(error?.message || '扫描失败，请重试')
    }
  }

  // ========== 扫描页面 ==========
  const ScanPage = () => (
    <View className="scan-page">
      {robots.length > 0 && (
        <View
          style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 10,
            padding: '6px 12px', background: 'rgba(39,39,42,0.85)',
            borderRadius: '8px', border: '1px solid #3f3f46',
          }}
          onClick={() => navigateTo('home')}
        >
          <Text style={{ color: '#a1a1aa', fontSize: '14px' }}>← 返回</Text>
        </View>
      )}
      <View className="scan-container">
        {/* Logo区域 */}
        <View className="logo-section">
          <View className="logo-placeholder">
            {/* Logo占位区域，可以后续替换为实际logo图片 */}
          </View>
          <Text className="logo-title">中拓智能</Text>
        </View>

        {/* 扫描区域 */}
        <View className="scan-content">
          <View className="scan-icon-wrapper">
            <View className="scan-icon">
              <View className="scan-icon-inner" />
            </View>
          </View>
          <Text className="scan-title">扫描设备二维码</Text>
          <Text className="scan-desc">请扫描设备上的18字节二维码</Text>
          <Text className="scan-desc-small">包含：公司代号(8字节)、产品型号(4字节)、产品编号(6字节)</Text>

          <Button className="scan-btn" onClick={handleScanQRCode}>
            <Text className="scan-btn-text">开始扫描</Text>
          </Button>
        </View>

        {scannedDevice && (
          <View className="scan-result">
            <Text className="scan-result-title">已扫描设备信息：</Text>
            <View className="scan-result-item">
              <Text className="scan-result-label">公司代号：</Text>
              <Text className="scan-result-value">{scannedDevice.companyCode}</Text>
            </View>
            <View className="scan-result-item">
              <Text className="scan-result-label">产品型号：</Text>
              <Text className="scan-result-value">{scannedDevice.productType}</Text>
            </View>
            <View className="scan-result-item">
              <Text className="scan-result-label">产品编号：</Text>
              <Text className="scan-result-value">{scannedDevice.productId}</Text>
            </View>
            <Button
              className="scan-btn scan-btn-secondary"
              onClick={() => {
                setSelectedDeviceFamily(null)
                setSearchKeyword('')
                navigateTo('home')
              }}
            >
              <Text className="scan-btn-text">进入设备类型</Text>
            </Button>
          </View>
        )}
      </View>
    </View>
  )

  const getRobotFamily = (robot: Robot): 'D' | 'T' | 'unknown' => {
    const type = robot.productType || ''
    if (type.startsWith('-D')) return 'D'
    if (type.startsWith('-T')) return 'T'
    return 'unknown'
  }

  const getProductTypeLabel = (productType?: string | null): string => {
    if (!productType) return '-'
    return productTypeLabelMap[productType] || productType.replace(/^-/, '')
  }

  const openRobotDetail = (robot: Robot) => {
    setSelectedRobot(robot)
    // 更新settings，确保D12字段也被包含
    setSettings(s => {
      // 只写入身份字段，参数字段由 railcar_config 表统一提供（useEffect 在进入详情页时触发）
      const newSettings = {
        ...s,
        ...(robot.companyCode != null && { companyCode: robot.companyCode }),
        ...(robot.productType != null && { productType: robot.productType }),
        ...(robot.productId != null && { productId: robot.productId }),
        infoCommandType: 0,
      }
      // D12/T12：只写入绑定关系（来自 vehicle 表）和行范围显示字段（来自 Redis，仅展示用）
      if (robot.productType === '-D12' || robot.productType === '-T12') {
        const boundListFromRobot = normalizeD01BindingIds(robot.boundDeviceIds || [])
        return {
          ...newSettings,
          bindStatus: boundListFromRobot.length,
          bindDeviceId: boundListFromRobot[0] || '',
          bindDeviceIds: boundListFromRobot,
          leftRowStart: robot.leftRowStart ?? s.leftRowStart,
          leftRowEnd: robot.leftRowEnd ?? s.leftRowEnd,
          rightRowStart: robot.rightRowStart ?? s.rightRowStart,
          rightRowEnd: robot.rightRowEnd ?? s.rightRowEnd,
        }
      }
      return {
        ...newSettings,
        bindStatus: 0,
        bindDeviceId: '',
        bindDeviceIds: [],
      }
    })

    setPendingD01Binding('')
    setIsEditingSettings(false)

    if ((robot.productType || '').startsWith('-T')) {
      void openTRailcarConsole(robot.productId)
      return
    }

    navigateTo('detail')
  }

  // ========== 首页 ==========
  const HomePage = () => {
    const dRobots = robots.filter(r => getRobotFamily(r) === 'D')
    const tRobots = robots.filter(r => getRobotFamily(r) === 'T')
    const selectedFamilyRobots = selectedDeviceFamily === 'D' ? dRobots : tRobots
    const keyword = searchKeyword.trim().toLowerCase()
    const filteredFamilyRobots = selectedFamilyRobots.filter(r => {
      const id = (r.productId || '').toLowerCase()
      return !keyword || id.includes(keyword)
    })

    return (
      <ScrollView className="home-page" scrollY={true}>
        <View className="home-header">
          <View className="header-top">
            <View className="header-main">
              <Text className="header-title header-title-large">中拓智能</Text>
              <Text className="header-subtitle">设备调度控制台</Text>
            </View>
            <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <View
                style={{
                  background: '#27272a', border: '1px solid #3f3f46',
                  borderRadius: '16px', padding: '5px 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => navigateTo('scan')}
              >
                <Text style={{ fontSize: '16px', color: '#a1a1aa', lineHeight: '1' }}>+</Text>
              </View>
              <Button className="refresh-btn" onClick={() => showToast('已刷新')}>
                <Refresh />
              </Button>
            </View>
          </View>

          <View className="stats-row">
            <View className="stat-item stat-item-primary">
              <Text className="stat-label">总设备</Text>
              <Text className="stat-value">{robots.length}</Text>
            </View>
            <View className="stat-item stat-item-success stat-item-border">
              <Text className="stat-label">在线</Text>
              <Text className="stat-value stat-value-green">{robots.filter(r => r.online === true).length}</Text>
            </View>
            <View className="stat-item stat-item-warning stat-item-border">
              <Text className="stat-label">运行中</Text>
              <Text className="stat-value stat-value-amber">{robots.filter(r => r.status === 'running').length}</Text>
            </View>
          </View>

          {/* WebSocket 连接进度条 */}
          {showProgress && (
            <View className="ws-sync-bar">
              <View className="ws-sync-bar-top">
                <Text className="ws-sync-text">
                  {reconnectInfo.isReconnecting && reconnectInfo.attempt > 0
                    ? `正在重连... (第${reconnectInfo.attempt}次)`
                    : wsConnected
                      ? '数据同步完成'
                      : '正在连接服务器...'}
                </Text>
                <Text className={`ws-sync-percent ${wsConnected ? 'ws-sync-percent-done' : ''}`}>
                  {Math.floor(connectProgress)}%
                </Text>
              </View>
              <View className="ws-sync-progress">
                <View
                  className={`ws-sync-progress-fill ${wsConnected ? 'ws-sync-progress-fill-done' : ''}`}
                  style={{ width: `${Math.min(connectProgress, 100)}%` }}
                />
              </View>
              {/* 重连失败提示和手动重连按钮 */}
              {!wsConnected && reconnectInfo.attempt >= 3 && (
                <View className="ws-reconnect-hint">
                  <Text className="ws-reconnect-text">
                    连接不稳定，{Math.ceil(reconnectInfo.nextRetryIn / 1000)}秒后重试
                  </Text>
                  {reconnectInfo.canManualRetry && (
                    <Button className="ws-reconnect-btn" onClick={handleManualReconnect}>
                      立即重连
                    </Button>
                  )}
                </View>
              )}
            </View>
          )}

          {/* 断开连接状态下的永久重连按钮（进度条隐藏后） */}
          {!showProgress && !wsConnected && (
            <View className="ws-disconnected-bar" onClick={handleManualReconnect}>
              <View className="ws-disconnected-dot" />
              <Text className="ws-disconnected-text">连接已断开，点击重连</Text>
            </View>
          )}
        </View>

        <View className="home-content">
          {!selectedDeviceFamily && (
            <View className="device-type-entry">
              <View className="section-title">
                <View className="section-dot" />
                <Text>设备类型</Text>
              </View>
              <View className="device-type-grid">
                <View
                  className="device-type-card device-type-card-d"
                  onClick={() => {
                    setSelectedDeviceFamily('D')
                    setSearchKeyword('')
                  }}
                >
                  <Text className="device-type-title">D型机器人</Text>
                  <Text className="device-type-desc">干挂清洗系列设备</Text>
                  <View className="device-type-metrics">
                    <Text className="device-type-metric">设备 {dRobots.length}</Text>
                    <Text className="device-type-metric">在线 {dRobots.filter(r => isRobotOnline(r)).length}</Text>
                  </View>
                </View>
                <View
                  className="device-type-card device-type-card-t"
                  onClick={() => {
                    setSelectedDeviceFamily('T')
                    setSearchKeyword('')
                  }}
                >
                  <Text className="device-type-title">T型机器人</Text>
                  <Text className="device-type-desc">履带智能系列设备</Text>
                  <View className="device-type-metrics">
                    <Text className="device-type-metric">设备 {tRobots.length}</Text>
                    <Text className="device-type-metric">在线 {tRobots.filter(r => isRobotOnline(r)).length}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {selectedDeviceFamily && (
            <View className="device-family-list">
              <View className="family-list-header">
                <Button
                  className="family-back-btn"
                  onClick={() => {
                    setSelectedDeviceFamily(null)
                    setSearchKeyword('')
                  }}
                >
                  返回类型
                </Button>
                <Text className="family-list-title">
                  {selectedDeviceFamily === 'D' ? 'D型机器人设备列表' : 'T型机器人设备列表'}
                </Text>
              </View>

              <View className="search-bar search-bar-inline">
                <Input
                  className="search-input"
                  type="text"
                  placeholder="搜索设备编号..."
                  value={searchKeyword}
                  onInput={(e) => setSearchKeyword(e.detail.value)}
                  onFocus={() => {
                    isInputFocusedRef.current = true
                  }}
                  onBlur={() => {
                    isInputFocusedRef.current = false
                  }}
                />
                {searchKeyword && (
                  <View
                    className="search-clear"
                    onClick={() => setSearchKeyword('')}
                  >
                    ✕
                  </View>
                )}
              </View>

              <View className="robot-list">
                {filteredFamilyRobots.length === 0 && (
                  <View className="family-empty-card">
                    <Text className="family-empty-text">当前类型下暂无设备</Text>
                  </View>
                )}
                {filteredFamilyRobots.map(robot => (
                  <View
                    key={robot.id}
                    className="robot-card"
                    onClick={() => openRobotDetail(robot)}
                  >
                    <View className="robot-status-card-header">
                      <Text className="robot-status-card-title">设备状态</Text>
                      <View className="robot-status-card-link">
                        <Text>控制台</Text>
                        <ChevronRight />
                      </View>
                    </View>

                      <View className="robot-status-card-body">
                        <View className="robot-device-pane">
                        <RobotModel size="mini" family={getRobotFamily(robot)} />
                        <Text className="robot-id">{robot.productId}</Text>
                        <Text className="robot-type">{getProductTypeLabel(robot.productType)}</Text>
                        <View className="robot-online-row">
                          <View className={`status-dot ${isRobotOnline(robot) ? (robot.status === 'running' ? 'status-dot-amber' : 'status-dot-green') : 'status-dot-gray'}`} />
                          <Text className={`robot-online-text ${isRobotOnline(robot) ? 'online' : 'offline'}`}>
                            {isRobotOnline(robot) ? '在线' : '离线'}
                          </Text>
                        </View>
                      </View>

                      <View className="robot-metric-grid">
                        <View className={`robot-metric-card robot-metric-card--${robot.status === 'running' ? 'running' : isRobotOnline(robot) ? 'online' : 'offline'}`}>
                          <View>
                            <Text className="robot-metric-label">运行状态</Text>
                            <Text className="robot-metric-value robot-metric-value--blue">{getStatusLabel(robot.status)}</Text>
                          </View>
                          <View className="robot-metric-icon">↻</View>
                        </View>
                        <View className="robot-metric-card robot-metric-card--battery">
                          <View>
                            <Text className="robot-metric-label">电量</Text>
                            <Text className="robot-metric-value robot-metric-value--green">
                              {robot.battery != null ? `${robot.battery}%` : '--'}
                            </Text>
                          </View>
                          <View className="robot-metric-icon robot-metric-icon--battery">
                            <Battery level={robot.battery ?? 0} />
                          </View>
                        </View>
                        <View className="robot-metric-card">
                          <View>
                            <Text className="robot-metric-label">{getRobotPrimaryMetricLabel(robot)}</Text>
                            <Text className="robot-metric-value">{getRobotPrimaryMetricValue(robot)}</Text>
                          </View>
                          <View className="robot-metric-icon robot-metric-icon--path">⌘</View>
                        </View>
                        <View className="robot-metric-card">
                          <View>
                            <Text className="robot-metric-label">
                              {robot.lastCommandStatus ? '最近命令' : '累计运行'}
                            </Text>
                            <Text className="robot-metric-value">
                              {robot.lastCommandStatus
                                ? getCommandStatusLabel(robot.lastCommandStatus)
                                : formatRobotRuntime(robot.runTimeTotal)}
                            </Text>
                          </View>
                          <View className="robot-metric-icon robot-metric-icon--time">◷</View>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    )
  }

  const preheatTRailcarPage = () => {
    if (isConsolePagePreheatedRef.current) {
      return consolePagePreheatPromiseRef.current || Promise.resolve()
    }
    isConsolePagePreheatedRef.current = true
    const preheatPromise = import('../t-railcar/index')
      .catch((error) => {
        console.warn('[Index Page] 预热控制台页面失败:', error)
      })
    consolePagePreheatPromiseRef.current = preheatPromise
    return preheatPromise
  }

  useEffect(() => {
    const model = selectedRobot?.productType || ''
    if (currentPage === 'detail' && model.startsWith('-T')) {
      void preheatTRailcarPage()
    }
  }, [currentPage, selectedRobot?.productType])

  const openTRailcarConsole = async (productId?: string | null) => {
    if (!productId || isOpeningConsoleRef.current) return
    isOpeningConsoleRef.current = true
    setIsOpeningConsole(true)
    void preheatTRailcarPage()
    Taro.showLoading({
      title: '打开控制台...',
      mask: true
    })
    try {
      await Taro.navigateTo({
        url: `/pages/t-railcar/index?productId=${productId}`
      })
    } catch (error) {
      console.error('[Index Page] 打开控制台失败:', error)
      showToast('打开控制台失败')
    } finally {
      Taro.hideLoading()
      setIsOpeningConsole(false)
      isOpeningConsoleRef.current = false
    }
  }

  // ========== 详情页 ==========
  const DetailPage = () => {
    const r = selectedRobot
    if (!r) return null
    const model = r.productType || ''
    const isTModel = model.startsWith('-T')
    const isRailcarModel = model === '-D12' || model === '-T12'
    const isBridgeModel = model === '-D11'
    const canUseDeviceModeControl = hasAnySupportedAction(r, ['SET_MODE', 'APPLY_CONFIG'])
      && hasAnySupportedParam(r, ['controlMode', 'enableMode'])
    const canShowQuickControls = !isTModel && canUseDeviceModeControl
    const canOpenSettings = !isTModel && (
      hasAnySupportedAction(r, ['APPLY_CONFIG', 'SET_MODE', 'BIND_DEVICE', 'UNBIND_DEVICE'])
      || hasAnySupportedParam(r, [
        'controlMode',
        'enableMode',
        'walkSpeed',
        'brushSpeed',
        'bridgeSpeed',
        'workWay',
        'time1',
        'time2',
        'time3',
        'time4',
        'bindDeviceIds',
        'leftRowStart',
        'leftRowEnd',
        'rightRowStart',
        'rightRowEnd',
        'maxRowCount',
        'edgeDelay',
        'bridgeTime',
        'errorReturnTime',
        'batteryLowLimit',
        'robotInPositionTime',
        'limitPositionCheckTime',
        'walkPositionCheckTime',
      ])
    )
    const canOpenConsole = isTModel && hasAnySupportedAction(r, [
      'GET_STATUS',
      'START_CLEAN',
      'STOP_TASK',
      'RETURN_HOME',
      'ENTER_DOCK',
      'EXIT_DOCK',
    ])
    const safeNumber = (value: unknown, digits = 1, suffix = '') => {
      const parsed = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(parsed)) return '-'
      return `${parsed.toFixed(digits)}${suffix}`
    }
    const safeText = (value: unknown) => {
      if (value == null) return '-'
      const text = String(value).trim()
      return text.length > 0 ? text : '-'
    }
    const tStatusItems = [
      hasAnySupportedStatusField(r, ['voltage']) ? { key: 'voltage', label: '电压', value: safeNumber(r.voltage, 1, 'V') } : null,
      hasAnySupportedStatusField(r, ['angle']) ? { key: 'angle', label: '航向角', value: safeNumber(r.angle, 1, '°') } : null,
      hasAnySupportedStatusField(r, ['tracking']) ? { key: 'tracking', label: '纠偏', value: r.tracking == null ? '-' : (r.tracking ? '开启' : '关闭') } : null,
      hasAnySupportedStatusField(r, ['pathPlanning', 'path_planning']) ? { key: 'pathPlanning', label: '路径规划', value: safeText(r.pathPlanning) } : null,
      hasAnySupportedStatusField(r, ['leftEdge', 'left_edge']) ? { key: 'leftEdge', label: '左侧边缘', value: r.leftEdge == null ? '-' : `${safeText(r.leftEdge)}mm` } : null,
      hasAnySupportedStatusField(r, ['rightEdge', 'right_edge']) ? { key: 'rightEdge', label: '右侧边缘', value: r.rightEdge == null ? '-' : `${safeText(r.rightEdge)}mm` } : null,
      hasAnySupportedStatusField(r, ['moveJudge', 'move_judge']) ? { key: 'moveJudge', label: '运动中', value: r.moveJudge == null ? '-' : (r.moveJudge ? '是' : '否') } : null,
      hasAnySupportedStatusField(r, ['detectQrcode', 'detect_qrcode']) ? { key: 'detectQrcode', label: '二维码检测', value: r.detectQrcode == null ? '-' : (r.detectQrcode ? '是' : '否') } : null,
      hasAnySupportedStatusField(r, ['enterGarage', 'enter_garage']) ? { key: 'enterGarage', label: '在吊篮内', value: r.enterGarage == null ? '-' : (r.enterGarage ? '是' : '否') } : null,
    ].filter(Boolean) as Array<{ key: string; label: string; value: string }>

    const runtimeStatusItems = [
      hasAnySupportedStatusField(r, ['runTimeSingle']) ? {
        key: 'runTimeSingle',
        label: '单次时长',
        value: r.runTimeSingle != null ? <>{r.runTimeSingle}<Text className="total-data-unit">s</Text></> : '-',
      } : null,
      hasAnySupportedStatusField(r, ['mileageSingle']) ? {
        key: 'mileageSingle',
        label: '单次里程',
        value: r.mileageSingle != null ? <>{r.mileageSingle.toFixed(1)}<Text className="total-data-unit">m</Text></> : '-',
      } : null,
      hasAnySupportedStatusField(r, ['runTimeTotal']) ? {
        key: 'runTimeTotal',
        label: '总运行时长',
        value: r.runTimeTotal != null ? (() => {
          const h = Math.floor(r.runTimeTotal / 3600)
          const m = Math.floor((r.runTimeTotal % 3600) / 60)
          const s = r.runTimeTotal % 60
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        })() : '--:--:--',
        mono: true,
      } : null,
      hasAnySupportedStatusField(r, ['mileageTotal']) ? {
        key: 'mileageTotal',
        label: '总里程',
        value: r.mileageTotal != null ? <>{r.mileageTotal.toFixed(1)}<Text className="total-data-unit">m</Text></> : '-',
      } : null,
      hasAnySupportedStatusField(r, ['heartbeat']) ? {
        key: 'heartbeat',
        label: '心跳脉冲',
        value: <>{r.heartbeat != null ? r.heartbeat.toFixed(2) : '-'}<Text className="total-data-unit">s</Text></>,
      } : null,
    ].filter(Boolean) as Array<{ key: string; label: string; value: React.ReactNode; mono?: boolean }>

    return (
      <ScrollView className={`detail-page ${isTModel ? 'detail-page-t' : 'detail-page-d'}`} scrollY={true}>
        <View className="detail-header">
          <Button className="back-btn" onClick={() => navigateTo('home')}>
            <Back />
          </Button>
          <View className="detail-title">
            <Text className="detail-id"></Text>
          </View>
          <View className="detail-header-right">
            {isRobotOnline(r) ? (
              <View className="status-badge status-badge-online">
                <Text>{getStatusLabel(r.status)}</Text>
              </View>
            ) : (
              <View className="status-badge status-badge-offline status-badge-battery">
                <Battery level={r.battery ?? 0} />
                <Text className="status-badge-battery-text">{r.battery != null ? `${r.battery}%` : '-'}</Text>
              </View>
            )}
          </View>
        </View>

        <View className="detail-content">

          {!isTModel && (
            <View className="info-card">
              <View className="section-title">
                <View className="section-dot" />
                <Text>平台识别</Text>
              </View>
              <View className="detail-overview-grid">
                <View className="detail-overview-item">
                  <Text className="detail-overview-label">设备族</Text>
                  <Text className="detail-overview-value">{isTModel ? '履带 T 系列' : '干挂 D 系列'}</Text>
                </View>
                <View className="detail-overview-item">
                  <Text className="detail-overview-label">机型能力</Text>
                  <Text className="detail-overview-value">
                    {isRailcarModel ? '接驳/轨道' : isBridgeModel ? '跨桥清扫' : '标准清扫'}
                  </Text>
                </View>
                <View className="detail-overview-item">
                  <Text className="detail-overview-label">当前模式</Text>
                  <Text className="detail-overview-value">{getControlLabel(r.runControl)}</Text>
                </View>
              </View>
            </View>
          )}


          {/* 运行状态 */}
          {!isTModel && (
            <View className="info-card">
              <View className="section-title">
                <View className="section-dot" />
                <Text>运行状态</Text>
              </View>
              <View className="run-status-grid">
                {!isRailcarModel && hasAnySupportedStatusField(r, ['runEnable']) && (
                  <View className="run-status-item run-status-item-full">
                    <Text className="run-status-label">{isTModel ? '巡检使能' : '运行使能'}</Text>
                    <Text className="run-status-value">{runEnableOptions.find(o => o.value === r.runEnable)?.label || '-'}</Text>
                  </View>
                )}
                {!isRailcarModel && hasAnySupportedStatusField(r, ['currentRowPosition', 'current_row_position']) && (
                  <View className="run-status-item run-status-item-full">
                    <Text className="run-status-label">当前排位置</Text>
                    <Text className="run-status-value">{r.currentRowPosition ?? '-'}</Text>
                  </View>
                )}
                {model === '-D12' && hasAnySupportedStatusField(r, ['currentRowPosition', 'current_row_position']) && (
                  <View className="run-status-item">
                    <Text className="run-status-label">当前排位置</Text>
                    <Text className="run-status-value">{r.currentRowPosition ?? '-'}</Text>
                  </View>
                )}
                {model === '-D12' && hasAnySupportedStatusField(r, ['d12WorkWay', 'workWay', 'work_mode']) && (
                  <View className="run-status-item">
                    <Text className="run-status-label">接驳方式</Text>
                    <Text className="run-status-value">
                      {r.d12WorkWay != null ? (['无效', '接右', '接左', '接左右'][r.d12WorkWay] ?? '-') : '-'}
                    </Text>
                  </View>
                )}
              </View>

              {/* D12 接驳车速度显示 */}
              {isRailcarModel ? (
                <View className="speed-grid">
                  {hasAnySupportedStatusField(r, ['walkSpeed', 'speed']) && (
                    <View className="speed-item">
                      <Text className="speed-label">当前速率</Text>
                      <View className="speed-value-row">
                        <Text className="speed-value speed-value-sky">{r.walkSpeed != null ? (r.walkSpeed / 10).toFixed(1) : '-'}</Text>
                        <Text className="speed-unit-inline">%</Text>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <View className={`speed-grid ${isBridgeModel ? 'speed-grid-3col' : 'speed-grid-2col'}`}>
                  {hasAnySupportedStatusField(r, ['walkSpeed', 'speed']) && (
                    <View className="speed-item">
                      <Text className="speed-label">{isTModel ? '履带速率' : '行走速率'}</Text>
                      <View className="speed-value-row">
                        <Text className="speed-value speed-value-sky">{r.walkSpeed != null ? (r.walkSpeed / 10).toFixed(1) : '-'}</Text>
                        <Text className="speed-unit-inline">%</Text>
                      </View>
                    </View>
                  )}
                  {hasAnySupportedStatusField(r, ['brushSpeed', 'brush_speed']) && (
                    <View className="speed-item">
                      <Text className="speed-label">{isTModel ? '主刷速率' : '滚刷速率'}</Text>
                      <View className="speed-value-row">
                        <Text className="speed-value speed-value-green">{r.brushSpeed != null ? (r.brushSpeed / 10).toFixed(1) : '-'}</Text>
                        <Text className="speed-unit-inline">%</Text>
                      </View>
                    </View>
                  )}
                  {/* 只有D11设备有跨桥功能 */}
                  {isBridgeModel && hasAnySupportedStatusField(r, ['bridgeSpeed', 'bridge_speed']) && (
                    <View className="speed-item">
                      <Text className="speed-label">跨桥</Text>
                      <View className="speed-value-row">
                        <Text className="speed-value speed-value-amber">{r.bridgeSpeed != null ? (r.bridgeSpeed / 10).toFixed(1) : '-'}</Text>
                        <Text className="speed-unit-inline">%</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {isTModel && (
            <View className="info-card">
              <View className="section-title">
                <View className="section-dot" />
                <Text>状态上报</Text>
              </View>
              {tStatusItems.length > 0 && (
                <View className="t-status-list">
                  {tStatusItems.map(item => (
                    <View key={item.key} className="t-status-item">
                      <Text className="t-status-label">{item.label}</Text>
                      <Text className="t-status-value">{item.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {!isTModel && (
            <>
              {/* 运行数据 */}
              <View className="info-card">
              <View className="section-title">
                <View className="section-dot" />
                <Text>运行数据</Text>
              </View>
              <View className="total-data-grid">
                  {runtimeStatusItems.map(item => (
                    <View key={item.key} className="total-data-item">
                      <Text className="total-data-label">{item.label}</Text>
                      <Text className={`total-data-value${item.mono ? ' total-data-value-mono' : ''}`}>{item.value}</Text>
                    </View>
                  ))}
              </View>
            </View>

            <View className="info-card">
              <View className="section-title">
                <View className="section-dot" />
                <Text>最近命令</Text>
              </View>
              <View className="total-data-grid">
                <View className="total-data-item">
                  <Text className="total-data-label">命令状态</Text>
                  <Text className="total-data-value">{getCommandStatusLabel(r.lastCommandStatus)}</Text>
                </View>
                <View className="total-data-item">
                  <Text className="total-data-label">命令编号</Text>
                  <Text className="total-data-value">
                    {r.lastCommandId ? r.lastCommandId.slice(-8) : '-'}
                  </Text>
                </View>
              </View>
            </View>

            {/* 快捷控制 - 横向滚动 */}
            {canShowQuickControls && (
              <View className="info-card">
                <View className="section-title">
                  <View className="section-dot" />
                  <Text>快捷控制</Text>
                </View>
                <View className="quick-control-grid">
                  {[
                    { label: '启动', value: 1 },
                    { label: '停止', value: 2 },
                    { label: '复位', value: 3 },
                    { label: '循环', value: 4 },
                    { label: '手动', value: 5 },
                  ].map((btn) => (
                    <Button
                      key={btn.value}
                      className={`quick-control-btn ${settings.runControl === btn.value ? 'quick-control-btn-active' : ''} ${isConfigLoading ? 'quick-control-btn-disabled' : ''}`}
                      disabled={isConfigLoading}
                      onClick={async () => {
                        setSettings(s => ({ ...s, runControl: btn.value }))

                        // 通过后端 API 发送控制命令（安全模式）
                        if (r) {
                          try {
                            // 快捷按钮同样走完整参数下发，避免交互帧覆盖/回退参数
                            const clientClickTimestamp = Date.now()
                            const apiConfig = {
                              ...buildApiConfig(btn.value),
                              quickAction: true,
                              clientClickTimestamp,
                            }
                            const result = await deviceControlService.sendCommand(apiConfig)
                            startCommandStatusPolling(apiConfig.deviceId, result.commandId, result.commandStatus)

                            if (result.success) {
                              showToast(`${btn.label}`)
                            } else {
                              showToast(`${btn.label} (失败)`)
                            }
                          } catch (error) {
                            showToast(`${btn.label} (失败)`)
                          }
                        } else {
                          showToast(`${btn.label}`)
                        }
                      }}
                    >
                      {btn.label}
                    </Button>
                  ))}
                </View>
              </View>
            )}
            </>
          )}

          {canOpenConsole && (
            <Button
              className="settings-entry-btn settings-entry-btn-t"
              onTouchStart={() => {
                void openTRailcarConsole(r.productId)
              }}
              onClick={() => {
                void openTRailcarConsole(r.productId)
              }}
              disabled={isOpeningConsole}
            >
              <Text className="settings-entry-simple-text">控制台</Text>
            </Button>
          )}

          {/* 进入设置 */}
          {canOpenSettings && (
            <Button
              className="settings-entry-btn"
              onClick={() => navigateTo('settings')}
            >
              <View className="settings-entry-content">
                <Settings />
                参数设置与数据下发
              </View>
              <ChevronRight />
            </Button>
          )}
        </View>
      </ScrollView>
    )
  }

  // ========== 设置页 ==========
  const SettingsPage = () => {
    const capabilityRobot = selectedRobot
    const update = (k: keyof Settings, v: any) => setSettings(s => ({ ...s, [k]: v }))
    const d12Serial = `${settings.productType}${settings.productId}`
    const normalizedBoundDeviceIds = normalizeD01BindingIds(settings.bindDeviceIds)
    const ownedD01Options = robots
      .filter(r => r.productType === '-D01' && !!r.productId)
      .map(r => ({
        label: `D01-${r.productId}`,
        value: `${r.productType}${r.productId}`,
      }))
    const availableD01Options = ownedD01Options.filter(opt => !normalizedBoundDeviceIds.includes(opt.value))
    const selectedPendingBindIndex = Math.max(0, availableD01Options.findIndex(opt => opt.value === pendingD01Binding))
    const d01LabelMap = ownedD01Options.reduce<Record<string, string>>((map, item) => {
      map[item.value] = item.label
      return map
    }, {})

    const handleBindD01 = async () => {
      if (settings.productType !== '-D12') return
      if (normalizedBoundDeviceIds.length >= 5) {
        showToast('最多绑定5台 D01')
        return
      }
      const d01Serial = pendingD01Binding || availableD01Options[0]?.value
      if (!d01Serial) {
        showToast('暂无可绑定 D01 设备')
        return
      }
      try {
        setIsBindingUpdating(true)
        const bindings = await vehicleService.bindD12Device(d12Serial, d01Serial)
        syncD12BindingState(d12Serial, bindings)
        setPendingD01Binding('')
        showToast('绑定成功')
      } catch (error: any) {
        console.error('[Settings Page] 绑定 D01 失败:', error)
        showToast('绑定失败: ' + (error?.message || '未知错误'))
      } finally {
        setIsBindingUpdating(false)
      }
    }

    const handleUnbindD01 = async (d01Serial: string) => {
      if (settings.productType !== '-D12') return
      const normalizedD01Serial = (d01Serial || '').trim()
      if (!normalizedD01Serial) {
        showToast('解绑失败: 无效设备编码')
        return
      }
      try {
        setIsBindingUpdating(true)
        console.log('[Settings Page] 准备解绑 D01:', {
          d12Serial,
          d01Serial: normalizedD01Serial,
          currentBindings: normalizedBoundDeviceIds,
        })
        const bindings = await vehicleService.unbindD12Device(d12Serial, normalizedD01Serial)
        console.log('[Settings Page] 解绑 D01 返回:', {
          d12Serial,
          d01Serial: normalizedD01Serial,
          bindings,
        })
        syncD12BindingState(d12Serial, bindings)
        setPendingD01Binding('')
        showToast('解绑成功')
      } catch (error: any) {
        console.error('[Settings Page] 解绑 D01 失败:', {
          d12Serial,
          d01Serial: normalizedD01Serial,
          error,
        })
        showToast('解绑失败: ' + (error?.message || '未知错误'))
      } finally {
        setIsBindingUpdating(false)
      }
    }

    const getPlanCycleText = (plan: DevicePlan) => {
      if (plan.isRepeat === 0) {
        return `单次执行 · ${plan.executeDate || '未设置日期'}`
      }

      if (plan.intervalUnit === 'week') {
        return `每 ${plan.intervalValue || 1} 周 · 周${plan.executeDays || '-'}`
      }

      if (plan.intervalUnit === 'month') {
        return `每 ${plan.intervalValue || 1} 月 · ${plan.executeDays || '-'}号`
      }

      return `每 ${plan.intervalValue || 1} 天循环执行`
    }

    const nextPlanTime = plans.length > 0
      ? [...plans]
        .map(plan => plan.executeTime || '99:99')
        .sort((a, b) => a.localeCompare(b))[0]
      : '--:--'

    const settingsTabs = [
      { id: 'basic' as const, label: '基本', visible: true },
      {
        id: 'range' as const,
        label: '范围',
        visible: (settings.productType === '-D12' || settings.productType === '-T12')
          && (
            hasAnySupportedAction(capabilityRobot, ['BIND_DEVICE', 'UNBIND_DEVICE'])
            || hasAnySupportedParam(capabilityRobot, [
              'bindDeviceIds',
              'leftRowStart',
              'leftRowEnd',
              'rightRowStart',
              'rightRowEnd',
              'maxRowCount',
            ])
          ),
      },
      {
        id: 'detect' as const,
        label: '检测',
        visible: hasAnySupportedParam(capabilityRobot, [
          'edgeDelay',
          'bridgeTime',
          'errorReturnTime',
          'batteryLowLimit',
          'robotInPositionTime',
          'limitPositionCheckTime',
          'walkPositionCheckTime',
        ]),
      },
      {
        id: 'time' as const,
        label: '定时',
        visible: hasAnySupportedParam(capabilityRobot, [
          'workWay',
          'time1',
          'time2',
          'time3',
          'time4',
        ]),
      },
    ].filter(tab => tab.visible)

    const canConfigureEnableMode = hasAnySupportedParam(capabilityRobot, ['enableMode'])
    const canManageBindings = hasAnySupportedAction(capabilityRobot, ['BIND_DEVICE', 'UNBIND_DEVICE'])
    const canConfigureWalkSpeed = hasAnySupportedParam(capabilityRobot, ['walkSpeed', 'speed'])
    const canConfigureBrushSpeed = hasAnySupportedParam(capabilityRobot, ['brushSpeed', 'brush_speed'])
    const canConfigureBridgeSpeed = hasAnySupportedParam(capabilityRobot, ['bridgeSpeed', 'bridge_speed'])
    const canConfigureWalkFastSpeed = hasAnySupportedParam(capabilityRobot, ['walkFastSpeed'])
    const canConfigureWalkSlowSpeed = hasAnySupportedParam(capabilityRobot, ['walkSlowSpeed'])
    const canConfigureMaxRowCount = hasAnySupportedParam(capabilityRobot, ['maxRowCount'])

    const openCreateTimingModal = () => {
      setEditingPlan({ isRepeat: 1, intervalUnit: 'day', intervalValue: 1, executeTime: '08:00' })
      setPlanRepeatTab('repeat')
      setShowPlanModal(true)
    }

    return (
      <View className="settings-page">
        <View className="settings-header">
          <Button className="back-btn" onClick={() => {
            // 返回时取消编辑标记
            setIsEditingSettings(false)
            navigateTo('detail')
          }}>
            <Back />
          </Button>
          <Text className="settings-title">参数设置</Text>
        </View>

        <View className="settings-tabs">
          {settingsTabs.map(t => (
            <Button
              key={t.id}
              className={`settings-tab ${settingsTab === t.id ? 'settings-tab-active' : ''}`}
              onClick={() => setSettingsTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </View>

        <ScrollView className="settings-content" scrollY={true}>
          {settingsTab === 'basic' && (
            <View className="settings-section">
              <View className="section-title">
                <View className="section-dot" />
                <Text>基本设置</Text>
              </View>
              <View className="control-console control-console-basic">
                <View className="control-console-head">
                  <View className="control-console-title-wrap">
                    <Text className="control-console-eyebrow">BASIC</Text>
                    <Text className="control-console-title">控制台参数面板</Text>
                  </View>
                  <View className="control-console-badge">
                    <Text className="control-console-badge-label">DEVICE</Text>
                    <Text className="control-console-badge-value">{`${settings.productType}${settings.productId}`}</Text>
                  </View>
                </View>
                <View className="control-console-body">
                  <View className="form-row">
                    <View className="form-group form-group-half">
                      <Text className="form-label">产品型号</Text>
                      <View className="form-input form-input-readonly">
                        <Text className="form-readonly-text">{productTypeOptions.find(o => o.value === settings.productType)?.label || settings.productType}</Text>
                      </View>
                    </View>
                    <View className="form-group form-group-half">
                      <Text className="form-label">产品编号</Text>
                      <Input
                        className="form-input form-input-readonly"
                        value={settings.productId}
                        disabled={true}
                        maxlength={6}
                      />
                    </View>
                  </View>
                  {settings.productType !== '-D12' && settings.productType !== '-T12' && canConfigureEnableMode && (
                    <>
                      <View className="form-group">
                        <Text className="form-label">运动使能</Text>
                        <Picker
                          mode="selector"
                          range={runEnableOptions}
                          rangeKey="label"
                          value={runEnableOptions.findIndex(o => o.value === settings.runEnable)}
                          onChange={(e) => {
                            update('runEnable', runEnableOptions[e.detail.value].value)
                            isInputFocusedRef.current = false
                          }}
                        >
                          <View
                            className="form-picker"
                            onClick={() => {
                              isInputFocusedRef.current = true
                            }}
                          >
                            {runEnableOptions.find(o => o.value === settings.runEnable)?.label}
                          </View>
                        </Picker>
                      </View>
                    </>
                  )}
                  {(settings.productType === '-D12' || settings.productType === '-T12') && (
                    <>
                      {canConfigureEnableMode && (
                        <View className="form-group">
                          <Text className="form-label">运行使能</Text>
                          <Picker
                            mode="selector"
                            range={d12WorkWayOptions}
                            rangeKey="label"
                            value={Math.max(0, d12WorkWayOptions.findIndex(o => o.value === settings.runEnable))}
                            onChange={(e) => {
                              update('runEnable', d12WorkWayOptions[e.detail.value].value)
                              isInputFocusedRef.current = false
                            }}
                          >
                            <View
                              className="form-picker"
                              onClick={() => {
                                isInputFocusedRef.current = true
                              }}
                            >
                              {d12WorkWayOptions.find(o => o.value === settings.runEnable)?.label || '无效'}
                            </View>
                          </Picker>
                        </View>
                      )}
                      {canManageBindings && (
                        <View className="form-group">
                          <Text className="form-label">绑定状态</Text>
                          <View className="form-input form-input-readonly">
                            <Text className="form-readonly-text">
                              {settings.bindStatus > 0 ? `已绑定(${settings.bindStatus})` : '未绑定'}
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                  {/* 速度设置 */}
                  {(settings.productType === '-D12' || settings.productType === '-T12') ? (
                    (canConfigureWalkFastSpeed || canConfigureWalkSlowSpeed) && <View className="form-row">
                      {canConfigureWalkFastSpeed && <View className="form-group form-group-half">
                        <Text className="form-label">行走快速度 (%)</Text>
                        <Input
                          type="digit"
                          className="form-input"
                          key={`walkFastSpeed-${settings.walkFastSpeed}`}
                          defaultValue={((settings.walkFastSpeed ?? 800) / 10).toFixed(1)}
                          onFocus={() => { isInputFocusedRef.current = true }}
                          onBlur={(e) => {
                            const v = parseFloat(e.detail.value)
                            update('walkFastSpeed', isNaN(v) || v < 0 ? 0 : v > 100 ? 1000 : Math.round(v * 10))
                            setIsEditingSettings(false)
                            isInputFocusedRef.current = false
                          }}
                        />
                      </View>}
                      {canConfigureWalkSlowSpeed && <View className="form-group form-group-half">
                        <Text className="form-label">行走慢速度 (%)</Text>
                        <Input
                          type="digit"
                          className="form-input"
                          key={`walkSlowSpeed-${settings.walkSlowSpeed}`}
                          defaultValue={((settings.walkSlowSpeed ?? 400) / 10).toFixed(1)}
                          onFocus={() => { isInputFocusedRef.current = true }}
                          onBlur={(e) => {
                            const v = parseFloat(e.detail.value)
                            update('walkSlowSpeed', isNaN(v) || v < 0 ? 0 : v > 100 ? 1000 : Math.round(v * 10))
                            setIsEditingSettings(false)
                            isInputFocusedRef.current = false
                          }}
                        />
                      </View>}
                    </View>
                  ) : (
                    <>
                      {(canConfigureWalkSpeed || canConfigureBrushSpeed) && <View className="form-row">
                        {canConfigureWalkSpeed && <View className="form-group form-group-half">
                          <Text className="form-label">行走速度 (%)</Text>
                          <Input
                            type="digit"
                            className="form-input"
                            key={`walkSpeed-${settings.walkSpeed}`}
                            defaultValue={((settings.walkSpeed || 0) / 10).toFixed(1)}
                            onFocus={() => { isInputFocusedRef.current = true }}
                            onBlur={(e) => {
                              const v = parseFloat(e.detail.value)
                              update('walkSpeed', isNaN(v) || v < 0 ? 0 : v > 100 ? 1000 : Math.round(v * 10))
                              setIsEditingSettings(false)
                              isInputFocusedRef.current = false
                            }}
                          />
                        </View>}
                        {canConfigureBrushSpeed && <View className="form-group form-group-half">
                          <Text className="form-label">刷子速度 (%)</Text>
                          <Input
                            type="digit"
                            className="form-input"
                            key={`brushSpeed-${settings.brushSpeed}`}
                            defaultValue={((settings.brushSpeed || 0) / 10).toFixed(1)}
                            onFocus={() => { isInputFocusedRef.current = true }}
                            onBlur={(e) => {
                              const v = parseFloat(e.detail.value)
                              update('brushSpeed', isNaN(v) || v < 0 ? 0 : v > 100 ? 1000 : Math.round(v * 10))
                              setIsEditingSettings(false)
                              isInputFocusedRef.current = false
                            }}
                          />
                        </View>}
                      </View>}
                      {settings.productType === '-D11' && canConfigureBridgeSpeed && (
                        <View className="form-group">
                          <Text className="form-label">桥梁速度 (%)</Text>
                          <Input
                            type="digit"
                            className="form-input"
                            key={`bridgeSpeed-${settings.bridgeSpeed}`}
                            defaultValue={((settings.bridgeSpeed || 0) / 10).toFixed(1)}
                            onFocus={() => { isInputFocusedRef.current = true }}
                            onBlur={(e) => {
                              const v = parseFloat(e.detail.value)
                              update('bridgeSpeed', isNaN(v) || v < 0 ? 0 : v > 100 ? 1000 : Math.round(v * 10))
                              setIsEditingSettings(false)
                              isInputFocusedRef.current = false
                            }}
                          />
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* D12 绑定与范围设置 */}
          {settingsTab === 'range' && (settings.productType === '-D12' || settings.productType === '-T12') && (
            <View className="settings-section">
              <View className="section-title">
                <View className="section-dot" />
                <Text>绑定与范围设置</Text>
              </View>
              {settings.productType === '-D12' && canManageBindings && (
                <View className="binding-console">
                  <View className="binding-console-head">
                    <View className="binding-console-title-wrap">
                      <Text className="binding-console-eyebrow">D12 X D01</Text>
                      <Text className="binding-console-title">编组控制面板</Text>
                    </View>
                    <View className="binding-console-counter">
                      <Text className="binding-console-counter-value">{normalizedBoundDeviceIds.length}</Text>
                      <Text className="binding-console-counter-unit">/5</Text>
                    </View>
                  </View>

                  <View className="binding-status-rail">
                    <View className="binding-status-track">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <View
                          key={`bind-slot-${idx}`}
                          className={`binding-status-slot ${idx < normalizedBoundDeviceIds.length ? 'binding-status-slot-active' : ''}`}
                        />
                      ))}
                    </View>
                    <Text className="binding-status-tip">信息识别码低字节按绑定数量自动下发</Text>
                  </View>

                  <View className="binding-block">
                    <Text className="form-label">已绑定 D01 小车</Text>
                    {normalizedBoundDeviceIds.length === 0 ? (
                      <View className="binding-empty">
                        <Text className="binding-empty-title">暂无绑定设备</Text>
                        <Text className="form-hint">当前未绑定 D01 设备</Text>
                      </View>
                    ) : (
                      normalizedBoundDeviceIds.map(serial => (
                        <View key={serial} className="binding-item-row">
                          <View className="binding-item-main">
                            <Text className="binding-item-label">{d01LabelMap[serial] || serial}</Text>
                            <Text className="binding-item-code">{serial}</Text>
                          </View>
                          <Button
                            className="binding-remove-btn"
                            disabled={isBindingUpdating}
                            onClick={() => handleUnbindD01(serial)}
                          >
                            解绑
                          </Button>
                        </View>
                      ))
                    )}
                  </View>

                  <View className="binding-block">
                    <Text className="form-label">新增绑定 D01</Text>
                    <View className="binding-picker-shell">
                      <Picker
                        mode="selector"
                        range={availableD01Options}
                        rangeKey="label"
                        value={selectedPendingBindIndex}
                        disabled={availableD01Options.length === 0}
                        onChange={(e) => {
                          const option = availableD01Options[e.detail.value]
                          setPendingD01Binding(option?.value || '')
                          isInputFocusedRef.current = false
                        }}
                      >
                        <View
                          className="form-picker binding-picker"
                          onClick={() => {
                            isInputFocusedRef.current = true
                          }}
                        >
                          {availableD01Options.length === 0
                            ? '无可绑定 D01 设备'
                            : (availableD01Options[selectedPendingBindIndex]?.label || '选择 D01 设备')}
                        </View>
                      </Picker>
                      <Button
                        className={`binding-add-btn ${availableD01Options.length === 0 ? 'binding-add-btn-disabled' : ''}`}
                        disabled={isBindingUpdating || availableD01Options.length === 0}
                        onClick={handleBindD01}
                      >
                        {isBindingUpdating ? '处理中...' : '添加绑定'}
                      </Button>
                    </View>
                    <Text className="form-hint binding-group-note">仅支持绑定当前账号已拥有的 D01 设备</Text>
                  </View>
                </View>
              )}
              {canConfigureMaxRowCount && (
                <View className="form-group">
                  <Text className="form-label">工作区域最大排数量</Text>
                  <Input
                    type="number"
                    className="form-input"
                    defaultValue={String(settings.maxRowCount || 25)}
                    onFocus={() => {
                      isInputFocusedRef.current = true
                    }}
                    onBlur={(e) => {
                      const value = Math.max(1, Math.min(99, parseInt(e.detail.value, 10) || 25))
                      update('maxRowCount', value)
                      update('waitStopRowPosition', value)
                      setIsEditingSettings(false)
                      isInputFocusedRef.current = false
                    }}
                  />
                  <Text className="form-hint">范围: 1-99</Text>
                </View>
              )}
            </View>
          )}

          {settingsTab === 'detect' && (
            <View className="settings-section">
              <View className="section-title">
                <View className="section-dot" />
                <Text>检测设置</Text>
              </View>
              <View className="control-console control-console-detect">
                <View className="control-console-head">
                  <View className="control-console-title-wrap">
                    <Text className="control-console-eyebrow">DETECT</Text>
                    <Text className="control-console-title">检测链路控制台</Text>
                  </View>
                  <View className="control-console-badge">
                    <Text className="control-console-badge-label">MODE</Text>
                    <Text className="control-console-badge-value">{settings.productType}</Text>
                  </View>
                </View>
                <View className="control-console-body control-console-body-tight">
                  {settings.productType === '-D12' || settings.productType === '-T12' ? (
                    // D12 接驳车检测设置
                    [
                      {
                        key: 'robotInPositionTime' as const,
                        supportedParams: ['robotInPositionTime'],
                        label: '机器人在位判断时间',
                        unit: 'ms',
                        range: '0-1000',
                        displayValue: (v: number) => String(v ?? 500),
                        parseValue: (v: string) => parseInt(v) || 500
                      },
                      {
                        key: 'limitPositionCheckTime' as const,
                        supportedParams: ['limitPositionCheckTime'],
                        label: '极限位检时间',
                        unit: 'ms',
                        range: '0-1000',
                        displayValue: (v: number) => String(v ?? 500),
                        parseValue: (v: string) => parseInt(v) || 500
                      },
                      {
                        key: 'walkPositionCheckTime' as const,
                        supportedParams: ['walkPositionCheckTime'],
                        label: '行走到位检时间',
                        unit: 'ms',
                        range: '0-1000',
                        displayValue: (v: number) => String(v ?? 500),
                        parseValue: (v: string) => parseInt(v) || 500
                      },
                      {
                        key: 'heartbeat' as const,
                        supportedParams: ['heartbeat'],
                        label: '心跳脉冲',
                        unit: 's',
                        range: '0-99.99',
                        displayValue: (v: number) => ((v ?? 0) / 100).toFixed(2),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 0) * 100)
                      },
                      {
                        key: 'batteryLowLimit' as const,
                        supportedParams: ['batteryLowLimit'],
                        label: '电池低电量警戒线',
                        unit: '%',
                        range: '0-100.0',
                        displayValue: (v: number) => ((v ?? 50) / 10).toFixed(1),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 5) * 10)
                      },
                    ].filter(item => hasAnySupportedParam(capabilityRobot, item.supportedParams)).map(item => {
                      const currentValue = (settings as any)[item.key]
                      return (
                        <View key={item.key} className="form-group control-field-panel">
                          <Text className="form-label">{item.label}</Text>
                          <View className="form-input-row">
                            <Input
                              type="digit"
                              className="form-input form-input-flex"
                              defaultValue={item.displayValue(currentValue)}
                              onFocus={() => {
                                isInputFocusedRef.current = true
                              }}
                              onBlur={(e) => {
                                update(item.key, item.parseValue(e.detail.value))
                                setIsEditingSettings(false)
                                isInputFocusedRef.current = false
                              }}
                            />
                            <Text className="form-unit">{item.unit}</Text>
                          </View>
                          <Text className="form-hint">范围: {item.range}</Text>
                        </View>
                      )
                    })
                  ) : (
                    // 标准设备检测设置
                    [
                      {
                        key: 'edgeDetectDelay' as const,
                        supportedParams: ['edgeDelay'],
                        label: '到边检测控制时间',
                        unit: 's',
                        range: '0~99.99s (0.01s=10ms)',
                        displayValue: (v: number) => ((v ?? 0) / 100).toFixed(2),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 0) * 100)
                      },
                      {
                        key: 'bridgeDetectTime' as const,
                        supportedParams: ['bridgeTime'],
                        label: '跨桥检测时间',
                        unit: 's',
                        range: '0-999.999',
                        displayValue: (v: number) => ((v ?? 0) / 1000).toFixed(3),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 0) * 1000),
                        showForD11Only: true
                      },
                      {
                        key: 'errorReturnTime' as const,
                        supportedParams: ['errorReturnTime'],
                        label: '纠错校正长度控制设置',
                        unit: 'm',
                        range: '0-99.99m',
                        displayValue: (v: number) => ((v ?? 0) / 100).toFixed(2),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 0) * 100)
                      },
                      {
                        key: 'heartbeat' as const,
                        supportedParams: ['heartbeat'],
                        label: '心跳脉冲',
                        unit: 's',
                        range: '0-99.99',
                        displayValue: (v: number) => ((v ?? 0) / 100).toFixed(2),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 0) * 100)
                      },
                      {
                        key: 'batteryLowLimit' as const,
                        supportedParams: ['batteryLowLimit'],
                        label: '电池低电量警戒线',
                        unit: '%',
                        range: '0-100.0',
                        displayValue: (v: number) => ((v ?? 50) / 10).toFixed(1),
                        parseValue: (v: string) => Math.round((parseFloat(v) || 5) * 10)
                      },
                    ].filter(item => {
                      if (item.showForD11Only && settings.productType !== '-D11') {
                        return false
                      }
                      return hasAnySupportedParam(capabilityRobot, item.supportedParams)
                    }).map(item => (
                      <View key={item.key} className="form-group control-field-panel">
                        <Text className="form-label">{item.label}</Text>
                        <View className="form-input-row">
                          <Input
                            type="digit"
                            className="form-input form-input-flex"
                            defaultValue={item.displayValue(settings[item.key])}
                            placeholder={item.displayValue(settings[item.key])}
                            onFocus={() => {
                              isInputFocusedRef.current = true
                            }}
                            onBlur={(e) => {
                              update(item.key, item.parseValue(e.detail.value))
                              setIsEditingSettings(false)
                              isInputFocusedRef.current = false
                            }}
                            onConfirm={(e) => {
                              update(item.key, item.parseValue(e.detail.value))
                              setIsEditingSettings(false)
                              isInputFocusedRef.current = false
                            }}
                          />
                          <Text className="form-unit">{item.unit}</Text>
                        </View>
                        <Text className="form-hint">范围: {item.range}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>
          )}

          {settingsTab === 'time' && (
            <View className="settings-section plan-section">
              <View className="section-title">
                <View className="section-dot" />
                <Text>定时</Text>
              </View>

              <View className="plan-hero">
                <View className="plan-hero-stats">
                  <View className="plan-stat">
                    <Text className="plan-stat-label">总数</Text>
                    <Text className="plan-stat-value">{plans.length}</Text>
                  </View>
                  <View className="plan-stat">
                    <Text className="plan-stat-label">最近</Text>
                    <Text className="plan-stat-value plan-stat-value-time">{nextPlanTime}</Text>
                  </View>
                </View>
              </View>

              <View className="plan-list-shell">
                {plans.length === 0 ? (
                  <View className="empty-plans">
                    <Text className="empty-plans-title">暂无定时</Text>
                  </View>
                ) : (
                  <View className="plans-list">
                    {plans.map(plan => (
                      <View key={plan.id} className="plan-card">
                        <View className="plan-card-top">
                          <View className="plan-time-block">
                            <Text className="plan-time">{plan.executeTime || '--:--'}</Text>
                            <Text className="plan-time-label">时间</Text>
                          </View>
                          <View className={`plan-kind-tag ${plan.isRepeat === 0 ? 'plan-kind-tag-once' : 'plan-kind-tag-repeat'}`}>
                            {plan.isRepeat === 0 ? '单次' : '循环'}
                          </View>
                        </View>

                        <View className="plan-card-middle">
                          <Text className="plan-freq">{getPlanCycleText(plan)}</Text>
                        </View>

                        <View className="plan-card-bottom">
                          <Button className="plan-edit-btn" onClick={() => {
                            setEditingPlan({ ...plan })
                            setPlanRepeatTab(plan.isRepeat === 0 ? 'once' : 'repeat')
                            setShowPlanModal(true)
                          }}>编辑</Button>
                          <Button className="plan-delete-btn" onClick={async () => {
                            Taro.showModal({
                              title: '提示',
                              content: '确定要删除该定时吗？',
                              success: async (res) => {
                                if (res.confirm && plan.id) {
                                  await devicePlanService.deletePlan(plan.id)
                                  fetchPlans(selectedRobot?.productType + '' + selectedRobot?.productId)
                                }
                              }
                            })
                          }}>删除</Button>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Button className="plan-fab-btn" onClick={openCreateTimingModal}>
                  <Text className="plan-fab-icon">+</Text>
                </Button>
              </View>
            </View>
          )}

          {/* 计划编辑弹窗 */}
          {showPlanModal && (
            <View className="modal-overlay plan-modal-overlay">
              <View className="modal-content plan-modal plan-modal-content">
                <View className="modal-header plan-modal-header">
                  <View className="plan-modal-title-wrap">
                    <Text className="modal-title plan-modal-title">{editingPlan.id ? '编辑定时' : '新增定时'}</Text>
                  </View>
                  <View className="modal-close" onClick={() => setShowPlanModal(false)}>×</View>
                </View>

                <ScrollView scrollY enableFlex className="modal-body plan-form-scroll">
                  <View className="form-group plan-field-emphasis">
                    <Text className="form-label">定时时间</Text>
                    <Picker
                      mode="time"
                      value={editingPlan.executeTime || '08:00'}
                      onChange={(e) => setEditingPlan({ ...editingPlan, executeTime: e.detail.value })}
                    >
                      <View className="form-input form-input-readonly plan-input-highlight">
                        {editingPlan.executeTime || '08:00'}
                      </View>
                    </Picker>
                  </View>

                  {/* 频率切换: 重复 vs 单次 */}
                  <View className="plan-tabs">
                    <View
                      className={`plan-tab ${planRepeatTab === 'repeat' ? 'active' : ''}`}
                      onClick={() => { setPlanRepeatTab('repeat'); setEditingPlan({ ...editingPlan, isRepeat: 1 }) }}
                    >循环</View>
                    <View
                      className={`plan-tab ${planRepeatTab === 'once' ? 'active' : ''}`}
                      onClick={() => { setPlanRepeatTab('once'); setEditingPlan({ ...editingPlan, isRepeat: 0 }) }}
                    >单次</View>
                  </View>

                  {planRepeatTab === 'once' && (
                    <View className="form-group">
                      <Text className="form-label">执行日期</Text>
                      <Picker
                        mode="date"
                        value={editingPlan.executeDate || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setEditingPlan({ ...editingPlan, executeDate: e.detail.value })}
                      >
                        <View className="form-input form-input-readonly">
                          {editingPlan.executeDate || new Date().toISOString().split('T')[0]}
                        </View>
                      </Picker>
                    </View>
                  )}

                  {planRepeatTab === 'repeat' && (
                    <View className="repeat-settings">
                      <View className="form-row">
                        <View className="form-group form-group-half">
                          <Text className="form-label">频率单位</Text>
                          <Picker
                            mode="selector"
                            range={[
                              { label: '每天', value: 'day' },
                              { label: '每周', value: 'week' },
                              { label: '每月', value: 'month' }
                            ]}
                            rangeKey="label"
                            value={['day', 'week', 'month'].indexOf(editingPlan.intervalUnit || 'day')}
                            onChange={(e) => {
                              const units: ('day' | 'week' | 'month')[] = ['day', 'week', 'month']
                              setEditingPlan({ ...editingPlan, intervalUnit: units[e.detail.value] })
                            }}
                          >
                            <View className="form-input form-input-readonly">
                              {editingPlan.intervalUnit === 'month' ? '每月' : editingPlan.intervalUnit === 'week' ? '每周' : '每天'}
                            </View>
                          </Picker>
                        </View>
                        <View className="form-group form-group-half">
                          <Text className="form-label">间隔数值</Text>
                          <Input
                            type="number"
                            className="form-input"
                            defaultValue={String(editingPlan.intervalValue || 1)}
                            onFocus={() => { isInputFocusedRef.current = true }}
                            onBlur={(e) => {
                              const v = parseInt(e.detail.value, 10)
                              setEditingPlan({ ...editingPlan, intervalValue: v > 0 ? v : 1 })
                              isInputFocusedRef.current = false
                            }}
                          />
                        </View>
                      </View>

                      {editingPlan.intervalUnit === 'week' && (
                        <View className="form-group">
                          <Text className="form-label">执行日 (多选)</Text>
                          <View className="week-days-selector">
                            {['1', '2', '3', '4', '5', '6', '7'].map(d => {
                              const labels = ['一', '二', '三', '四', '五', '六', '日']
                              const isSelected = (editingPlan.executeDays || '').split(',').includes(d)
                              return (
                                <View
                                  key={d}
                                  className={`day-btn ${isSelected ? 'selected' : ''}`}
                                  onClick={() => {
                                    let days = (editingPlan.executeDays || '').split(',').filter(Boolean)
                                    if (days.includes(d)) days = days.filter(x => x !== d)
                                    else days.push(d)
                                    setEditingPlan({ ...editingPlan, executeDays: days.sort().join(',') })
                                  }}
                                >
                                  {labels[parseInt(d) - 1]}
                                </View>
                              )
                            })}
                          </View>
                        </View>
                      )}

                      {editingPlan.intervalUnit === 'month' && (
                        <View className="form-group">
                          <Text className="form-label">执行号数 (多选 例:1,15)</Text>
                          <Input
                            className="form-input"
                            value={editingPlan.executeDays || ''}
                            placeholder="逗号分隔，例如 1,15,30"
                            onInput={(e) => setEditingPlan({ ...editingPlan, executeDays: e.detail.value })}
                          />
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>

                <View className="modal-footer plan-modal-footer">
                  <Button className="cancel-btn plan-cancel-btn" onClick={() => setShowPlanModal(false)}>取消</Button>
                  <Button className="confirm-btn plan-confirm-btn" loading={isPlanSaving} onClick={async () => {
                    if (planRepeatTab === 'once' && !editingPlan.executeDate) {
                      Taro.showToast({ title: '请选择日期', icon: 'none' }); return
                    }
                    if (planRepeatTab === 'repeat' && ['week', 'month'].includes(editingPlan.intervalUnit || '') && !editingPlan.executeDays) {
                      Taro.showToast({ title: '请选择执行天数/号数', icon: 'none' }); return
                    }
                    try {
                      setIsPlanSaving(true)
                      const payload = { ...editingPlan, deviceId: selectedRobot?.productType + '' + selectedRobot?.productId }
                      if (payload.id) {
                        await devicePlanService.updatePlan(payload.id, payload)
                      } else {
                        await devicePlanService.addPlan(payload as DevicePlan)
                      }
                      setShowPlanModal(false)
                      fetchPlans(payload.deviceId)
                      Taro.showToast({ title: '保存成功', icon: 'success' })
                    } catch (e) {
                      Taro.showToast({ title: '保存失败', icon: 'error' })
                    } finally {
                      setIsPlanSaving(false)
                    }
                  }}>
                    保存定时
                  </Button>
                </View>
              </View>
            </View>
          )}

          {/* 底部发送区 - 移到ScrollView内部 */}
          {settingsTab !== 'time' && (
            <View className="settings-footer">
              {/* 隐藏70字节协议预览 */}
              {/* <View className="hex-display">
                <Text className="hex-text">{generateHex()}</Text>
              </View> */}
              <Button
                className={`send-btn ${isSending || isConfigLoading ? 'send-btn-disabled' : 'send-btn-active'}`}
                onClick={handleSend}
                disabled={isSending || isConfigLoading}
              >
                {isConfigLoading ? (
                  <>
                    <View className="loading-spinner" />
                    <Text>加载参数中...</Text>
                  </>
                ) : isSending ? (
                  <>
                    <View className="loading-spinner" />
                    <Text>下发中...</Text>
                  </>
                ) : (
                  <>
                    <Send />
                    <Text>保存并下发</Text>
                  </>
                )}
              </Button>
            </View>
          )}
        </ScrollView>
      </View>
    )
  }

  // ========== 统计页 ==========
  // ========== 我的页面 ==========
  const ProfilePage = () => {
    const onlineCount = robots.filter(r => r.online === true).length
    const runningCount = robots.filter(r => r.status === 'running').length
    const totalMileage = robots.reduce((sum, r) => sum + (r.mileageTotal || 0), 0)
    const userName = currentUser?.realName || currentUser?.username || '用户'
    const userRole = currentUser?.roleName || '普通用户'
    const userInitial = userName.charAt(0).toUpperCase()

    return (
      <ScrollView className="profile-page" scrollY={true}>
        <View className="profile-content">
          <View className="profile-hero">
            <Text className="profile-hero-kicker">ACCOUNT CENTER</Text>
            <View className="profile-header">
              <View className="profile-avatar">
                <View className="avatar-placeholder avatar-logged-in">
                  <Text className="avatar-text">{userInitial}</Text>
                </View>
              </View>
              <Text className="profile-username">{userName}</Text>
              <Text className="profile-email">{userRole}</Text>
            </View>
            <View className="profile-quick-stats">
              <View className="profile-quick-stat">
                <Text className="profile-quick-stat-label">设备总数</Text>
                <Text className="profile-quick-stat-value">{robots.length}</Text>
              </View>
              <View className="profile-quick-stat profile-quick-stat-online">
                <Text className="profile-quick-stat-label">在线设备</Text>
                <Text className="profile-quick-stat-value">{onlineCount}</Text>
              </View>
              <View className="profile-quick-stat profile-quick-stat-running">
                <Text className="profile-quick-stat-label">运行中</Text>
                <Text className="profile-quick-stat-value">{runningCount}</Text>
              </View>
              <View className="profile-quick-stat profile-quick-stat-mileage">
                <Text className="profile-quick-stat-label">累计里程</Text>
                <Text className="profile-quick-stat-value">
                  {totalMileage.toFixed(1)}
                  <Text className="profile-quick-stat-unit"> km</Text>
                </Text>
              </View>
            </View>
          </View>

          {/* 功能菜单 */}
          <View className="profile-menu">
            <View className="menu-section">
              <View className="menu-item" onClick={() => {
                setSelectedDeviceFamily(null)
                setSearchKeyword('')
                navigateTo('home')
              }}>
                <View className="menu-item-left">
                  <View className="menu-icon">
                    <Home />
                  </View>
                  <View className="menu-text-wrap">
                    <Text className="menu-text">我的设备</Text>
                    <Text className="menu-subtext">设备清单与远程控制</Text>
                  </View>
                </View>
                <View className="menu-item-right">
                  <Text className="menu-badge">{robots.length}</Text>
                  <View className="menu-chevron"><ChevronRight /></View>
                </View>
              </View>
              <View className="menu-item" onClick={() => navigateTo('stats')}>
                <View className="menu-item-left">
                  <View className="menu-icon">
                    <Bell />
                  </View>
                  <View className="menu-text-wrap">
                    <Text className="menu-text">报警记录</Text>
                    <Text className="menu-subtext">设备异常与报警信息查看</Text>
                  </View>
                </View>
                <View className="menu-chevron"><ChevronRight /></View>
              </View>
            </View>

            <View className="menu-section">
              <View className="menu-item" onClick={() => setShowHelpModal(true)}>
                <View className="menu-item-left">
                  <View className="menu-icon">
                    <Text className="menu-icon-text">?</Text>
                  </View>
                  <View className="menu-text-wrap">
                    <Text className="menu-text">帮助中心</Text>
                    <Text className="menu-subtext">快速查看常见操作问题</Text>
                  </View>
                </View>
                <View className="menu-chevron"><ChevronRight /></View>
              </View>
              <View className="menu-item" onClick={() => setShowAboutModal(true)}>
                <View className="menu-item-left">
                  <View className="menu-icon">
                    <Text className="menu-icon-text">!</Text>
                  </View>
                  <View className="menu-text-wrap">
                    <Text className="menu-text">关于我们</Text>
                    <Text className="menu-subtext">产品信息与版本说明</Text>
                  </View>
                </View>
                <View className="menu-chevron"><ChevronRight /></View>
              </View>
            </View>

            {/* 登出按钮 */}
            <View className="menu-section menu-section-logout">
              <Text className="profile-logout-hint">切换账号或结束当前会话</Text>
              <Button className="profile-logout-btn" onClick={handleLogout}>
                <Text className="profile-logout-text">退出登录</Text>
              </Button>
            </View>
          </View>
        </View>
      </ScrollView>
    )
  }

  const StatsPage = () => {
    type AlarmSeverity = 'critical' | 'warning' | 'info'
    type AlarmStatus = 'unhandled' | 'handled' | 'ignored'
    interface AlarmItem {
      id: string
      deviceId: string
      severity: AlarmSeverity
      type: string
      description: string
      time: string
      status: AlarmStatus
    }

    const PLACEHOLDER_ALARMS: AlarmItem[] = [
      { id: '1', deviceId: '-D01250001', severity: 'critical', type: '电量严重不足', description: '设备电量低于 10%，请立即充电', time: '今日 09:32', status: 'unhandled' },
      { id: '2', deviceId: '-D12250001', severity: 'warning',  type: '设备离线超时', description: '超过 30 分钟未收到心跳数据', time: '今日 08:15', status: 'unhandled' },
      { id: '3', deviceId: '-D01250003', severity: 'warning',  type: '连续故障上报', description: '故障码持续上报，请检查设备', time: '今日 07:50', status: 'unhandled' },
      { id: '4', deviceId: '-D11250001', severity: 'warning',  type: '电量不足',     description: '设备电量低于 20%', time: '昨日 17:22', status: 'handled' },
      { id: '5', deviceId: '-D01250002', severity: 'info',     type: '固件版本过低', description: '建议升级至最新固件版本', time: '昨日 15:44', status: 'handled' },
      { id: '6', deviceId: '-D12250001', severity: 'critical', type: 'MQTT 连接异常', description: '设备多次重连失败，请检查网络', time: '2天前', status: 'ignored' },
      { id: '7', deviceId: '-D01250001', severity: 'info',     type: '首次上线',     description: '设备首次接入系统，已自动注册', time: '3天前', status: 'handled' },
    ]

    const severityFilter = alarmSeverityFilter
    const statusFilter = alarmStatusFilter
    const setStatusFilter = setAlarmStatusFilter

    const filtered = PLACEHOLDER_ALARMS.filter(a =>
      (severityFilter === 'all' || a.severity === severityFilter) &&
      (statusFilter === 'all' || a.status === statusFilter)
    )

    const unhandledCount = PLACEHOLDER_ALARMS.filter(a => a.status === 'unhandled').length

    const statusLabel: Record<AlarmStatus, string> = { unhandled: '未处理', handled: '已处理', ignored: '已忽略' }

    const statusOptions = [
      { key: 'all'       as const, label: '全部' },
      { key: 'unhandled' as const, label: '未处理' },
      { key: 'handled'   as const, label: '已处理' },
      { key: 'ignored'   as const, label: '已忽略' },
    ]

    return (
      <ScrollView className="am-page" scrollY={true}>

        {/* Header：标题 + 未处理数量 */}
        <View className="am-header">
          <View className="am-header-left">
            <Text className="am-kicker">ALARM MONITOR</Text>
            <Text className="am-title">报警</Text>
          </View>
          {unhandledCount > 0 && (
            <View className="am-unhandled-badge">
              <Text className="am-unhandled-num">{unhandledCount}</Text>
              <Text className="am-unhandled-label">未处理</Text>
            </View>
          )}
        </View>

        {/* 状态筛选 */}
        <View className="am-filter">
          {statusOptions.map(opt => (
            <View
              key={opt.key}
              className={`am-filter-item ${statusFilter === opt.key ? 'am-filter-item--active' : ''}`}
              onClick={() => setStatusFilter(opt.key)}
            >
              <Text className="am-filter-text">{opt.label}</Text>
            </View>
          ))}
        </View>

        {/* 报警列表 */}
        <View className="am-list">
          {filtered.length === 0 ? (
            <View className="am-empty">
              <Text className="am-empty-icon">—</Text>
              <Text className="am-empty-text">暂无报警</Text>
            </View>
          ) : (
            filtered.map(alarm => (
              <View
                key={alarm.id}
                className={`am-card am-card--${alarm.severity} ${alarm.status === 'unhandled' ? 'am-card--live' : ''}`}
              >
                <View className="am-card-bar" />
                <View className="am-card-content">
                  <View className="am-card-row">
                    <Text className="am-card-device">{alarm.deviceId}</Text>
                    <Text className="am-card-time">{alarm.time}</Text>
                  </View>
                  <Text className="am-card-type">{alarm.type}</Text>
                  <View className="am-card-row">
                    <Text className="am-card-desc">{alarm.description}</Text>
                    <Text className={`am-card-status am-card-status--${alarm.status}`}>
                      {statusLabel[alarm.status]}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    )
  }

  // ========== 帮助中心模态框 ==========
  const HelpModal = () => (
    <View className="modal-overlay" onClick={() => setShowHelpModal(false)}>
      <View className="modal-content" onClick={(e) => e.stopPropagation()}>
        <View className="modal-header">
          <Text className="modal-title">帮助中心</Text>
          <Button className="modal-close" onClick={() => setShowHelpModal(false)}>
            <Text className="modal-close-text">×</Text>
          </Button>
        </View>
        <ScrollView className="modal-body" scrollY={true}>
          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>如何添加设备？</Text>
            </View>
            <Text className="help-text">
              1. 点击底部导航栏的"首页"按钮{'\n'}
              2. 点击"开始扫描"按钮{'\n'}
              3. 扫描设备上的18字节二维码{'\n'}
              4. 扫描成功后，设备会自动添加到设备列表
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>如何控制设备？</Text>
            </View>
            <Text className="help-text">
              1. 在设备列表中点击要控制的设备{'\n'}
              2. 进入设备详情页后，可以使用快捷控制按钮{'\n'}
              3. AUTO - 自动模式{'\n'}
              4. STOP - 停止运行{'\n'}
              5. RESET - 重置设备{'\n'}
              6. CONT - 连续运行{'\n'}
              7. MAN - 手动模式
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>如何修改参数？</Text>
            </View>
            <Text className="help-text">
              1. 在设备详情页点击"参数设置与数据下发"{'\n'}
              2. 选择对应的参数标签（基本/检测/速度/定时）{'\n'}
              3. 修改参数值{'\n'}
              4. 点击"保存并下发"按钮将参数发送到设备
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>常见问题</Text>
            </View>
            <Text className="help-text">
              Q: 设备显示离线怎么办？{'\n'}
              A: 请检查设备电源和网络连接，确保设备正常上电并连接到MQTT服务器。{'\n\n'}
              Q: 参数下发失败怎么办？{'\n'}
              A: 请确保设备在线，并检查MQTT连接状态。如果问题持续，请重启设备。{'\n\n'}
              Q: 如何查看设备统计数据？{'\n'}
              A: 点击底部导航栏的"统计"按钮，即可查看所有设备的累计数据。
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>联系技术支持</Text>
            </View>
            <Text className="help-text">
              技术支持联系方式正在完善中，敬请期待...
            </Text>
          </View>
        </ScrollView>
        <View className="modal-footer">
          <Button className="modal-btn modal-btn-primary" onClick={() => setShowHelpModal(false)}>
            <Text className="modal-btn-text">知道了</Text>
          </Button>
        </View>
      </View>
    </View>
  )

  // ========== 关于我们模态框 ==========
  const AboutModal = () => (
    <View className="modal-overlay" onClick={() => setShowAboutModal(false)}>
      <View className="modal-content" onClick={(e) => e.stopPropagation()}>
        <View className="modal-header">
          <Text className="modal-title">关于我们</Text>
          <Button className="modal-close" onClick={() => setShowAboutModal(false)}>
            <Text className="modal-close-text">×</Text>
          </Button>
        </View>
        <ScrollView className="modal-body" scrollY={true}>
          <View className="about-section">
            <View className="about-logo">
              <Text className="about-logo-text">ZTZN</Text>
            </View>
            <Text className="about-company">南京中拓科技有限公司</Text>
            <Text className="about-slogan">智能清洁，让生活更美好</Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>公司简介</Text>
            </View>
            <Text className="help-text">
              南京中拓科技有限公司（ZTZN）是一家专注于智能清洁设备研发、生产和销售的高新技术企业。
              我们致力于为全球客户提供高效、智能、环保的清洁解决方案。
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>产品系列</Text>
            </View>
            <Text className="help-text">
              • D01 干挂基本型 - 适用于标准墙面清洁{'\n'}
              • D11 干挂带扭 - 支持复杂角度清洁{'\n'}
              • D21 干挂带跨 - 具备跨桥功能{'\n'}
              • T01 履带基本型 - 适用于地面清洁{'\n'}
              • T11 履带无人值守 - 全自动清洁{'\n'}
              • T21 履带操控看守 - 人工辅助清洁
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>应用版本</Text>
            </View>
            <Text className="help-text">
              版本号：v{APP_VERSION_INFO.version}{'\n'}
              发布分支：{APP_VERSION_INFO.branch}{'\n'}
              发布标记：{APP_VERSION_INFO.releaseTag}{'\n'}
              更新时间：{APP_VERSION_INFO.updatedAt}{'\n'}
              更新内容：{'\n'}
              • 统一设备状态与最近命令状态展示{'\n'}
              • 支持命令状态查询与控制结果回显{'\n'}
              • 首页与详情页共享标准状态信息{'\n'}
              • WebSocket 设备状态日志收敛为单条摘要
            </Text>
          </View>

          <View className="help-section">
            <View className="section-title">
              <View className="section-dot" />
              <Text>联系方式</Text>
            </View>
            <Text className="help-text">
              联系方式正在完善中，敬请期待...
            </Text>
          </View>

          <View className="about-footer-section">
            <Text className="about-copyright">© 2026 南京中拓科技有限公司</Text>
            <Text className="about-rights">版权所有 保留一切权利</Text>
          </View>
        </ScrollView>
        <View className="modal-footer">
          <Button className="modal-btn modal-btn-primary" onClick={() => setShowAboutModal(false)}>
            <Text className="modal-btn-text">关闭</Text>
          </Button>
        </View>
      </View>
    </View>
  )

  return (
    <View className="container">
      {currentPage === 'scan' && ScanPage()}
      {currentPage === 'home' && HomePage()}
      {currentPage === 'detail' && DetailPage()}
      {currentPage === 'settings' && SettingsPage()}
      {currentPage === 'stats' && StatsPage()}
      {currentPage === 'profile' && ProfilePage()}

      {/* Toast */}
      {toast.show && (
        <View className="toast">
          <Text>{toast.message}</Text>
        </View>
      )}

      {/* 帮助中心模态框 */}
      {showHelpModal && HelpModal()}

      {/* 关于我们模态框 */}
      {showAboutModal && AboutModal()}

      {/* 底部导航 */}
      <View className="bottom-nav">
        <Button
          className={`nav-item ${currentPage === 'home' ? 'nav-item-active' : ''}`}
          onClick={() => {
            setSelectedDeviceFamily(null)
            setSearchKeyword('')
            navigateTo('home')
          }}
        >
          <Home />
          <Text>设备</Text>
        </Button>
        <Button
          className={`nav-item ${currentPage === 'stats' ? 'nav-item-active' : ''}`}
          onClick={() => navigateTo('stats')}
        >
          <Bell />
          <Text>报警</Text>
        </Button>
        <Button
          className={`nav-item ${currentPage === 'profile' ? 'nav-item-active' : ''}`}
          onClick={() => navigateTo('profile')}
        >
          <View className="nav-icon">
            <View className="profile-icon-small" />
          </View>
          <Text>我的</Text>
        </Button>
      </View>
    </View>
  )
}
