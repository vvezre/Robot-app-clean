import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

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

const getCanvasPixelSize = () => {
  try {
    const winInfo = Taro.getWindowInfo()
    const windowWidth = winInfo.windowWidth || 375
    const windowHeight = winInfo.windowHeight || 667

    const rpxToPx = windowWidth / 750
    const widthPx = Math.round(680 * rpxToPx)
    const halfHeightPx = Math.round(windowHeight * 0.5)
    const heightPx = Math.max(halfHeightPx - 80, 240)
    return { width: widthPx, height: heightPx }
  } catch {
    try {
      const sysInfo = Taro.getSystemInfoSync()
      const rpxToPx = (sysInfo.windowWidth || 375) / 750
      const widthPx = Math.round(680 * rpxToPx)
      const halfHeightPx = Math.round((sysInfo.windowHeight || 667) * 0.5)
      const heightPx = Math.max(halfHeightPx - 80, 240)
      return { width: widthPx, height: heightPx }
    } catch {
      return { width: 340, height: 300 }
    }
  }
}

const RoutePage = () => {
  const canvasIdRef = useRef('route-preview-canvas')
  const [canvasSize] = useState(() => getCanvasPixelSize())

  const [areaPoints, setAreaPoints] = useState<PointData[]>([])
  const [pathPoints, setPathPoints] = useState<PointData[]>([])
  const [linkPoints, setLinkPoints] = useState<PointData[]>([])
  const [showCleaningPath, setShowCleaningPath] = useState(true)

  useEffect(() => {
    const storedArea = Taro.getStorageSync('areaPoints')
    const storedPath = Taro.getStorageSync('pathPoints')
    const storedLink = Taro.getStorageSync('linkPoints')

    if (storedArea) {
      try {
        const parsed = JSON.parse(storedArea)
        if (parsed.length > 0) {
          setAreaPoints(parsed)
        }
      } catch (e) {
        console.error('解析areaPoints失败:', e)
      }
    }
    if (storedPath) {
      try {
        const parsed = JSON.parse(storedPath)
        if (parsed.length > 0) {
          setPathPoints(parsed)
        }
      } catch (e) {
        console.error('解析pathPoints失败:', e)
      }
    }
    if (storedLink) {
      try {
        const parsed = JSON.parse(storedLink)
        if (parsed.length > 0) {
          setLinkPoints(parsed)
        }
      } catch (e) {
        console.error('解析linkPoints失败:', e)
      }
    }
  }, [])

  const drawRouteOnCanvas = useCallback(() => {
    const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = canvasSize
    const PADDING = 20

    const ctx = Taro.createCanvasContext(canvasIdRef.current)

    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // 收集所有用于计算边界的点
    const allPoints = [...areaPoints, ...linkPoints, ...pathPoints]

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

    // 居中偏移量
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

    // 区域颜色配置（循环使用）
    const areaColors = [
      { stroke: '#4a90e2', fill: 'rgba(74, 144, 226, 0.15)', dot: '#4a90e2' },
      { stroke: '#e24a4a', fill: 'rgba(226, 74, 74, 0.15)', dot: '#e24a4a' },
      { stroke: '#4ae290', fill: 'rgba(74, 226, 144, 0.15)', dot: '#4ae290' },
      { stroke: '#e2a04a', fill: 'rgba(226, 160, 74, 0.15)', dot: '#e2a04a' },
      { stroke: '#904ae2', fill: 'rgba(144, 74, 226, 0.15)', dot: '#904ae2' },
      { stroke: '#4ae2d0', fill: 'rgba(74, 226, 208, 0.15)', dot: '#4ae2d0' },
    ]

    // 绘制区域点（按 areaNumber 分区）
    if (areaPoints.length > 0) {
      const areaGroups: Record<number, PointData[]> = {}
      areaPoints.forEach(p => {
        const areaNum = p.areaNumber ?? 1
        if (!areaGroups[areaNum]) areaGroups[areaNum] = []
        areaGroups[areaNum].push(p)
      })

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

          // 绘制区域编号（在区域中心）
          if (points.length > 0) {
            const projectedPoints = points.map(p => project(p.x, p.y))
            const minPX = Math.min(...projectedPoints.map(p => p.x))
            const minPY = Math.min(...projectedPoints.map(p => p.y))
            const maxPX = Math.max(...projectedPoints.map(p => p.x))
            const maxPY = Math.max(...projectedPoints.map(p => p.y))

            const labelFontSize = Math.max(10, Math.round(CANVAS_WIDTH / 40))
            ctx.setFontSize(labelFontSize)
            ctx.setFillStyle(colors.stroke)
            ctx.setTextAlign('center')
            ctx.setTextBaseline('top')
            const centerX = (minPX + maxPX) / 2
            const centerY = (minPY + maxPY) / 2
            ctx.fillText(`区域${areaNum}`, centerX, centerY)
          }
        }
      })
    }

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
      sortedLinks.forEach(point => {
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
    if (showCleaningPath && pathPoints.length > 0) {
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

    ctx.draw()
  }, [areaPoints, pathPoints, linkPoints, canvasSize, showCleaningPath])

  useEffect(() => {
    drawRouteOnCanvas()
  }, [drawRouteOnCanvas])

  const handleBack = () => {
    Taro.navigateBack()
  }

  const handleConfirm = () => {
    Taro.navigateTo({
      url: '/pages/route-name/index',
    })
  }

  return (
    <View className="route-page">
      <View className="route-page__header">
        <Text className="route-page__title">规划路径预览</Text>
      </View>

      <View className="route-page__canvas-container">
        <Canvas
          id={canvasIdRef.current}
          canvas-id={canvasIdRef.current}
          width={String(canvasSize.width)}
          height={String(canvasSize.height)}
          className="route-page__canvas"
          style={{ width: '100%', height: `${canvasSize.height}px` }}
        />
      </View>

      <View className="route-page__legend">
        {(() => {
          const areaColors = ['#4a90e2', '#e24a4a', '#4ae290', '#e2a04a', '#904ae2', '#4ae2d0']
          const groups: Record<number, number> = {}
          areaPoints.forEach(p => {
            const n = p.areaNumber ?? 1
            groups[n] = (groups[n] || 0) + 1
          })
          return Object.keys(groups)
            .sort((a, b) => Number(a) - Number(b))
            .map((k, i) => (
              <View key={k} className="route-page__legend-item">
                <View
                  className="route-page__legend-dot"
                  style={{ backgroundColor: areaColors[i % areaColors.length] }}
                />
                <Text className="route-page__legend-text">
                  区域{k} ({groups[Number(k)]}点)
                </Text>
              </View>
            ))
        })()}
        {linkPoints.length > 0 && (
          <View className="route-page__legend-item">
            <View
              className="route-page__legend-dot"
              style={{ backgroundColor: '#ff9500' }}
            />
            <Text className="route-page__legend-text">桥梁 ({Math.floor(linkPoints.length / 2)}座, {linkPoints.length}点)</Text>
          </View>
        )}
        {pathPoints.length > 0 && (
          <View className="route-page__legend-item route-page__legend-item--check" onClick={() => setShowCleaningPath(!showCleaningPath)}>
            <View className="route-page__legend-checkbox">
              {showCleaningPath && <Text className="route-page__legend-checkmark">✓</Text>}
            </View>
            <View className="route-page__legend-line" />
            <Text className="route-page__legend-text">清扫路径 ({pathPoints.length}点)</Text>
          </View>
        )}
      </View>

      <View className="route-page__footer">
        <View className="route-page__btn route-page__btn--secondary" onClick={handleBack}>
          <Text className="route-page__btn-text">上一步</Text>
        </View>
        <View className="route-page__btn route-page__btn--primary" onClick={handleConfirm}>
          <Text className="route-page__btn-text">确认</Text>
        </View>
      </View>
    </View>
  )
}

export default RoutePage
