import { View } from '@tarojs/components'
import './index.scss'

interface IconProps {
  className?: string
}

interface BatteryProps extends IconProps {
  level: number
}

export const Battery = ({ level, className = '' }: BatteryProps) => {
  const width = Math.max(0, (level / 100) * 14)
  const fillColor = level > 20 ? '#6b7' : '#b66'
  
  return (
    <View className={`icon icon-battery ${className}`}>
      <View className="battery-body">
        <View 
          className="battery-fill" 
          style={{ width: `${width}px`, backgroundColor: fillColor }}
        />
      </View>
      <View className="battery-tip" />
    </View>
  )
}

export const Back = ({ className = '' }: IconProps) => (
  <View className={`icon icon-back ${className}`}>
    <View className="arrow-left" />
  </View>
)

export const Home = ({ className = '' }: IconProps) => (
  <View className={`icon icon-home ${className}`}>
    <View className="home-roof" />
    <View className="home-body" />
  </View>
)

export const Settings = ({ className = '' }: IconProps) => (
  <View className={`icon icon-settings ${className}`}>
    <View className="settings-gear" />
  </View>
)

export const Send = ({ className = '' }: IconProps) => (
  <View className={`icon icon-send ${className}`}>
    <View className="send-arrow" />
  </View>
)

export const Refresh = ({ className = '' }: IconProps) => (
  <View className={`icon icon-refresh ${className}`}>
    <View className="refresh-circle" />
  </View>
)

export const ChevronRight = ({ className = '' }: IconProps) => (
  <View className={`icon icon-chevron-right ${className}`}>
    <View className="chevron" />
  </View>
)

interface SignalProps extends IconProps {
  on: boolean
}

export const Signal = ({ on, className = '' }: SignalProps) => (
  <View className={`icon icon-signal ${className}`} style={{ color: on ? '#6b7' : '#666' }}>
    <View className="signal-wave signal-wave-1" />
    <View className="signal-wave signal-wave-2" />
    <View className="signal-dot" style={{ backgroundColor: on ? '#6b7' : '#666' }} />
  </View>
)

export const BarChart = ({ className = '' }: IconProps) => (
  <View className={`icon icon-bar-chart ${className}`}>
    <View className="bar bar-1" />
    <View className="bar bar-2" />
    <View className="bar bar-3" />
  </View>
)

export const Bell = ({ className = '' }: IconProps) => (
  <View className={`icon icon-bell ${className}`}>
    <View className="bell-handle" />
    <View className="bell-body" />
    <View className="bell-clapper" />
  </View>
)

export const Robot = ({ className = '' }: IconProps) => (
  <View className={`icon icon-robot ${className}`}>
    <View className="robot-antenna" />
    <View className="robot-head">
      <View className="robot-eye" />
      <View className="robot-eye" />
    </View>
    <View className="robot-mouth" />
  </View>
)


