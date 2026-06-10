if (process.env.TARO_ENV === 'weapp') {
  if (typeof global !== 'undefined' && !global.Buffer) {
    const { Buffer } = require('buffer')
    global.Buffer = Buffer
  }

  if (typeof global !== 'undefined' && !global.process) {
    global.process = require('process')
  }

  if (typeof global !== 'undefined' && !global.WebSocket) {
    const { WxWebSocket } = require('./utils/wxWebSocket')
    global.WebSocket = WxWebSocket
  }
}

if (process.env.TARO_ENV === 'rn') {
  require('react-native-url-polyfill/auto')
}

import { Component, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './app.scss'
import websocketService from './services/websocketService'

class App extends Component<PropsWithChildren> {
  private lastHideTime = 0

  componentDidMount() {
    console.log('[App] mounted', {
      nodeEnv: process.env.NODE_ENV,
      taroEnv: process.env.TARO_ENV,
    })

    if (process.env.TARO_ENV === 'h5' && typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        console.error('[App] global error:', event.error || event.message)
      })

      window.addEventListener('unhandledrejection', (event) => {
        console.error('[App] unhandled promise rejection:', event.reason)
      })
    }
  }

  componentDidShow() {
    const now = Date.now()
    const timeSinceHide = this.lastHideTime > 0 ? now - this.lastHideTime : 0

    console.log('[App] show', { timeSinceHide })

    if (this.lastHideTime > 0 && timeSinceHide > 5000 && !websocketService.isConnected()) {
      console.log('[App] websocket disconnected after background, triggering reconnect')
      websocketService.manualReconnect()
    }

    Taro.eventCenter.trigger('app:show', { timeSinceHide })
  }

  componentDidHide() {
    this.lastHideTime = Date.now()
    console.log('[App] hide')
    Taro.eventCenter.trigger('app:hide')
  }

  render() {
    try {
      return this.props.children
    } catch (error) {
      console.error('[App] render error:', error)
      return (
        <View style={{ padding: '32rpx', textAlign: 'center' }}>
          <Text style={{ color: '#fff', fontSize: '32rpx' }}>应用加载出错</Text>
        </View>
      )
    }
  }
}

export default App
