import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Button, Text, ScrollView, Canvas } from '@tarojs/components'
import Taro, { useDidHide, useUnload, useDidShow } from '@tarojs/taro'
import { Battery, Back, Home } from '../../components/Icons'
import RobotModel from '../../components/RobotModel'
import { authService } from '../../services/authService'
import websocketService from '../../services/websocketService'
import vehicleService from '../../services/vehicleService'
import tRailcarService from '../../services/tRailcarService'
import { APP_VERSION_INFO } from '../../config/version'
import './home.scss'
// 二维码数据结构（18字节）
interface QRCodeData {
    companyCode: string  // 8字节：公司代号
    productType: string  // 4字节：产品型号
    productId: string    // 6字节：产品编号（作为deviceID）
}

// 获取Canvas实际像素尺寸（将rpx转换为px，画布高度约为屏幕一半）
const getCanvasPixelSize = () => {
    try {
        // 优先使用新API getWindowInfo，避免getSystemInfoSync弃用警告
        const winInfo = Taro.getWindowInfo()
        const windowWidth = winInfo.windowWidth || 375
        const windowHeight = winInfo.windowHeight || 667

        const rpxToPx = windowWidth / 750
        const widthPx = Math.round(680 * rpxToPx)
        // 画布高度 = 视口高度的一半 - 80px（给图例留空间），最低240px
        const halfHeightPx = Math.round(windowHeight * 0.5)
        const heightPx = Math.max(halfHeightPx - 80, 240)
        return { width: widthPx, height: heightPx }
    } catch {
        try {
            // 兼容回退：老版本Taro或非微信小程序环境
            const sysInfo = Taro.getSystemInfoSync()
            const rpxToPx = (sysInfo.windowWidth || 375) / 750
            const widthPx = Math.round(680 * rpxToPx)
            const halfHeightPx = Math.round((sysInfo.windowHeight || 667) * 0.5)
            const heightPx = Math.max(halfHeightPx - 80, 240)
            return { width: widthPx, height: heightPx }
        } catch {
            return { width: 340, height: 320 }
        }
    }
}
interface Robot {
    id: number
    serialNumber: string
    companyCode: string //"ZTZN-PVC"
    productType: string //"-T01"
    productId: string //"250002",
    status: string //"offline",
    battery: number //null,电量
    online: boolean //false,
    onlineState?: string | null
    runTimeTotal: number//运行时间
    walkSpeed: number//行走速度
}
interface PointData {
    id: string
    name: string
    sequence: number
    x: number
    y: number
    lat: number
    lon: number
    areaNumber?: number
}

interface Route {
    id: number
    name: string
    modelId?: string
    current?: boolean
    areaPoints?: PointData[]
    linkPoints?: PointData[]
    pathPoints?: PointData[]
}

