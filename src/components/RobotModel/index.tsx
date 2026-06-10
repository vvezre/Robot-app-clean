import { Image, View } from '@tarojs/components'
import './index.scss'
import robotImage from '../../assets/robots/t-crawler-cleaner.jpg'

type RobotModelSize = 'mini' | 'status'
type RobotModelFamily = 'T' | 'D' | 'unknown'

interface RobotModelProps {
  size?: RobotModelSize
  family?: RobotModelFamily
  className?: string
}

const solarCells = Array.from({ length: 36 })
const dBolts = Array.from({ length: 10 })

function DRobotModel() {
  return (
    <View className="d-robot-model" aria-label="D hanging solar panel cleaning robot">
      {/* Background Solar Panel Grid Bed */}
      <View className="d-solar-panel">
        {solarCells.slice(0, 24).map((_, index) => (
          <View key={`d-solar-cell-${index}`} className="d-solar-cell" />
        ))}
      </View>

      {/* Side Rail on the right edge of the panels */}
      <View className="d-side-rail">
        <View className="d-rail-metallic" />
      </View>

      {/* Long Horizontal Brush Roller extending across the panel from the right rail */}
      <View className="d-horizontal-brush">
        <View className="d-brush-arm-bar" />
        <View className="d-brush-roller">
          <View className="d-brush-bristles" />
        </View>
        <View className="d-brush-end-wheel" />
      </View>

      {/* Main Drive Body sliding on the right rail */}
      <View className="d-body-block">
        <View className="d-body-face" />
        <View className="d-body-lid" />
        <View className="d-body-led" />
      </View>
    </View>
  )
}function TRobotModel() {
  return (
    <View className="t-robot-model" aria-label="T crawler solar panel cleaning robot">
      {/* Background Solar Panel Grid Bed */}
      <View className="t-solar-panel">
        {solarCells.slice(0, 24).map((_, index) => (
          <View key={`t-solar-cell-${index}`} className="t-solar-cell" />
        ))}
      </View>

      {/* Ground Shadow */}
      <View className="t-robot-shadow" />

      {/* Rear Brush Roller (Furthest) */}
      <View className="t-brush t-brush--rear">
        <View className="t-brush-arm t-brush-arm--left" />
        <View className="t-brush-arm t-brush-arm--right" />
        <View className="t-brush-roller">
          <View className="t-brush-bristles" />
        </View>
      </View>

      {/* Left Track */}
      <View className="t-track t-track--left">
        <View className="t-track-belt">
          <View className="t-track-pattern" />
        </View>
        <View className="t-track-wheel t-track-wheel--1" />
        <View className="t-track-wheel t-track-wheel--2" />
        <View className="t-track-wheel t-track-wheel--3" />
        <View className="t-track-plate" />
      </View>

      {/* Central Cabinet / Chassis */}
      <View className="t-chassis">
        <View className="t-chassis-side" />
        <View className="t-chassis-top">
          <View className="t-chassis-lid">
            <View className="t-lid-accent" />
          </View>
          {/* Handles */}
          <View className="t-chassis-handle" />
          {/* Sensors */}
          <View className="t-chassis-sensor t-chassis-sensor--black-1" />
          <View className="t-chassis-sensor t-chassis-sensor--gold" />
          <View className="t-chassis-sensor t-chassis-sensor--black-2" />
        </View>
        <View className="t-chassis-status-led" />
      </View>

      {/* Right Track */}
      <View className="t-track t-track--right">
        <View className="t-track-belt">
          <View className="t-track-pattern" />
        </View>
        <View className="t-track-wheel t-track-wheel--1" />
        <View className="t-track-wheel t-track-wheel--2" />
        <View className="t-track-wheel t-track-wheel--3" />
        <View className="t-track-plate" />
      </View>

      {/* Front Brush Roller (Closest to viewer) */}
      <View className="t-brush t-brush--front">
        <View className="t-brush-arm t-brush-arm--left" />
        <View className="t-brush-arm t-brush-arm--right" />
        <View className="t-brush-roller">
          <View className="t-brush-bristles" />
        </View>
        <View className="t-brush-endcap" />
      </View>
    </View>
  )
}

export default function RobotModel({ size = 'mini', family = 'T', className = '' }: RobotModelProps) {
  const classes = [
    'robot-model',
    `robot-model--${size}`,
    `robot-model--${family}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <View className={classes}>
      {family === 'D' ? <DRobotModel /> : <TRobotModel />}
    </View>
  )
}

