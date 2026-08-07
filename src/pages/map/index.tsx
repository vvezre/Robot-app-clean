import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import './index.scss'
import tRailcarService from '../../services/tRailcarService'
import VehicleService from '../../services/vehicleService'
import Taro from '@tarojs/taro'

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

const productId = VehicleService.getCurrentProductId()
// const productId = "999999"
interface CommandResponse {
    success: boolean
    message: string
}

interface PointPanelProps {
    dataList: PointData[]
    title: string
    subtitle: string
    actionText: string
    actionColor?: 'blue' | 'orange'
    currentArea: number
    areaCount: number
    onAreaChange: (area: number) => void
    onFetch: () => Promise<void>
    onSample: () => Promise<CommandResponse>
    onDelete: (id: string) => Promise<void>
    onClear: () => Promise<void>
    onDirection: (direction: 'up' | 'down' | 'left' | 'right' | 'stop') => Promise<void>
}

const PointPanel = ({
    dataList,
    title,
    subtitle,
    actionText,
    actionColor = 'blue',
    currentArea,
    areaCount,
    onAreaChange,
    onFetch,
    onSample,
    onDelete,
    onClear,
    onDirection,
}: PointPanelProps) => {
    const handleDirection = useCallback(async (direction: 'up' | 'down' | 'left' | 'right' | 'stop') => {
        await onDirection(direction)
    }, [onDirection])

    const handleActionBtn = useCallback(async () => {
        try {
            const response = await onSample()
            if (!response.success) {
                throw new Error(response.message || '指令下发失败')
            }
            Taro.showToast({ title: '记录成功', icon: 'success' })
            await onFetch()
        } catch (error: any) {
            console.error('[记录点] 失败:', error)
            Taro.showToast({ title: error.message || '操作失败', icon: 'none' })
        }
    }, [onSample, onFetch])

    const handleDelete = async (id: string) => {
        try {
            await onDelete(id)
            Taro.showToast({ title: '删除成功', icon: 'success' })
            await onFetch()
        } catch (error: any) {
            console.error('[删除] 失败:', error)
            Taro.showToast({ title: '删除失败', icon: 'none' })
        }
    }

    const handleClearAll = async () => {
        const isConnection = areaCount === 0
        const confirmText = isConnection
            ? '确定要清空所有连接点吗？清空后将同时清空区域点，需要重新开始建图。'
            : `确定要清空所有区域点吗？清空后将重新开始建图。`
        Taro.showModal({
            title: '确认清空',
            content: confirmText,
            confirmText: '确定清空',
            cancelText: '取消',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await onClear()
                        Taro.showToast({ title: '清空成功', icon: 'success' })
                        await onFetch()
                    } catch (error: any) {
                        console.error('[清空] 失败:', error)
                        Taro.showToast({ title: '清空失败', icon: 'none' })
                    }
                }
            },
        })
    }

    // 按区域分组（区域点按areaNumber，连接点按每2个一组作为一座桥梁）
    const groupedPoints = useMemo(() => {
        if (areaCount === 0) {
            // 连接点：按每2个一组作为一座桥梁
            const sorted = [...dataList].sort((a, b) => a.sequence - b.sequence)
            const groups: Record<number, PointData[]> = {}
            for (let i = 0; i < sorted.length; i += 2) {
                const bridgeIndex = Math.floor(i / 2) + 1
                groups[bridgeIndex] = sorted.slice(i, i + 2)
            }
            return Object.keys(groups)
                .map(Number)
                .sort((a, b) => a - b)
                .map(area => ({ area, points: groups[area] }))
        } else {
            // 区域点：按areaNumber分组
            const groups: Record<number, PointData[]> = {}
            dataList.forEach(item => {
                const area = item.areaNumber ?? 1
                if (!groups[area]) groups[area] = []
                groups[area].push(item)
            })
            return Object.keys(groups)
                .map(Number)
                .sort((a, b) => a - b)
                .map(area => ({ area, points: groups[area] }))
        }
    }, [dataList, areaCount])

    return (
        <View className="region-card">
            <View className="region-point">
                <View className="region-point__header">
                    <View className="region-point__header-left">
                        <Text className="region-point__header-title">
                            {areaCount === 0
                                ? `已标记 ${Math.floor(dataList.length / 2)} 座桥梁 (${dataList.length}个连接点)`
                                : `已标记 ${areaCount} 个清扫区域 (${dataList.length}个区域点)`
                            }
                        </Text>
                    </View>
                    <View className="region-point__header-clear" onClick={handleClearAll}>
                        <Text className="region-point__header-clear-text">清空</Text>
                    </View>
                </View>

                {areaCount === 0 ? (
                    <View className="region-point__hint">
                        <Text className="region-point__hint-text">💡 每座桥梁需记录2个点（起点和终点）</Text>
                    </View>
                ) : (
                    <View className="region-point__hint">
                        <Text className="region-point__hint-text">💡 每个区域最少需要4个点才能形成闭合区域</Text>
                    </View>
                )}

                <ScrollView
                    className="region-point__scroll"
                    scrollY
                    style={{ height: '280px' }}
                >
                    <View className="region-point__table">
                        {dataList.length === 0 ? (
                            <View className="region-point__empty">
                                <Text className="region-point__empty-text">暂无数据</Text>
                            </View>
                        ) : areaCount === 0 ? (
                            // 连接点：按桥梁分组显示（每2个为一组）
                            groupedPoints.map(group => (
                                <View key={`bridge-${group.area}`} className="region-point__group">
                                    <View className="region-point__group-header">
                                        <Text className="region-point__group-title">
                                            桥梁{group.area} ({group.points.length}个点)
                                        </Text>
                                    </View>
                                    {group.points.map((item: PointData) => (
                                        <View className="region-point__row" key={item.id}>
                                            <View className="region-point__cell region-point__cell--name">
                                                <Text className="region-point__cell-text">{item.name}</Text>
                                            </View>
                                            <View className="region-point__cell region-point__cell--value">
                                                <Text className="region-point__cell-text">({item.x},{item.y})</Text>
                                            </View>
                                            <View
                                                className="region-point__cell region-point__cell--delete"
                                                onClick={() => handleDelete(item.id)}
                                            >
                                                <Text className="region-point__delete-btn">删除</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ))
                        ) : (
                            // 区域点：按区域分组显示
                            groupedPoints.map(group => (
                                <View key={`area-${group.area}`} className={`region-point__group`}>
                                    <View className="region-point__group-header">
                                        <Text className="region-point__group-title">
                                            区域{group.area} ({group.points.length}个点)
                                        </Text>
                                    </View>
                                    {group.points.map((item: PointData) => (
                                        <View className="region-point__row" key={item.id}>
                                            <View className="region-point__cell region-point__cell--name">
                                                <Text className="region-point__cell-text">{item.name}</Text>
                                            </View>
                                            <View className="region-point__cell region-point__cell--value">
                                                <Text className="region-point__cell-text">({item.x},{item.y})</Text>
                                            </View>
                                            <View
                                                className="region-point__cell region-point__cell--delete"
                                                onClick={() => handleDelete(item.id)}
                                            >
                                                <Text className="region-point__delete-btn">删除</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ))
                        )}
                    </View>
                </ScrollView>
            </View>

            <View className="region-control">
                <Text className="region-control__title">{title}</Text>
                <Text className="region-control__subtitle">{subtitle}</Text>
                <View className="region-control__body">
                    <View className="region-control__joystick">
                        <View className="joystick-pad">
                            <View className="joystick-btn joystick-btn--up" onClick={() => handleDirection('up')}>
                                <Text className="joystick-btn__arrow">▲</Text>
                            </View>
                            <View className="joystick-btn joystick-btn--left" onClick={() => handleDirection('left')}>
                                <Text className="joystick-btn__arrow">◀</Text>
                            </View>
                            <View className="joystick-btn joystick-btn--center" onClick={() => handleDirection('stop')}>
                                <Text className="joystick-btn__text">停止</Text>
                            </View>
                            <View className="joystick-btn joystick-btn--right" onClick={() => handleDirection('right')}>
                                <Text className="joystick-btn__arrow">▶</Text>
                            </View>
                            <View className="joystick-btn joystick-btn--down" onClick={() => handleDirection('down')}>
                                <Text className="joystick-btn__arrow">▼</Text>
                            </View>
                        </View>
                    </View>
                    <View className="region-control__action">
                        <View className={`action-btn ${actionColor === 'orange' ? 'action-btn--orange' : ''}`} onClick={handleActionBtn}>
                            <Text className="action-btn__text">{actionText}</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    )
}

const MapPage = () => {
    const [activeTab, setActiveTab] = useState<'region' | 'connect'>('region')
    const [showGuide, setShowGuide] = useState(false)
    const [currentStep, setCurrentStep] = useState(1)

    const [regionPoints, setRegionPoints] = useState<PointData[]>([])
    const [linkingPoints, setLinkingPoints] = useState<PointData[]>([])
    const [regionLoaded, setRegionLoaded] = useState(false)
    const [connectLoaded, setConnectLoaded] = useState(false)
    const [currentArea, setCurrentArea] = useState(1)
    const [areaCount, setAreaCount] = useState(1)

    const fetchModelingPoints = useCallback(async () => {
        // const fetchModelingPoints = useCallback(async (): Promise<PointData[]> => {
        try {
            const response = await tRailcarService.modeling.getModelingPoints(productId)
            console.log('[查询区域点] 成功:', response)
            const allPoints = Array.isArray(response) ? response : (response as any)?.points || []
            // 统计所有区域数
            const areas = new Set<number>()
            allPoints.forEach((p: PointData) => {
                if (p.areaNumber !== undefined) areas.add(p.areaNumber)
                else areas.add(1)
            })
            const maxArea = Math.max(...Array.from(areas), 1)
            setAreaCount(maxArea)
            // 存储所有区域点（不过滤）
            setRegionPoints(allPoints)
            return allPoints
        } catch (error) {
            console.error('[查询区域点] 失败:', error)
            return []
        }
    }, [])

    const fetchLinkingPoints = useCallback(async () => {
        try {
            const response = await tRailcarService.modeling.getLinkingPoints(productId)
            console.log('[查询连接点] 成功:', response)
            const points = Array.isArray(response) ? response : (response as any)?.points || []
            setLinkingPoints(points)
        } catch (error) {
            console.error('[查询连接点] 失败:', error)
        }
    }, [])

    useEffect(() => {
        if (activeTab === 'region') {
            fetchModelingPoints()
            fetchLinkingPoints()  // 同时刷新连接点，确保新增区域时检查准确
            setRegionLoaded(true)
        } else {
            fetchLinkingPoints()
            setConnectLoaded(true)
        }
    }, [activeTab, fetchModelingPoints, fetchLinkingPoints])

    useEffect(() => {
        if (activeTab === 'region') {
            fetchLinkingPoints()
            setConnectLoaded(true)
        } else {
            fetchModelingPoints()
            setRegionLoaded(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleRegionDirection = useCallback(async (direction: 'up' | 'down' | 'left' | 'right' | 'stop') => {
        const directionMap: Record<string, string> = {
            'up': '前进',
            'down': '后退',
            'left': '左转',
            'right': '右转',
            'stop': '停止',
        }
        try {
            let response
            switch (direction) {
                case 'up': response = await tRailcarService.movement.drive(productId, 0); break
                case 'down': response = await tRailcarService.movement.back(productId, 0); break
                case 'left': response = await tRailcarService.movement.turnLeft(productId, 0); break
                case 'right': response = await tRailcarService.movement.turnRight(productId, 0); break
                case 'stop': response = await tRailcarService.movement.stop(productId); break
            }
            if (!response.success) throw new Error(response.message || '指令下发失败')
            Taro.showToast({ title: `${directionMap[direction]} 指令下发成功`, icon: 'success' })
        } catch (error: any) {
            console.error('[方向控制] 失败:', error)
            Taro.showToast({ title: error.message || '操作失败', icon: 'none' })
        }
    }, [])

    const handleConnectDirection = useCallback(async (direction: 'up' | 'down' | 'left' | 'right' | 'stop') => {
        const directionMap: Record<string, string> = {
            'up': '前进',
            'down': '后退',
            'left': '左转',
            'right': '右转',
            'stop': '停止',
        }
        try {
            let response
            switch (direction) {
                case 'up': response = await tRailcarService.movement.drive(productId, 0); break
                case 'down': response = await tRailcarService.movement.back(productId, 0); break
                case 'left': response = await tRailcarService.movement.turnLeft(productId, 0); break
                case 'right': response = await tRailcarService.movement.turnRight(productId, 0); break
                case 'stop': response = await tRailcarService.movement.stop(productId); break
            }
            if (!response.success) throw new Error(response.message || '指令下发失败')
            Taro.showToast({ title: `${directionMap[direction]} 指令下发成功`, icon: 'success' })
        } catch (error: any) {
            console.error('[方向控制] 失败:', error)
            Taro.showToast({ title: error.message || '操作失败', icon: 'none' })
        }
    }, [])

    const handleSampleRegion = useCallback(async (): Promise<CommandResponse> => {
        const response = await tRailcarService.movement.sample_modeling_point(productId)
        if (!response.success) throw new Error(response.message || '采样区域点失败')
        return response
    }, [])

    const handleSampleConnect = useCallback(async (): Promise<CommandResponse> => {
        const response = await tRailcarService.movement.sample_modeling_link_point(productId)
        if (!response.success) throw new Error(response.message || '采样连接点失败')
        return response
    }, [])

    const handleDeleteRegion = useCallback(async (id: string) => {
        const response = await tRailcarService.movement.delete_modeling_point(productId, id)
        if (!response.success) throw new Error(response.message || '删除区域点失败')
    }, [])

    const handleDeleteConnect = useCallback(async (id: string) => {
        const response = await tRailcarService.movement.delete_link_point(productId, id)
        if (!response.success) throw new Error(response.message || '删除连接点失败')
    }, [])

    const handleClearRegion = useCallback(async () => {
        const response = await tRailcarService.movement.clear_area_point(productId)
        if (!response.success) throw new Error(response.message || '清空区域点失败')
        // 清空后发送start_modeling重新开始建图
        await tRailcarService.movement.start_modeling(productId)
        setAreaCount(1)
        setCurrentArea(1)
        setRegionPoints([])
    }, [])

    const handleClearConnect = useCallback(async () => {
        const response = await tRailcarService.movement.clear_link_point(productId)
        if (!response.success) throw new Error(response.message || '清空连接点失败')
        // 清空后发送start_modeling重新开始建图
        await tRailcarService.movement.start_modeling(productId)
        setAreaCount(1)
        setCurrentArea(1)
        setRegionPoints([])
        setLinkingPoints([])
    }, [])

    const handleHelpClick = () => {
        setShowGuide(true)
        setCurrentStep(1)
    }

    const handleComplete = () => {
        Taro.showModal({
            title: '规划完成，开始连线',
            content: '系统将自动连接，生成最高效的清扫路径。',
            confirmText: '确认',
            cancelText: '取消',
            success: async (res) => {
                if (res.confirm) {
                    Taro.showLoading({ title: '正在规划路径...' })
                    try {
                        const commandRes = await tRailcarService.movement.finish_modeling(productId)
                        console.log('[finish_modeling]', commandRes)

                        if (commandRes.success) {
                            const response = await tRailcarService.modeling.planCleaningPath(productId)
                            console.log('[规划结果]', response)
                            Taro.hideLoading()

                            let areaPoints: any[] = []
                            let linkPoints: any[] = []
                            let pathPoints: any[] = []

                            if (response) {
                                areaPoints = response.areaPoints || []
                                linkPoints = response.linkPoints || []
                                pathPoints = response.pathPoints || []
                            }

                            if (areaPoints.length > 0 || pathPoints.length > 0 || linkPoints.length > 0) {
                                console.log('[规划结果] areaPoints:', areaPoints.length, 'linkPoints:', linkPoints.length, 'pathPoints:', pathPoints.length)
                                Taro.setStorageSync('areaPoints', JSON.stringify(areaPoints))
                                Taro.setStorageSync('linkPoints', JSON.stringify(linkPoints))
                                Taro.setStorageSync('pathPoints', JSON.stringify(pathPoints))
                                Taro.navigateTo({
                                    url: '/pages/route/index',
                                })
                            } else {
                                Taro.showToast({
                                    title: '规划失败',
                                    icon: 'none',
                                })
                            }
                        } else {
                            Taro.hideLoading()
                            Taro.showToast({
                                title: commandRes.message || '指令下发失败',
                                icon: 'none',
                            })
                        }
                    } catch (error: any) {
                        Taro.hideLoading()
                        console.error('规划路径失败:', error)
                        const errorMsg = error?.message || (typeof error === 'string' ? error : '规划失败')
                        Taro.showToast({
                            title: String(errorMsg),
                            icon: 'none',
                        })
                    }
                }
            },
        })
    }

    // 新增区域块
    const handleNewArea = useCallback(async () => {
        // 先刷新数据，确保使用最新的区域点
        const latestPoints = await fetchModelingPoints()
        // 当前区域点数检查：每个区域最少4个点
        const currentAreaPoints = latestPoints.filter(p => (p.areaNumber ?? 1) === currentArea)
        console.log('[新增区域] 当前区域点检查:', { currentArea, totalPoints: latestPoints.length, currentAreaPointsCount: currentAreaPoints.length })
        if (currentAreaPoints.length < 4) {
            Taro.showModal({
                title: '区域点不足',
                content: `区域${currentArea}最少需要4个点才能形成闭合区域，当前已有${currentAreaPoints.length}个点，请继续在当前区域记录点。`,
                showCancel: false,
                confirmText: '知道了',
            })
            return
        }

        // 新增第N个区域需要N-1座桥梁（2个连接点/座）
        const requiredBridges = currentArea  // 新增后区域数-1 = 需要的桥梁数
        const requiredLinkPoints = requiredBridges * 2
        // 重新获取连接点数据
        let latestLinkingPoints: PointData[] = []
        try {
            const linkRes = await tRailcarService.modeling.getLinkingPoints(productId)
            latestLinkingPoints = Array.isArray(linkRes) ? linkRes : (linkRes as any)?.points || []
            setLinkingPoints(latestLinkingPoints)
        } catch (e) {
            console.error('[新增区域] 获取连接点失败:', e)
        }
        const currentBridges = Math.floor(latestLinkingPoints.length / 2)
        if (latestLinkingPoints.length < requiredLinkPoints) {
            Taro.showModal({
                title: '需要记录连接点',
                content: `区域间需要桥梁连接。新增区域${currentArea + 1}需要${requiredBridges}座桥梁（${requiredLinkPoints}个连接点），当前已有${currentBridges}座桥梁（${latestLinkingPoints.length}个连接点），请先切换到"连接点"标签页记录桥梁。`,
                confirmText: '去记录',
                cancelText: '取消',
                success: (res) => {
                    if (res.confirm) {
                        setActiveTab('connect')
                    }
                },
            })
            return
        }

        Taro.showModal({
            title: '新增区域',
            content: `当前区域${currentArea}的点已记录完成，确定要开始新的区域吗？`,
            confirmText: '确定',
            cancelText: '取消',
            success: async (res) => {
                if (res.confirm) {
                    Taro.showLoading({ title: '正在创建新区域...' })
                    try {
                        const response = await tRailcarService.movement.new_modeling_area(productId)
                        if (!response.success || !response.commandId) {
                            Taro.hideLoading()
                            Taro.showToast({ title: response.message || '新增区域失败', icon: 'none' })
                            return
                        }
                        console.log('[新增区域]', response.commandId)
                        // 轮询命令状态
                        const statusRes = await tRailcarService.pollCommandStatus(response.commandId, 15, 1000)
                        Taro.hideLoading()

                        const statusData = statusRes.detail?.result?.data
                        if (statusData && statusRes.status === 'SUCCEEDED') {
                            const newArea = statusData.areaNumber || (currentArea + 1)
                            const totalCount = statusData.groupCount || newArea
                            setAreaCount(totalCount)
                            setCurrentArea(newArea)
                            // setRegionPoints([])
                            Taro.showToast({ title: `已切换到区域${newArea}`, icon: 'success' })
                        } else if (statusRes.status === 'FAILED') {
                            Taro.showToast({ title: '新增区域失败', icon: 'none' })
                        } else {
                            // 超时或其他状态，回退到 +1
                            const newArea = currentArea + 1
                            setAreaCount(newArea)
                            setCurrentArea(newArea)
                            setRegionPoints([])
                            Taro.showToast({ title: `已切换到区域${newArea}`, icon: 'success' })
                        }
                    } catch (error: any) {
                        Taro.hideLoading()
                        Taro.showToast({ title: error?.message || '新增区域失败', icon: 'none' })
                    }
                }
            },
        })
    }, [currentArea, fetchModelingPoints])

    // 切换区域
    const handleAreaChange = useCallback((area: number) => {
        setCurrentArea(area)
        setActiveTab('region')
    }, [])

    const handleNextStep = () => {
        if (currentStep === 1) {
            setCurrentStep(2)
        } else {
            setShowGuide(false)
        }
    }

    const handleCloseGuide = () => {
        setShowGuide(false)
    }

    const GuideOverlay = () => (
        <View className="guide-overlay" onClick={handleNextStep}>
            <View className="guide-mask" />
            {currentStep === 1 && (
                <>
                    <View className="guide-highlight guide-highlight--tabs" />
                    <View className="guide-bubble guide-bubble--step1">
                        <View className="guide-bubble__arrow guide-bubble__arrow--top" />
                        <View className="guide-bubble__content">
                            <Text className="guide-bubble__title">步骤 1/2</Text>
                            <Text className="guide-bubble__text">区域点：标记需要清扫的区域边界</Text>
                            <Text className="guide-bubble__text">连接点：标记两个清扫区域之间的连接路径</Text>
                        </View>
                        <View className="guide-bubble__next" onClick={(e) => { e.stopPropagation(); handleNextStep() }}>
                            <Text className="guide-bubble__next-text">下一步 →</Text>
                        </View>
                    </View>
                </>
            )}
            {currentStep === 2 && (
                <>
                    <View className="guide-highlight guide-highlight--control" />
                    <View className="guide-bubble guide-bubble--step2">
                        <View className="guide-bubble__arrow" />
                        <View className="guide-bubble__content">
                            <Text className="guide-bubble__title">步骤 2/2</Text>
                            <Text className="guide-bubble__text">使用方向键遥控小车到指定位置</Text>
                            <Text className="guide-bubble__text">点击「记录点」保存当前位置</Text>
                        </View>
                        <View className="guide-bubble__next" onClick={(e) => { e.stopPropagation(); handleNextStep() }}>
                            <Text className="guide-bubble__next-text">完成</Text>
                        </View>
                    </View>
                </>
            )}
            <View className="guide-close" onClick={(e) => { e.stopPropagation(); handleCloseGuide() }}>
                <Text className="guide-close__icon">×</Text>
            </View>
        </View>
    )

    return (
        <View className="map-page">
            <View className="tab-switch">
                <View className="tab-switch__wrapper">
                    <View className="tab-switch__help" onClick={handleHelpClick}>
                        <Text className="tab-switch__help-icon">?</Text>
                    </View>
                    <View className={`tab-switch__slider ${activeTab === 'connect' ? 'tab-switch__slider--right' : ''}`} />
                    <View
                        className={`tab-switch__item ${activeTab === 'region' ? 'tab-switch__item--active' : ''} ${showGuide && currentStep === 1 ? 'guide-target' : ''}`}
                        onClick={() => {
                            if (activeTab !== 'region') {
                                setActiveTab('region')
                            }
                        }}
                    >
                        <Text className="tab-switch__text">区域点</Text>
                    </View>
                    <View
                        className={`tab-switch__item ${activeTab === 'connect' ? 'tab-switch__item--active' : ''} ${showGuide && currentStep === 1 ? 'guide-target' : ''}`}
                        onClick={() => {
                            if (activeTab !== 'connect') {
                                setActiveTab('connect')
                            }
                        }}
                    >
                        <Text className="tab-switch__text">连接点</Text>
                    </View>
                </View>
            </View>

            <View className="tab-content">
                {regionLoaded && (
                    <View style={{ display: activeTab === 'region' ? 'block' : 'none' }}>
                        <PointPanel
                            dataList={regionPoints}
                            title="标记清扫区域"
                            subtitle="遥控机器人移至区域边缘位置，点击记录点。"
                            actionText="记录点"
                            currentArea={currentArea}
                            areaCount={areaCount}
                            onAreaChange={handleAreaChange}
                            onFetch={fetchModelingPoints}
                            onSample={handleSampleRegion}
                            onDelete={handleDeleteRegion}
                            onClear={handleClearRegion}
                            onDirection={handleRegionDirection}
                        />
                    </View>
                )}
                {connectLoaded && (
                    <View style={{ display: activeTab === 'connect' ? 'block' : 'none' }}>
                        <PointPanel
                            dataList={linkingPoints}
                            title="标记连接路径"
                            subtitle="遥控机器人移至连接点位置，点击记录桥梁。"
                            actionText="记录桥梁"
                            actionColor="orange"
                            currentArea={1}
                            areaCount={0}
                            onAreaChange={() => { }}
                            onFetch={fetchLinkingPoints}
                            onSample={handleSampleConnect}
                            onDelete={handleDeleteConnect}
                            onClear={handleClearConnect}
                            onDirection={handleConnectDirection}
                        />
                    </View>
                )}
            </View>

            <View className="map-page__footer">
                <View className="map-page__footer-actions">
                    <View
                        className={`map-page__footer-btn map-page__footer-btn--undo ${activeTab !== 'region' ? 'map-page__footer-btn--disabled' : ''}`}
                        onClick={activeTab === 'region' ? handleNewArea : undefined}
                    >
                        <Text className="map-page__footer-btn-text">新增区域</Text>
                    </View>
                    <View className="map-page__footer-btn map-page__footer-btn--complete" onClick={handleComplete}>
                        <Text className="map-page__footer-btn-text">完成</Text>
                    </View>
                </View>
            </View>

            {showGuide && <GuideOverlay />}
        </View>
    )
}

export default MapPage
