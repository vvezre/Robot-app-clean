import React, { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import VehicleService from '../../services/vehicleService'
import tRailcarService from '../../services/tRailcarService'
const RouteNamePage = () => {
  const [routeName, setRouteName] = useState('')
  const productId = VehicleService.getCurrentProductId()
  // const productId = "999999"
  const handleNameChange = (e: any) => {
    setRouteName(e.detail.value)
  }

  const handleConfirm = async () => {
    if (!routeName.trim()) {
      Taro.showToast({
        title: '请输入路线名称',
        icon: 'none',
      })
      return
    }
    console.log('保存路线:', routeName)
    Taro.showLoading({ title: '保存中...' })
    try {
      console.log('保存路径id:', productId)

      // 1. 发送保存命令
      const response: any = await Promise.race([
        tRailcarService.movement.save_modeling_task(productId, routeName),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('请求超时，请检查网络连接')), 12000)
        )
      ])
      console.log('保存命令响应:', response)

      if (!response || typeof response !== 'object') {
        throw new Error('响应数据异常')
      }

      if (response.success === false) {
        throw new Error(response.message || '保存失败')
      }

      const commandId = response.commandId
      if (!commandId) {
        throw new Error('命令发送成功但未获取到命令ID')
      }

      // 2. 轮询命令状态
      console.log('开始轮询命令状态, commandId:', commandId)
      const status: any = await tRailcarService.pollCommandStatus(commandId, 15, 1000)
      console.log('命令状态:', status)

      Taro.hideLoading()

      // 3. 判断保存结果
      if (status && (status.status === 'SUCCEEDED' || status.terminal === true)) {
        // 保存成功
        const savedData = status.detail?.result?.data
        console.log('保存成功，返回数据:', savedData)

        Taro.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 1500,
        })

        setTimeout(() => {
          Taro.navigateTo({
            url: '/pages/home/home',
          })
        }, 1500)
      } else if (status && status.status === 'FAILED') {
        throw new Error(status.message || '保存失败')
      } else {
        throw new Error('保存超时，请重试')
      }
    } catch (error: any) {
      Taro.hideLoading()
      console.error('保存路线失败:', error)

      Taro.showToast({
        title: error?.message || '保存失败，请重试',
        icon: 'none',
        duration: 2000,
      })
    }
  }

  return (
    <View className="route-name-page">
      <View className="route-name-page__header">
        <Text className="route-name-page__title">命名路线</Text>
        <Text className="route-name-page__subtitle">为这条清扫路线取一个便于识别的名称</Text>
      </View>

      <View className="route-name-page__form">
        <View className="route-name-page__input-wrapper">
          <Text className="route-name-page__label">路线名称</Text>
          <Input
            className="route-name-page__input"
            value={routeName}
            onInput={handleNameChange}
            placeholder="请输入路线名称"
            maxlength={20}
          />
          <Text className="route-name-page__count">{routeName.length}/20</Text>
        </View>

        <View className="route-name-page__tips">
          <Text className="route-name-page__tips-title">命名建议：</Text>
          <Text className="route-name-page__tips-item">• 使用清晰易识别的名称</Text>
          <Text className="route-name-page__tips-item">• 可以包含区域、时间等信息</Text>
          <Text className="route-name-page__tips-item">• 例如："A区日常清扫"</Text>
        </View>
      </View>

      <View className="route-name-page__footer">
        <View
          className={`route-name-page__btn route-name-page__btn--confirm ${!routeName.trim() ? 'route-name-page__btn--disabled' : ''}`}
          onClick={routeName.trim() ? handleConfirm : undefined}
        >
          <Text className="route-name-page__btn-text">确认</Text>
        </View>
      </View>
    </View>
  )
}

export default RouteNamePage
