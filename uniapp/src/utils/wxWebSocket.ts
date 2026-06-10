import Taro from '@tarojs/taro'

/**
 * 微信小程序 WebSocket 适配器
 * 将 wx.connectSocket API 包装成标准 WebSocket 接口
 */
export class WxWebSocket {
  public url: string
  public readyState: number = 0 // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
  public protocol: string = ''
  public binaryType: string = 'arraybuffer'

  public onopen: ((event: any) => void) | null = null
  public onclose: ((event: any) => void) | null = null
  public onmessage: ((event: any) => void) | null = null
  public onerror: ((event: any) => void) | null = null

  private socketTask: Taro.SocketTask | null = null

  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocol = Array.isArray(protocols) ? protocols[0] || '' : protocols || ''

    // 使用 Taro API 连接
    this.socketTask = Taro.connectSocket({
      url: url,
      protocols: protocols ? (Array.isArray(protocols) ? protocols : [protocols]) : ['mqtt'],
      success: () => {
        console.log('[WxWebSocket] 连接请求已发送')
      },
      fail: (error) => {
        console.error('[WxWebSocket] 连接请求失败:', error)
        this.readyState = WxWebSocket.CLOSED
        if (this.onerror) {
          this.onerror({ type: 'error', message: error.errMsg })
        }
      }
    })

    if (this.socketTask) {
      this.socketTask.onOpen(() => {
        console.log('[WxWebSocket] 连接已打开')
        this.readyState = WxWebSocket.OPEN
        if (this.onopen) {
          this.onopen({ type: 'open' })
        }
      })

      this.socketTask.onMessage((res) => {
        if (this.onmessage) {
          this.onmessage({ type: 'message', data: res.data })
        }
      })

      this.socketTask.onError((error) => {
        console.error('[WxWebSocket] 错误:', error)
        if (this.onerror) {
          this.onerror({ type: 'error', message: error.errMsg })
        }
      })

      this.socketTask.onClose((res) => {
        console.log('[WxWebSocket] 连接已关闭:', res)
        this.readyState = WxWebSocket.CLOSED
        if (this.onclose) {
          this.onclose({ type: 'close', code: res.code, reason: res.reason })
        }
      })
    }
  }

  send(data: string | ArrayBuffer) {
    if (this.readyState !== WxWebSocket.OPEN) {
      console.warn('[WxWebSocket] 连接未打开，无法发送数据')
      return
    }

    if (this.socketTask) {
      this.socketTask.send({
        data: data,
        fail: (error) => {
          console.error('[WxWebSocket] 发送失败:', error)
          if (this.onerror) {
            this.onerror({ type: 'error', message: error.errMsg })
          }
        }
      })
    }
  }

  close(code?: number, reason?: string) {
    if (this.readyState === WxWebSocket.CLOSED || this.readyState === WxWebSocket.CLOSING) {
      return
    }

    this.readyState = WxWebSocket.CLOSING

    if (this.socketTask) {
      this.socketTask.close({
        code: code || 1000,
        reason: reason || '',
        success: () => {
          console.log('[WxWebSocket] 关闭成功')
        },
        fail: (error) => {
          console.error('[WxWebSocket] 关闭失败:', error)
        }
      })
    }
  }

  // 事件监听器接口（兼容标准 WebSocket）
  addEventListener(type: string, listener: (event: any) => void) {
    switch (type) {
      case 'open':
        this.onopen = listener
        break
      case 'close':
        this.onclose = listener
        break
      case 'message':
        this.onmessage = listener
        break
      case 'error':
        this.onerror = listener
        break
    }
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    switch (type) {
      case 'open':
        if (this.onopen === listener) this.onopen = null
        break
      case 'close':
        if (this.onclose === listener) this.onclose = null
        break
      case 'message':
        if (this.onmessage === listener) this.onmessage = null
        break
      case 'error':
        if (this.onerror === listener) this.onerror = null
        break
    }
  }
}

export default WxWebSocket