export default function Index() {
    const [robots, setRobots] = useState<Robot[]>([])
    const [currentRobot, setCurrentRobot] = useState<Robot | null>(null)
    const [dropdownVisible, setDropdownVisible] = useState(false)
    const [selectedModel, setSelectedModel] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState({ show: false, message: '' })
    const currentPageRef = useRef<'scan' | 'home'>('home')
    const [currentPage, setCurrentPage] = useState<'scan' | 'home'>('home')
    const [scannedDevice, setScannedDevice] = useState<QRCodeData | null>(null)
    const [confirmDevice, setConfirmDevice] = useState<QRCodeData | null>(null)
    const [binding, setBinding] = useState(false)
    const productId = vehicleService.getCurrentProductId()
    // 当前设备号
    const serialNumber = Taro.getStorageSync('currentSerialNumber')

    const [showPath, setShowPath] = useState<boolean>(true);
    const [routes, setRoutes] = useState<Route[]>([])
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
    const [routeScrollTop, setRouteScrollTop] = useState(0)
    const routeScrollLockRef = useRef(false)
    const [routesLoading, setRoutesLoading] = useState(false)
    const [routesError, setRoutesError] = useState<string | null>(null)
    const requestIdRef = useRef(0)  // 请求ID，用于取消旧请求
    const canvasIdRef = useRef('home-route-canvas')
    // Canvas实际像素尺寸（将rpx转换为px，确保绘图坐标与CSS显示尺寸一致）
    const [canvasSize] = useState(() => getCanvasPixelSize())

    // ===== 实时轨迹相关 =====
    const [isCleaning, setIsCleaning] = useState(false)
    const [realTimeTrack, setRealTimeTrack] = useState<{ x: number, y: number }[]>([])
    const realTimeTrackRef = useRef<{ x: number, y: number }[]>([])
    const wsDeviceIdRef = useRef<string>('')
    const isWsConnectedRef = useRef<boolean>(false)
    // 当前位置
    const [currentPosition, setCurrentPosition] = useState<{ x: number, y: number, heading?: number } | null>(null)
    const currentPositionRef = useRef<{ x: number, y: number, heading?: number } | null>(null)
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
    // 封装 页面切换 函数，同时更新 state 和 ref
    const navigateTo = (page: 'scan' | 'home') => {
        currentPageRef.current = page
        setCurrentPage(page)
    }
    const loadVehicles = useCallback(async (): Promise<Robot[]> => {
        try {
            console.log('[Index Page] 开始加载设备列表')

            const vehicles = await vehicleService.getAllVehicles()
            const robotLists = vehicles.map(v => vehicleService.convertToRobot(v)) // 所有设备

            const mockData = robotLists
            // 这里 serialNumber 是之前已经从 storage 里取到的“上次连接设备号”
            vehicleService.setCurrentSerialNumber(serialNumber);
            console.log('[上次连接设备] 当前设备号：', serialNumber)

            // 加载所有设备，不再过滤特定型号
            const robotList = mockData

            setRobots(robotList)
            console.log(`[Index Page] 加载了 ${robotList.length} 个设备`, robotList)

            if (robotList.length === 0) {
                // 无设备时显示扫码引导
                currentPageRef.current = 'home'
                setCurrentPage('home')
            } else {
                // 尝试根据上次连接设备号匹配
                let targetRobot: Robot | undefined
                if (serialNumber) {
                    targetRobot = robotList.find(robot => robot.serialNumber === serialNumber)
                }
                // 如果没匹配到，退回到第一个设备
                if (!targetRobot) {
                    targetRobot = robotList[0]
                }
                setCurrentRobot(targetRobot || null)

                // 自动获取匹配设备的详情和 shadow
                if (targetRobot) {
                    console.log('选中设备：', targetRobot.serialNumber)
                    try {
                        const res = await vehicleService.getVehicleById(targetRobot.id)
                        vehicleService.setCurrentProductId(res.productId);
                        vehicleService.setCurrentSerialNumber(res.serialNumber)
                        console.log('设备详情:', res)
                    } catch (error) {
                        console.error('获取设备详情失败:', error);
                    }
                    // 获取路线列表（fetchTaskList 内部已包含超时处理）
                    fetchTaskList()
                }
            }

            return robotList
        } catch (error: any) {
            console.error('[Index Page] 加载设备列表失败:', error)
            showToast('加载设备列表失败: ' + error.message)
            return []
        } finally {
            setLoading(false)
        }
    }, [serialNumber])

    // ========== 刷新设备状态（不重新加载路线，只更新设备在线状态等信息） ==========
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const refreshDeviceStatus = useCallback(async () => {
        try {
            const vehicles = await vehicleService.getAllVehicles()
            const robotLists = vehicles.map(v => vehicleService.convertToRobot(v))

            setRobots(prevRobots => {
                // 保留当前选中的型号筛选
                return robotLists
            })

            // 同步更新当前设备的状态
            setCurrentRobot(prevRobot => {
                if (!prevRobot) return prevRobot
                const updated = robotLists.find(r => r.id === prevRobot.id)
                return updated || prevRobot
            })
        } catch (error) {
            console.error('[Index Page] 刷新设备状态失败:', error)
        }
    }, [])

    // 启动设备状态轮询（每10秒刷新一次）
    useEffect(() => {
        // 页面显示时启动轮询
        pollingRef.current = setInterval(() => {
            refreshDeviceStatus()
        }, 10000)

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
        }
    }, [refreshDeviceStatus])

    // 页面再次显示时立即刷新并重启轮询
    useDidShow(() => {
        refreshDeviceStatus()
        if (!pollingRef.current) {
            pollingRef.current = setInterval(() => {
                refreshDeviceStatus()
            }, 10000)
        }
    })

    // ========== 获取路线列表 ==========
    const fetchTaskList = useCallback(async () => {
        // 生成新的请求ID，取消之前的请求
        const currentRequestId = ++requestIdRef.current

        setRoutesLoading(true)

        const productId = vehicleService.getCurrentProductId()
        if (!productId) {
            console.log('[路线列表] 无productId')
            if (currentRequestId === requestIdRef.current) {
                setRoutesError('无设备信息')
                setRoutes([])
                setRoutesLoading(false)
            }
            return
        }

        try {
            // 添加请求超时保护
            const res = await Promise.race([
                tRailcarService.task.fetchTaskOptions(productId),
                // new Promise((_, reject) =>
                //     setTimeout(() => reject(new Error('请求超时，请检查网络连接')), 12000)
                // )
            ]) as any

            // 检查是否是最新请求
            if (currentRequestId !== requestIdRef.current) {
                console.log('[路线列表] 请求已取消，忽略结果')
                return
            }

            console.log('[路线列表]', res)

            if (res && res.routes) {
                const routeList: Route[] = res.routes.map((route, index) => ({
                    id: index + 1,
                    name: route.taskName,
                    modelId: route.modelId,
                    current: route.current,
                    areaPoints: route.areaPoints || [],
                    linkPoints: route.linkPoints || [],
                    pathPoints: route.pathPoints || [],
                }))
                setRoutesError(null)
                setRoutes(routeList)

                // 自动选中当前路线
                const currentIndex = routeList.findIndex(r => r.current)
                if (currentIndex >= 0) {
                    setSelectedRouteIndex(currentIndex)
                } else if (res.currentTaskName) {
                    const taskNameIndex = routeList.findIndex(r => r.name === res.currentTaskName)
                    if (taskNameIndex >= 0) {
                        setSelectedRouteIndex(taskNameIndex)
                    }
                } else if (routeList.length > 0) {
                    setSelectedRouteIndex(0)
                }
            } else {
                setRoutesError(null)
                setRoutes([])
            }
        } catch (error: any) {
            // 检查是否是最新请求
            if (currentRequestId !== requestIdRef.current) {
                console.log('[路线列表] 请求已取消，忽略错误')
                return
            }
            console.error('[路线列表] 获取失败:', error)
            // 超时错误不显示，只记录日志
            if (error?.message?.includes('请求超时')) {
                console.warn('[路线列表] 请求超时，静默忽略')
                setRoutesError(null)
                setRoutes([])
            } else {
                const errorMsg = error?.message || '加载失败，请重试'
                setRoutesError(errorMsg)
                setRoutes([])
            }
        } finally {
            // 只在最新请求时关闭loading
            if (currentRequestId === requestIdRef.current) {
                setRoutesLoading(false)
            }
        }
    }, [])

    // ========== 选择路线 ==========
    const handleSelectRoute = useCallback(async (index: number) => {
        if (isCleaning) {
            Taro.showToast({ title: '正在清扫中，无法切换路线', icon: 'none' })

            return
        }

        const route = routes[index]
        if (!route || !productId) return

        // 锁定滚动位置，防止选中后跳到顶部
        routeScrollLockRef.current = true
        setSelectedRouteIndex(index)

        try {
            const res = await tRailcarService.task.setCurrentTask(productId, route.name)
            if (res?.success) {
                showToast('路线选择成功')
            } else {
                showToast(res?.message || '路线选择失败')
            }
        } catch (error: any) {
            showToast(error?.message || '路线选择失败，请重试')
        } finally {
            // 延迟解锁，等重渲染完成
            setTimeout(() => {
                routeScrollLockRef.current = false
            }, 300)
        }
    }, [routes, productId, isCleaning])

    // ========== 切换机器人 ==========
    const handleRobotSwitch = useCallback(async (robot: Robot) => {
        // 停止当前设备的实时轨迹追踪
        if (isCleaning || wsDeviceIdRef.current) {
            stopRealTimeTracking()
            setIsCleaning(false)
            setRealTimeTrack([])
            setCurrentPosition(null)
            realTimeTrackRef.current = []
            currentPositionRef.current = null
        }

        // 主动取消之前的请求 - 使所有进行中的请求失效
        const currentDeviceId = vehicleService.getCurrentProductId()
        if (currentDeviceId && currentDeviceId !== robot.productId) {
            requestIdRef.current++  // 使之前的请求ID失效
        }

        setCurrentRobot(robot)
        setDropdownVisible(false)
        const res = vehicleService.getVehicleById(robot.id)

        console.log(robot.productId, '----productId---', res)
        vehicleService.setCurrentProductId(robot.productId);
        vehicleService.setCurrentSerialNumber(robot.serialNumber);
        Taro.showToast({
            title: `已切换到 ${robot.serialNumber}`,
            icon: 'success',
        })

        await fetchTaskList()
    }, [fetchTaskList, isCleaning])

    // 获取状态颜色
    const getStatusColor = (online: Robot['online']) => {
        switch (online) {
            case true: return '#52c41a'
            case false: return '#d9d9d9'
            default: return '#d9d9d9'
        }
    }

    // 判断设备是否在线（兼容 online 和 onlineState 两种字段）
    const isRobotOnline = (robot: Robot | null): boolean => {
        if (!robot) return false
        if (robot.online === true) return true
        const state = (robot.onlineState || '').toUpperCase()
        return state === 'ONLINE'
    }

    // 建图 - 发送开始建模信号
    const handleBuildMap = useCallback(async () => {
        const productId = vehicleService.getCurrentProductId()
        if (!productId) {
            Taro.showToast({ title: '无设备信息', icon: 'none' })
            return
        }

        // 设备离线时拦截
        if (!isRobotOnline(currentRobot)) {
            Taro.showToast({ title: '设备离线，请先连接设备', icon: 'none' })
            return
        }

        Taro.showLoading({ title: '正在启动建模...' })
        try {
            const res = await tRailcarService.sendCommand({
                productId,
                command: 'start_modeling',
                params: {},
            })
            console.log('[start_modeling]', res)
            Taro.hideLoading()

            if (res.success) {
                Taro.navigateTo({ url: '/pages/map/index' })
            } else {
                Taro.showToast({
                    title: res.message || '启动建模失败',
                    icon: 'none',
                })
            }
        } catch (error: any) {
            Taro.hideLoading()
            console.error('[start_modeling] 失败:', error)
            const errorMsg = error?.message || (typeof error === 'string' ? error : '启动建模失败')
            Taro.showToast({
                title: String(errorMsg),
                icon: 'none',
            })
        }
    }, [currentRobot])

    // ========== 实时轨迹WebSocket管理 ==========
    const startRealTimeTracking = useCallback((serialNumber: string) => {
        // const fullDeviceId = `-T01${productId}`
        const fullDeviceId = serialNumber;
        wsDeviceIdRef.current = fullDeviceId

        // 清空旧轨迹
        realTimeTrackRef.current = []
        setRealTimeTrack([])
        setCurrentPosition(null)
        currentPositionRef.current = null

        console.log('[WebSocket] 开始实时轨迹追踪, deviceId:', fullDeviceId)

        // 连接WebSocket
        websocketService.connect((message: any) => {
            // 只处理当前设备的消息
            if (message.deviceId !== fullDeviceId) {
                return
            }

            // 更新当前位置
            if (typeof message.localX === 'number' && typeof message.localY === 'number') {
                const newPos = {
                    x: message.localX,
                    y: message.localY,
                    heading: typeof message.heading === 'number' ? message.heading : undefined
                }

                currentPositionRef.current = newPos
                setCurrentPosition(newPos)

                // 添加到轨迹（如果与上一个点距离大于阈值，避免过多数据点）
                const lastPoint = realTimeTrackRef.current[realTimeTrackRef.current.length - 1]
                if (!lastPoint ||
                    Math.abs(newPos.x - lastPoint.x) > 5 ||
                    Math.abs(newPos.y - lastPoint.y) > 5) {
                    realTimeTrackRef.current = [...realTimeTrackRef.current, { x: newPos.x, y: newPos.y }]

                    // 限制轨迹点数，最多保留500个点
                    if (realTimeTrackRef.current.length > 500) {
                        realTimeTrackRef.current = realTimeTrackRef.current.slice(-500)
                    }

                    setRealTimeTrack([...realTimeTrackRef.current])
                }
            }
        }, (connected: boolean) => {
            isWsConnectedRef.current = connected
            console.log('[WebSocket] 连接状态:', connected)
        })

        // 订阅设备
        websocketService.subscribeDevice(fullDeviceId)
    }, [])

    const stopRealTimeTracking = useCallback(() => {
        const deviceId = wsDeviceIdRef.current
        if (deviceId) {
            websocketService.unsubscribeDevice(deviceId)
        }
        websocketService.disconnect()
        isWsConnectedRef.current = false
        console.log('[WebSocket] 停止实时轨迹追踪')
    }, [])

    // ========== 开始清洁 ==========

    const handleStartClean = useCallback(async () => {
        const productId = vehicleService.getCurrentProductId()
        if (!productId) {
            Taro.showToast({ title: '无设备信息', icon: 'none' })
            return
        }

        if (routes.length === 0) {
            Taro.showToast({ title: '请先规划路线', icon: 'none' })
            return
        }

        setIsCleaning(true)
        Taro.showLoading({ title: '正在启动清扫...' })

        try {
            // 发送自动清扫命令
            const res = await Promise.race([
                tRailcarService.movement.auto_drive(productId),
                // new Promise((_, reject) =>
                //     setTimeout(() => reject(new Error('请求超时，请检查网络连接')), 12000)
                // )
            ]) as any

            console.log('[auto_drive] 响应:', res)

            // 检查响应是否有效
            if (!res || typeof res !== 'object') {
                Taro.hideLoading()
                setIsCleaning(false)
                Taro.showToast({
                    title: '响应数据异常',
                    icon: 'none',
                })
                return
            }

            if (res.success === false) {
                Taro.hideLoading()
                setIsCleaning(false)
                Taro.showToast({
                    title: res.message || '启动清扫失败',
                    icon: 'none',
                })
                return
            }

            const commandId = res.commandId
            if (!commandId) {
                Taro.hideLoading()
                setIsCleaning(false)
                Taro.showToast({
                    title: '命令发送成功但未获取到命令ID',
                    icon: 'none',
                })
                return
            }

            // 轮询命令状态
            try {
                const status = await tRailcarService.pollCommandStatus(commandId, 10, 1000) as any
                Taro.hideLoading()

                if (status && (status.status === 'SUCCEEDED' || status.terminal === true)) {
                    Taro.showToast({
                        title: status.message || '自动清扫已启动',
                        icon: 'success',
                    })
                    // 启动实时轨迹追踪
                    startRealTimeTracking(productId)
                } else if (status && status.status === 'FAILED') {
                    Taro.showToast({
                        title: status.message || '启动清扫失败',
                        icon: 'none',
                    })
                    setIsCleaning(false)
                } else {
                    Taro.showToast({
                        title: status?.message || '命令已发送',
                        icon: 'none',
                    })
                    // 命令已发送，也启动追踪（可能还没收到状态）
                    startRealTimeTracking(productId)
                }
            } catch (pollError: any) {
                Taro.hideLoading()
                console.warn('[auto_drive] 轮询命令状态超时:', pollError)
                // 轮询超时不代表命令失败，显示成功提示
                Taro.showToast({
                    title: '命令已发送，清扫即将启动',
                    icon: 'success',
                })
                // 也启动实时追踪
                startRealTimeTracking(productId)
            }
        } catch (error: any) {
            Taro.hideLoading()
            setIsCleaning(false)
            console.error('[auto_drive] 失败:', error)
            const errorMsg = error?.message || (typeof error === 'string' ? error : '启动清扫失败')
            Taro.showToast({
                title: String(errorMsg),
                icon: 'none',
            })
        }
    }, [routes.length, startRealTimeTracking])

    // ========== 停止清洁 ==========
    const handleStopClean = useCallback(async () => {
        const productId = vehicleService.getCurrentProductId()
        if (!productId) {
            Taro.showToast({ title: '无设备信息', icon: 'none' })
            return
        }

        Taro.showLoading({ title: '正在停止...' })

        try {
            // 发送停止命令
            await Promise.race([
                tRailcarService.movement.stop(productId),
                // new Promise((_, reject) =>
                //     setTimeout(() => reject(new Error('请求超时，请检查网络连接')), 12000)
                // )
            ])

            // 停止追踪
            stopRealTimeTracking()
            setIsCleaning(false)
            setRealTimeTrack([])
            setCurrentPosition(null)
            realTimeTrackRef.current = []
            currentPositionRef.current = null

            Taro.hideLoading()
            Taro.showToast({
                title: '已停止清扫',
                icon: 'success',
            })
        } catch (error: any) {
            Taro.hideLoading()
            console.error('[stop] 失败:', error)
            // 即使停止命令失败，也停止追踪
            stopRealTimeTracking()
            setIsCleaning(false)

            const errorMsg = error?.message || (typeof error === 'string' ? error : '停止失败')
            Taro.showToast({
                title: String(errorMsg),
                icon: 'none',
            })
        }
    }, [stopRealTimeTracking])

    // ========== 开始清洁按钮状态 ==========
    const getButtonState = useMemo(() => {
        // 无设备
        if (robots.length === 0) {
            return { text: '开始清洁', disabled: true, action: undefined }
        }

        // 机器人离线
        if (!isRobotOnline(currentRobot)) {
            return { text: '开始清洁', disabled: true, action: undefined }
        }

        // 正在清洁中
        if (isCleaning) {
            return { text: '停止清洁', disabled: false, action: handleStopClean }
        }

        // 无路线
        if (routes.length === 0) {
            return { text: '开始清洁', disabled: true, action: undefined }
        }

        // 可以开始清洁
        return { text: '开始清洁', disabled: false, action: handleStartClean }

    }, [robots.length, currentRobot, routes.length, isCleaning, handleStartClean, handleStopClean])

    // 自定义复选框（使用 transform 居中）
    // ============================================================
    const CustomCheckbox: React.FC<{
        checked: boolean;
        onChange: () => void;
        color?: string;
    }> = ({ checked, onChange, color = '#4a90e2' }) => {
        return (
            <View
                className={`custom-checkbox-box ${checked ? 'checked' : ''}`}
                style={{
                    width: '26rpx',
                    height: '26rpx',
                    borderColor: color,
                    backgroundColor: checked ? color : 'transparent',
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

    // ========== 格式化运行时间 ==========
    const formatDuration = useCallback((seconds: number): string => {
        if (!seconds || seconds === 0) return '--'
        // 秒转化
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60

        // 有小时
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`
        }
        // 有分钟
        if (minutes > 0) {
            return `${minutes}m ${secs}s`
        }
        // 只有秒
        return `${secs}s`
    }, [])
    // 切换查看规划函数
    // ============================================================
    const toggleShowPath = useCallback(() => {
        setShowPath((prev) => !prev);
    }, []);

    // 绘制路线到 Canvas
    const drawRouteOnCanvas = useCallback((route: Route | null, showPlanningPath: boolean, track: { x: number, y: number }[] = [], robotPos: { x: number, y: number, heading?: number } | null = null) => {
        try {
            // Canvas 实际像素尺寸（与 CSS 尺寸对应）
            const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = getCanvasPixelSize()
            const PADDING = 20

            const ctx = Taro.createCanvasContext(canvasIdRef.current)
            if (!ctx) {
                // console.warn('[Canvas] 无法创建Canvas上下文, canvasId:', canvasIdRef.current)
                return
            }

            // console.log('[Canvas] 开始绘制 - 画布尺寸:', CANVAS_WIDTH, 'x', CANVAS_HEIGHT,
            //     '轨迹点数:', track.length,
            //     '位置:', robotPos ? `(${robotPos.x},${robotPos.y})` : 'null')

            ctx.setFillStyle('#ffffff')
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

            // 收集所有用于计算边界的点
            let allPoints: { x: number, y: number }[] = []

            if (route) {
                const areaPoints = route.areaPoints || []
                const linkPoints = route.linkPoints || []
                const pathPoints = route.pathPoints || []
                allPoints = [...areaPoints, ...linkPoints, ...pathPoints]
            }

            // 添加实时轨迹点到边界计算
            if (track.length > 0) {
                allPoints = [...allPoints, ...track]
            }

            // 添加当前位置到边界计算
            if (robotPos) {
                allPoints = [...allPoints, robotPos]
            }

            if (allPoints.length === 0) {
                ctx.draw()
                return
            }

            // 计算边界框
            const xs = allPoints.map(p => p.x)
            const ys = allPoints.map(p => p.y)
            const minX = Math.min(...xs)
            const minY = Math.min(...ys)
            const maxX = Math.max(...xs)
            const maxY = Math.max(...ys)

            const dataWidth = maxX - minX || 1
            const dataHeight = maxY - minY || 1

            const scaleX = (CANVAS_WIDTH - PADDING * 2) / dataWidth
            const scaleY = (CANVAS_HEIGHT - PADDING * 2) / dataHeight
            const scale = Math.min(scaleX, scaleY)

            // 居中偏移量：当数据不填满画布时，整体居中
            const renderedWidth = dataWidth * scale
            const renderedHeight = dataHeight * scale
            const offsetX = PADDING + (CANVAS_WIDTH - PADDING * 2 - renderedWidth) / 2
            const offsetY = PADDING + (CANVAS_HEIGHT - PADDING * 2 - renderedHeight) / 2

            const project = (x: number, y: number) => ({
                x: offsetX + (x - minX) * scale,
                y: offsetY + (y - minY) * scale,
            })

            // 绘制网格
            ctx.setStrokeStyle('#f0f0f0')
            ctx.setLineWidth(1)
            const gridSize = 50 * scale
            if (gridSize > 5) {
                for (let i = 0; i <= CANVAS_WIDTH; i += gridSize) {
                    ctx.beginPath()
                    ctx.moveTo(i, 0)
                    ctx.lineTo(i, CANVAS_HEIGHT)
                    ctx.stroke()
                }
                for (let i = 0; i <= CANVAS_HEIGHT; i += gridSize) {
                    ctx.beginPath()
                    ctx.moveTo(0, i)
                    ctx.lineTo(CANVAS_WIDTH, i)
                    ctx.stroke()
                }
            }

            // 绘制区域点和连接点（按 areaNumber 分区）
            if (route) {
                const areaPoints = route.areaPoints || []
                const linkPoints = route.linkPoints || []
                const pathPoints = route.pathPoints || []

                // 区域颜色配置（循环使用）
                const areaColors = [
                    { stroke: '#4a90e2', fill: 'rgba(74, 144, 226, 0.15)', dot: '#4a90e2' },
                    { stroke: '#e24a4a', fill: 'rgba(226, 74, 74, 0.15)', dot: '#e24a4a' },
                    { stroke: '#4ae290', fill: 'rgba(74, 226, 144, 0.15)', dot: '#4ae290' },
                    { stroke: '#e2a04a', fill: 'rgba(226, 160, 74, 0.15)', dot: '#e2a04a' },
                    { stroke: '#904ae2', fill: 'rgba(144, 74, 226, 0.15)', dot: '#904ae2' },
                    { stroke: '#4ae2d0', fill: 'rgba(74, 226, 208, 0.15)', dot: '#4ae2d0' },
                ]

                // 按 areaNumber 分组区域点
                const areaGroups: Record<number, PointData[]> = {}
                areaPoints.forEach(p => {
                    const areaNum = p.areaNumber ?? 1
                    if (!areaGroups[areaNum]) areaGroups[areaNum] = []
                    areaGroups[areaNum].push(p)
                })

                // 绘制每个区域
                Object.keys(areaGroups).sort((a, b) => Number(a) - Number(b)).forEach((areaKey, idx) => {
                    const areaNum = Number(areaKey)
                    const points = areaGroups[areaNum].sort((a, b) => a.sequence - b.sequence)
                    const colors = areaColors[idx % areaColors.length]

                    if (points.length > 0) {
                        // 绘制区域边框
                        ctx.setStrokeStyle(colors.stroke)
                        ctx.setLineWidth(2)
                        ctx.setLineCap('round')
                        ctx.beginPath()
                        const firstP = project(points[0].x, points[0].y)
                        ctx.moveTo(firstP.x, firstP.y)
                        for (let i = 1; i < points.length; i++) {
                            const p = project(points[i].x, points[i].y)
                            ctx.lineTo(p.x, p.y)
                        }
                        if (points.length > 2) {
                            ctx.closePath()
                        }
                        ctx.stroke()

                        // 填充区域
                        if (points.length > 2) {
                            ctx.setFillStyle(colors.fill)
                            ctx.fill()
                        }

                        // 绘制区域点
                        points.forEach(point => {
                            const p = project(point.x, point.y)
                            const dotRadius = Math.max(2, CANVAS_WIDTH / 100)

                            ctx.beginPath()
                            ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2)
                            ctx.setFillStyle(colors.dot)
                            ctx.fill()
                            ctx.setStrokeStyle('#ffffff')
                            ctx.setLineWidth(1)
                            ctx.stroke()

                            // 点标签
                            const fontSize = Math.max(8, Math.round(CANVAS_WIDTH / 50))
                            const labelOffset = dotRadius + 4
                            const label = point.name || point.id || `点${point.sequence}`
                            ctx.setFontSize(fontSize)
                            ctx.setFillStyle('#333333')
                            ctx.setTextAlign('center')
                            ctx.setTextBaseline('bottom')
                            ctx.fillText(label, p.x, p.y - labelOffset)
                        })

                        // 绘制区域编号（在区域底部）
                        if (points.length > 0) {
                            const projectedPoints = points.map(p => project(p.x, p.y))
                            const minX = Math.min(...projectedPoints.map(p => p.x))
                            const minY = Math.min(...projectedPoints.map(p => p.y))
                            const maxX = Math.max(...projectedPoints.map(p => p.x))
                            const maxY = Math.max(...projectedPoints.map(p => p.y))

                            const labelFontSize = Math.max(10, Math.round(CANVAS_WIDTH / 40))
                            ctx.setFontSize(labelFontSize)
                            ctx.setFillStyle(colors.stroke)
                            ctx.setTextAlign('center')
                            ctx.setTextBaseline('top')
                            const centerX = (minX + maxX) / 2
                            const labelY = (minY + maxY) / 2
                            ctx.fillText(`区域${areaNum}`, centerX, labelY)
                        }
                    }
                })

                // 绘制连接点（桥梁）- 每2个点为一组画一条线
                if (linkPoints.length > 0) {
                    const sortedLinks = [...linkPoints].sort((a, b) => a.sequence - b.sequence)

                    // 每2个连接点为一组，画一条连线
                    ctx.setStrokeStyle('#ff9500')
                    ctx.setLineWidth(2)
                    ctx.setLineCap('round')
                    for (let i = 0; i + 1 < sortedLinks.length; i += 2) {
                        const p1 = project(sortedLinks[i].x, sortedLinks[i].y)
                        const p2 = project(sortedLinks[i + 1].x, sortedLinks[i + 1].y)
                        ctx.beginPath()
                        ctx.moveTo(p1.x, p1.y)
                        ctx.lineTo(p2.x, p2.y)
                        ctx.stroke()
                    }

                    // 绘制连接点
                    linkPoints.forEach(point => {
                        const p = project(point.x, point.y)
                        const dotRadius = Math.max(4, CANVAS_WIDTH / 100)

                        ctx.beginPath()
                        ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2)
                        ctx.setFillStyle('#ff9500')
                        ctx.fill()
                        ctx.setStrokeStyle('#ffffff')
                        ctx.setLineWidth(1)
                        ctx.stroke()

                        const fontSize = Math.max(8, Math.round(CANVAS_WIDTH / 50))
                        const labelOffset = dotRadius + 4
                        const label = point.name || point.id || `桥${point.sequence}`
                        ctx.setFontSize(fontSize)
                        ctx.setFillStyle('#333333')
                        ctx.setTextAlign('center')
                        ctx.setTextBaseline('bottom')
                        ctx.fillText(label, p.x, p.y - labelOffset)
                    })
                }

                // 绘制规划路径线
                if (showPlanningPath && pathPoints.length > 0) {
                    const sortedPath = [...pathPoints].sort((a, b) => a.sequence - b.sequence)

                    ctx.setStrokeStyle('#4a6cf7')
                    ctx.setLineWidth(2)
                    ctx.setLineCap('round')
                    ctx.setLineJoin('round')
                    ctx.beginPath()
                    const firstPath = project(sortedPath[0].x, sortedPath[0].y)
                    ctx.moveTo(firstPath.x, firstPath.y)
                    for (let i = 1; i < sortedPath.length; i++) {
                        const p = project(sortedPath[i].x, sortedPath[i].y)
                        ctx.lineTo(p.x, p.y)
                    }
                    ctx.stroke()
                }
            }

            // 绘制实时轨迹（绿色线条）
            if (track.length > 1) {
                console.log('[Canvas] 绘制实时轨迹 - 点数:', track.length)
                ctx.setStrokeStyle('#00ff66')
                ctx.setLineWidth(2)
                ctx.setLineCap('round')
                ctx.setLineJoin('round')
                ctx.beginPath()

                const firstTrack = project(track[0].x, track[0].y)
                ctx.moveTo(firstTrack.x, firstTrack.y)
                for (let i = 1; i < track.length; i++) {
                    const p = project(track[i].x, track[i].y)
                    ctx.lineTo(p.x, p.y)
                }
                ctx.stroke()

                // 轨迹线发光效果
                ctx.setStrokeStyle('rgba(0, 255, 102, 0.3)')
                ctx.setLineWidth(4)
                ctx.beginPath()
                ctx.moveTo(firstTrack.x, firstTrack.y)
                for (let i = 1; i < track.length; i++) {
                    const p = project(track[i].x, track[i].y)
                    ctx.lineTo(p.x, p.y)
                }
                ctx.stroke()
            }

            // 绘制当前机器人位置
            if (robotPos) {
                console.log('[Canvas] 绘制机器人位置:', robotPos.x, robotPos.y)
                const pos = project(robotPos.x, robotPos.y)

                // 标记大小根据画布宽度动态调整
                const markerSize = Math.max(6, CANVAS_WIDTH / 45)

                // 外圈闪烁效果
                ctx.beginPath()
                ctx.arc(pos.x, pos.y, markerSize * 1.5, 0, Math.PI * 2)
                ctx.setFillStyle('rgba(0, 255, 102, 0.2)')
                ctx.fill()

                // 外圈
                ctx.beginPath()
                ctx.arc(pos.x, pos.y, markerSize, 0, Math.PI * 2)
                ctx.setFillStyle('rgba(0, 255, 102, 0.4)')
                ctx.fill()

                // 中心点
                ctx.beginPath()
                ctx.arc(pos.x, pos.y, markerSize * 0.6, 0, Math.PI * 2)
                ctx.setFillStyle('#00ff66')
                ctx.fill()
                ctx.setStrokeStyle('#ffffff')
                ctx.setLineWidth(1)
                ctx.stroke()

                // 方向指示
                if (robotPos.heading !== undefined) {
                    const headingRad = (robotPos.heading * Math.PI) / 180
                    const arrowLength = markerSize * 1.2
                    const arrowX = pos.x + Math.cos(headingRad) * arrowLength
                    const arrowY = pos.y + Math.sin(headingRad) * arrowLength

                    ctx.beginPath()
                    ctx.moveTo(pos.x, pos.y)
                    ctx.lineTo(arrowX, arrowY)
                    ctx.setStrokeStyle('#00ff66')
                    ctx.setLineWidth(2)
                    ctx.stroke()

                    const headLength = markerSize * 0.6
                    const headAngle1 = headingRad + Math.PI * 0.8
                    const headAngle2 = headingRad - Math.PI * 0.8

                    ctx.beginPath()
                    ctx.moveTo(arrowX, arrowY)
                    ctx.lineTo(
                        arrowX + Math.cos(headAngle1) * headLength,
                        arrowY + Math.sin(headAngle1) * headLength
                    )
                    ctx.moveTo(arrowX, arrowY)
                    ctx.lineTo(
                        arrowX + Math.cos(headAngle2) * headLength,
                        arrowY + Math.sin(headAngle2) * headLength
                    )
                    ctx.stroke()
                }
            }

            ctx.draw()
            console.log('[Canvas] 绘制完成')
        } catch (error) {
            console.error('[Canvas] 绘制失败:', error)
        }
    }, [])

    // 当选中路线变化时重新绘制
    useEffect(() => {
        if (dropdownVisible) return  // 下拉菜单打开时不绘制
        if (routes.length === 0 && realTimeTrack.length === 0) {
            try {
                const ctx = Taro.createCanvasContext(canvasIdRef.current)
                ctx.setFillStyle('#ffffff')
                ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)
                ctx.draw()
            } catch (e) {
                console.warn('[Canvas] 清空画布失败:', e)
            }
            return
        }
        // 延迟绘制，确保Canvas已渲染
        const timer = setTimeout(() => {
            const selectedRoute = routes[selectedRouteIndex]
            drawRouteOnCanvas(selectedRoute || null, showPath, realTimeTrack, currentPosition)
        }, 50)
        return () => clearTimeout(timer)
    }, [routes, selectedRouteIndex, showPath, drawRouteOnCanvas, dropdownVisible])

    // 实时轨迹更新时绘制（节流处理，每帧只绘制一次）
    const lastDrawTimeRef = useRef(0)
    useEffect(() => {
        if (dropdownVisible) return
        if (realTimeTrack.length === 0 && !currentPosition) return

        // 节流：至少间隔 50ms 才重新绘制，避免高频更新导致闪烁
        const now = Date.now()
        if (now - lastDrawTimeRef.current < 50) return
        lastDrawTimeRef.current = now

        const selectedRoute = routes[selectedRouteIndex]
        console.log('[Canvas] 实时绘制 - track:', realTimeTrack.length, 'pos:', currentPosition)
        drawRouteOnCanvas(selectedRoute || null, showPath, realTimeTrack, currentPosition)
    }, [realTimeTrack, currentPosition])

    // 当下拉菜单关闭时，重新绘制Canvas（因为Canvas被条件渲染移除后需要重绘）
    useEffect(() => {
        if (!dropdownVisible) {
            // 延迟等待Canvas渲染完成
            const timer = setTimeout(() => {
                const selectedRoute = routes[selectedRouteIndex]
                drawRouteOnCanvas(selectedRoute || null, showPath, realTimeTrackRef.current, currentPositionRef.current)
            }, 150)
            return () => clearTimeout(timer)
        }
    }, [dropdownVisible, routes, selectedRouteIndex, showPath, drawRouteOnCanvas])

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
        // console.log('[Index Page] ========== 启用 WebSocket ==========')

        // 页面卸载时断开连接
        return () => {
            console.log('[Index Page] 页面卸载，断开 WebSocket')
            stopRealTimeTracking()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadVehicles])

    // 页面隐藏时停止追踪和轮询
    useDidHide(() => {
        if (isCleaning) {
            console.log('[Index Page] 页面隐藏，停止实时追踪')
            stopRealTimeTracking()
        }
        if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
        }
    })

    // 页面卸载时清理
    useUnload(() => {
        stopRealTimeTracking()
        if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
        }
    })

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
                Taro.showToast({ title: '二维码格式错误，请扫描正确的设备二维码', icon: 'none' })
                return
            }

            // 保存扫描结果，弹出确认弹窗
            setScannedDevice(qrData)
            setConfirmDevice(qrData)
        } catch (error: any) {
            console.error('扫描二维码失败:', error)
            if (error.errMsg && error.errMsg.includes('cancel')) {
                // 用户取消扫描，不显示错误
                return
            }
            showToast(error?.message || '扫描失败，请重试')
        }
    }

    // 确认添加设备
    const handleConfirmAddDevice = async () => {
        if (!confirmDevice || binding) return
        setBinding(true)
        try {
            const bindResult = await vehicleService.scanAndBindDevice(confirmDevice)
            if (!bindResult.bound) {
                const owner = bindResult.boundUsername || '其他用户'
                Taro.showToast({ title: `该设备已被 ${owner} 绑定`, icon: 'none' })
                setConfirmDevice(null)
                setScannedDevice(null)
                return
            }
            Taro.showToast({ title: `设备 ${bindResult.productId} 绑定成功`, icon: 'success' })
            setConfirmDevice(null)
            navigateTo('home')
        } catch (error: any) {
            console.error('绑定设备失败:', error)
            Taro.showToast({ title: error?.message || '绑定失败，请重试', icon: 'none' })
        } finally {
            setBinding(false)
        }
    }

    // ========== 扫描页面 ==========
    const ScanPage = () => (
        <View className="scan-page">
            {robots.length > 0 && (
                <View
                    style={{
                        position: 'absolute', top: '16px', left: '16px', zIndex: 10,
                        padding: '6px 12px', background: '#4a6cf7',
                        borderRadius: '8px', border: '1px solid #4a6cf7',
                    }}
                    onClick={() => navigateTo('home')}
                >
                    <Text style={{ color: '#ffffffff', fontSize: '14px' }}>返回</Text>
                </View>
            )}
            <View className="scan-container">
                {/* Logo区域 */}
                <View className="logo-section">
                    <View className="logo-placeholder"> {/* Logo占位区域，可以后续替换为实际logo图片 */}

                    </View>
                    <Text className="logo-title">智能</Text>
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
                {/* 
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
                                // setSelectedDeviceFamily(null)
                                // setSearchKeyword('')
                                navigateTo('home')
                            }}
                        >
                            <Text className="scan-btn-text">进入设备类型</Text>
                        </Button>
                    </View>
                )} */}
            </View>
        </View>
    )
    // ========== 首页 ==========
    const HomePage = () => {

        if (loading) {
            return (
                <View className='home-container'>
                    <View className='loading-state'>
                        <View className='loading-state__spinner' />
                        <Text className='loading-state__text'>加载中</Text>
                        <View className='loading-state__dots'>
                            <View className='dot' />
                            <View className='dot' />
                            <View className='dot' />
                        </View>
                    </View>
                </View>
            )
        }
        return (


            <View className='home-container'>
                {/* 顶部导航栏 */}
                <View className='header'>
                    <View className='header-left'>
                        {/* 状态圆点 */}
                        <View
                            className='status-dot'
                            style={{ backgroundColor: getStatusColor(isRobotOnline(currentRobot) ? true : false) }}
                        />
                        {/* 机器人名称 */}

                        {/* 机器人名称 */}
                        <Text className='robot-name'>
                            {robots.length === 0 ? '暂无设备连接' : `${currentRobot?.serialNumber || ''}`}
                        </Text>
                    </View>

                    <View className='header-right'>
                        {/* 添加按钮 */}
                        <View className='add-btn' onClick={() => navigateTo('scan')}>
                            <Text className='add-icon'>+</Text>
                        </View>

                        {/* 下拉切换菜单 - 自定义实现 */}
                        <View className='dropdown-wrapper'>
                            <View
                                className='dropdown-trigger'
                                onClick={() => setDropdownVisible(!dropdownVisible)}
                            >
                                <Text className='dropdown-icon'>切换▼</Text>
                            </View>

                            {dropdownVisible && (
                                <View className='dropdown-menu'>
                                    {/* 型号筛选列表 */}
                                    <View className='dropdown-models'>
                                        <View
                                            className={`dropdown-model-item ${selectedModel === null ? 'dropdown-model-item--active' : ''}`}
                                            onClick={() => setSelectedModel(null)}
                                        >
                                            <Text className='dropdown-model-text'>全部</Text>
                                        </View>
                                        {(() => {
                                            const modelMap: { [key: string]: string } = {
                                                '-D01': '干挂式',
                                                '-D11': '干挂带扭',
                                                '-D21': '干挂带跨',
                                                '-D12': '干挂接驳车',
                                                '-T01': '履带式',
                                                '-T11': '履带无人值守',
                                                '-T21': '履带操控看守',
                                                '-T12': '履带充电仓',
                                            }
                                            // 从设备列表中提取存在的型号
                                            const existingModels = new Set<string>()
                                            robots.forEach(robot => {
                                                const pt = robot.productType || ''
                                                Object.keys(modelMap).forEach(key => {
                                                    if (pt.includes(key)) existingModels.add(key)
                                                })
                                            })
                                            return Array.from(existingModels).map(model => (
                                                <View
                                                    key={model}
                                                    className={`dropdown-model-item ${selectedModel === model ? 'dropdown-model-item--active' : ''}`}
                                                    onClick={() => setSelectedModel(model)}
                                                >
                                                    <Text className='dropdown-model-text'>{modelMap[model]}</Text>
                                                </View>
                                            ))
                                        })()}
                                    </View>

                                    {/* 设备列表 */}
                                    <View className='dropdown-list'>
                                        {robots
                                            .filter(robot => {
                                                if (!selectedModel) return true
                                                const pt = robot.productType || ''
                                                return pt.includes(selectedModel)
                                            })
                                            .map((robot) => (
                                                <View
                                                    key={robot.id}
                                                    className={`dropdown-item ${robot.id === currentRobot?.id ? 'active' : ''}`}
                                                    onClick={() => handleRobotSwitch(robot)}
                                                >
                                                    <View className='item-left'>
                                                        <View
                                                            className='item-status-dot'
                                                            style={{ backgroundColor: getStatusColor(robot.online) }}
                                                        />
                                                        <Text className='item-name'>{robot.serialNumber}</Text>
                                                    </View>
                                                    {robot.id === currentRobot?.id && (
                                                        <Text className='item-check'>✓</Text>
                                                    )}
                                                </View>
                                            ))
                                        }
                                    </View>
                                </View>
                            )}



                        </View>
                    </View>
                </View>

                {/* 页面内容区域 */}
                <View className='content'>

                    {robots.length === 0 ? (
                        // 无设备 - 显示提示
                        <View className='empty-device'>
                            <Text className='empty-title'>开启智慧清洁</Text>
                            <Text className='empty-desc'>点击右上角「+」绑定你的第一台机器人，
                                让它为你规划专属清扫路线。</Text>
                        </View>
                    ) : (
                        // 有设备 - 显示设备信息-线路图

                        <View className="path-demo-page">
                            {/* ===== Canvas ===== */}
                            {dropdownVisible ? (
                                // 下拉菜单打开时，用普通View替代Canvas，因为小程序中Canvas是原生组件层级最高
                                <View className="canvas-wrapper" style={{ height: `${canvasSize.height}px` }}>
                                    <View className="path-canvas canvas-placeholder-bg" />
                                </View>
                            ) : (
                                <View className="canvas-wrapper" style={{ height: `${canvasSize.height}px` }}>
                                    <Canvas
                                        id={canvasIdRef.current}
                                        canvas-id={canvasIdRef.current}
                                        width={String(canvasSize.width)}
                                        height={String(canvasSize.height)}
                                        className="path-canvas"
                                    />
                                    {/* Canvas 覆盖层：加载中/错误/空状态 */}
                                    {routesLoading && (
                                        <View className='empty-path-overlay'>
                                            <Text className='empty-path-title'>加载路线中...</Text>
                                        </View>
                                    )}
                                    {!routesLoading && routesError && (
                                        <View className='empty-path-overlay'>
                                            <Text className='empty-path-title' style={{ color: '#ff4d4f' }}>{routesError}</Text>
                                            <Text className='empty-path-title' style={{ color: '#4a6cf7', marginTop: '10rpx' }} onClick={fetchTaskList}>点击重试</Text>
                                        </View>
                                    )}
                                    {!routesLoading && !routesError && routes.length === 0 && (

                                        <View className='empty-path-overlay'>
                                            <Text className='empty-path-title'>请先点击底部的「建图」，在地图上标记清扫区域，再开始作业。</Text>
                                        </View>
                                    )}
                                </View>
                            )}
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
                                            color="#4a90e2"
                                        />
                                        <View className="legend-line dashed" />
                                        <Text className="legend-label">
                                            规划路径 <Text className="legend-small"></Text>
                                        </Text>
                                    </View>



                                </View>
                            </View>

                            {/* ===== 运行参数 - 一行三个 ===== */}
                            <View className='info-stats'>
                                <View className='stat-item'>
                                    <Text className='stat-label'>运行时间</Text>
                                    <Text className='stat-value'>
                                        {currentRobot.runTimeTotal !== null && currentRobot.runTimeTotal !== undefined
                                            ? formatDuration(currentRobot.runTimeTotal)
                                            : '--'}
                                    </Text>
                                </View>
                                <View className='stat-item'>
                                    <Text className='stat-label'>行走速度</Text>
                                    <Text className='stat-value'>
                                        {currentRobot.walkSpeed !== null && currentRobot.walkSpeed !== undefined
                                            ? `${currentRobot.walkSpeed}`
                                            : '--'}
                                    </Text>
                                </View>
                                <View className='stat-item'>
                                    <Text className='stat-label'>电量</Text>
                                    <Text className='stat-value'>
                                        {currentRobot.battery !== null && currentRobot.battery !== undefined
                                            ? `${currentRobot.battery}%`
                                            : '--'}
                                    </Text>
                                </View>
                            </View>



                            {/* ===== 选择路线图区块 ===== */}
                            <View className='path-section'>
                                {/* 选择路线图标题栏 */}
                                <View className='path-header'>
                                    <View className='path-header-left'>
                                        <Text className='path-header-icon'>🗺️</Text>
                                        <Text className='path-header-title'>我的路线图</Text>
                                    </View>
                                    <View className='path-header-right'>
                                        <View className='build-map-btn' onClick={handleBuildMap}>
                                            <Text className='build-map-text'>建图</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* 路线列表 - 竖向滚动 */}
                                <ScrollView
                                    className='path-list-scroll'
                                    scrollY
                                    showScrollbar={false}
                                    scrollTop={routeScrollTop}
                                    onScroll={(e) => {
                                        // 记录滚动位置，防止重渲染时跳到顶部
                                        if (!routeScrollLockRef.current) {
                                            setRouteScrollTop(e.detail.scrollTop)
                                        }
                                    }}
                                >
                                    <View className='path-list'>
                                        {routesLoading ? (
                                            <View className='path-loading-item'>
                                                <Text className='path-loading-text'>加载中...</Text>
                                            </View>
                                        ) : routesError ? (
                                            <View className='path-error-item' onClick={fetchTaskList}>
                                                <Text className='path-error-icon'>⚠️</Text>
                                                <Text className='path-error-text'>{routesError}</Text>
                                                <Text className='path-error-retry'>点击重试</Text>
                                            </View>
                                        ) : routes.length === 0 ? (
                                            <View className='path-empty-item'>
                                                <Text className='path-empty-text'>暂无路线</Text>
                                            </View>
                                        ) : (
                                            routes.map((route, index) => (
                                                <View
                                                    key={route.id}
                                                    className={`path-item ${index === selectedRouteIndex ? 'active' : ''}`}
                                                    onClick={() => handleSelectRoute(index)}
                                                >
                                                    <View className='path-item-left'>
                                                        <View className='path-item-dot' />
                                                        <Text className='path-item-name'>{route.name}</Text>
                                                    </View>
                                                    {index === selectedRouteIndex && (
                                                        <Text className='path-item-check'>✓</Text>
                                                    )}
                                                </View>
                                            ))
                                        )}
                                    </View>
                                </ScrollView>
                            </View>
                        </View>






                    )}


                </View>

                {/* ===== 底部按钮 ===== */}
                <View className='footer'>
                    <View
                        className={`start-btn ${getButtonState.disabled ? 'disabled' : ''}`}
                        onClick={getButtonState.action}
                    >
                        <Text className='btn-text'>{getButtonState.text}</Text>
                    </View>

                </View>

            </View>


        )
    }

    return (
        <View className="container">
            {currentPage === 'scan' && ScanPage()}
            {currentPage === 'home' && HomePage()}


            {/* Toast */}
            {toast.show && (
                <View className="toast">
                    <Text>{toast.message}</Text>
                </View>
            )}

            {/* 设备信息确认弹窗 */}
            {confirmDevice && (
                <View className="confirm-modal-mask">
                    <View className="confirm-modal">
                        <View className="confirm-modal__title">
                            <Text>设备信息确认</Text>
                        </View>
                        <View className="confirm-modal__content">
                            <View className="confirm-modal__row">
                                <Text className="confirm-modal__label">公司代号：</Text>
                                <Text className="confirm-modal__value">{confirmDevice.companyCode}</Text>
                            </View>
                            <View className="confirm-modal__row">
                                <Text className="confirm-modal__label">产品型号：</Text>
                                <Text className="confirm-modal__value">{confirmDevice.productType}</Text>
                            </View>
                            <View className="confirm-modal__row">
                                <Text className="confirm-modal__label">产品编号：</Text>
                                <Text className="confirm-modal__value">{confirmDevice.productId}</Text>
                            </View>
                            <View className="confirm-modal__tip">
                                <Text>确认添加此设备吗？</Text>
                            </View>
                        </View>
                        <View className="confirm-modal__actions">
                            <View
                                className="confirm-modal__btn confirm-modal__btn--cancel"
                                onClick={() => { setConfirmDevice(null); setScannedDevice(null) }}
                            >
                                <Text>取消</Text>
                            </View>
                            <View
                                className={`confirm-modal__btn confirm-modal__btn--confirm ${binding ? 'confirm-modal__btn--disabled' : ''}`}
                                onClick={handleConfirmAddDevice}
                            >
                                <Text>{binding ? '添加中...' : '确认添加'}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )}



            {/* 底部导航已移除 */}
            <View className="bottom-nav">
                {/* <Button
                    className={`nav-item ${currentPage === 'home' ? 'nav-item-active' : ''}`}
                    onClick={() => {

                        navigateTo('home')
                    }}
                >
                    <Home />
                    <Text>设备</Text>
                </Button>

                <Button
                //   className={`nav-item ${currentPage === 'profile' ? 'nav-item-active' : ''}`}
                //   onClick={() => navigateTo('profile')}
                >
                    <View className="nav-icon">
                        <View className="profile-icon-small" />
                    </View>
                    <Text>我的</Text>
                </Button> */}
            </View>
        </View>
    )

}