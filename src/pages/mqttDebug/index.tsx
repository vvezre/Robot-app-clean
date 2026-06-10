import { useState, useEffect, useRef } from 'react'
import { View, Button, Input, Text, ScrollView, Picker } from '@tarojs/components'
import mqttService from '../../services/mqttService'
import { MQTTConnectionState, MQTT_TOPICS } from '../../config/mqtt'
import { bufferToHex, encodeConfig, decodeStatus, DeviceConfig } from '../../utils/dataEncoder'
import './index.scss'

interface LogEntry {
  id: number
  time: string
  type: 'send' | 'receive' | 'info' | 'error'
  topic?: string
  message: string
  hex?: string
}

export default function MQTTDebug() {
  const [connectionState, setConnectionState] = useState<MQTTConnectionState>(MQTTConnectionState.DISCONNECTED)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [subscribeTopic, setSubscribeTopic] = useState('RAILCAR/S/-D01250001')
  const [publishTopic, setPublishTopic] = useState('RAILCAR/R/-D01250001')
  
  // 参数配置
  const [deviceID, setDeviceID] = useState('250001')
  const [companyCode, setCompanyCode] = useState('ZTZN-PVC')
  const [model, setModel] = useState('-D01')
  const [workWay, setWorkWay] = useState(1)
  const [controlMode, setControlMode] = useState(1)
  const [enableMode, setEnableMode] = useState(1)
  const [walkSpeed, setWalkSpeed] = useState(800) // 80.0%
  const [brushSpeed, setBrushSpeed] = useState(1000) // 100.0%
  const [bridgeSpeed, setBridgeSpeed] = useState(800) // 80.0%
  const [edgeDelay, setEdgeDelay] = useState(0)
  const [bridgeTime, setBridgeTime] = useState(0)
  const [errorReturnTime, setErrorReturnTime] = useState(0)
  const [heartbeatSet, setHeartbeatSet] = useState(100) // 1.00s
  
  // 时间组
  const [time1, setTime1] = useState({ yearWeek: '0725', monDay: '1108', hrMin: '1230' })
  const [time2] = useState({ yearWeek: '0000', monDay: '0000', hrMin: '0000' })
  const [time3] = useState({ yearWeek: '0000', monDay: '0000', hrMin: '0000' })
  const [time4] = useState({ yearWeek: '0000', monDay: '0000', hrMin: '0000' })
  
  const logIdRef = useRef(0)

  const addLog = (type: LogEntry['type'], message: string, topic?: string, hex?: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const log: LogEntry = {
      id: logIdRef.current++,
      time,
      type,
      topic,
      message,
      hex
    }
    setLogs(prev => [log, ...prev].slice(0, 200)) // 保留最近200条
  }

  useEffect(() => {
    // 初始化 MQTT 服务回调
    mqttService.init(
      () => {
        addLog('info', '✅ MQTT 连接成功')
        setConnectionState(MQTTConnectionState.CONNECTED)
      },
      (topic, msg) => {
        let displayMsg = ''
        let hexData = ''
        
        if (msg instanceof Uint8Array) {
          hexData = bufferToHex(msg)
          if (msg.length === 64) {
            try {
              const status = decodeStatus(msg)
              displayMsg = `[状态数据] 设备: ${status.deviceID}, 电量: ${status.batteryLevel.toFixed(1)}%, 行走: ${status.curWalkSpeed.toFixed(1)}%, 滚刷: ${status.curBrushSpeed.toFixed(1)}%, 跨桥: ${status.curBridgeSpeed.toFixed(1)}%`
            } catch (e) {
              displayMsg = `[二进制数据 ${msg.length}字节] ${hexData.substring(0, 100)}${hexData.length > 100 ? '...' : ''}`
            }
          } else {
            displayMsg = `[二进制数据 ${msg.length}字节] ${hexData.substring(0, 100)}${hexData.length > 100 ? '...' : ''}`
          }
        } else if (typeof msg === 'object') {
          displayMsg = JSON.stringify(msg, null, 2)
        } else {
          displayMsg = String(msg)
        }
        
        addLog('receive', displayMsg, topic, hexData)
      },
      (error) => {
        addLog('error', `MQTT 错误: ${error.message}`)
        setConnectionState(MQTTConnectionState.ERROR)
      }
    )

    // 定时检查连接状态
    const timer = setInterval(() => {
      setConnectionState(mqttService.getConnectionState())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleConnect = () => {
    addLog('info', '🔌 正在连接...')
    mqttService.init()
  }

  const handleDisconnect = () => {
    mqttService.disconnect()
    addLog('info', '🔌 已断开连接')
    setConnectionState(MQTTConnectionState.DISCONNECTED)
  }

  const handleSubscribe = async () => {
    if (!subscribeTopic) {
      addLog('error', '订阅主题不能为空')
      return
    }
    try {
      await mqttService.subscribe(subscribeTopic, 1)
      addLog('info', `📡 订阅成功: ${subscribeTopic}`, subscribeTopic)
    } catch (e) {
      addLog('error', `订阅失败: ${(e as Error).message}`)
    }
  }

  const handleUnsubscribe = async () => {
    if (!subscribeTopic) return
    try {
      await mqttService.unsubscribe(subscribeTopic)
      addLog('info', `📤 取消订阅成功: ${subscribeTopic}`, subscribeTopic)
    } catch (e) {
      addLog('error', `取消订阅失败: ${(e as Error).message}`)
    }
  }

  const handlePublishConfig = async () => {
    if (!publishTopic) {
      addLog('error', '发布主题不能为空')
      return
    }
    
    try {
      // 构建配置对象
      const config: DeviceConfig = {
        companyCode: companyCode.padEnd(8, '\0').substring(0, 8),
        model: model.padEnd(4, '\0').substring(0, 4),
        deviceID: deviceID.padEnd(6, '\0').substring(0, 6),
        workWay,
        time1,
        time2,
        time3,
        time4,
        controlMode,
        enableMode,
        edgeDelay,
        bridgeTime,
        errorReturnTime,
        walkSpeed,
        brushSpeed,
        bridgeSpeed,
        heartbeatSet,
        reserved: 0
      }

      // 编码为64字节二进制数据
      const buffer = encodeConfig(config)
      const hexData = bufferToHex(buffer)
      
      addLog('send', `📤 发送配置数据 - 设备: ${deviceID}, 控制模式: ${controlMode}, 行走速度: ${(walkSpeed/10).toFixed(1)}%, 滚刷速度: ${(brushSpeed/10).toFixed(1)}%, 跨桥速度: ${(bridgeSpeed/10).toFixed(1)}%`, publishTopic, hexData)
      
      await mqttService.publish(publishTopic, buffer, 1, false)
      addLog('info', `✅ 配置数据发送成功`, publishTopic)
    } catch (e) {
      addLog('error', `发送失败: ${(e as Error).message}`)
    }
  }

  const updateDeviceID = (id: string) => {
    setDeviceID(id)
    // 自动更新主题（使用小车型号+小车编号）
    setSubscribeTopic(MQTT_TOPICS.deviceStatus(model, id))
    setPublishTopic(MQTT_TOPICS.deviceSet(model, id))
  }

  // 当型号改变时，也更新主题
  useEffect(() => {
    if (deviceID) {
      setSubscribeTopic(MQTT_TOPICS.deviceStatus(model, deviceID))
      setPublishTopic(MQTT_TOPICS.deviceSet(model, deviceID))
    }
  }, [model, deviceID])

  const clearLogs = () => setLogs([])

  const getLogTypeClass = (type: LogEntry['type']) => {
    const map = {
      send: 'log-send',
      receive: 'log-receive',
      info: 'log-info',
      error: 'log-error'
    }
    return map[type] || ''
  }

  return (
    <View className="mqtt-debug">
      <View className="header">
        <Text className={`status ${connectionState}`}>
          状态: {connectionState === MQTTConnectionState.CONNECTED ? '已连接' : 
                 connectionState === MQTTConnectionState.CONNECTING ? '连接中' :
                 connectionState === MQTTConnectionState.ERROR ? '错误' : '未连接'}
        </Text>
        <View className="actions">
          <Button size="mini" onClick={handleConnect} disabled={connectionState === MQTTConnectionState.CONNECTED || connectionState === MQTTConnectionState.CONNECTING}>
            连接
          </Button>
          <Button size="mini" type="warn" onClick={handleDisconnect} disabled={connectionState !== MQTTConnectionState.CONNECTED}>
            断开
          </Button>
        </View>
      </View>

      <View className="mini-metrics">
        <View className="metric-card">
          <Text className="metric-label">设备</Text>
          <Text className="metric-value">{deviceID}</Text>
        </View>
        <View className="metric-card">
          <Text className="metric-label">日志条数</Text>
          <Text className="metric-value">{logs.length}</Text>
        </View>
        <View className="metric-card">
          <Text className="metric-label">模型</Text>
          <Text className="metric-value">{model}</Text>
        </View>
      </View>

      <ScrollView scrollY className="content">
        {/* 设备配置 */}
        <View className="section">
          <Text className="section-title">设备配置</Text>
          <View className="form-row">
            <View className="form-group">
              <Text className="form-label">设备编号</Text>
              <Input 
                className="input" 
                value={deviceID} 
                onInput={e => updateDeviceID(e.detail.value)} 
                placeholder="如: 250001"
                maxlength={6}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">公司代码</Text>
              <Input 
                className="input" 
                value={companyCode} 
                onInput={e => setCompanyCode(e.detail.value)} 
                placeholder="ZTZN-PVC"
                maxlength={8}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">产品型号（小车型号）</Text>
              <Input 
                className="input" 
                value={model} 
                onInput={e => {
                  const newModel = e.detail.value
                  setModel(newModel)
                  // 当型号改变时，更新主题
                  if (deviceID) {
                    setSubscribeTopic(MQTT_TOPICS.deviceStatus(newModel, deviceID))
                    setPublishTopic(MQTT_TOPICS.deviceSet(newModel, deviceID))
                  }
                }} 
                placeholder="-D01"
                maxlength={4}
              />
            </View>
          </View>
        </View>

        {/* 控制参数 */}
        <View className="section">
          <Text className="section-title">控制参数</Text>
          <View className="form-row">
            <View className="form-group">
              <Text className="form-label">工作方式</Text>
              <Picker
                mode="selector"
                range={['无效', '每日', '每月', '每年', '每周']}
                value={workWay}
                onChange={e => setWorkWay(Number(e.detail.value))}
              >
                <View className="picker-view">
                  {['无效', '每日', '每月', '每年', '每周'][workWay] || '无效'}
                </View>
              </Picker>
            </View>
            <View className="form-group">
              <Text className="form-label">控制模式</Text>
              <Picker
                mode="selector"
                range={['无效', 'AUTO', 'STOP', 'RESET', 'CONT', 'MAN']}
                value={controlMode}
                onChange={e => setControlMode(Number(e.detail.value))}
              >
                <View className="picker-view">
                  {['无效', 'AUTO', 'STOP', 'RESET', 'CONT', 'MAN'][controlMode] || '无效'}
                </View>
              </Picker>
            </View>
            <View className="form-group">
              <Text className="form-label">使能模式</Text>
              <Picker
                mode="selector"
                range={['无效', '检+左+单', '检+左+双', '检+右+单', '检+右+双']}
                value={enableMode}
                onChange={e => setEnableMode(Number(e.detail.value))}
              >
                <View className="picker-view">
                  {['无效', '检+左+单', '检+左+双', '检+右+单', '检+右+双'][enableMode] || '无效'}
                </View>
              </Picker>
            </View>
          </View>
        </View>

        {/* 速度参数 */}
        <View className="section">
          <Text className="section-title">速度参数 (0-1000, 表示 0-100.0%)</Text>
          <View className="form-row">
            <View className="form-group">
              <Text className="form-label">行走速度</Text>
              <Input 
                type="number"
                className="input" 
                value={String(walkSpeed)} 
                onInput={e => setWalkSpeed(Number(e.detail.value) || 0)} 
                placeholder="800"
              />
              <Text className="form-hint">当前: {(walkSpeed/10).toFixed(1)}%</Text>
            </View>
            <View className="form-group">
              <Text className="form-label">滚刷速度</Text>
              <Input 
                type="number"
                className="input" 
                value={String(brushSpeed)} 
                onInput={e => setBrushSpeed(Number(e.detail.value) || 0)} 
                placeholder="1000"
              />
              <Text className="form-hint">当前: {(brushSpeed/10).toFixed(1)}%</Text>
            </View>
            <View className="form-group">
              <Text className="form-label">跨桥速度</Text>
              <Input 
                type="number"
                className="input" 
                value={String(bridgeSpeed)} 
                onInput={e => setBridgeSpeed(Number(e.detail.value) || 0)} 
                placeholder="800"
              />
              <Text className="form-hint">当前: {(bridgeSpeed/10).toFixed(1)}%</Text>
            </View>
          </View>
        </View>

        {/* 检测参数 */}
        <View className="section">
          <Text className="section-title">检测参数</Text>
          <View className="form-row">
            <View className="form-group">
              <Text className="form-label">到边检测延时 (ms)</Text>
              <Input 
                type="number"
                className="input" 
                value={String(edgeDelay)} 
                onInput={e => setEdgeDelay(Number(e.detail.value) || 0)} 
                placeholder="0"
              />
            </View>
            <View className="form-group">
              <Text className="form-label">跨桥检测时间 (ms)</Text>
              <Input 
                type="number"
                className="input" 
                value={String(bridgeTime)} 
                onInput={e => setBridgeTime(Number(e.detail.value) || 0)} 
                placeholder="0"
              />
            </View>
            <View className="form-group">
              <Text className="form-label">纠错返回时间 (10ms)</Text>
              <Input 
                type="number"
                className="input" 
                value={String(errorReturnTime)} 
                onInput={e => setErrorReturnTime(Number(e.detail.value) || 0)} 
                placeholder="0"
              />
            </View>
            <View className="form-group">
              <Text className="form-label">心跳脉冲 (100ms)</Text>
              <Input 
                type="number"
                className="input" 
                value={String(heartbeatSet)} 
                onInput={e => setHeartbeatSet(Number(e.detail.value) || 0)} 
                placeholder="100"
              />
              <Text className="form-hint">当前: {(heartbeatSet/100).toFixed(2)}s</Text>
            </View>
          </View>
        </View>

        {/* 时间组1 */}
        <View className="section">
          <Text className="section-title">时间组1 (BCD格式: 0725 1108 1230)</Text>
          <View className="form-row">
            <View className="form-group">
              <Text className="form-label">周/年</Text>
              <Input 
                className="input" 
                value={time1.yearWeek} 
                onInput={e => setTime1({...time1, yearWeek: e.detail.value})} 
                placeholder="0725"
                maxlength={4}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">月/日</Text>
              <Input 
                className="input" 
                value={time1.monDay} 
                onInput={e => setTime1({...time1, monDay: e.detail.value})} 
                placeholder="1108"
                maxlength={4}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">时/分</Text>
              <Input 
                className="input" 
                value={time1.hrMin} 
                onInput={e => setTime1({...time1, hrMin: e.detail.value})} 
                placeholder="1230"
                maxlength={4}
              />
            </View>
          </View>
        </View>

        {/* 订阅测试 */}
        <View className="section">
          <Text className="section-title">订阅测试</Text>
          <Input 
            className="input" 
            value={subscribeTopic} 
            onInput={e => setSubscribeTopic(e.detail.value)} 
            placeholder="输入订阅主题"
          />
          <View className="row">
            <Button size="mini" onClick={handleSubscribe}>订阅</Button>
            <Button size="mini" onClick={handleUnsubscribe}>取消订阅</Button>
          </View>
        </View>

        {/* 参数下发 */}
        <View className="section">
          <Text className="section-title">参数下发</Text>
          <Input 
            className="input" 
            value={publishTopic} 
            onInput={e => setPublishTopic(e.detail.value)} 
            placeholder="发布主题"
          />
          <Button type="primary" onClick={handlePublishConfig} className="send-btn">
            发送配置参数 (64字节)
          </Button>
        </View>

        {/* 日志 */}
        <View className="section logs-section">
          <View className="row">
            <Text className="section-title">日志 ({logs.length})</Text>
            <Button size="mini" onClick={clearLogs}>清空</Button>
          </View>
          <ScrollView scrollY className="logs-box">
            {logs.length === 0 ? (
              <Text className="log-empty">暂无日志</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} className={`log-item ${getLogTypeClass(log.type)}`}>
                  <Text className="log-time">{log.time}</Text>
                  {log.topic && <Text className="log-topic">[{log.topic}]</Text>}
                  <Text className="log-message">{log.message}</Text>
                  {log.hex && (
                    <View className="log-hex">
                      <Text className="log-hex-label">Hex:</Text>
                      <Text className="log-hex-content">{log.hex}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  )
}
