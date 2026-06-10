import { useEffect, useMemo, useRef } from 'react'
import { Canvas, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { TRailcarPathSegment } from '../../services/tRailcarService'
import './index.scss'

type CurrentPoint = {
  x: number
  y: number
  heading?: number
}

type Props = {
  segments: TRailcarPathSegment[]
  currentPoint?: CurrentPoint | null
  currentTaskIndex?: number | null
  height?: number
}

const CANVAS_WIDTH = 680

export default function PathCanvas({
  segments,
  currentPoint,
  currentTaskIndex,
  height = 420,
}: Props) {
  const canvasIdRef = useRef(`path-canvas-${Math.random().toString(36).slice(2, 8)}`)

  const viewport = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    segments.forEach((segment) => {
      xs.push(segment.startX || 0, segment.endX || 0)
      ys.push(segment.startY || 0, segment.endY || 0)
    })
    if (currentPoint) {
      xs.push(currentPoint.x)
      ys.push(currentPoint.y)
    }
    if (!xs.length || !ys.length) {
      return null
    }
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    }
  }, [segments, currentPoint])

  useEffect(() => {
    const ctx = Taro.createCanvasContext(canvasIdRef.current)
    const canvasHeight = height

    ctx.setFillStyle('#07111f')
    ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight)

    if (!viewport) {
      ctx.setFillStyle('#94a3b8')
      ctx.setFontSize(24)
      ctx.fillText('暂无路径数据', 24, 48)
      ctx.draw()
      return
    }

    const padding = 40
    const usableWidth = CANVAS_WIDTH - padding * 2
    const usableHeight = canvasHeight - padding * 2
    const scale = Math.min(usableWidth / viewport.width, usableHeight / viewport.height)

    const project = (x: number, y: number) => {
      const projectedX = padding + (x - viewport.minX) * scale
      const projectedY = canvasHeight - padding - (y - viewport.minY) * scale
      return { x: projectedX, y: projectedY }
    }

    const gridColor = 'rgba(148,163,184,0.12)'
    ctx.setStrokeStyle(gridColor)
    ctx.setLineWidth(1)
    for (let i = 1; i < 5; i++) {
      const x = padding + (usableWidth / 5) * i
      const y = padding + (usableHeight / 5) * i
      ctx.beginPath()
      ctx.moveTo(x, padding)
      ctx.lineTo(x, canvasHeight - padding)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(CANVAS_WIDTH - padding, y)
      ctx.stroke()
    }

    segments.forEach((segment, index) => {
      const start = project(segment.startX || 0, segment.startY || 0)
      const end = project(segment.endX || 0, segment.endY || 0)
      const isCurrent = currentTaskIndex === index
      const color = isCurrent ? '#f97316' : segment.mode === 1 ? '#22d3ee' : '#94a3b8'

      ctx.setStrokeStyle(color)
      ctx.setLineWidth(isCurrent ? 6 : 3)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    })

    if (currentPoint) {
      const point = project(currentPoint.x, currentPoint.y)
      ctx.setFillStyle('#ef4444')
      ctx.beginPath()
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2)
      ctx.fill()

      if (typeof currentPoint.heading === 'number') {
        const headingRad = (currentPoint.heading * Math.PI) / 180
        const arrowLen = 26
        const tipX = point.x + Math.sin(headingRad) * arrowLen
        const tipY = point.y - Math.cos(headingRad) * arrowLen
        ctx.setStrokeStyle('#f8fafc')
        ctx.setLineWidth(3)
        ctx.beginPath()
        ctx.moveTo(point.x, point.y)
        ctx.lineTo(tipX, tipY)
        ctx.stroke()
      }
    }

    ctx.draw()
  }, [segments, currentPoint, currentTaskIndex, height, viewport])

  return (
    <View className='path-canvas-card'>
      <Canvas
        className='path-canvas'
        canvasId={canvasIdRef.current}
        style={{ width: '100%', height: `${height}px` }}
      />
      <View className='path-legend'>
        <View className='legend-item'>
          <View className='legend-dot cleaning' />
          <Text className='legend-text'>清扫段</Text>
        </View>
        <View className='legend-item'>
          <View className='legend-dot turn' />
          <Text className='legend-text'>转场段</Text>
        </View>
        <View className='legend-item'>
          <View className='legend-dot current' />
          <Text className='legend-text'>当前任务段</Text>
        </View>
        <View className='legend-item'>
          <View className='legend-dot vehicle' />
          <Text className='legend-text'>车辆位置</Text>
        </View>
      </View>
    </View>
  )
}
