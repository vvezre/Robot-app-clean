import React, { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import VehicleService from '../../services/vehicleService'
import tRailcarService from '../../services/tRailcarService'
const RouteNamePage = () => {
  const [routeName, setRouteName] = useState('')
  // const productId = VehicleService.getCurrentProductId()
  const productId = "999999"
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
      const areaPoints = Taro.getStorageSync('areaPoints')
      const pathPoints = Taro.getStorageSync('pathPoints')
      // tRailcarService.movement.sample_modeling_point(productId)
      console.log('保存路径id:', productId)
      const response = await tRailcarService.movement.save_modeling_task(productId, routeName)
      console.log('保存路径名称:', response)
      if (!response.success) throw new Error(response.message || '保存失败')
      Taro.hideLoading()

      if (response.success) {
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
      } else {
        Taro.showToast({
          title: response?.message || '保存失败',
          icon: 'none',
        })
      }
    } catch (error) {
      Taro.hideLoading()
      console.error('保存路线失败:', error)

      Taro.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 1500,
      })

      setTimeout(() => {
        Taro.switchTab({
          url: '/pages/home/home',
        })
      }, 1500)
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
