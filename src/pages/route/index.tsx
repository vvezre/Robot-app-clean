import React, { useState, useEffect, useRef } from 'react'
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
}

const CANVAS_DISPLAY_HEIGHT = 500

const RoutePage = () => {
  const canvasIdRef = useRef('route-preview-canvas')

  const [areaPoints, setAreaPoints] = useState<PointData[]>([])
  const [pathPoints, setPathPoints] = useState<PointData[]>([])

  useEffect(() => {
    const storedArea = Taro.getStorageSync('areaPoints')
    const storedPath = Taro.getStorageSync('pathPoints')

    let hasData = false

    if (storedArea) {
      try {
        const parsed = JSON.parse(storedArea)
        if (parsed.length > 0) {
          setAreaPoints(parsed)
          hasData = true
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
          hasData = true
        }
      } catch (e) {
        console.error('解析pathPoints失败:', e)
      }
    }


  }, [])

  useEffect(() => {
    if (areaPoints.length === 0 && pathPoints.length === 0) return

    const allPoints = [...areaPoints, ...pathPoints]
    const xs = allPoints.map(p => p.x)
    const ys = allPoints.map(p => p.y)
    const maxX = Math.max(...xs, 100)
    const maxY = Math.max(...ys, 100)

    const PADDING = 40
    const CANVAS_WIDTH = 680
    const scaleX = (CANVAS_WIDTH - PADDING * 2) / maxX
    const scaleY = 380 / maxY
    const scale = Math.min(scaleX, scaleY)

    const project = (x: number, y: number) => ({
      x: PADDING + x * scale,
      y: PADDING + y * scale,
    })

    const ctx = Taro.createCanvasContext(canvasIdRef.current)

    const CANVAS_HEIGHT = PADDING * 2 + maxY * scale

    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.setStrokeStyle('#f0f0f0')
    ctx.setLineWidth(1)
    const gridSize = 50 * scale
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

    if (areaPoints.length > 0) {
      const sortedArea = [...areaPoints].sort((a, b) => a.sequence - b.sequence)

      ctx.setStrokeStyle('#cccccc')
      ctx.setLineWidth(2)
      // ctx.setLineDash([5, 5])
      ctx.beginPath()
      const firstArea = project(sortedArea[0].x, sortedArea[0].y)
      ctx.moveTo(firstArea.x, firstArea.y)
      for (let i = 1; i < sortedArea.length; i++) {
        const p = project(sortedArea[i].x, sortedArea[i].y)
        ctx.lineTo(p.x, p.y)
      }
      if (sortedArea.length > 2) {
        ctx.closePath()
      }
      ctx.stroke()
      // ctx.setLineDash([])

      if (sortedArea.length > 2) {
        ctx.setFillStyle('rgba(79, 161, 228, 0.24)')
        ctx.fill()
      }

      sortedArea.forEach((point) => {
        const p = project(point.x, point.y)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
        ctx.setFillStyle('#999999')
        ctx.fill()
        ctx.setStrokeStyle('#ffffff')
        ctx.setLineWidth(2)
        ctx.stroke()
      })
    }

    if (pathPoints.length > 0) {
      const sortedPath = [...pathPoints].sort((a, b) => a.sequence - b.sequence)

      ctx.setStrokeStyle('#4a6cf7')
      ctx.setLineWidth(4)
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

      sortedPath.forEach((point, index) => {
        const p = project(point.x, point.y)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
        ctx.setFillStyle('#4a6cf7')
        ctx.fill()
        ctx.setStrokeStyle('#ffffff')
        ctx.setLineWidth(3)
        ctx.stroke()

        ctx.setFillStyle('#ffffff')
        ctx.setFontSize(10)
        ctx.setTextAlign('center')
        ctx.setTextBaseline('middle')
        ctx.fillText(`${index + 1}`, p.x, p.y)
      })
    }

    ctx.draw()
  }, [areaPoints, pathPoints])

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
          canvasId={canvasIdRef.current}
          className="route-page__canvas"
          style={{ width: '100%', height: `${CANVAS_DISPLAY_HEIGHT}px` }}
        />
      </View>

      <View className="route-page__legend">
        <View className="route-page__legend-item">
          <View className="route-page__legend-dot route-page__legend-dot--area" />
          <Text className="route-page__legend-text">区域边界 ({areaPoints.length}点)</Text>
        </View>
        <View className="route-page__legend-item">
          <View className="route-page__legend-line" />
          <Text className="route-page__legend-text">清扫路径 ({pathPoints.length}点)</Text>
        </View>
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
