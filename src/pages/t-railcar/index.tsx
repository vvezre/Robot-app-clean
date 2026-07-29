import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Canvas, Button, Input, ScrollView, Text, View, Slider } from '@tarojs/components'
import Taro from '@tarojs/taro'
import PathCanvas from '../../components/PathCanvas'
import RobotModel from '../../components/RobotModel'
import tRailcarService from '../../services/tRailcarService'
import deviceStatusService from '../../services/deviceStatusService'
import type { TRailcarTaskPathPayload } from '../../services/tRailcarService'
import {
  buildLayoutPreview,
  buildLayoutRenderModel,
  buildLayoutV2,
  buildLayoutV2Payload,
  buildPointDraftRenderModel,
  buildPointTaskModel,
  buildPointTaskRenderModel,
  type LayoutPreview,
  type LayoutRenderModel,
  type LayoutV2,
  type PointDraftRenderModel,
  type PointTaskModel,
  type PointTaskRenderModel,
} from '../../utils/taskLayoutModel'
import websocketService, { type WebSocketMessage } from '../../services/websocketService'
import './index.scss'

type CurrentPoint = {
  x: number
  y: number
  heading?: number
}

type RealtimeSnapshot = Partial<WebSocketMessage>
type ConsoleTab = 'control' | 'status' | 'task' | 'test'
type CommandAction = 'start' | 'stop' | 'forward' | 'backward' | 'turnLeft' | 'turnRight'
type TouchPoint = { x: number; y: number }
type TaskGeoPoint = { lat: number; lon: number; heading?: number }
type JoystickRect = { left: number; top: number; width: number; height: number }
type JoystickVector = { x: number; y: number; power: number }
type JoystickPayload = { distance: number; dirX: number; dirY: number }
type TaskLoadingAction = 'params' | 'generate' | 'plan' | 'current' | 'delete' | 'refresh' | null
type TaskParamsForm = Record<
  | 'goBackLen'
  | 'goLeftOrRightBackLen'
  | 'turnBackLen'
  | 'panelWidth'
  | 'panelHeight'
  | 'leftOrRightBridgeLen'
  | 'voltageWarn'
  | 'heading'
  | 'startLat'
  | 'startLon'
  | 'garageEntryLat'
  | 'garageEntryLon'
  | 'chargingPileLat'
  | 'chargingPileLon'
  | 'startToChargingPilePointLength'
  | 'lastTaskBackLength'
  | 'panelAngle'
  | 'panelAngleX'
  | 'gap'
  | 'gapX'
  | 'gapY'
  | 'originHeading',
  string
>
type TaskPlanForm = {
  taskName: string
  areaNumber: string
  direction: 'left' | 'right'
  layoutMode: 'legacy' | 'layoutV2' | 'pointModel'
  lineCount: string
  columnCount: string
  bridgeRows: string
  bridgeLen: string
  areas: LayoutRangeDraft[]
  holes: LayoutRangeDraft[]
  extras: LayoutRangeDraft[]
  connectors: LayoutConnectorDraft[]
  pointModelPoints: PointModelPointDraft[]
}
type PointModelPointDraft = {
  x: string
  y: string
  lat?: string
  lon?: string
}
type LayoutRangeGroupKey = 'areas' | 'holes' | 'extras'
type LayoutRangeDraft = {
  rowStart: string
  rowEnd: string
  colStart: string
  colEnd: string
}
type LayoutConnectorDraft = {
  type: 'col' | 'row'
  rowStart: string
  rowEnd: string
  afterCol: string
  colStart: string
  colEnd: string
  afterRow: string
  length: string
}
// 
const JOYSTICK_MAX_DISTANCE = 50
const JOYSTICK_DEAD_ZONE = 0.12
const JOYSTICK_THROTTLE_MS = 180
const JOYSTICK_KNOB_TRAVEL_RPX = 78
const JOYSTICK_CENTER: JoystickVector = { x: 0, y: 0, power: 0 }
const JOYSTICK_STOP_PAYLOAD: JoystickPayload = { distance: 0, dirX: 0, dirY: 0 }
const createLayoutRangeDraft = (
  rowStart = '0',
  rowEnd = '0',
  colStart = '0',
  colEnd = '0',
): LayoutRangeDraft => ({
  rowStart,
  rowEnd,
  colStart,
  colEnd,
})
const createLayoutConnectorDraft = (type: 'col' | 'row' = 'col'): LayoutConnectorDraft => ({
  type,
  rowStart: '0',
  rowEnd: '0',
  afterCol: '0',
  colStart: '0',
  colEnd: '0',
  afterRow: '0',
  length: '0',
})
const createPointModelPointDraft = (x = '', y = '', lat = '', lon = ''): PointModelPointDraft => ({
  x,
  y,
  lat,
  lon,
})
const DEFAULT_TASK_PARAMS_FORM: TaskParamsForm = {
  goBackLen: '20',
  goLeftOrRightBackLen: '20',
  turnBackLen: '20',
  panelWidth: '100',
  panelHeight: '200',
  leftOrRightBridgeLen: '20',
  voltageWarn: '20',
  heading: '0',
  startLat: '',
  startLon: '',
  garageEntryLat: '',
  garageEntryLon: '',
  chargingPileLat: '',
  chargingPileLon: '',
  startToChargingPilePointLength: '0',
  lastTaskBackLength: '0',
  panelAngle: '0',
  panelAngleX: '0',
  gap: '0',
  gapX: '0',
  gapY: '0',
  originHeading: '0',
}
const DEFAULT_TASK_PLAN_FORM: TaskPlanForm = {
  taskName: `task-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
  areaNumber: '1',
  direction: 'left',
  layoutMode: 'legacy',
  lineCount: '4',
  columnCount: '4',
  bridgeRows: '',
  bridgeLen: '0',
  areas: [
    createLayoutRangeDraft('0', '3', '0', '3'),
  ],
  holes: [],
  extras: [],
  connectors: [],
  pointModelPoints: [],
}
const TASK_PARAM_FIELDS: Array<{ key: keyof TaskParamsForm; label: string; placeholder?: string }> = [
  { key: 'startLat', label: '起点纬度', placeholder: '如 31.000000' },
  { key: 'startLon', label: '起点经度', placeholder: '如 118.000000' },
  { key: 'garageEntryLat', label: '入舱点纬度', placeholder: '未设置默认使用起点' },
  { key: 'garageEntryLon', label: '入舱点经度', placeholder: '未设置默认使用起点' },
  { key: 'chargingPileLat', label: '充电桩纬度', placeholder: '如 31.000000' },
  { key: 'chargingPileLon', label: '充电桩经度', placeholder: '如 118.000000' },
  { key: 'heading', label: '启动航向' },
  { key: 'originHeading', label: '原点航向' },
  { key: 'goBackLen', label: '直行后退距离' },
  { key: 'goLeftOrRightBackLen', label: '左右后退距离' },
  { key: 'turnBackLen', label: '转向后退距离' },
  { key: 'panelWidth', label: '板宽' },
  { key: 'panelHeight', label: '板高' },
  { key: 'leftOrRightBridgeLen', label: '左右桥接距离' },
  { key: 'startToChargingPilePointLength', label: '入舱点到充电桩距离' },
  { key: 'lastTaskBackLength', label: '末段后退距离' },
  { key: 'panelAngle', label: '板角度' },
  { key: 'panelAngleX', label: '板角度 X' },
  { key: 'gap', label: '默认间隙' },
  { key: 'gapX', label: '横向间隙' },
  { key: 'gapY', label: '纵向间隙' },
  { key: 'voltageWarn', label: '低压告警' },
]

const commandLabels: Record<CommandAction, { idle: string; loading: string; success: string; failure: string }> = {
  start: {
    idle: '启动',
    loading: '启动中',
    success: '已发送启动指令',
    failure: '启动失败',
  },
  stop: {
    idle: '停止',
    loading: '停止中',
    success: '已发送停止指令',
    failure: '停止失败',
  },
  forward: {
    idle: '前进',
    loading: '前进中',
    success: '已发送前进指令',
    failure: '前进失败',
  },
  backward: {
    idle: '后退',
    loading: '后退中',
    success: '已发送后退指令',
    failure: '后退失败',
  },
  turnLeft: {
    idle: '左旋转',
    loading: '左旋转中',
    success: '已发送左旋转指令',
    failure: '左旋转失败',
  },
  turnRight: {
    idle: '右旋转',
    loading: '右旋转中',
    success: '已发送右旋转指令',
    failure: '右旋转失败',
  },
}

const formatValue = (value?: string | number | null, empty = '--') =>
  value == null || value === '' ? empty : String(value)

const formatNumber = (value?: number | null, digits = 0, suffix = '') =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '--'

const formatCoordinate = (value?: number | null, digits = 6) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'

const formatCoordinateInput = (value: number) => String(Number(value.toFixed(8)))

const formatHeadingInput = (value: number) => String(Number(value.toFixed(2)))

const formatModelCoordinateInput = (value: number) => String(Number(value.toFixed(2)))

const formatTimestamp = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '未上报'
  }

  const normalized = value < 1e12 ? value * 1000 : value
  return new Date(normalized).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const resolveStatusTone = (rawStatus: string, normalizedStatus: string) => {
  switch (rawStatus || normalizedStatus) {
    case 'working':
    case 'running':
    case 'cleaning':
    case 'returning':
      return 'running'
    case 'charging':
      return 'charging'
    case 'offline':
    case 'unknown':
      return 'offline'
    case 'disabled':
      return 'idle'
    default:
      return 'idle'
  }
}

const resolveStatusLabel = (rawStatus: string, normalizedStatus: string) => {
  switch (rawStatus || normalizedStatus) {
    case 'working':
    case 'running':
    case 'cleaning':
      return '执行中'
    case 'returning':
      return '返航中'
    case 'charging':
      return '充电中'
    case 'offline':
      return '不可启动'
    case 'disabled':
      return '待命'
    case 'unknown':
      return '等待下位机上报'
    case 'active':
      return '待命'
    case 'idle':
      return '空闲'
    case 'stopped':
    case 'parking':
      return '已停车'
    default:
      return rawStatus ? rawStatus.toUpperCase() : '等待上报'
  }
}

const resolveControlStateLabel = (value?: string | null) => {
  switch ((value || '').trim().toUpperCase()) {
    case 'RUNNING':
      return '运行中'
    case 'READY':
      return '就绪'
    case 'BLOCKED':
      return '已拦截'
    case 'STOPPED':
      return '已停止'
    case 'DISABLED':
      return '-'
    case 'UNKNOWN':
      return '等待下位机上报'
    case 'IDLE':
      return '空闲'
    default:
      return formatValue(value)
  }
}

const resolveHealthStateLabel = (value?: string | null) => {
  switch ((value || '').trim().toUpperCase()) {
    case 'OK':
      return '正常'
    case 'WARN':
      return '需处理'
    case 'ERROR':
      return '异常'
    default:
      return formatValue(value)
  }
}

const resolveFaultStateLabel = (value?: string | null) => {
  switch ((value || '').trim().toUpperCase()) {
    case 'LOWER_MACHINE_DISABLED':
    case 'LOWER_MACHINE_STATUS_UNKNOWN':
      return '-'
    case 'NOT_AT_TASK_START':
      return '不在任务起点'
    case 'RTK_NOT_READY':
      return 'RTK 未就绪'
    case 'TASK_PARAMS_MISSING':
      return '任务参数缺失'
    case 'TASK_PATH_EMPTY':
      return '任务路径为空'
    case 'START_POSITION_UNKNOWN':
      return '起点距离未知'
    case 'START_HEADING_CHECK_FAILED':
      return '起始姿态校验失败'
    case 'TASK_NAME_NOT_FOUND':
      return '当前位置未匹配任务'
    case 'ALREADY_RUNNING':
      return '任务已在执行'
    default:
      return formatValue(value)
  }
}

const hiddenControllerControlStates = new Set(['DISABLED', 'UNKNOWN'])
const hiddenControllerFaultStates = new Set(['LOWER_MACHINE_DISABLED', 'LOWER_MACHINE_STATUS_UNKNOWN'])
const hiddenControllerReasonTexts = [
  'LOWER_MACHINE_DISABLED',
  'LOWER_MACHINE_STATUS_UNKNOWN',
  '下位机未使能',
  '未收到下位机上报',
  'Controller is disabled',
  'No controller report received',
]

const shouldHideControllerControlState = (value?: string | null) =>
  hiddenControllerControlStates.has((value || '').trim().toUpperCase())

const shouldHideControllerFaultState = (value?: string | null) =>
  hiddenControllerFaultStates.has((value || '').trim().toUpperCase())

const shouldHideControllerReason = (value?: string | null) => {
  const reason = (value || '').trim()
  if (!reason) return false
  const upperReason = reason.toUpperCase()
  return hiddenControllerReasonTexts.some(text => upperReason.includes(text.toUpperCase()))
}

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return fallback
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const roundJoystickAxis = (value: number) => Number(value.toFixed(2))
// 方向
const getJoystickDirectionLabel = ({ x, y, power }: JoystickVector) => {
  if (power <= 0) {
    return '中心'
  }

  const absX = Math.abs(x)
  const absY = Math.abs(y)

  if (absX < 0.35 && y > 0) return '前进'
  if (absX < 0.35 && y < 0) return '后退'
  if (absY < 0.35 && x < 0) return '左向'
  if (absY < 0.35 && x > 0) return '右向'
  if (x < 0 && y > 0) return '左前'
  if (x > 0 && y > 0) return '右前'
  if (x < 0 && y < 0) return '左后'
  return '右后'
}

const parseNumber = (value: string, fieldName: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${fieldName}不能为空`)
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName}必须是数字`)
  }
  return parsed
}

const parseInteger = (value: string, fieldName: string) => {
  const parsed = parseNumber(value, fieldName)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName}必须是整数`)
  }
  return parsed
}

const parseIntegerList = (value: string, fieldName: string) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)
  .map(item => parseInteger(item, fieldName))

