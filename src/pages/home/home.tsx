import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Button, Input, Text, Picker, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Battery, Back, Home, Settings, Send, Refresh, ChevronRight, Bell } from '../../components/Icons'
import RobotModel from '../../components/RobotModel'
import { deviceControlService, type DeviceConfig, type RailcarConfigRecord } from '../../services/deviceControlService'
import commandStatusService from '../../services/commandStatusService'
import { authService } from '../../services/authService'
import deviceStatusService from '../../services/deviceStatusService'
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
interface Robot {
    id: number
    serialNumber: string
    companyCode: string //"ZTZN-PVC"
    productType: string //"-T01"
    productId: string //"250002",
    status: string //"offline",
    battery: number //null,电量
    online: boolean //false,
    runTimeTotal: number//运行时间
    walkSpeed: number//行走速度
}
interface Route {
    id: number
    name: string //"路线名",
}
interface State {
    robots: Robot[]
    currentRobot: Robot | null
    dropdownVisible: boolean
}

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
export default function Index() {
    const [robots, setRobots] = useState<Robot[]>([])
    const [currentRobot, setCurrentRobot] = useState<Robot | null>(null)
    const [dropdownVisible, setDropdownVisible] = useState(false)
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState({ show: false, message: '' })
    const currentPageRef = useRef<'scan' | 'home'>('home')
    const [currentPage, setCurrentPage] = useState<'scan' | 'home'>('home')
    const [scannedDevice, setScannedDevice] = useState<QRCodeData | null>(null)
    // const [productId, setProductId] = useState('1250001')
    // const [serialNumber, setSerialNumber] = useState('-T01250001')
    // 当前设备号
    const serialNumber = Taro.getStorageSync('currentSerialNumber')

    const [position, setPosition] = useState<Point>(PATH_POINTS[0]);
    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [showPath, setShowPath] = useState<boolean>(true);
    const [speed, setSpeed] = useState<number>(10);
    const [routes, setRoutes] = useState<Route[]>([])
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
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
    // const [shadowData, setShadowData] = useState<DeviceShadow | null>(null)
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
        const previousPage = currentPageRef.current
        currentPageRef.current = page
        setCurrentPage(page)

        // // 进入设置页面时，标记为正在编辑
        // if (page === 'settings') {
        //     setIsEditingSettings(true)
        //     setSettingsTab('basic')
        //     isInputFocusedRef.current = false
        // } else if (previousPage === 'settings') {
        //     // 离开设置页面时，取消编辑标记
        //     setIsEditingSettings(false)
        //     isInputFocusedRef.current = false
        // }
    }

    const loadVehicles = useCallback(async (): Promise<Robot[]> => {
        try {
            console.log('[Index Page] 开始加载设备列表')
            // // 模拟数据
            // const mockData: Robot[] = [
            //     {
            //         id: 28,
            //         companyCode: 'ZTZN-PVC',
            //         productType: '-T01',
            //         productId: '250001',
            //         status: 'online',
            //         battery: 85,
            //         online: true,
            //         // runTimeTotal: 0,
            //         // walkSpeed: 0,
            //     },
            //     {
            //         id: 29,
            //         companyCode: 'ZTZN-PVC-002',
            //         productType: '-T01',
            //         productId: '250002',
            //         status: 'offline',
            //         battery: 0,
            //         online: false,
            //         // runTimeTotal: 0,
            //         // walkSpeed: 0,
            //     },
            //     {
            //         id: 30,
            //         companyCode: 'ZTZN-PVC-003',
            //         productType: '-D01',
            //         productId: '250003',
            //         status: 'online',
            //         battery: 60,
            //         online: true,
            //         // runTimeTotal: 0,
            //         // walkSpeed: 0,
            //     },
            // ]
            const vehicles = await vehicleService.getAllVehicles()
            const robotLists = vehicles.map(v => vehicleService.convertToRobot(v))//所有设备

            const mockData = robotLists
            vehicleService.setCurrentSerialNumber(serialNumber);
            console.log('[上次连接设备] 当前设备号：', serialNumber)

            // 自动筛选包含 T01 的型号
            const robotList = mockData.filter((robot) => {
                const productType = robot.productType || ''
                const productId = robot.productId || ''
                return productType.includes('T01') || productId.includes('T01')
            })

            setRobots(robotList)
            console.log(`[Index Page] 加载了 ${robotList.length} 个设备`, robotList)
            setLoading(true)
            if (robotList.length === 0) {//无设备时显示扫码引导
                currentPageRef.current = 'home'
                setCurrentPage('home')

            } else {
                setCurrentRobot(robotList[0] || null)
                // 自动获取第一个设备的 shadow
                if (robotList[0]) {
                    console.log(robotList[0])
                    // setProductId(robotList[0].productId)
                    // const fullDeviceId = robotList[0].productType + robotList[0].productId
                    // setSerialNumber(robotList[0].serialNumber)

                    console.log("======serialNumber=======" + robotList[0].serialNumber)
                    try {
                        const res = await vehicleService.getVehicleById(robotList[0].id)
                        // 保存设备id主键号
                        // Taro.setStorageSync('currentid', res.id)
                        vehicleService.setCurrentProductId(res.productId);
                        // 保存设备号
                        vehicleService.setCurrentSerialNumber(res.serialNumber)
                        // const res = deviceStatusService.getDeviceShadow(robotList[0].serialNumber)
                        console.log('-------', res)

                        // 获取路线列表
                        fetchTaskList()
                    } catch (error) {


                        console.error('getDeviceShadow加载失败:', error);
                    }
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
    }, [])

    // ========== 获取路线列表 ==========
    const fetchTaskList = useCallback(async () => {
        try {
            const productId = vehicleService.getCurrentProductId()
            if (!productId) {
                console.log('[路线列表] 无productId')
                return
            }

            const res = await tRailcarService.task.fetchTaskOptions(productId)
            console.log('[路线列表]', res)

            if (res && res.taskNames) {
                const routeList: Route[] = res.taskNames.map((name, index) => ({
                    id: index + 1,
                    name: name,
                }))
                setRoutes(routeList)

                if (res.currentTaskName) {
                    const currentIndex = res.taskNames.findIndex(name => name === res.currentTaskName)
                    if (currentIndex >= 0) {
                        setSelectedRouteIndex(currentIndex)
                    }
                } else if (routeList.length > 0) {
                    setSelectedRouteIndex(0)
                }
            }
        } catch (error) {
            console.error('[路线列表] 获取失败:', error)
        }
    }, [])

    // ========== 切换机器人 ==========
    const handleRobotSwitch = useCallback(async (robot: Robot) => {
        setCurrentRobot(robot)
        setDropdownVisible(false)
        // getVehicleById
        // const res = await deviceStatusService.getDeviceShadow(robot.serialNumber)
        const res = vehicleService.getVehicleById(robot.id)

        console.log(robot.productId, '----productId---', res)
        // 保存设备
        // Taro.setStorageSync('currentproductId', robot.productId)
        // 保存设备号
        vehicleService.setCurrentProductId(robot.productId);
        console.log('已调用 setCurrentProductId')
        vehicleService.setCurrentSerialNumber(robot.serialNumber);
        console.log('已调用 setCurrentSerialNumber')
        Taro.showToast({
            title: `已切换到 ${robot.serialNumber}`,
            icon: 'success',
        })

        // 获取路线列表
        await fetchTaskList()
    }, [fetchTaskList])

    // 获取状态颜色
    const getStatusColor = (online: Robot['online']) => {
        switch (online) {
            case true: return '#52c41a'
            case false: return '#d9d9d9'
            default: return '#d9d9d9'
        }
    }
    // ========== 开始清洁按钮状态 ==========
    const getButtonState = useMemo(() => {
        // 无设备
        if (robots.length === 0) {
            return { text: '开始清洁', disabled: true, action: undefined }
        }

        // 机器人离线
        if (!currentRobot || currentRobot.online !== true) {
            return { text: '开始清洁', disabled: true, action: undefined }
        }
        // 无路线
        if (routes.length === 0) {
            return { text: '开始清洁', disabled: true }
        }


        // // 待机 - 显示开始清洁
        // return { text: '开始清洁', disabled: false, }

    }, [robots.length, currentRobot])

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
        // initWebSocket()

        // 页面卸载时断开连接
        return () => {
            console.log('[Index Page] 页面卸载，断开 WebSocket')
            //   clearCommandStatusPolling()
            websocketService.disconnect()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadVehicles])

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
                )}
            </View>
        </View>
    )
    // ========== 首页 ==========
    const HomePage = () => {

        if (loading) {
            return (
                <View className='home-container'>
                    <View className='loading-state'>
                        <Text>加载中...</Text>
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
                            style={{ backgroundColor: getStatusColor(currentRobot?.online ?? false) }}
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
                                    <View className='dropdown-list'>
                                        {robots.map((robot) => (
                                            <View
                                                key={robot.id}
                                                className={`dropdown-item ${robot.id === currentRobot.id ? 'active' : ''}`}
                                                onClick={() => handleRobotSwitch(robot)}
                                            >
                                                <View className='item-left'>
                                                    <View
                                                        className='item-status-dot'
                                                        style={{ backgroundColor: getStatusColor(robot.online) }}
                                                    />
                                                    <Text className='item-name'>{robot.serialNumber}</Text>
                                                </View>
                                                {robot.id === currentRobot.id && (
                                                    <Text className='item-check'>✓</Text>
                                                )}
                                            </View>
                                        ))}
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
                            <View className="canvas-wrapper">

                                <canvas
                                    id="pathCanvas"
                                    // @ts-ignore
                                    type="2d"
                                    className="path-canvas"
                                />
                                {/* 无路线时显示文字覆盖层 */}
                                {routes.length === 0 && (
                                    <View className='empty-path-overlay'>
                                        {/* <Text className='empty-path-icon'>🗺️</Text> */}
                                        <Text className='empty-path-title'>请先点击底部的「建图」，在地图上标记清扫区域，再开始作业。</Text>
                                        {/* <Text className='empty-path-desc'>请添加设备后查看路线</Text> */}
                                    </View>
                                )}
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
                                        <View className='build-map-btn' onClick={() => Taro.navigateTo({ url: '/pages/map/index' })}>
                                            <Text className='build-map-text'>建图</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* 路线列表 - 竖向滚动 */}
                                <ScrollView
                                    className='path-list-scroll'
                                    scrollY
                                    showScrollbar={false}
                                >
                                    <View className='path-list'>
                                        {routes.length === 0 ? (
                                            <View className='path-empty-item'>
                                                <Text className='path-empty-text'>暂无路线</Text>
                                            </View>
                                        ) : (
                                            routes.map((route, index) => (
                                                <View
                                                    key={route.id}
                                                    className={`path-item ${index === selectedRouteIndex ? 'active' : ''}`}
                                                    onClick={() => setSelectedRouteIndex(index)}
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
    // // ========== 建图页面 ==========
    // const MapPage = () => {
    //     return <View>建图页面</View>
    // }

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



            {/* 底部导航 */}
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