interface CanvasParams {
  currentHeading?: number;
  currentLat?: number;
  currentLon?: number;
  originHeading?: number;
  taskStartLat?: number;
  taskStartLon?: number;
  taskdistance?: number;
  taskstartToleranceM?: number;
}
export default function TRailcarStatusPage() {
  const [taskdistance, setTaskdistance] = useState(0)
  const [taskstartToleranceM, setTaskStartToleranceM] = useState(0)

  const [canvasParams, setCanvasParams] = useState<CanvasParams>({});


  const [taskProductId, setTaskProductId] = useState<string>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const CANVAS_WIDTH = 375
  const CANVAS_HEIGHT = 150
  const isActivecontrol = useRef(true)     // 标记是否活跃
  const [taskmsg, setTaskmsg] = useState<string>('⏳正在获取定位信息...')
  const [activeTab, setActiveTab] = useState<ConsoleTab>('control')
  const [productId, setProductId] = useState('250001')
  const [taskPath, setTaskPath] = useState<TRailcarTaskPathPayload | null>(null)
  const [pathLoading, setPathLoading] = useState(false)
  const [pathError, setPathError] = useState('')
  const [pathReloadKey, setPathReloadKey] = useState(0)
  const [socketConnected, setSocketConnected] = useState(false)
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number | null>(null)
  const [currentPoint, setCurrentPoint] = useState<CurrentPoint | null>(null)
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot>({})
  const [commandLoading, setCommandLoading] = useState<CommandAction | null>(null)
  const [joystickActive, setJoystickActive] = useState(false)
  const [joystickVector, setJoystickVector] = useState<JoystickVector>(JOYSTICK_CENTER)
  const [joystickStatus, setJoystickStatus] = useState('拖动摇杆开始控制，松手自动停止')
  const [taskParamsForm, setTaskParamsForm] = useState<TaskParamsForm>(DEFAULT_TASK_PARAMS_FORM)
  const [taskPlanForm, setTaskPlanForm] = useState<TaskPlanForm>(DEFAULT_TASK_PLAN_FORM)
  const [taskNames, setTaskNames] = useState<string[]>([])
  const [selectedTaskName, setSelectedTaskName] = useState('')
  const [currentTaskName, setCurrentTaskName] = useState('')
  const [taskLoading, setTaskLoading] = useState<TaskLoadingAction>(null)
  const [taskMessage, setTaskMessage] = useState('先保存参数，再生成任务并规划路径。')
  const [capturedTaskPoint, setCapturedTaskPoint] = useState<TaskGeoPoint | null>(null)
  const [pointTaskModel, setPointTaskModel] = useState<PointTaskModel | null>(null)
  const taskPathRef = useRef<TRailcarTaskPathPayload | null>(null)
  const currentTaskIndexRef = useRef<number | null>(null)
  const joystickRectRef = useRef<JoystickRect | null>(null)
  const joystickLastSentAtRef = useRef(0)
  const joystickLastPayloadRef = useRef<JoystickPayload>(JOYSTICK_STOP_PAYLOAD)

  useEffect(() => {
    const instance = Taro.getCurrentInstance()
    const urlProductId = instance.router?.params?.productId
    if (urlProductId) {
      console.log("========urlProductId" + urlProductId)
      setTaskProductId(`-T01${urlProductId}`)
      setProductId(urlProductId)

    }
  }, [])




  // // 监听 taskProductId，启动轮询
  // useEffect(() => {
  //   console.log('taskProductId 变化了:', taskProductId)  // 看这里有没有输出

  //   if (!taskProductId) return

  //   // 清空旧定时器
  //   if (timerRef.current) {
  //     clearInterval(timerRef.current)
  //     clearTimeout(timerRef.current);
  //     // ✅ 清空画布，防止残留
  //     const ctx = Taro.createCanvasContext('point-canvas');
  //     ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  //     ctx.draw(true);
  //   }

  //   loadData()
  //   if (isActivecontrol) {
  //     timerRef.current = setInterval(loadData, 3000)
  //   }
  //   return () => {
  //     if (timerRef.current) {
  //       clearInterval(timerRef.current)

  //       // ✅ 清空画布，防止残留
  //       const ctx = Taro.createCanvasContext('point-canvas');
  //       ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  //       ctx.draw(true);
  //     }
  //   }
  // }, [taskProductId])

  // useEffect(() => {
  //   return () => {
  //     if (timerRef.current) {
  //       // ✅ 清空画布，防止残留
  //       const ctx = Taro.createCanvasContext('point-canvas');
  //       ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  //       ctx.draw(true);
  //       clearTimeout(timerRef.current);
  //     }
  //   };
  // }, []);




  useEffect(() => {
    taskPathRef.current = taskPath
  }, [taskPath])

  useEffect(() => {
    currentTaskIndexRef.current = currentTaskIndex
  }, [currentTaskIndex])

  useEffect(() => {
    let isActive = true

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    const loadTaskPath = async () => {
      setPathLoading(true)
      setPathError('')
      setTaskPath(null)

      try {
        await tRailcarService.task.getTaskPath(productId)
      } catch (error) {
        console.warn('[T Railcar] trigger task path failed, keep polling cache', error)
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        if (!isActive) return

        try {
          const response = await tRailcarService.task.fetchTaskPath(productId)
          if (response.success && response.data?.segments?.length) {
            if (!isActive) return
            setTaskPath(response.data)
            setPathError('')
            setPathLoading(false)
            return
          }
        } catch (error) {
          console.warn('[T Railcar] fetch task path cache failed', error)
        }

        await sleep(500)
      }

      if (!isActive) return
      setPathLoading(false)
      setPathError('路径暂未就绪')
    }

    void loadTaskPath()

    return () => {
      isActive = false
    }
  }, [productId, pathReloadKey])

  useEffect(() => {
    const fullDeviceId = `-T01${productId}`
    console.log("======productId=======" + productId)
    setTaskProductId(fullDeviceId)
    websocketService.connect((message: WebSocketMessage) => {

      if (message.deviceId !== fullDeviceId) {
        return
      }


      setSnapshot(prev => ({
        ...prev,
        ...message,
      }))

      if (typeof message.curTaskIndex === 'number') {
        setCurrentTaskIndex(message.curTaskIndex)
      }

      if (typeof message.localX === 'number' && typeof message.localY === 'number') {
        const fallbackHeading =
          typeof message.heading === 'number'
            ? message.heading
            : taskPathRef.current?.segments?.[
              typeof message.curTaskIndex === 'number'
                ? message.curTaskIndex
                : currentTaskIndexRef.current || 0
            ]?.heading

        setCurrentPoint({
          x: message.localX,
          y: message.localY,
          heading: fallbackHeading,
        })
      }
    }, setSocketConnected)

    websocketService.subscribeDevice(fullDeviceId)

    return () => {
      websocketService.unsubscribeDevice(fullDeviceId)
      websocketService.disconnect()
    }

  }, [productId])

  const handleRefreshPath = () => {
    setPathReloadKey(prev => prev + 1)
  }

  const loadTaskOptions = async (showToast = false) => {
    setTaskLoading('refresh')
    try {
      const response = await tRailcarService.task.fetchTaskOptions(productId)
      if (!response.success) {
        throw new Error(response.message || '获取任务列表失败')
      }

      const names = response.data?.taskNames || []
      const currentName = response.data?.currentTaskName || ''
      setTaskNames(names)
      setCurrentTaskName(currentName)
      setSelectedTaskName(prev => prev || currentName || names[0] || '')
      setTaskMessage(names.length ? `已加载 ${names.length} 个缓存任务` : '暂无缓存任务，请先生成任务')
      if (showToast) {
        Taro.showToast({ title: '任务列表已刷新', icon: 'success' })
      }
    } catch (error) {
      setTaskMessage(extractErrorMessage(error, '获取任务列表失败'))
    } finally {
      setTaskLoading(null)
    }
  }

  const runCommand = async (action: CommandAction) => {
    setCommandLoading(action)
    const labels = commandLabels[action]

    try {
      let response

      switch (action) {
        case 'start':
          response = await tRailcarService.advanced.autoDrive(productId)
          break
        case 'stop':
          response = await tRailcarService.movement.stop(productId)
          break
        case 'forward':
          response = await tRailcarService.movement.drive(productId, 0)
          break
        case 'backward':
          response = await tRailcarService.movement.back(productId, 0)
          break
        case 'turnLeft':
          response = await tRailcarService.movement.turnLeft(productId, 0)
          break
        case 'turnRight':
          response = await tRailcarService.movement.turnRight(productId, 0)
          break
      }

      if (!response.success) {
        throw new Error(response.message || '指令下发失败')
      }

      Taro.showToast({
        title: labels.success,
        icon: 'success',
      })
    } catch (error) {
      Taro.showToast({
        title: extractErrorMessage(error, labels.failure),
        icon: 'none',
      })
    } finally {
      setCommandLoading(null)
    }
  }

  const getTouchPoint = (event: any): TouchPoint | null => {
    const touch = event?.touches?.[0] || event?.changedTouches?.[0]
    if (!touch) {
      return null
    }

    const x = typeof touch.clientX === 'number' ? touch.clientX : touch.pageX
    const y = typeof touch.clientY === 'number' ? touch.clientY : touch.pageY
    if (typeof x !== 'number' || typeof y !== 'number') {
      return null
    }

    return { x, y }
  }

  const sendJoystickPayload = async (payload: JoystickPayload, force = false) => {
    const now = Date.now()
    const lastPayload = joystickLastPayloadRef.current
    const isSamePayload =
      payload.distance === lastPayload.distance &&
      Math.abs(payload.dirX - lastPayload.dirX) < 0.02 &&
      Math.abs(payload.dirY - lastPayload.dirY) < 0.02

    if (!force) {
      if (isSamePayload) return
      if (now - joystickLastSentAtRef.current < JOYSTICK_THROTTLE_MS) return
    }

    joystickLastSentAtRef.current = now
    joystickLastPayloadRef.current = payload

    try {
      const response = await tRailcarService.joystick.move(productId, payload.distance, payload.dirX, payload.dirY)
      if (!response.success) {
        throw new Error(response.message || '摇杆指令下发失败')
      }

      setJoystickStatus(
        payload.distance > 0
          ? `已下发：强度 ${payload.distance}/${JOYSTICK_MAX_DISTANCE}，X ${payload.dirX.toFixed(2)}，Y ${payload.dirY.toFixed(2)}`
          : '摇杆归零，已请求停止'
      )
    } catch (error) {
      console.warn('[T Railcar] joystick command failed', error)
      setJoystickStatus(extractErrorMessage(error, '摇杆指令下发失败'))
    }
  }

  const updateJoystickByPoint = (point: TouchPoint, forceSend = false) => {
    const rect = joystickRectRef.current
    if (!rect) {
      return
    }

    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2)
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const rawX = (point.x - centerX) / radius
    const rawY = -(point.y - centerY) / radius
    const rawMagnitude = Math.sqrt(rawX * rawX + rawY * rawY)
    const magnitude = Math.min(1, rawMagnitude)
    const scale = rawMagnitude > 1 ? 1 / rawMagnitude : 1
    const normalizedX = clamp(rawX * scale, -1, 1)
    const normalizedY = clamp(rawY * scale, -1, 1)

    if (magnitude < JOYSTICK_DEAD_ZONE) {
      setJoystickVector(JOYSTICK_CENTER)
      void sendJoystickPayload(JOYSTICK_STOP_PAYLOAD, forceSend)
      return
    }

    const power = Math.round(magnitude * 100)
    const payload: JoystickPayload = {
      distance: Math.max(1, Math.round((power / 100) * JOYSTICK_MAX_DISTANCE)),
      dirX: roundJoystickAxis(normalizedX),
      dirY: roundJoystickAxis(normalizedY),
    }

    setJoystickVector({
      x: payload.dirX,
      y: payload.dirY,
      power,
    })
    void sendJoystickPayload(payload, forceSend)
  }

  const measureJoystickAndUpdate = (point: TouchPoint, forceSend = false) => {
    Taro.createSelectorQuery()
      .select('.joystick-surface')
      .boundingClientRect((rect: any) => {
        if (!rect) {
          return
        }

        joystickRectRef.current = {
          left: Number(rect.left) || 0,
          top: Number(rect.top) || 0,
          width: Number(rect.width) || 0,
          height: Number(rect.height) || 0,
        }
        updateJoystickByPoint(point, forceSend)
      })
      .exec()
  }

  const handleJoystickTouchStart = (event: any) => {
    event?.stopPropagation?.()
    const point = getTouchPoint(event)
    if (!point) {
      return
    }

    setJoystickActive(true)
    measureJoystickAndUpdate(point, true)
  }

  const handleJoystickTouchMove = (event: any) => {
    event?.stopPropagation?.()
    const point = getTouchPoint(event)
    if (!point) {
      return
    }

    if (!joystickRectRef.current) {
      measureJoystickAndUpdate(point)
      return
    }

    updateJoystickByPoint(point)
  }

  const resetJoystick = () => {
    setJoystickActive(false)
    setJoystickVector(JOYSTICK_CENTER)
    void sendJoystickPayload(JOYSTICK_STOP_PAYLOAD, true)

  }

  const switchConsoleTab = (tab: ConsoleTab) => {
    if (tab !== 'control' && joystickActive) {
      resetJoystick()

    }
    if (tab === 'task' && activeTab !== 'task') {
      void loadTaskOptions(false)
    }
    if (tab !== 'control') {
      isActivecontrol.current = false
      // // ✅ 清空画布，防止残留
      // const ctx = Taro.createCanvasContext('point-canvas');
      // ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // ctx.draw(true);

    } else if (tab === 'control') {
      console.log('在控制页面了')
      isActivecontrol.current = true

    }
    setActiveTab(tab)



  }

  const updateTaskParam = (key: keyof TaskParamsForm, value: string) => {
    setTaskParamsForm(prev => ({ ...prev, [key]: value }))
  }

  const updateTaskPlan = <K extends keyof TaskPlanForm>(key: K, value: TaskPlanForm[K]) => {
    if (key === 'layoutMode' || key === 'pointModelPoints') {
      setPointTaskModel(null)
    }
    setTaskPlanForm(prev => ({ ...prev, [key]: value }))
  }

  const addPointModelPoint = (point = createPointModelPointDraft()) => {
    setPointTaskModel(null)
    setTaskPlanForm(prev => ({
      ...prev,
      pointModelPoints: [...prev.pointModelPoints, point],
    }))
  }

  const removePointModelPoint = (index: number) => {
    setPointTaskModel(null)
    setTaskPlanForm(prev => ({
      ...prev,
      pointModelPoints: prev.pointModelPoints.filter((_, pointIndex) => pointIndex !== index),
    }))
  }

  const clearPointModelPoints = () => {
    setPointTaskModel(null)
    setTaskPlanForm(prev => ({ ...prev, pointModelPoints: [] }))
  }

  const addLayoutRange = (groupKey: LayoutRangeGroupKey) => {
    setTaskPlanForm(prev => ({
      ...prev,
      [groupKey]: [...prev[groupKey], createLayoutRangeDraft()],
    }))
  }

  const removeLayoutRange = (groupKey: LayoutRangeGroupKey, index: number) => {
    setTaskPlanForm(prev => ({
      ...prev,
      [groupKey]: prev[groupKey].filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const updateLayoutRange = (
    groupKey: LayoutRangeGroupKey,
    index: number,
    field: keyof LayoutRangeDraft,
    value: string,
  ) => {
    setTaskPlanForm(prev => ({
      ...prev,
      [groupKey]: prev[groupKey].map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }))
  }

  const addLayoutConnector = () => {
    setTaskPlanForm(prev => ({
      ...prev,
      connectors: [...prev.connectors, createLayoutConnectorDraft()],
    }))
  }

  const removeLayoutConnector = (index: number) => {
    setTaskPlanForm(prev => ({
      ...prev,
      connectors: prev.connectors.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const updateLayoutConnector = (
    index: number,
    field: keyof LayoutConnectorDraft,
    value: string,
  ) => {
    setTaskPlanForm(prev => ({
      ...prev,
      connectors: prev.connectors.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        if (field === 'type') {
          return { ...item, type: value === 'row' ? 'row' : 'col' }
        }
        return { ...item, [field]: value }
      }),
    }))
  }

  const getCurrentTaskGeoPoint = (): TaskGeoPoint => {
    if (typeof snapshot.lat !== 'number' || typeof snapshot.lon !== 'number') {
      throw new Error('暂无当前经纬度上报')
    }
    if (!Number.isFinite(snapshot.lat) || !Number.isFinite(snapshot.lon)) {
      throw new Error('当前经纬度无效')
    }

    return {
      lat: snapshot.lat,
      lon: snapshot.lon,
      heading: typeof snapshot.heading === 'number' && Number.isFinite(snapshot.heading)
        ? snapshot.heading
        : undefined,
    }
  }

  const getCurrentTaskLocalPoint = (): CurrentPoint => {
    if (typeof snapshot.localX !== 'number' || typeof snapshot.localY !== 'number') {
      throw new Error('暂无当前坐标系位置上报')
    }
    if (!Number.isFinite(snapshot.localX) || !Number.isFinite(snapshot.localY)) {
      throw new Error('当前坐标系位置无效')
    }

    return {
      x: snapshot.localX,
      y: snapshot.localY,
      heading: typeof snapshot.heading === 'number' && Number.isFinite(snapshot.heading)
        ? snapshot.heading
        : undefined,
    }
  }

  const getTaskGeoPointForAction = () => capturedTaskPoint || getCurrentTaskGeoPoint()

  const capturePointModelCurrentPoint = () => {
    try {
      const localPoint = getCurrentTaskLocalPoint()
      const geoPoint = getCurrentTaskGeoPoint()
      addPointModelPoint(createPointModelPointDraft(
        formatModelCoordinateInput(localPoint.x),
        formatModelCoordinateInput(localPoint.y),
        formatCoordinateInput(geoPoint.lat),
        formatCoordinateInput(geoPoint.lon),
      ))
      setTaskMessage(`已打点：相对 ${formatNumber(localPoint.x, 0)} / ${formatNumber(localPoint.y, 0)}，绝对 ${formatCoordinate(geoPoint.lat, 8)} / ${formatCoordinate(geoPoint.lon, 8)}`)
      Taro.showToast({ title: '已添加外围点', icon: 'success' })
    } catch (error) {
      Taro.showToast({
        title: extractErrorMessage(error, '添加外围点失败'),
        icon: 'none',
      })
    }
  }

  const generatePointTaskModel = () => {
    try {
      const model = buildPointTaskModel(taskPlanForm.pointModelPoints)
      setPointTaskModel(model)
      setTaskMessage(`打点模型已生成：${model.pointCount} 个外围点，面积 ${formatNumber(model.area, 0)}，周长 ${formatNumber(model.perimeter, 0)}`)
      Taro.showToast({ title: '模型已生成', icon: 'success' })
    } catch (error) {
      setPointTaskModel(null)
      setTaskMessage(extractErrorMessage(error, '生成打点模型失败'))
    }
  }

  const captureCurrentTaskGeoPoint = () => {
    try {
      const point = getCurrentTaskGeoPoint()
      setCapturedTaskPoint(point)
      setTaskMessage(`已获取当前经纬度：${formatCoordinate(point.lat, 8)}, ${formatCoordinate(point.lon, 8)}`)
      Taro.showToast({ title: '已获取当前位置', icon: 'success' })
    } catch (error) {
      Taro.showToast({
        title: extractErrorMessage(error, '获取当前位置失败'),
        icon: 'none',
      })
    }
  }

  const setOriginFromTaskPoint = () => {
    try {
      const point = getTaskGeoPointForAction()
      const lat = formatCoordinateInput(point.lat)
      const lon = formatCoordinateInput(point.lon)
      const heading = typeof point.heading === 'number' ? formatHeadingInput(point.heading) : ''
      const shouldFillGarageEntry =
        !taskParamsForm.garageEntryLat.trim() || !taskParamsForm.garageEntryLon.trim()

      setTaskParamsForm(prev => {
        return {
          ...prev,
          startLat: lat,
          startLon: lon,
          heading: heading || prev.heading,
          originHeading: heading || prev.originHeading,
          garageEntryLat: shouldFillGarageEntry ? lat : prev.garageEntryLat,
          garageEntryLon: shouldFillGarageEntry ? lon : prev.garageEntryLon,
        }
      })

      setTaskMessage(
        shouldFillGarageEntry
          ? '已设为原点/起点；入舱点未设置，已默认使用原点'
          : '已设为原点/起点'
      )
      Taro.showToast({ title: '已设置起点', icon: 'success' })
    } catch (error) {
      Taro.showToast({
        title: extractErrorMessage(error, '设置起点失败'),
        icon: 'none',
      })
    }
  }

  const setGarageEntryPointFromTaskPoint = () => {
    try {
      const point = getTaskGeoPointForAction()
      setTaskParamsForm(prev => ({
        ...prev,
        garageEntryLat: formatCoordinateInput(point.lat),
        garageEntryLon: formatCoordinateInput(point.lon),
      }))
      setTaskMessage('已设置入舱点')
      Taro.showToast({ title: '已设置入舱点', icon: 'success' })
    } catch (error) {
      Taro.showToast({
        title: extractErrorMessage(error, '设置入舱点失败'),
        icon: 'none',
      })
    }
  }

  const buildTaskParamsPayload = () => {
    const payload: any = {}
    const normalizedForm: TaskParamsForm = {
      ...taskParamsForm,
      garageEntryLat: taskParamsForm.garageEntryLat.trim() || taskParamsForm.startLat,
      garageEntryLon: taskParamsForm.garageEntryLon.trim() || taskParamsForm.startLon,
    }

    TASK_PARAM_FIELDS.forEach(field => {
      payload[field.key] = parseNumber(normalizedForm[field.key], field.label)
    })
    return payload
  }

  const buildTaskPlanPayload = () => {
    if (taskPlanForm.layoutMode === 'layoutV2') {
      return buildLayoutV2Payload(taskPlanForm)
    }
    if (taskPlanForm.layoutMode === 'pointModel') {
      throw new Error('打点建模只生成前端模型，不生成任务')
    }

    const taskName = taskPlanForm.taskName.trim()
    if (!taskName) {
      throw new Error('任务名称不能为空')
    }

    const lineCount = parseInteger(taskPlanForm.lineCount, '行数')
    const columnCount = parseInteger(taskPlanForm.columnCount, '列数')
    if (lineCount <= 0) {
      throw new Error('行数必须大于0')
    }
    if (columnCount <= 0) {
      throw new Error('列数必须大于0')
    }

    const bridgeRows = new Set(parseIntegerList(taskPlanForm.bridgeRows, '跨桥所在行'))
    const bridgeLen = parseNumber(taskPlanForm.bridgeLen, '跨桥长度')

    return {
      taskName,
      areaList: [{
        areaNumber: parseInteger(taskPlanForm.areaNumber, '区域编号'),
        direction: taskPlanForm.direction,
        lineCount,
        panelInfo: Array.from({ length: lineCount }, (_, index) => ({
          column: columnCount,
          isGap: bridgeRows.has(index + 1),
          gapLen: bridgeRows.has(index + 1) ? bridgeLen : 0,
        })),
      }],
    }
  }

  const saveTaskParams = async () => {
    setTaskLoading('params')
    try {
      const response = await tRailcarService.config.saveParams(productId, buildTaskParamsPayload())
      if (!response.success) {
        throw new Error(response.message || '保存参数失败')
      }
      setTaskMessage('任务参数已保存，可以生成任务。')
      Taro.showToast({ title: '参数已保存', icon: 'success' })
    } catch (error) {
      setTaskMessage(extractErrorMessage(error, '保存参数失败'))
    } finally {
      setTaskLoading(null)
    }
  }

  const generateTask = async () => {
    setTaskLoading('generate')
    try {
      const payload = buildTaskPlanPayload()
      const response = await tRailcarService.task.createTask(productId, payload)
      if (!response.success) {
        throw new Error(response.message || '生成任务失败')
      }
      setSelectedTaskName(payload.taskName)
      setTaskMessage(`任务 ${payload.taskName} 已生成，共 ${response.data?.areaCount || payload.areaList.length} 个区域。`)
      Taro.showToast({ title: '任务已生成', icon: 'success' })
      await loadTaskOptions(false)
    } catch (error) {
      setTaskMessage(extractErrorMessage(error, '生成任务失败'))
    } finally {
      setTaskLoading(null)
    }
  }

  const planTaskPath = async () => {
    const taskName = (selectedTaskName || taskPlanForm.taskName).trim()
    if (!taskName) {
      Taro.showToast({ title: '请选择或填写任务名', icon: 'none' })
      return
    }

    setTaskLoading('plan')
    try {
      const response = await tRailcarService.task.setCurrentTask(productId, taskName)
      if (!response.success) {
        throw new Error(response.message || '路径规划失败')
      }
      setSelectedTaskName(taskName)
      setCurrentTaskName(taskName)
      setPathReloadKey(prev => prev + 1)
      setTaskMessage(`任务 ${taskName} 已设为当前任务，并已触发路径规划。`)
      Taro.showToast({ title: '已触发路径规划', icon: 'success' })
    } catch (error) {
      setTaskMessage(extractErrorMessage(error, '路径规划失败'))
    } finally {
      setTaskLoading(null)
    }
  }

  const setCurrentTask = async () => {
    await planTaskPath()
  }

  const deleteCachedTask = async () => {
    const taskName = selectedTaskName.trim()
    if (!taskName) {
      Taro.showToast({ title: '请选择任务', icon: 'none' })
      return
    }

    setTaskLoading('delete')
    try {
      const response = await tRailcarService.task.deleteCachedTask(productId, taskName)
      if (!response.success) {
        throw new Error(response.message || '删除缓存任务失败')
      }
      setSelectedTaskName('')
      setTaskMessage(`缓存任务 ${taskName} 已删除。`)
      if (response.data?.wasCurrentTask) {
        setCurrentTaskName('')
        setPathReloadKey(prev => prev + 1)
      }
      Taro.showToast({ title: '已删除缓存任务', icon: 'success' })
      await loadTaskOptions(false)
    } catch (error) {
      setTaskMessage(extractErrorMessage(error, '删除缓存任务失败'))
    } finally {
      setTaskLoading(null)
    }
  }

  const rawStatus = (snapshot.status || '').trim().toLowerCase()
  const normalizedStatus = (snapshot.statusNormalized || '').trim().toLowerCase()
  const statusLabel = resolveStatusLabel(rawStatus, normalizedStatus)
  const statusTone = resolveStatusTone(rawStatus, normalizedStatus)
  const latestTimestamp = snapshot.timestamp ?? snapshot.updatedAt
  const reportedSpeed = snapshot.speed ?? snapshot.walkSpeed
  const taskProgressText =
    typeof snapshot.curTaskIndex === 'number' && typeof snapshot.taskCount === 'number' && snapshot.taskCount > 0
      ? `${snapshot.curTaskIndex + 1} / ${snapshot.taskCount}`
      : typeof snapshot.curTaskIndex === 'number'
        ? String(snapshot.curTaskIndex + 1)
        : '--'
  const commandIdShort = snapshot.lastCommandId ? snapshot.lastCommandId.slice(-8) : '--'
  const pathSegmentCount = taskPath?.segments?.length ?? 0
  const runtimeDetail = snapshot.shadowDetail || {}
  const startCheckReason =
    typeof runtimeDetail.startCheckReason === 'string' && runtimeDetail.startCheckReason.trim()
      ? runtimeDetail.startCheckReason.trim()
      : snapshot.lastCommandMessage?.trim() || ''
  const visibleStartCheckReason = shouldHideControllerReason(startCheckReason) ? '' : startCheckReason
  const showControlState = !shouldHideControllerControlState(snapshot.controlState)
  const showFaultState = !shouldHideControllerFaultState(snapshot.faultState)
  const visibleHealthState = showFaultState ? snapshot.healthState : 'OK'
  const showRuntimeBanner = Boolean((snapshot.controlState && showControlState) || visibleStartCheckReason)
  const startDistance =
    typeof runtimeDetail.distanceToStartM === 'number' ? runtimeDetail.distanceToStartM : undefined
  const startTolerance =
    typeof runtimeDetail.startToleranceM === 'number' ? runtimeDetail.startToleranceM : undefined
  const runtimeControlState = showControlState ? (snapshot.controlState || '').toUpperCase() : ''
  const runtimeBannerTone = ['BLOCKED', 'DISABLED', 'UNKNOWN'].includes(runtimeControlState) ? 'warning' : 'normal'

  const layoutV2Preview = useMemo(() => {
    if (taskPlanForm.layoutMode !== 'layoutV2') {
      return null
    }

    try {
      const layout: LayoutV2 = buildLayoutV2(taskPlanForm)
      const preview: LayoutPreview = buildLayoutPreview(layout, {
        panelWidth: parseNumber(taskParamsForm.panelWidth, 'panelWidth'),
        panelHeight: parseNumber(taskParamsForm.panelHeight, 'panelHeight'),
        gapX: parseNumber(taskParamsForm.gapX, 'gapX'),
        gapY: parseNumber(taskParamsForm.gapY, 'gapY'),
        panelAngle: parseNumber(taskParamsForm.panelAngle, 'panelAngle'),
        panelAngleX: parseNumber(taskParamsForm.panelAngleX, 'panelAngleX'),
        direction: taskPlanForm.direction,
      })
      const renderModel: LayoutRenderModel = buildLayoutRenderModel(preview)
      return { layout, preview, renderModel, error: '' }
    } catch (error) {
      return {
        layout: null as LayoutV2 | null,
        preview: null as LayoutPreview | null,
        renderModel: null as LayoutRenderModel | null,
        error: extractErrorMessage(error, 'layout v2 preview failed'),
      }
    }
  }, [
    taskParamsForm.gapX,
    taskParamsForm.gapY,
    taskParamsForm.panelAngle,
    taskParamsForm.panelAngleX,
    taskParamsForm.panelHeight,
    taskParamsForm.panelWidth,
    taskPlanForm,
  ])

  const pointModelRender = useMemo<PointTaskRenderModel | null>(() => {
    if (!pointTaskModel) {
      return null
    }

    return buildPointTaskRenderModel(pointTaskModel)
  }, [pointTaskModel])

  const pointDraftRender = useMemo<PointDraftRenderModel>(() => (
    buildPointDraftRenderModel(taskPlanForm.pointModelPoints)
  ), [taskPlanForm.pointModelPoints])

  const statusCards = useMemo(() => ([
    { label: 'Python 状态', value: statusLabel, meta: rawStatus || '--', tone: statusTone },
    ...(showControlState ? [{ label: '控制状态', value: resolveControlStateLabel(snapshot.controlState), meta: 'control_state' }] : []),
    { label: '健康状态', value: resolveHealthStateLabel(visibleHealthState), meta: 'health_state' },
    ...(showFaultState ? [{ label: '故障原因', value: resolveFaultStateLabel(snapshot.faultState), meta: 'fault_state' }] : []),
    { label: '当前动作', value: formatValue(snapshot.action), meta: 'action' },
    { label: '任务名称', value: formatValue(snapshot.taskName), meta: 'task_name' },
    { label: '任务进度', value: taskProgressText, meta: 'cur_task_index / task_count' },
    { label: '车速', value: formatNumber(reportedSpeed, 0, ' cm/s'), meta: 'speed' },
    { label: '刷速', value: formatNumber(snapshot.brushSpeed, 0, ' rpm'), meta: 'brush_speed' },
    { label: '电压', value: formatNumber(snapshot.voltage, 1, ' V'), meta: 'voltage' },
    { label: '航向', value: formatNumber(snapshot.heading, 1, '°'), meta: 'heading' },
    {
      label: '本地坐标',
      value: `${formatNumber(snapshot.localX, 0)} / ${formatNumber(snapshot.localY, 0)}`,
      meta: 'local_x / local_y',
    },
  ]), [

    snapshot.action,
    snapshot.brushSpeed,
    snapshot.controlState,
    snapshot.faultState,
    snapshot.healthState,
    snapshot.heading,
    snapshot.localX,
    snapshot.localY,
    snapshot.taskName,
    snapshot.voltage,
    showControlState,
    showFaultState,
    visibleHealthState,
    statusLabel,
    statusTone,
    taskProgressText,
  ])
  const joystickDirectionLabel = getJoystickDirectionLabel(joystickVector)
  const joystickKnobStyle =
    `transform: translate(${joystickVector.x * JOYSTICK_KNOB_TRAVEL_RPX}rpx, ${-joystickVector.y * JOYSTICK_KNOB_TRAVEL_RPX}rpx);`

  const renderCommandButton = (action: CommandAction, className = '') => (
    <Button
      className={`console-action-btn ${className}`.trim()}
      onClick={() => void runCommand(action)}
      disabled={commandLoading !== null}
      loading={commandLoading === action}
    >
      {commandLoading === action ? commandLabels[action].loading : commandLabels[action].idle}
    </Button>
  )

  const renderLayoutField = (
    label: string,
    value: string,
    onInput: (value: string) => void,
    placeholder = '0',
  ) => (
    <View className="layout-field">
      <Text className="layout-field-label">{label}</Text>
      <Input
        className="layout-field-input"
        value={value}
        placeholder={placeholder}
        onInput={event => onInput(String(event.detail.value))}
      />
    </View>
  )

  const renderLayoutRangeGroup = (groupKey: LayoutRangeGroupKey, title: string, emptyText: string) => (
    <View className="layout-range-group">
      <View className="layout-group-header">
        <View>
          <Text className="layout-group-title">{title}</Text>
          <Text className="layout-group-subtitle">{emptyText}</Text>
        </View>
        <Button className="task-mini-btn layout-add-btn" onClick={() => addLayoutRange(groupKey)}>
          添加
        </Button>
      </View>
      {taskPlanForm[groupKey].length ? taskPlanForm[groupKey].map((item, index) => (
        <View className="layout-edit-card" key={`${groupKey}-${index}`}>
          <View className="layout-card-header">
            <Text className="layout-card-title">第 {index + 1} 项</Text>
            <Button className="layout-delete-btn" onClick={() => removeLayoutRange(groupKey, index)}>
              删除
            </Button>
          </View>
          <View className="layout-field-grid">
            {renderLayoutField('rowStart', item.rowStart, value => updateLayoutRange(groupKey, index, 'rowStart', value))}
            {renderLayoutField('rowEnd', item.rowEnd, value => updateLayoutRange(groupKey, index, 'rowEnd', value))}
            {renderLayoutField('colStart', item.colStart, value => updateLayoutRange(groupKey, index, 'colStart', value))}
            {renderLayoutField('colEnd', item.colEnd, value => updateLayoutRange(groupKey, index, 'colEnd', value))}
          </View>
        </View>
      )) : (
        <View className="layout-empty-card">
          <Text className="layout-empty-text">暂无数据，可点击添加。</Text>
        </View>
      )}
    </View>
  )

  const renderLayoutConnectors = () => (
    <View className="layout-connector-group">
      <View className="layout-group-header">
        <View>
          <Text className="layout-group-title">连接段 connectors</Text>
          <Text className="layout-group-subtitle">保留横向 col / 纵向 row 全部字段</Text>
        </View>
        <Button className="task-mini-btn layout-add-btn" onClick={addLayoutConnector}>
          添加
        </Button>
      </View>
      {taskPlanForm.connectors.length ? taskPlanForm.connectors.map((item, index) => (
        <View className="layout-edit-card" key={`connector-${index}`}>
          <View className="layout-card-header">
            <Text className="layout-card-title">连接段 {index + 1}</Text>
            <Button className="layout-delete-btn" onClick={() => removeLayoutConnector(index)}>
              删除
            </Button>
          </View>
          <View className="layout-connector-type">
            <View
              className={`layout-type-pill ${item.type === 'col' ? 'active' : ''}`}
              onClick={() => updateLayoutConnector(index, 'type', 'col')}
            >
              <Text>横向 col</Text>
            </View>
            <View
              className={`layout-type-pill ${item.type === 'row' ? 'active' : ''}`}
              onClick={() => updateLayoutConnector(index, 'type', 'row')}
            >
              <Text>纵向 row</Text>
            </View>
          </View>
          <View className="layout-field-grid">
            {item.type === 'col' ? (
              <>
                {renderLayoutField('rowStart', item.rowStart, value => updateLayoutConnector(index, 'rowStart', value))}
                {renderLayoutField('rowEnd', item.rowEnd, value => updateLayoutConnector(index, 'rowEnd', value))}
                {renderLayoutField('afterCol', item.afterCol, value => updateLayoutConnector(index, 'afterCol', value))}
                {renderLayoutField('length', item.length, value => updateLayoutConnector(index, 'length', value))}
              </>
            ) : (
              <>
                {renderLayoutField('colStart', item.colStart, value => updateLayoutConnector(index, 'colStart', value))}
                {renderLayoutField('colEnd', item.colEnd, value => updateLayoutConnector(index, 'colEnd', value))}
                {renderLayoutField('afterRow', item.afterRow, value => updateLayoutConnector(index, 'afterRow', value))}
                {renderLayoutField('length', item.length, value => updateLayoutConnector(index, 'length', value))}
              </>
            )}
          </View>
        </View>
      )) : (
        <View className="layout-empty-card">
          <Text className="layout-empty-text">暂无连接段。</Text>
        </View>
      )}
    </View>
  )

  const renderPointModelEditor = () => (
    <View className="point-model-editor">
      <View className="point-model-control-panel">
        <View className="point-model-control-copy">
          <Text className="layout-preview-title">打点控制</Text>
          <Text className="layout-preview-text">摇杆移动车辆，停到外围点后点击打当前点；当前只记录外围点并生成模型。</Text>
        </View>
        <View className="point-model-joystick-card">
          <View
            className={`joystick-surface ${joystickActive ? 'joystick-surface--active' : ''}`}
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={resetJoystick}
            onTouchCancel={resetJoystick}
          >
            <View className="joystick-axis joystick-axis--x" />
            <View className="joystick-axis joystick-axis--y" />
            <View className="joystick-ring joystick-ring--outer" />
            <View className="joystick-ring joystick-ring--inner" />
            <View
              className={`joystick-knob ${joystickActive ? 'joystick-knob--active' : ''}`}
              style={joystickKnobStyle}
            >
              <Text className="joystick-knob-text">{joystickActive ? '控制' : '摇杆'}</Text>
            </View>
          </View>
          <View className="joystick-readout">
            <View className="joystick-readout-item">
              <Text className="joystick-readout-label">方向</Text>
              <Text className="joystick-readout-value">{joystickDirectionLabel}</Text>
            </View>
            <View className="joystick-readout-item">
              <Text className="joystick-readout-label">强度</Text>
              <Text className="joystick-readout-value">{joystickVector.power}%</Text>
            </View>
            <View className="joystick-readout-item">
              <Text className="joystick-readout-label">向量</Text>
              <Text className="joystick-readout-value">
                {joystickVector.x.toFixed(2)} / {joystickVector.y.toFixed(2)}
              </Text>
            </View>
          </View>
          <Text className="joystick-status">{joystickStatus}</Text>
        </View>
      </View>

      <View className="point-model-toolbar">
        <View className="point-model-current-grid">
          <View className="point-model-current">
            <Text className="point-model-label">当前相对坐标</Text>
            <Text className="point-model-value">
              {formatNumber(snapshot.localX, 2)} / {formatNumber(snapshot.localY, 2)}
            </Text>
          </View>
          <View className="point-model-current">
            <Text className="point-model-label">当前绝对坐标</Text>
            <Text className="point-model-value point-model-value--geo">
              {formatCoordinate(snapshot.lat, 8)} / {formatCoordinate(snapshot.lon, 8)}
            </Text>
          </View>
        </View>
        <View className="point-model-actions">
          <Button className="point-model-btn" onClick={capturePointModelCurrentPoint}>
            打当前点
          </Button>
          <Button className="point-model-btn" onClick={clearPointModelPoints}>
            清空
          </Button>
        </View>
      </View>

      <View className="point-model-record-panel">
        <View className="point-model-record-header">
          <Text className="layout-preview-title">已打点记录</Text>
          <Text className="point-model-record-count">{taskPlanForm.pointModelPoints.length} 个点</Text>
        </View>
        {taskPlanForm.pointModelPoints.length ? (
          <View className="point-model-record-table">
            <View className="point-model-record-row point-model-record-row--head">
              <Text className="point-model-record-cell point-model-record-cell--index">点</Text>
              <Text className="point-model-record-cell">相对坐标</Text>
              <Text className="point-model-record-cell">绝对坐标</Text>
              <Text className="point-model-record-cell point-model-record-cell--action">操作</Text>
            </View>
            {taskPlanForm.pointModelPoints.map((point, index) => (
              <View className="point-model-record-row" key={`point-record-${index}`}>
                <Text className="point-model-record-cell point-model-record-cell--index">P{index + 1}</Text>
                <Text className="point-model-record-cell point-model-record-value">
                  {point.x || '--'} / {point.y || '--'}
                </Text>
                <Text className="point-model-record-cell point-model-record-value point-model-record-value--geo">
                  {point.lat || '--'} / {point.lon || '--'}
                </Text>
                <View className="point-model-record-cell point-model-record-cell--action">
                  <Button className="point-model-delete-btn" onClick={() => removePointModelPoint(index)}>
                    删除
                  </Button>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="point-model-record-empty">
            <Text className="point-model-empty-text">还没有打点。停到外围点后点击“打当前点”，这里会保存相对坐标和绝对坐标。</Text>
          </View>
        )}
      </View>

      {pointDraftRender.pointCount ? (
        <View className="point-model-preview point-model-draft-preview">
          <Text className="layout-preview-title">实时外围点</Text>
          <View className="layout-map point-model-map">
            <View
              className="layout-map-origin layout-map-origin--x"
              style={`left: ${pointDraftRender.origin.leftPct}%;`}
            />
            <View
              className="layout-map-origin layout-map-origin--y"
              style={`top: ${pointDraftRender.origin.topPct}%;`}
            />
            {pointDraftRender.pathSegments.map((segment, index) => (
              <View
                key={`point-draft-segment-${index}`}
                className={`layout-map-segment point-model-segment point-model-segment--draft ${segment.isVertical ? 'layout-map-segment--vertical' : ''}`}
                style={`left: ${segment.leftPct}%; top: ${segment.topPct}%; width: ${segment.widthPct}%; height: ${segment.heightPct}%;`}
              />
            ))}
            {pointDraftRender.points.map((point, index) => (
              <View
                key={`point-draft-dot-${index}`}
                className="point-model-dot point-model-dot--draft"
                style={`left: ${point.leftPct}%; top: ${point.topPct}%;`}
              >
                <Text className="point-model-dot-text">{index + 1}</Text>
              </View>
            ))}
          </View>
          <Text className="layout-preview-text">
            已打 {pointDraftRender.pointCount} 个外围点
            {pointDraftRender.isClosed ? '，预览已自动闭合' : '，继续打点后形成外围轮廓'}
            {pointDraftRender.invalidCount ? `，${pointDraftRender.invalidCount} 个点坐标未完整` : ''}
          </Text>
          <View className="point-model-coordinate-list">
            {pointDraftRender.points.map((point, index) => (
              <Text className="point-model-coordinate-item" key={`point-draft-coordinate-${index}`}>
                P{index + 1}: {formatNumber(point.x, 2)} / {formatNumber(point.y, 2)}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {pointTaskModel && pointModelRender ? (
        <View className="point-model-preview">
          <Text className="layout-preview-title">已生成模型</Text>
          <View className="layout-map point-model-map">
            <View
              className="layout-map-origin layout-map-origin--x"
              style={`left: ${pointModelRender.origin.leftPct}%;`}
            />
            <View
              className="layout-map-origin layout-map-origin--y"
              style={`top: ${pointModelRender.origin.topPct}%;`}
            />
            {pointModelRender.pathSegments.map((segment, index) => (
              <View
                key={`point-segment-${index}`}
                className={`layout-map-segment point-model-segment ${segment.isVertical ? 'layout-map-segment--vertical' : ''}`}
                style={`left: ${segment.leftPct}%; top: ${segment.topPct}%; width: ${segment.widthPct}%; height: ${segment.heightPct}%;`}
              />
            ))}
            {pointModelRender.points.map((point, index) => (
              <View
                key={`point-dot-${index}`}
                className="point-model-dot"
                style={`left: ${point.leftPct}%; top: ${point.topPct}%;`}
              >
                <Text className="point-model-dot-text">{index + 1}</Text>
              </View>
            ))}
          </View>
          <Text className="layout-preview-text">
            points {pointTaskModel.pointCount} / area {formatNumber(pointTaskModel.area, 0)} / perimeter {formatNumber(pointTaskModel.perimeter, 0)}
          </Text>
          <Text className="layout-preview-text">
            bounds x {formatNumber(pointTaskModel.bounds.minX, 0)}..{formatNumber(pointTaskModel.bounds.maxX, 0)}
            {' '}y {formatNumber(pointTaskModel.bounds.minY, 0)}..{formatNumber(pointTaskModel.bounds.maxY, 0)}
          </Text>
          <View className="point-model-coordinate-list">
            {pointTaskModel.outline.map((point, index) => (
              <Text className="point-model-coordinate-item" key={`point-model-coordinate-${index}`}>
                P{index + 1}: 相对 {formatNumber(point.x, 2)} / {formatNumber(point.y, 2)}
                {' '}绝对 {formatCoordinate(point.lat, 8)} / {formatCoordinate(point.lon, 8)}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )



  const loadData = async () => {


    if (activeTab !== 'control') {
      console.log('当前不在控制页面，跳过绘制')
      return
    } else {
      if (!isActivecontrol.current) {
        return
      } else {
        let rawPoints = [];

        try {
          rawPoints.length = 0;
          const res = await deviceStatusService.getDeviceShadow(taskProductId)
          console.log('-------', res)
          setTaskdistance(res.detail.distanceToTaskOriginM)
          setTaskStartToleranceM(res.detail.taskOriginToleranceM)
          const distanceCm = Number((res.detail.distanceToTaskOriginM * 100).toFixed(2));
          const toleranceCm = Number((res.detail.taskOriginToleranceM * 100).toFixed(2));

          const newParams = {
            currentHeading: res.detail.currentHeading || 0,
            currentLat: res.detail.currentLat || 0,
            currentLon: res.detail.currentLon || 0,
            originHeading: res.detail.originHeading || 0,
            taskStartLat: res.detail.taskStartLat || 0,
            taskStartLon: res.detail.taskStartLon || 0,
            taskdistance: distanceCm,
            taskstartToleranceM: toleranceCm,
          };

          setCanvasParams(newParams);

          console.log('-------', res.detail.taskStartLat)
          if (res.detail.taskStartLat == undefined) {
            // ✅ 清空画布，防止残留
            const ctx = Taro.createCanvasContext('point-canvas');
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.draw(true);
          } else {
            // ✅ 准备并过滤新数据
            const newPoints = [
              {
                x: res.detail.taskStartLat,
                y: res.detail.taskStartLon,
                heading: res.detail.originHeading || 0,
                lat: res.detail.taskStartLat,
                lon: res.detail.taskStartLon,
                type: 'origin',
                label: '原点位置'
              },
              {
                x: res.detail.currentLat,
                y: res.detail.currentLon,
                heading: res.detail.currentHeading || 0,
                lat: res.detail.currentLat,
                lon: res.detail.currentLon,
                type: 'vehicle',
                label: '机器人位置'
              }
            ].filter(p => {
              // 过滤条件：x和y都存在，且不为0
              return p.x != null && p.y != null && p.x !== 0 && p.y !== 0;
            });

            // ✅ 添加有效数据
            rawPoints.push(...newPoints);


            if (rawPoints.length === 0) {
              setTaskmsg('❌ 无点位数据,请检查传感器或定位信号')
            } else if (rawPoints.length > 0) {

              console.log(" 容错范围", toleranceCm,
                ' 当前距离:', distanceCm
              )  // ✅ 读取全局变量

              if (distanceCm <= toleranceCm) {
                setTaskmsg('✅ 点位已对齐,可以启动')
              } else {
                setTaskmsg('⚠️ 点位未对齐,请调整位置')
              }
            }

            const canvasWidth = CANVAS_WIDTH
            const canvasHeight = CANVAS_HEIGHT

            const ctx = Taro.createCanvasContext('point-canvas')

            const query = Taro.createSelectorQuery()


            // 不管有没有 class，用 #id 一定能找到
            query.select('#point-canvas').boundingClientRect((rect: any) => {
              if (!rect) {
                console.warn('元素未找到')
                return
              }
              // console.log('✅ 找到了:', rect)
              // })


              // console.log('📍', rawPoints)
              // ====== 开始绘制 ======

              ctx.clearRect(0, 0, canvasWidth, canvasHeight)
              ctx.setFillStyle('rgba(7, 17, 31, 1)')
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
              const lats = rawPoints.map(p => p.x)  // 纬度
              const lngs = rawPoints.map(p => p.y)  // 经度
              const MIN_RANGE = 0.0001  // 约 11.1 米
              const minLat = Math.min(...lats)
              const maxLat = Math.max(...lats)
              const minLng = Math.min(...lngs)
              const maxLng = Math.max(...lngs)
              const latRange = Math.max(maxLat - minLat, MIN_RANGE)
              const lngRange = Math.max(maxLng - minLng, MIN_RANGE)

              let zoomFactor = 600 / (distanceCm + 40)

              // 限制范围
              zoomFactor = Math.max(zoomFactor, 0.05)   // 最小 0.5 倍
              zoomFactor = Math.min(zoomFactor, 25)    // 最大 15 倍

              console.log(`🔍 缩放倍数: ${zoomFactor.toFixed(2)}x`)

              const centerLat = (minLat + maxLat) / 2
              const centerLng = (minLng + maxLng) / 2

              const zoomedLatRange = latRange / zoomFactor
              const zoomedLngRange = lngRange / zoomFactor

              const newMinLat = centerLat - zoomedLatRange / 2
              const newMaxLat = centerLat + zoomedLatRange / 2
              const newMinLng = centerLng - zoomedLngRange / 2
              const newMaxLng = centerLng + zoomedLngRange / 2

              function toCanvas(lat, lng) {
                const y = ((newMaxLat - lat) / (newMaxLat - newMinLat)) * canvasHeight
                const x = ((lng - newMinLng) / (newMaxLng - newMinLng)) * canvasWidth
                return { x, y }
              }

              const points = rawPoints.map(p => {
                const pos = toCanvas(p.x, p.y)
                // console.log(`📍 ${p.label}: 原始(${p.x}, ${p.y}) → Canvas(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`)
                return {
                  x: pos.x,
                  y: pos.y,
                  lat: p.x,
                  lng: p.y,
                  plat: p.lat,
                  plon: p.lon,
                  heading: p.heading,
                  type: p.type,
                  label: p.label,
                }
              })


              const gridCount = Math.max(4, Math.min(20, Math.round(10 / zoomFactor)))

              ctx.setStrokeStyle('rgba(134, 134, 134, 0.34)')
              ctx.setLineWidth(0.4)
              for (let i = 0; i <= gridCount; i++) {

                const lng = newMinLng + (zoomedLngRange / gridCount) * i
                const pos = toCanvas(newMinLat, lng)
                ctx.beginPath()
                ctx.moveTo(pos.x, 0)
                ctx.lineTo(pos.x, canvasHeight)
                ctx.stroke()


                const lat = newMaxLat - (zoomedLatRange / gridCount) * i
                const pos2 = toCanvas(lat, newMinLng)
                ctx.beginPath()
                ctx.moveTo(0, pos2.y)
                ctx.lineTo(canvasWidth, pos2.y)
                ctx.stroke()
              }

              const origin = rawPoints.find(p => p.type === 'origin')
              if (!origin) {
                // console.warn('⚠️ 未找到原点')
                return
              }

              const originPos = toCanvas(origin.x, origin.y)
              ctx.beginPath()
              ctx.arc(originPos.x, originPos.y, 8 + 3 + toleranceCm * 0.06, 0, 2 * Math.PI)
              ctx.setFillStyle('rgba(34, 197, 94, 0.15)')
              ctx.fill()
              ctx.setStrokeStyle('rgba(34, 197, 94, 0.5)')
              ctx.setLineWidth(0.6)
              ctx.stroke()


              const vehicle = rawPoints.find(p => p.type === 'vehicle');

              // 计算相对位置
              const dx = (vehicle?.x || 0) - (origin?.x || 0);
              const dy = (vehicle?.y || 0) - (origin?.y || 0);
              const originOnRight = dx > 0;
              const originOnBottom = dy > 0;


              // , `航向: ${point.heading || 0}`
              points.forEach(point => {
                const infoLines = [
                  ` ${(point.plon || 0).toFixed(4)},${(point.plat || 0).toFixed(4)}`
                  // `经度: ${(point.plon || 0).toFixed(4)}`,
                  // `纬度: ${(point.plat || 0).toFixed(4)}`
                ];
                console.log("infoX", infoLines,)
                const lineHeight = 10;
                const padding = 4;//左右
                const offset = 5; // 点与信息框的间距+ padding * 2;+ padding * 1.5;
                let infoX, infoY;
                // 计算信息框尺寸
                const maxWidth = Math.max(...infoLines.map(line => ctx.measureText(line).width));
                const boxWidth = maxWidth
                const boxHeight = infoLines.length * lineHeight
                const isOrigin = point.type === 'origin';

                // ===== 1. 根据相对位置选择方向 =====
                if (isOrigin) {
                  // 原点：zuo方向
                  infoX = originOnRight ? point.x - boxWidth - offset * 2 : point.x + offset * 2;
                  infoY = originOnBottom ? point.y - boxHeight - offset : point.y + offset;
                } else {
                  // 机器人：方向
                  infoX = originOnRight ? point.x + offset * 2 : point.x - boxWidth - offset * 2;//youzuo
                  infoY = originOnBottom ? point.y + offset : point.y - boxHeight - offset;
                }

                // ===== 2. 边界强制修正（确保不超出） =====
                // 水平修正
                if (infoX < 0) {
                  // 左边超出 → 改到右边
                  infoX = point.x - offset * 2;
                }
                if (infoX + boxWidth > canvasWidth - 15) {
                  // 右边超出 → 改到左边
                  infoX = point.x - boxWidth - offset * 2;
                }
                // 如果左右都超出 → 居中
                if (infoX < 0 || infoX + boxWidth > canvasWidth - 15) {
                  infoX = (canvasWidth - boxWidth) / 2;
                }

                // 垂直修正
                if (infoY < 0) {
                  // 上边超出 → 改到下边
                  infoY = point.y + offset;
                }
                if (infoY + boxHeight > canvasHeight) {
                  // 下边超出 → 改到上边
                  infoY = point.y - boxHeight - offset;
                }
                // 如果上下都超出 → 居中
                if (infoY < 0 || infoY + boxHeight > canvasHeight) {
                  infoY = (canvasHeight - boxHeight) / 2;
                }

                // ===== 3. 最终安全边界（保底） =====
                infoX = Math.max(0, Math.min(infoX, canvasWidth - boxWidth));
                infoY = Math.max(0, Math.min(infoY, canvasHeight - boxHeight));


                ctx.setFontSize(9);
                ctx.setTextAlign('left');
                ctx.setTextBaseline('top');
                // ctx.fillStyle = 'rgba(70, 95, 122, 0.3)';
                // // 绘制圆角矩形背景（可选）
                // const radius = 4; // 圆角大小
                // ctx.beginPath();
                // ctx.moveTo(infoX + radius, infoY);
                // ctx.lineTo(infoX + boxWidth - radius, infoY);
                // ctx.quadraticCurveTo(infoX + boxWidth, infoY, infoX + boxWidth, infoY + radius);
                // ctx.lineTo(infoX + boxWidth, infoY + boxHeight - radius);
                // ctx.quadraticCurveTo(infoX + boxWidth, infoY + boxHeight, infoX + boxWidth - radius, infoY + boxHeight);
                // ctx.lineTo(infoX + radius, infoY + boxHeight);
                // ctx.quadraticCurveTo(infoX, infoY + boxHeight, infoX, infoY + boxHeight - radius);
                // ctx.lineTo(infoX, infoY + radius);
                // ctx.quadraticCurveTo(infoX, infoY, infoX + radius, infoY);
                // ctx.closePath();
                // ctx.fill();

                // 画圆点
                if (point.type === 'origin') {
                  ctx.setFillStyle('#22d3ee')   // 原点位置22d3ee青色

                  infoLines.forEach((line, index) => {
                    const textX = infoX + padding;
                    const textY = infoY + padding + index * lineHeight;
                    ctx.fillText(line, textX, textY);
                  });

                } else if (point.type === 'vehicle') {
                  ctx.setFillStyle('#735ee7')   // 机器人位置735ee7

                  infoLines.forEach((line, index) => {
                    const textX = infoX + padding;
                    const textY = infoY + padding + index * lineHeight;
                    ctx.fillText(line, textX, textY);
                  });

                } else {
                  ctx.setFillStyle('#ffffff')   // 默认白色
                }

                ctx.beginPath()
                ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI)
                ctx.fill()
              })

              // && 
              if (isActivecontrol.current && activeTab === 'control') {
                ctx.draw(true, () => {
                  console.log('✅ 绘制完成，可以查看')
                })
              }
            }).exec();

          }
        } catch (error) {


          console.error('getDeviceShadow加载失败:', error);
        }
      }
    }
  };
  const [expanded, setExpanded] = useState(false)

  const handleToggle = () => {
    setExpanded(!expanded)
  }

  const toggleSection = (key) => {
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  // 通用的更新函数，支持多个数据源
  function updateDataFromApi(dataObject, apiData) {
    for (const key in dataObject) {
      const section = dataObject[key];

      // 处理直接包含 attrs 的情况（如 panelData）
      if (section.attrs && !section.title) {
        section.attrs.forEach(item => {
          if (item.field && apiData[item.field] !== undefined) {
            item.value = apiData[item.field];
          }
        });
      }

      // 处理包含 title 和 attrs 的情况（如 vehicleData 的 body、battery 等）
      if (section.title && section.attrs) {
        section.attrs.forEach(item => {
          if (item.field && apiData[item.field] !== undefined) {
            item.value = apiData[item.field];
          }
        });
      }

      // 处理包含 children 的情况（如 vehicleData 的 hardware）
      if (section.children) {
        section.children.forEach(child => {
          child.attrs.forEach(item => {
            if (item.field && apiData[item.field] !== undefined) {
              item.value = apiData[item.field];
            }
          });
        });
      }
    }
  }

  const [expandedSections, setExpandedSections] = useState({
    body: true,
    battery: true,
    brush: true,
    steering: true,
    airPump: true,
    solenoidValve: true,
    hardware: true,
    panel: true,
    ultrasonic: true,
    rtk: true,
  })

  // 模拟数据

  const vehicleData = {
    body: {
      title: '本体',
      attrs: [
        { label: '小车ID', value: 'T01250005', field: 'vehicleId' },
        { label: '当前行驶速度', value: '1.2 m/s', field: 'currentSpeed' },
        { label: '行驶里程', value: '128.5 m', field: 'totalMileage' },
        { label: '使能/通电状态', value: '已使能', field: 'enableStatus' },
        { label: '转向速度', value: '30°/s', field: 'steeringSpeed' },
        { label: '当前工作模式', value: '自动模式', field: 'workMode' },
      ]
    },
    battery: {
      title: '电池',
      attrs: [
        { label: '电池电压', value: '48.2 V', field: 'batteryVoltage' },
        { label: '电池电流', value: '15.6 A', field: 'batteryCurrent' },
        { label: '电池温度', value: '36°C', field: 'batteryTemp' },
        { label: 'SOC', value: '85%', field: 'soc' },
        { label: 'SOH', value: '95%', field: 'soh' },
        { label: '电池状态', value: '正常', field: 'batteryStatus' },
        { label: '低电阈值', value: '20%', field: 'lowPowerThreshold' },
        { label: '数据更新时间', value: '2026-06-30 14:30:25', field: 'batteryUpdateTime' },
      ]
    },
    brush: {
      title: '滚刷',
      attrs: [
        { label: '当前滚刷速度', value: '800 rpm', field: 'brushSpeed' },
        { label: '滚刷状态', value: '运行中', field: 'brushStatus' },
        { label: '前滚刷重量', value: '2.5 kg', field: 'frontBrushWeight' },
        { label: '后滚刷重量', value: '2.5 kg', field: 'rearBrushWeight' },
        { label: '前滚刷宽度', value: '80 cm', field: 'frontBrushWidth' },
        { label: '后滚刷宽度', value: '80 cm', field: 'rearBrushWidth' },
      ]
    },
    hardware: {
      title: '硬件',
      attrs: [
        { label: '硬件总体状态', value: '正常', field: 'hardwareOverallStatus' },
        { label: '数据更新时间', value: '2026-06-30 14:30:25', field: 'hardwareUpdateTime' },
      ],
      children: [
        {
          key: 'steering',
          title: '舵机',
          attrs: [
            { label: '舵机状态', value: '正常', field: 'steeringStatus' },
            { label: '当前位置状态', value: '抬升', field: 'steeringPosition' },
          ]
        },
        {
          key: 'airPump',
          title: '气泵',
          attrs: [
            { label: '气泵状态', value: '正常', field: 'airPumpStatus' },
            { label: '工作状态', value: '工作中', field: 'airPumpWorkStatus' },
          ]
        },
        {
          key: 'solenoidValve',
          title: '电磁阀',
          attrs: [
            { label: '电磁阀状态', value: '关闭', field: 'solenoidValveStatus' },
            { label: '开关状态', value: '关闭', field: 'solenoidValveSwitch' },
          ]
        },
        {
          key: 'ultrasonic',
          title: '超声波传感器',
          attrs: [
            { label: '超声波状态', value: '正常', field: 'ultrasonicStatus' },
            { label: '测量值', value: '0.5 m', field: 'ultrasonicValue' },
          ]
        },
      ]
    },
    rtk: {
      title: 'RTK',
      attrs: [
        { label: '当前纬度', value: '32.0589° N', field: 'latitude' },
        { label: '当前经度', value: '118.7832° E', field: 'longitude' },
        { label: '高程/海拔', value: '15.6 m', field: 'altitude' },
        { label: '航向角', value: '45.2°', field: 'headingAngle' },
        { label: '俯仰角', value: '2.1°', field: 'pitchAngle' },
        { label: '横滚角', value: '1.5°', field: 'rollAngle' },
        { label: '定位解状态', value: '固定解', field: 'positionStatus' },
        { label: '定向/姿态解状态', value: '固定解', field: 'orientationStatus' },
        { label: '卫星数量', value: '18', field: 'satelliteCount' },
        { label: '水平精度因子', value: '0.8', field: 'hdop' },
        { label: '差分龄期', value: '2.5 s', field: 'differentialAge' },
        { label: '基站ID', value: 'BASE-001', field: 'baseStationId' },
        { label: '数据更新时间', value: '2026-06-30 14:30:25', field: 'rtkUpdateTime' },
      ]
    }
  };


  const panelData = {
    title: '光伏板',
    attrs: [
      { label: '光伏板宽度', value: '100 cm', field: 'panelWidth' },
      { label: '光伏板长度', value: '200 cm', field: 'panelLength' },
      { label: '光伏板高度', value: '30 cm', field: 'panelHeight' },
      { label: 'X方向倾斜角', value: '15°', field: 'tiltAngleX' },
      { label: 'X方向板间距', value: '10 cm', field: 'spacingX' },
      { label: 'Y方向板间距', value: '10 cm', field: 'spacingY' },
    ]
  };


  interface Point {
    x: number;
    y: number;
  }

  const SHAPE = {

    rectTop: { x: 20, y: 25, w: 300, h: 95 },
    bridge: { x: 20, y: 120, w: 16, h: 16 },
    rectBottom: { x: 20, y: 136, w: 300, h: 95 },
  };

  // 规划路径点
  const PATH_POINTS: Point[] = [
    { x: 26, y: 225 },
    { x: 26, y: 32 },
    { x: 315, y: 32 },
    { x: 315, y: 58 },
    { x: 26, y: 58 },
    { x: 26, y: 84 },
    { x: 315, y: 84 },
    { x: 315, y: 110 },
    { x: 26, y: 110 },
  ];


  const [position, setPosition] = useState<Point>(PATH_POINTS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showPath, setShowPath] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(10);

  // Canvas 相关
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isCanvasReady = useRef<boolean>(false);
  const isFirstDraw = useRef<boolean>(true);

  // 轨迹数据
  const trailRef = useRef<Point[]>([PATH_POINTS[0]]);
  const drawnCountRef = useRef<number>(1);

  // 路径移动相关
  const pathIndexRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const positionRef = useRef<Point>(PATH_POINTS[0]);

  // ===== ★★★ 新增：绘制频率控制 ★★★ =====
  const lastDrawTime = useRef<number>(0);
  const DRAW_INTERVAL = 20; // 每 50ms 绘制一次（20fps）

  const isDrawing = useRef<boolean>(false);

  // ============================================================
  // 获取 DPR
  // ============================================================
  const getDpr = useCallback(() => {
    try {
      const deviceInfo = Taro.getDeviceInfo() as { pixelRatio?: number };
      return deviceInfo.pixelRatio || 2;
    } catch {
      try {
        const systemInfo = Taro.getSystemInfoSync() as { pixelRatio?: number };
        return systemInfo.pixelRatio || 2;
      } catch {
        return 2;
      }
    }
  }, []);

  // ============================================================
  // 绘制背景
  // ============================================================
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, W, H);

    const buildShapePath = () => {
      const { rectTop, bridge, rectBottom } = SHAPE;
      ctx.beginPath();
      ctx.rect(rectTop.x, rectTop.y, rectTop.w, rectTop.h);
      ctx.rect(bridge.x, bridge.y, bridge.w, bridge.h);
      ctx.rect(rectBottom.x, rectBottom.y, rectBottom.w, rectBottom.h);
      ctx.closePath();
    };

    ctx.save();
    buildShapePath();
    ctx.clip();

    const centerX = W / 2;
    const centerY = H / 2;
    const grad = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, Math.max(W, H) / 2);
    grad.addColorStop(0, '#1a1a5e');
    grad.addColorStop(1, '#0a0a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridStep = 15;
    for (let x = 0; x < W; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    if (showPath) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PATH_POINTS[0].x, PATH_POINTS[0].y);
      for (let i = 1; i < PATH_POINTS.length; i++) {
        ctx.lineTo(PATH_POINTS[i].x, PATH_POINTS[i].y);
      }
      ctx.stroke();
      ctx.restore();

      ctx.save();
      for (let i = 0; i < PATH_POINTS.length; i++) {
        const p = PATH_POINTS[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = i === pathIndexRef.current ? 'rgba(34, 211, 238, 0.7)' : 'rgba(34, 211, 238, 0.25)';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(i), p.x, p.y - 6);
      }
      ctx.restore();
    }

    ctx.save();
    buildShapePath();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const { rectTop, bridge, rectBottom } = SHAPE;
    ctx.fillText('上区域', rectTop.x + rectTop.w / 2, rectTop.y + rectTop.h / 2);
    ctx.fillText('桥', bridge.x + bridge.w / 2, bridge.y + bridge.h / 2);
    ctx.fillText('下区域', rectBottom.x + rectBottom.w / 2, rectBottom.y + rectBottom.h / 2);
    ctx.restore();

    ctx.restore();
  }, [showPath]);

  // ============================================================
  // ★★★ 批量绘制轨迹（一次性绘制所有待处理的点） ★★★
  // ============================================================
  const drawTrailBatch = useCallback((ctx: CanvasRenderingContext2D) => {
    // const trail = trailRef.current;
    // const drawnCount = drawnCountRef.current;

    // // 从已绘制的位置开始绘制
    // for (let i = Math.max(1, drawnCount); i < trail.length; i++) {
    //   const p1 = trail[i - 1];
    //   const p2 = trail[i];
    //   const alpha = 0.2 + 0.8 * (i / trail.length);
    //   ctx.beginPath();
    //   ctx.moveTo(p1.x, p1.y);
    //   ctx.lineTo(p2.x, p2.y);
    //   ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
    //   ctx.lineWidth = 1.5 + 2.5 * (i / trail.length);
    //   ctx.shadowColor = '#22d3ee';
    //   ctx.shadowBlur = 3;
    //   ctx.stroke();
    // }

    // drawnCountRef.current = trail.length;
  }, []);

  // ============================================================
  // 绘制机器人
  // ============================================================
  const drawRobot = useCallback((ctx: CanvasRenderingContext2D) => {
    const px = position.x;
    const py = position.y;
    if (px <= 0 || py <= 0) return;

    const grad2 = ctx.createRadialGradient(px, py, 2, px, py, 16);
    grad2.addColorStop(0, '#7ae9ff');
    grad2.addColorStop(0.3, '#22d3ee');
    grad2.addColorStop(1, 'rgba(34,211,238,0.5)');
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = grad2;
    ctx.fill();

    // ctx.shadowBlur = 0;
    // ctx.beginPath();
    // ctx.arc(px - 1.5, py - 1.5, 2, 0, Math.PI * 2);
    // ctx.fillStyle = 'rgba(255,255,255,0.4)';
    // ctx.fill();
  }, [position]);


  // ★★★ 主绘制函数（带防抖） ★★★
  // ============================================================
  const draw = useCallback(() => {
    console.log('🎨 draw 被调用');
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // 如果正在绘制，跳过
    if (isDrawing.current) return;
    isDrawing.current = true;

    try {
      const dpr = getDpr();
      const canvasWidth = 350;
      const canvasHeight = 280;

      const pixelWidth = canvasWidth * dpr;
      const pixelHeight = canvasHeight * dpr;
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      if (isFirstDraw.current) {
        drawBackground(ctx, canvasWidth, canvasHeight);

        const trail = trailRef.current;
        for (let i = 1; i < trail.length; i++) {
          const p1 = trail[i - 1];
          const p2 = trail[i];
          const alpha = 0.2 + 0.8 * (i / trail.length);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
          ctx.lineWidth = 1.5 + 2.5 * (i / trail.length);
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 6;
          ctx.stroke();
        }
        drawnCountRef.current = trail.length;

        drawRobot(ctx);

        isFirstDraw.current = false;
        isCanvasReady.current = true;
        isDrawing.current = false;
        return;
      }
      drawRobot(ctx);
      // 增量绘制
      drawTrailBatch(ctx);


      isCanvasReady.current = true;
    } catch (e) {
      console.warn('绘制错误:', e);
    } finally {
      isDrawing.current = false;
    }

    // isDrawing.current = false;
  }, [drawBackground, drawTrailBatch, drawRobot, getDpr]);

  // ============================================================
  // 初始化 Canvas
  // ============================================================
  useEffect(() => {
    const initCanvas = () => {
      const query = Taro.createSelectorQuery();
      query.select('#pathCanvas')
        .node((res: any) => {
          if (res && res.node) {
            const canvas = res.node as HTMLCanvasElement;
            canvasRef.current = canvas;
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
            ctxRef.current = ctx;
            isFirstDraw.current = true;
            draw();
          }
        })
        .exec();
    };

    setTimeout(initCanvas, 1000);
  }, [draw]);

  // ============================================================
  // // showPath 变化时重绘
  // // ============================================================
  // useEffect(() => {
  //   if (isCanvasReady.current) {
  //     isFirstDraw.current = true;
  //     draw();

  //   }
  // }, [showPath, draw]);

  // ============================================================
  // ★★★ 移动逻辑（优化版：控制绘制频率） ★★★
  // ============================================================
  const moveAlongPath = useCallback(() => {
    if (!isPlaying) return;

    const start = PATH_POINTS[pathIndexRef.current];
    const end = PATH_POINTS[pathIndexRef.current + 1];

    if (!end) {
      pathIndexRef.current = 0;
      progressRef.current = 0;
      trailRef.current = [PATH_POINTS[0]];
      drawnCountRef.current = 1;
      positionRef.current = PATH_POINTS[0];
      // setPosition(PATH_POINTS[0]);
      isFirstDraw.current = true;
      draw();
      return;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const totalDist = Math.sqrt(dx * dx + dy * dy);

    if (totalDist === 0) {
      pathIndexRef.current++;
      return;
    }

    const step = speed / 60 * 100;
    const stepProgress = step / totalDist;
    progressRef.current += stepProgress;

    let newPos: Point;

    if (progressRef.current >= 1) {
      progressRef.current = 0;
      pathIndexRef.current++;

      if (pathIndexRef.current >= PATH_POINTS.length - 1) {
        newPos = PATH_POINTS[PATH_POINTS.length - 1];
        trailRef.current.push(newPos);

        positionRef.current = newPos;
        // setPosition(newPos);
        draw();

        setTimeout(() => {
          pathIndexRef.current = 0;
          progressRef.current = 0;
          const p0 = PATH_POINTS[0];
          trailRef.current = [p0];
          drawnCountRef.current = 1;
          positionRef.current = p0;
          // setPosition(p0);
          isFirstDraw.current = true;
          draw();
        }, 3500);
        return;
      }

      newPos = PATH_POINTS[pathIndexRef.current];
    } else {
      const currentStart = PATH_POINTS[pathIndexRef.current];
      const currentEnd = PATH_POINTS[pathIndexRef.current + 1];
      newPos = {
        x: currentStart.x + (currentEnd.x - currentStart.x) * progressRef.current,
        y: currentStart.y + (currentEnd.y - currentStart.y) * progressRef.current,
      };
    }
    positionRef.current = newPos;
    // 更新位置
    setPosition(newPos);
    trailRef.current.push(newPos);


    const now = Date.now();
    if (now - lastDrawTime.current >= DRAW_INTERVAL) {
      lastDrawTime.current = now;
      draw();
    }

  }, [isPlaying, speed, draw]);
  // ============================================================
  // ★★★ 用 setInterval 替代 requestAnimationFrame ★★★
  // ============================================================
  useEffect(() => {
    // 清除旧定时器
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isPlaying) return;

    // ★★★ 每秒执行一次 ★★★
    timerRef.current = setInterval(() => {
      moveAlongPath();
    }, 1500);  // 1000ms = 1秒

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, moveAlongPath]);
  // ============================================================
  // 动画循环
  // ============================================================
  // useEffect(() => {
  //   const animate = () => {
  //     moveAlongPath();
  //     animFrameRef.current = requestAnimationFrame(animate);
  //   };

  //   animate();

  //   return () => {
  //     if (animFrameRef.current) {
  //       cancelAnimationFrame(animFrameRef.current);
  //       animFrameRef.current = null;
  //     }
  //   };
  // }, [moveAlongPath]);

  // ============================================================
  // 清空轨迹
  // ============================================================
  const clearTrail = useCallback(() => {
    trailRef.current = [{ x: position.x, y: position.y }];
    drawnCountRef.current = 1;
    isFirstDraw.current = true;
    draw();
  }, [position, draw]);

  // ============================================================
  // 重置路径
  // ============================================================
  const resetPath = useCallback(() => {
    pathIndexRef.current = 0;
    progressRef.current = 0;
    trailRef.current = [PATH_POINTS[0]];
    drawnCountRef.current = 1;
    setPosition(PATH_POINTS[0]);
    isFirstDraw.current = true;
    draw();
  }, [draw]);

  // ============================================================
  // 切换函数
  // ============================================================
  const toggleShowPath = useCallback(() => {
    setShowPath((prev) => !prev);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSpeedChange = useCallback((e: any) => {
    setSpeed(e.detail.value);
  }, []);
  useEffect(() => {
    // @ts-ignore
    window.insertPoint = (x: number, y: number) => {
      positionRef.current = { x, y };
      draw();
      console.log('📥 外部插入点位:', x, y);
    };
  }, [draw]);

  // ============================================================
  // 自定义复选框（使用 transform 居中）
  // ============================================================
  const CustomCheckbox: React.FC<{
    checked: boolean;
    onChange: () => void;
    color?: string;
  }> = ({ checked, onChange, color = '#22d3ee' }) => {
    return (
      <View
        className={`custom-checkbox-box ${checked ? 'checked' : ''}`}
        style={{
          width: '26rpx',
          height: '26rpx',
          borderColor: checked ? color : 'rgba(255,255,255,0.3)',
          backgroundColor: checked ? color : 'rgba(255,255,255,0.05)',
          boxShadow: checked ? `0 0 16rpx ${color}40` : 'none',
          borderRadius: '4rpx',
          borderWidth: '2rpx',
          borderStyle: 'solid',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onChange();
        }}
      >
        {checked && (
          <Text
            style={{
              color: '#fff',
              fontSize: '26rpx',
              fontWeight: 'bold',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              lineHeight: '26rpx',
            }}
          >
            ✓
          </Text>
        )}
      </View>
    );
  };



  // 在组件外部或内部定义渲染函数
  const renderAttrsGrid = (attrs) => {
    if (!attrs || attrs.length === 0) return null;

    return (
      <View className='attr-grid'>
        {attrs.reduce((rows, attr, index) => {
          if (index % 2 === 0) {
            rows.push([attr]);
          } else {
            rows[rows.length - 1].push(attr);
          }
          return rows;
        }, []).map((row, rowIdx) => (
          <View className='attr-row' key={rowIdx}>
            {row.map((attr, idx) => (
              <View className='attr-group' key={idx}>
                <Text className='attr-label'>{attr.label}：</Text>
                <Text className='attr-value'>{attr.value}</Text>
              </View>
            ))}
            {row.length === 1 && <View className='attr-group-placeholder' />}
          </View>
        ))}
      </View>
    );
  };


  return (
    <ScrollView className="t-railcar-page" scrollY={!joystickActive}>
      {/* <View className="console-tab-shell"> */}


      {/* <View className="console-tab-switch">
          <View
            className={`console-tab-item ${activeTab === 'control' ? 'console-tab-item--active' : ''}`}
            onClick={() => switchConsoleTab('control')}
          >
            <Text className="console-tab-title">控制页面</Text>
            <Text className="console-tab-subtitle">路径 / 摇杆 / 指令</Text>
          </View>
          <View
            className={`console-tab-item ${activeTab === 'status' ? 'console-tab-item--active' : ''}`}
            onClick={() => switchConsoleTab('status')}
          >
            <Text className="console-tab-title">状态页面</Text>
            <Text className="console-tab-subtitle">上报 / 电量 / 定位</Text>
          </View>
          <View
            className={`console-tab-item ${activeTab === 'task' ? 'console-tab-item--active' : ''}`}
            onClick={() => switchConsoleTab('task')}
          >
            <Text className="console-tab-title">任务页面</Text>
            <Text className="console-tab-subtitle">参数 / 规划 / 缓存</Text>
          </View>
        </View> */}

      {/* </View> */}



      {activeTab === 'control' ? (
        <>
          {/* <View className="section section--priority"> */}

          <View className="path-demo-page">


            {/* ===== Canvas ===== */}
            <View className="canvas-wrapper">

              <canvas
                id="pathCanvas"
                // @ts-ignore
                type="2d"
                className="path-canvas"
              />


            </View>
            {/* ===== 图例（横向，放在图表下方） ===== */}
            <View className="legend-horizontal">
              <View className="legend-items">
                <View className="legend-item">
                  <View className="legend-dot robot" />
                  <Text className="legend-label">机器人位置</Text>
                </View>
                <View className="legend-item">
                  <View className="legend-line" />
                  <Text className="legend-label">
                    实时路线 <Text className="legend-small"></Text>
                  </Text>
                </View>

                {/* ===== 规划路径 ===== */}
                <View className="legend-item clickable" onClick={toggleShowPath}>
                  <CustomCheckbox
                    checked={showPath}
                    onChange={toggleShowPath}
                    color="#22d3ee"
                  />
                  <View className="legend-line dashed" />
                  <Text className="legend-label">
                    规划路径 <Text className="legend-small"></Text>
                  </Text>
                </View>

                {/* <View className="legend-item clickable" onClick={toggleShowPath}>
                  <View onClick={(e) => { e.stopPropagation(); toggleShowPath(); }}>
                    <Checkbox
                      value="showPath"
                      checked={showPath}
                      color="#22d3ee"
                    />
                  </View>
                  <View className="legend-line dashed" />
                  <Text className="legend-label">规划路径 <Text className="legend-small"></Text></Text>
                </View> */}



              </View>
            </View>

          </View>

        </>
      ) : activeTab === 'status' ? (//状态页面activeTab === 'test' ?
        <>
          <View className="section section--status-overview">
            <View className="status-overview-card">
              <View className="status-overview-header">
                <Text className="status-overview-title">设备状态</Text>
                <Text className="status-overview-link">查看详情 ›</Text>
              </View>

              <View className="status-overview-body">
                <View className="status-device-pane">
                  <RobotModel size="status" family="T" />
                  <Text className="status-device-name">机器人{productId}</Text>
                  <View className={`status-online-dot ${socketConnected ? 'online' : 'offline'}`} />
                  <Text className={`status-device-online ${socketConnected ? 'online' : 'offline'}`}>
                    {socketConnected ? '在线' : '重连中'}
                  </Text>
                </View>

                <View className="status-metric-grid">
                  <View className={`status-metric-card status-metric-card--${statusTone}`}>
                    <View>
                      <Text className="status-metric-label">运行状态</Text>
                      <Text className="status-metric-value status-metric-value--blue">{statusLabel}</Text>
                    </View>
                    <View className="status-metric-icon status-metric-icon--clock">↻</View>
                  </View>
                  <View className="status-metric-card status-metric-card--battery">
                    <View>
                      <Text className="status-metric-label">电量</Text>
                      <Text className="status-metric-value status-metric-value--green">
                        {typeof snapshot.battery === 'number' ? `${snapshot.battery.toFixed(0)}%` : '--'}
                      </Text>
                    </View>
                    <View className="status-metric-icon status-metric-icon--battery">▯</View>
                  </View>
                  <View className="status-metric-card">
                    <View>
                      <Text className="status-metric-label">任务进度</Text>
                      <Text className="status-metric-value">{taskProgressText}</Text>
                    </View>
                    <View className="status-metric-icon status-metric-icon--path">⌘</View>
                  </View>
                  <View className="status-metric-card">
                    <View>
                      <Text className="status-metric-label">运行速度</Text>
                      <Text className="status-metric-value">
                        {formatNumber(reportedSpeed, 0, '')}
                        <Text className="status-metric-unit"> cm/s</Text>
                      </Text>
                    </View>
                    <View className="status-metric-icon status-metric-icon--speed">◷</View>
                  </View>
                </View>
              </View>

              <View className="status-overview-footer">
                <Text className="status-overview-meta">最近上报：{formatTimestamp(latestTimestamp)}</Text>
                <Text className="status-overview-meta">raw: {rawStatus || '--'}</Text>
              </View>
            </View>
          </View>

          <View className="section section--status-fields">
            <Text className="section-title">实时字段</Text>
            <View className="status-card-grid status-card-grid--compact">
              {statusCards.slice(1).map(card => (
                <View
                  key={card.label}
                  className={`status-card-panel ${card.tone ? `status-card-panel--${card.tone}` : ''}`}
                >
                  <Text className="status-card-label">{card.label}</Text>
                  <Text className="status-card-value">{card.value}</Text>
                  <Text className="status-card-meta">{card.meta}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="section">
            <Text className="section-title">定位信息</Text>
            <View className="detail-grid">
              <View className="detail-card">
                <Text className="detail-card-label">经纬度</Text>
                <Text className="detail-card-value">
                  {formatCoordinate(snapshot.lat)} / {formatCoordinate(snapshot.lon)}
                </Text>
              </View>
              <View className="detail-card">
                <Text className="detail-card-label">坐标系位置</Text>
                <Text className="detail-card-value">
                  {formatNumber(snapshot.localX, 0)} / {formatNumber(snapshot.localY, 0)}
                </Text>
              </View>
              <View className="detail-card">
                <Text className="detail-card-label">最新命令</Text>
                <Text className="detail-card-value">
                  {formatValue(snapshot.lastCommandStatus)} / {commandIdShort}
                </Text>
              </View>
              <View className="detail-card">
                <Text className="detail-card-label">命令反馈</Text>
                <Text className="detail-card-value">{formatValue(snapshot.lastCommandMessage)}</Text>
              </View>
            </View>
          </View>

        </>
      ) : activeTab === 'task' ? (//任务页面
        <>
          <View className="section">
            <View className="task-panel">
              <View className="task-panel-header">
                <View>
                  <Text className="section-title">生成任务</Text>
                  <Text className="task-panel-subtitle">先保存参数，再生成任务；路径规划会设置当前任务并刷新预览。</Text>
                </View>
                <Button
                  className="task-mini-btn"
                  onClick={() => void loadTaskOptions(true)}
                  disabled={taskLoading !== null}
                  loading={taskLoading === 'refresh'}
                >
                  刷新任务
                </Button>
              </View>

              <View className="task-message-card">
                <Text className="task-message-text">{taskMessage}</Text>
                <Text className="task-message-meta">当前任务：{currentTaskName || '未设置'}</Text>
              </View>
            </View>
          </View>

          <View className="section">
            <View className="task-panel">
              <View className="task-panel-header">
                <Text className="section-title">1. 设置生成任务参数</Text>
              </View>
              <View className="task-quick-card">
                <View className="task-quick-copy">
                  <Text className="task-quick-label">当前采样点</Text>
                  <Text className="task-quick-value">
                    {capturedTaskPoint
                      ? `${formatCoordinate(capturedTaskPoint.lat, 8)} / ${formatCoordinate(capturedTaskPoint.lon, 8)}`
                      : '未获取，按钮会使用最新上报经纬度'}
                  </Text>
                </View>
                <View className="task-quick-actions">
                  <Button className="task-mini-btn task-quick-btn" onClick={captureCurrentTaskGeoPoint}>
                    获取当前经纬度
                  </Button>
                  <Button className="task-mini-btn task-quick-btn" onClick={setOriginFromTaskPoint}>
                    设为原点/起点
                  </Button>
                  <Button className="task-mini-btn task-quick-btn" onClick={setGarageEntryPointFromTaskPoint}>
                    设置入舱点
                  </Button>
                </View>
              </View>
              <View className="task-form-grid">
                {TASK_PARAM_FIELDS.map(field => (
                  <View className="task-form-item" key={field.key}>
                    <Text className="task-form-label">{field.label}</Text>
                    <Input
                      className="task-form-input"
                      type="digit"
                      value={taskParamsForm[field.key]}
                      placeholder={field.placeholder || '请输入数字'}
                      onInput={event => updateTaskParam(field.key, String(event.detail.value))}
                    />
                  </View>
                ))}
              </View>
              <Button
                className="task-action-btn task-action-btn--primary"
                onClick={() => void saveTaskParams()}
                disabled={taskLoading !== null}
                loading={taskLoading === 'params'}
              >
                保存生成参数
              </Button>
            </View>
          </View>

          <View className="section">
            <View className="task-panel">
              <Text className="section-title">2. 任务路径规划</Text>
              <View className={`task-form-grid ${taskPlanForm.layoutMode === 'layoutV2' ? 'task-form-grid--layout-v2' : ''}`}>
                <View className="task-form-item task-form-item--wide">
                  <Text className="task-form-label">任务名称</Text>
                  <Input
                    className="task-form-input"
                    value={taskPlanForm.taskName}
                    placeholder="请输入任务名称"
                    onInput={event => updateTaskPlan('taskName', String(event.detail.value))}
                  />
                </View>
                <View className="task-form-item task-form-item--wide">
                  <Text className="task-form-label">布局模式</Text>
                  <View className="task-segmented">
                    <View
                      className={`task-segmented-item ${taskPlanForm.layoutMode === 'legacy' ? 'active' : ''}`}
                      onClick={() => updateTaskPlan('layoutMode', 'legacy')}
                    >
                      <Text>旧版行列</Text>
                    </View>
                    <View
                      className={`task-segmented-item ${taskPlanForm.layoutMode === 'layoutV2' ? 'active' : ''}`}
                      onClick={() => updateTaskPlan('layoutMode', 'layoutV2')}
                    >
                      <Text>坐标系布局</Text>
                    </View>
                    <View
                      className={`task-segmented-item ${taskPlanForm.layoutMode === 'pointModel' ? 'active' : ''}`}
                      onClick={() => updateTaskPlan('layoutMode', 'pointModel')}
                    >
                      <Text>打点建模</Text>
                    </View>
                  </View>
                </View>
                {taskPlanForm.layoutMode !== 'pointModel' && (
                  <>
                    <View className="task-form-item">
                      <Text className="task-form-label">区域编号</Text>
                      <Input
                        className="task-form-input"
                        type="number"
                        value={taskPlanForm.areaNumber}
                        onInput={event => updateTaskPlan('areaNumber', String(event.detail.value))}
                      />
                    </View>
                    <View className="task-form-item">
                      <Text className="task-form-label">规划方向</Text>
                      <View className="task-segmented">
                        <View
                          className={`task-segmented-item ${taskPlanForm.direction === 'left' ? 'active' : ''}`}
                          onClick={() => updateTaskPlan('direction', 'left')}
                        >
                          <Text>向左</Text>
                        </View>
                        <View
                          className={`task-segmented-item ${taskPlanForm.direction === 'right' ? 'active' : ''}`}
                          onClick={() => updateTaskPlan('direction', 'right')}
                        >
                          <Text>向右</Text>
                        </View>
                      </View>
                    </View>
                  </>
                )}
                {taskPlanForm.layoutMode === 'legacy' && (
                  <>
                    <View className="task-form-item">
                      <Text className="task-form-label">行数</Text>
                      <Input
                        className="task-form-input"
                        type="number"
                        value={taskPlanForm.lineCount}
                        placeholder="请输入行数"
                        onInput={event => updateTaskPlan('lineCount', String(event.detail.value))}
                      />
                    </View>
                    <View className="task-form-item">
                      <Text className="task-form-label">列数</Text>
                      <Input
                        className="task-form-input"
                        type="number"
                        value={taskPlanForm.columnCount}
                        placeholder="请输入列数"
                        onInput={event => updateTaskPlan('columnCount', String(event.detail.value))}
                      />
                    </View>
                    <View className="task-form-item">
                      <Text className="task-form-label">跨桥所在行</Text>
                      <Input
                        className="task-form-input"
                        value={taskPlanForm.bridgeRows}
                        placeholder="可空，如 3 或 3,6"
                        onInput={event => updateTaskPlan('bridgeRows', String(event.detail.value))}
                      />
                    </View>
                    <View className="task-form-item">
                      <Text className="task-form-label">跨桥长度</Text>
                      <Input
                        className="task-form-input"
                        type="digit"
                        value={taskPlanForm.bridgeLen}
                        onInput={event => updateTaskPlan('bridgeLen', String(event.detail.value))}
                      />
                    </View>
                  </>
                )}
              </View>
              {taskPlanForm.layoutMode === 'layoutV2' && (
                <View className="layout-structured-editor">
                  {renderLayoutRangeGroup('areas', '基础区域 areas', '至少保留一个基础区域或额外区域')}
                  {renderLayoutRangeGroup('holes', '挖掉区域 holes', '用于从基础区域中排除板块')}
                  {renderLayoutRangeGroup('extras', '额外区域 extras', '用于补充基础区域之外的板块')}
                  {renderLayoutConnectors()}
                </View>
              )}
              {taskPlanForm.layoutMode === 'layoutV2' && (
                <View className={`layout-preview-card ${layoutV2Preview?.error ? 'layout-preview-card--error' : ''}`}>
                  <Text className="layout-preview-title">坐标系预览</Text>
                  {layoutV2Preview?.error ? (
                    <Text className="layout-preview-text">{layoutV2Preview.error}</Text>
                  ) : (
                    <>
                      <View className="layout-map">
                        <View
                          className="layout-map-origin layout-map-origin--x"
                          style={`left: ${layoutV2Preview?.renderModel?.origin.leftPct || 0}%;`}
                        />
                        <View
                          className="layout-map-origin layout-map-origin--y"
                          style={`top: ${layoutV2Preview?.renderModel?.origin.topPct || 0}%;`}
                        />
                        {(layoutV2Preview?.renderModel?.pathSegments || []).map((segment, index) => (
                          <View
                            key={`path-${index}`}
                            className={`layout-map-segment ${segment.isVertical ? 'layout-map-segment--vertical' : ''}`}
                            style={`left: ${segment.leftPct}%; top: ${segment.topPct}%; width: ${segment.widthPct}%; height: ${segment.heightPct}%;`}
                          />
                        ))}
                        {(layoutV2Preview?.renderModel?.panels || []).slice(0, 180).map(panel => (
                          <View
                            key={`${panel.row}:${panel.col}`}
                            className="layout-map-panel"
                            style={`left: ${panel.leftPct}%; top: ${panel.topPct}%; width: ${panel.widthPct}%; height: ${panel.heightPct}%;`}
                          >
                            {(layoutV2Preview?.renderModel?.panels.length || 0) <= 80 && (
                              <Text className="layout-map-panel-text">{panel.row},{panel.col}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                      <Text className="layout-preview-text">
                        panels {layoutV2Preview?.preview?.panels.length || 0} / path points {layoutV2Preview?.preview?.path.length || 0}
                      </Text>
                      <Text className="layout-preview-text">
                        areas {layoutV2Preview?.layout?.areas.length || 0} / holes {layoutV2Preview?.layout?.holes.length || 0} / extras {layoutV2Preview?.layout?.extras.length || 0} / connectors {layoutV2Preview?.layout?.connectors.length || 0}
                      </Text>
                      <View className="layout-preview-points">
                        {(layoutV2Preview?.preview?.path || []).slice(0, 6).map((point, index) => (
                          <Text className="layout-preview-point" key={`${point.x}:${point.y}:${index}`}>
                            {index + 1}. {point.x}, {point.y}
                          </Text>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}
              {taskPlanForm.layoutMode === 'pointModel' && renderPointModelEditor()}
              {taskPlanForm.layoutMode === 'pointModel' ? (
                <View className="task-action-row task-action-row--single">
                  <Button
                    className="task-action-btn task-action-btn--primary"
                    onClick={generatePointTaskModel}
                    disabled={taskLoading !== null}
                  >
                    生成模型
                  </Button>
                </View>
              ) : (
                <View className="task-action-row">
                  <Button
                    className="task-action-btn task-action-btn--primary"
                    onClick={() => void generateTask()}
                    disabled={taskLoading !== null}
                    loading={taskLoading === 'generate'}
                  >
                    生成任务
                  </Button>
                  <Button
                    className="task-action-btn"
                    onClick={() => void planTaskPath()}
                    disabled={taskLoading !== null}
                    loading={taskLoading === 'plan'}
                  >
                    规划路径
                  </Button>
                </View>
              )}
            </View>
          </View>

          <View className="section">
            <View className="task-panel">
              <Text className="section-title">3. 当前任务 / 缓存任务</Text>
              <View className="task-list">
                {taskNames.length ? taskNames.map(name => (
                  <View
                    key={name}
                    className={`task-list-item ${selectedTaskName === name ? 'task-list-item--active' : ''}`}
                    onClick={() => setSelectedTaskName(name)}
                  >
                    <Text className="task-list-name">{name}</Text>
                    <Text className="task-list-tag">{currentTaskName === name ? '当前任务' : '缓存任务'}</Text>
                  </View>
                )) : (
                  <View className="task-empty-card">
                    <Text className="task-message-text">暂无缓存任务</Text>
                  </View>
                )}
              </View>
              <View className="task-action-row">
                <Button
                  className="task-action-btn task-action-btn--primary"
                  onClick={() => void setCurrentTask()}
                  disabled={taskLoading !== null || !selectedTaskName}
                  loading={taskLoading === 'current' || taskLoading === 'plan'}
                >
                  设置为当前任务
                </Button>
                <Button
                  className="task-action-btn task-action-btn--danger"
                  onClick={() => void deleteCachedTask()}
                  disabled={taskLoading !== null || !selectedTaskName}
                  loading={taskLoading === 'delete'}
                >
                  删除缓存任务
                </Button>
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <View className="section section--priority">
            <View className="path-priority-card">
              <View className="path-section-header">
                <View>
                  <Text className="section-title">路径预览</Text>
                  <Text className="path-priority-summary">
                    首屏先看真实任务轨迹，再看启动条件和控制状态。
                  </Text>
                </View>
                <Button className="path-refresh-btn" onClick={handleRefreshPath} disabled={pathLoading}>
                  {pathLoading ? '刷新中' : '刷新路径'}
                </Button>
              </View>

              {pathSegmentCount ? (
                <PathCanvas
                  segments={taskPath!.segments}
                  currentPoint={currentPoint}
                  currentTaskIndex={currentTaskIndex}
                />
              ) : (
                <View className="path-empty-card">
                  <Text className="path-empty-title">
                    {pathLoading ? '正在拉取真实路径...' : '暂无真实路径数据'}
                  </Text>
                  <Text className="path-empty-text">
                    {pathError || '还没有收到 Python 返回的 get_task_path 结果，可以先刷新一次路径。'}
                  </Text>
                </View>
              )}

              <View className="path-preview-meta">
                <Text className="path-preview-meta-text">
                  {pathSegmentCount
                    ? `当前显示的是云平台缓存的真实任务路径，共 ${pathSegmentCount} 段。`
                    : '当前还没有拿到真实路径缓存，所以这里只展示空态提示。'}
                </Text>
              </View>

              {showRuntimeBanner && (
                <View className={`runtime-banner runtime-banner--${runtimeBannerTone}`}>
                  <Text className="runtime-banner-title">
                    启动条件：{showControlState ? resolveControlStateLabel(snapshot.controlState) : '启动提示'}
                  </Text>
                  <Text className="runtime-banner-text">
                    {visibleStartCheckReason || '当前没有新的阻塞信息。'}
                  </Text>
                  {typeof startDistance === 'number' && typeof startTolerance === 'number' && (
                    <Text className="runtime-banner-text">
                      距任务起点 {startDistance.toFixed(2)} m，允许范围 {startTolerance.toFixed(2)} m
                    </Text>
                  )}
                </View>
              )}
              <View className='point-canvas-card'>
                <View className="title-row">
                  <Text className="manual-control-title">点位调整</Text>
                </View>

                <View className="info-row">
                  <Text className="manual-control-info">
                    容错范围：{!isNaN(taskstartToleranceM) && taskstartToleranceM !== undefined
                      ? (taskstartToleranceM * 100).toFixed(2)
                      : '0.00'
                    }厘米
                  </Text>
                  <Text className="manual-control-info">
                    当前距离：{!isNaN(taskdistance) && taskdistance !== undefined
                      ? (taskdistance * 100).toFixed(2)
                      : '0.00'
                    }厘米
                  </Text>

                </View>



                <View className="msg-row">
                  <Text className="manual-control-title"> {taskmsg} </Text>
                </View>

                <View className='vai-canvas'>

                  <Canvas
                    id="point-canvas"
                    className='point-canvas'
                    canvasId='point-canvas'

                  />

                </View>
                {/* ===== 图例（原点/车辆位置）,（,{canvasParams.currentHeading}° ===== */}
                <View className='legend-container'>
                  <View className='legend-item'>
                    <View className='legend-dot origin' />
                    <Text className='legend-text'>原点位置</Text>
                  </View>
                  <View className='legend-item'>
                    <View className='legend-dot vehicle' />
                    <Text className='legend-text'>机器人位置</Text>
                  </View>
                  <View className='legend-item'>
                    <View className='legend-dot' style={{ background: 'transparent', border: '2rpx solid rgba(34, 197, 94, 0.6)' }} />
                    <Text className='legend-text'>容错范围</Text>
                  </View>

                </View>


                <View className="info-row">
                  <Text className="manual-control-info">
                    {[
                      // `容错范围：${canvasParams.taskstartToleranceM}厘米`,
                      `原点经度：${canvasParams.taskStartLon}`,
                      `原点纬度：${canvasParams.taskStartLat}`,
                      `原点航向角：${canvasParams.originHeading}`

                    ].join('\n')}
                  </Text>
                  <Text className="manual-control-info">
                    {[
                      // `当前距离：${canvasParams.taskdistance}厘米`,
                      `机器人经度：${canvasParams.currentLon}`,
                      `机器人纬度：${canvasParams.currentLat}`,
                      `机器人航向角：${canvasParams.currentHeading}`

                    ].join('\n')}
                  </Text>
                </View>

              </View>

              <View className="console-actions console-actions--primary">
                {renderCommandButton('start', 'console-action-btn--start')}{/* 启动 */}
                {renderCommandButton('stop', 'console-action-btn--stop')}{/* 停止 */}
              </View>
              <View className='accordion-card'>
                <View className='accordion-item'>

                  <View className='accordion-header' onClick={handleToggle}>
                    <Text className='accordion-title'>具体参数</Text>
                    <Text className={`arrow ${expanded ? 'up' : 'down'}`}>
                      ▼
                    </Text>
                  </View>


                  {expanded && (
                    <View className='accordion-content'>
                      {/* <View className='vehicle-info'>/ */}
                      <View className='vehicle-title'>
                        <Text>小车</Text>
                      </View>

                      {/* 本体 */}
                      <View className='sections'>

                        <View
                          className='section-header'
                          onClick={() => toggleSection('body')}
                        >
                          <Text className='section-title'>本体</Text>
                          <Text className={`arrow ${expandedSections.body ? 'up' : 'down'}`}>▼</Text>
                        </View>
                        {expandedSections.body && (
                          <View className='section-content'>
                            <View className='attr-grid'>
                              {vehicleData.body.attrs.reduce((rows, attr, index) => {
                                if (index % 2 === 0) {
                                  rows.push([attr]);
                                } else {
                                  rows[rows.length - 1].push(attr);
                                }
                                return rows;
                              }, []).map((row, rowIdx) => (
                                <View className='attr-row' key={rowIdx}>
                                  {row.map((attr, idx) => (
                                    <View className='attr-group' key={idx}>
                                      <Text className='attr-label'>{attr.label}：</Text>
                                      <Text className='attr-value'>{attr.value}</Text>
                                    </View>
                                  ))}
                                  {row.length === 1 && <View className='attr-group-placeholder' />}
                                </View>

                              ))}
                            </View>
                          </View>


                        )}
                      </View>

                      {/* 电池 */}
                      <View className='sections'>
                        <View
                          className='section-header'
                          onClick={() => toggleSection('battery')}
                        >
                          <Text className='section-title'>电池</Text>
                          <Text className={`arrow ${expandedSections.battery ? 'up' : 'down'}`}>▼</Text>
                        </View>
                        {expandedSections.battery && (
                          // <View className='section-content'>
                          //   {vehicleData.battery.attrs.map((attr, idx) => (
                          //     <View className='attr-row' key={idx}>
                          //       <Text className='attr-label'>{attr.label}</Text>
                          //       <Text className='attr-value'>{attr.value}</Text>
                          //     </View>
                          //   ))}
                          // </View>

                          <View className='section-content'>
                            <View className='attr-grid'>
                              {vehicleData.battery.attrs.reduce((rows, attr, index) => {
                                if (index % 2 === 0) {
                                  rows.push([attr]);
                                } else {
                                  rows[rows.length - 1].push(attr);
                                }
                                return rows;
                              }, []).map((row, rowIdx) => (
                                <View className='attr-row' key={rowIdx}>
                                  {row.map((attr, idx) => (
                                    <View className='attr-group' key={idx}>
                                      <Text className='attr-label'>{attr.label}：</Text>
                                      <Text className='attr-value'>{attr.value}</Text>
                                    </View>
                                  ))}
                                  {row.length === 1 && <View className='attr-group-placeholder' />}
                                </View>

                              ))}
                            </View>
                          </View>



                        )}
                      </View>
                      {/* 滚刷 */}
                      <View className='sections'>
                        <View className='section-header' onClick={() => toggleSection('brush')}>
                          <Text className='section-title'>滚刷</Text>
                          <Text className={`arrow ${expandedSections.brush ? 'up' : 'down'}`}>▼</Text>
                        </View>
                        {expandedSections.brush && (
                          // <View className='section-content'>{renderAttrs(vehicleData.brush.attrs)}</View>
                          <View className='section-content'>
                            <View className='attr-grid'>
                              {vehicleData.brush.attrs.reduce((rows, attr, index) => {
                                if (index % 2 === 0) {
                                  rows.push([attr]);
                                } else {
                                  rows[rows.length - 1].push(attr);
                                }
                                return rows;
                              }, []).map((row, rowIdx) => (
                                <View className='attr-row' key={rowIdx}>
                                  {row.map((attr, idx) => (
                                    <View className='attr-group' key={idx}>
                                      <Text className='attr-label'>{attr.label}：</Text>
                                      <Text className='attr-value'>{attr.value}</Text>
                                    </View>
                                  ))}
                                  {row.length === 1 && <View className='attr-group-placeholder' />}
                                </View>

                              ))}
                            </View>
                          </View>


                        )}





                      </View>



                      {/* 硬件（两级折叠） */}
                      <View className='sections'>
                        <View className='section-header' onClick={() => toggleSection('hardware')}>
                          <Text className='section-title'>硬件</Text>
                          <Text className={`arrow ${expandedSections.hardware ? 'up' : 'down'}`}>▼</Text>
                        </View>
                        {expandedSections.hardware && (
                          <View className='hardware-children'>
                            {/* 渲染硬件父级的 attrs */}
                            {vehicleData.hardware.attrs && (
                              <View className='section-content'>
                                {renderAttrsGrid(vehicleData.hardware.attrs)}
                              </View>
                            )}

                            {/* 渲染子级 */}
                            {vehicleData.hardware.children.map(child => (
                              <View className='child-section' key={child.key}>
                                <View className='section-header child-header' onClick={() => toggleSection(child.key)}>
                                  <Text className='section-title child-title'>{child.title}</Text>
                                  <Text className={`arrow ${expandedSections[child.key] ? 'up' : 'down'}`}>▼</Text>
                                </View>
                                {expandedSections[child.key] && (
                                  <View className='section-content child-content'>
                                    {renderAttrsGrid(child.attrs)}
                                  </View>
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      {/* RTK */}
                      <View className='sections'>
                        <View className='section-header' onClick={() => toggleSection('rtk')}>
                          <Text className='section-title'>RTK</Text>
                          <Text className={`arrow ${expandedSections.rtk ? 'up' : 'down'}`}>▼</Text>
                        </View>
                        {expandedSections.rtk && (

                          <View className='section-content'>
                            <View className='attr-grid'>
                              {vehicleData.rtk.attrs.reduce((rows, attr, index) => {
                                if (index % 2 === 0) {
                                  rows.push([attr]);
                                } else {
                                  rows[rows.length - 1].push(attr);
                                }
                                return rows;
                              }, []).map((row, rowIdx) => (
                                <View className='attr-row' key={rowIdx}>
                                  {row.map((attr, idx) => (
                                    <View className='attr-group' key={idx}>
                                      <Text className='attr-label'>{attr.label}：</Text>
                                      <Text className='attr-value'>{attr.value}</Text>
                                    </View>
                                  ))}
                                  {row.length === 1 && <View className='attr-group-placeholder' />}
                                </View>
                              ))}
                            </View>
                          </View>


                        )}





                      </View>


                      {/* ========== 光伏板（与小车平级） ========== */}
                      <View className='vehicle-title'>
                        <Text>光伏板</Text>
                      </View>

                      <View className='sections'>
                        <View className='section-header' onClick={() => toggleSection('panel')}>
                          <Text className='section-title'>属性</Text>
                          <Text className={`arrow ${expandedSections.panel ? 'up' : 'down'}`}>▼</Text>
                        </View>
                        {expandedSections.panel && (
                          <View className='section-content'>
                            <View className='attr-grid'>
                              {panelData.attrs.reduce((rows, attr, index) => {
                                if (index % 2 === 0) {
                                  rows.push([attr]);
                                } else {
                                  rows[rows.length - 1].push(attr);
                                }
                                return rows;
                              }, []).map((row, rowIdx) => (
                                <View className='attr-row' key={rowIdx}>
                                  {row.map((attr, idx) => (
                                    <View className='attr-group' key={idx}>
                                      <Text className='attr-label'>{attr.label}：</Text>
                                      <Text className='attr-value'>{attr.value}</Text>
                                    </View>
                                  ))}
                                  {row.length === 1 && <View className='attr-group-placeholder' />}
                                </View>

                              ))}
                            </View>
                          </View>
                        )}
                      </View>




                      {/* </View> */}





                    </View>
                  )}
                </View>
              </View>
              <View className="manual-control-panel">
                <View className="manual-control-header">
                  <Text className="manual-control-title">手动控制</Text>
                  <Text className="manual-control-subtitle">拖动摇杆实时控制，松手自动停止。</Text>
                </View>

                <View className="joystick-card">
                  <View
                    className={`joystick-surface ${joystickActive ? 'joystick-surface--active' : ''}`}
                    onTouchStart={handleJoystickTouchStart}
                    onTouchMove={handleJoystickTouchMove}
                    onTouchEnd={resetJoystick}
                    onTouchCancel={resetJoystick}
                  >
                    <View className="joystick-axis joystick-axis--x" />
                    <View className="joystick-axis joystick-axis--y" />
                    <View className="joystick-ring joystick-ring--outer" />
                    <View className="joystick-ring joystick-ring--inner" />
                    <View
                      className={`joystick-knob ${joystickActive ? 'joystick-knob--active' : ''}`}
                      style={joystickKnobStyle}
                    >
                      <Text className="joystick-knob-text">{joystickActive ? '控制' : '摇杆'}</Text>
                    </View>
                  </View>

                  <View className="joystick-readout">
                    <View className="joystick-readout-item">
                      <Text className="joystick-readout-label">方向</Text>
                      <Text className="joystick-readout-value">{joystickDirectionLabel}</Text>
                    </View>
                    <View className="joystick-readout-item">
                      <Text className="joystick-readout-label">强度</Text>
                      <Text className="joystick-readout-value">{joystickVector.power}%</Text>
                    </View>
                    <View className="joystick-readout-item">
                      <Text className="joystick-readout-label">向量</Text>
                      <Text className="joystick-readout-value">
                        {joystickVector.x.toFixed(2)} / {joystickVector.y.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <Text className="joystick-status">{joystickStatus}</Text>
                </View>

                <View className="manual-control-pad">
                  <View className="manual-control-spacer" />
                  {renderCommandButton('forward', 'console-action-btn--manual')}
                  <View className="manual-control-spacer" />
                  {renderCommandButton('turnLeft', 'console-action-btn--rotate')}
                  {renderCommandButton('stop', 'console-action-btn--pad-stop')}
                  {renderCommandButton('turnRight', 'console-action-btn--rotate')}
                  <View className="manual-control-spacer" />
                  {renderCommandButton('backward', 'console-action-btn--manual')}
                  <View className="manual-control-spacer" />
                </View>
              </View>
            </View>
          </View>
        </>

      )
      }

      <View className="bottom-space" />
    </ScrollView >
  )
}
