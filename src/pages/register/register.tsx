import { Component } from 'react'
import { View, Input, Button, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { authService } from '../../services/authService'
import { storage } from '../../utils/storage'
import './register.scss'

interface RegisterState {
  username: string
  password: string
  confirmPassword: string
  loading: boolean
  errorMessage: string
}

export default class Register extends Component<{}, RegisterState> {
  state: RegisterState = {
    username: '',
    password: '',
    confirmPassword: '',
    loading: false,
    errorMessage: '',
  }

  componentDidShow() {
    if (authService.isAuthenticated()) {
      Taro.reLaunch({ url: '/pages/index/index' })
    }
  }

  handleUsernameChange = (e: any) => {
    this.setState({ username: e.detail.value, errorMessage: '' })
  }

  handlePasswordChange = (e: any) => {
    this.setState({ password: e.detail.value, errorMessage: '' })
  }

  handleConfirmPasswordChange = (e: any) => {
    this.setState({ confirmPassword: e.detail.value, errorMessage: '' })
  }

  handleRegister = async () => {
    const { username, password, confirmPassword } = this.state

    if (!username || !password) {
      this.setState({ errorMessage: '请输入用户名和密码' })
      return
    }

    if (username.length < 2 || username.length > 20) {
      this.setState({ errorMessage: '用户名长度需在 2 到 20 个字符之间' })
      return
    }

    if (password.length < 4 || password.length > 32) {
      this.setState({ errorMessage: '密码长度需在 4 到 32 个字符之间' })
      return
    }

    if (password !== confirmPassword) {
      this.setState({ errorMessage: '两次输入的密码不一致' })
      return
    }

    this.setState({ loading: true, errorMessage: '' })

    try {
      await authService.register(username, password)
      storage.setLastCredentials(username, password)
      Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error: any) {
      this.setState({
        errorMessage: error.message || '注册失败，请稍后重试',
        loading: false,
      })
    }
  }

  goToLogin = () => {
    Taro.navigateTo({ url: '/pages/login/login' })
  }

  render() {
    const { username, password, confirmPassword, loading, errorMessage } = this.state

    return (
      <View className='register-page'>
        <View className='register-container'>
          <View className='frame-glow' />

          <View className='register-header'>
            <Text className='mode-badge'>NEW ACCOUNT</Text>
            <Text className='register-title'>注册账号</Text>
            <Text className='register-subtitle'>创建您的设备控制账户</Text>
          </View>

          <View className='register-form'>
            <View className='form-item'>
              <Text className='field-label'>用户名</Text>
              <Input
                className='form-input'
                placeholder='请输入用户名（2-20 个字符）'
                placeholderClass='input-placeholder'
                value={username}
                onInput={this.handleUsernameChange}
                disabled={loading}
              />
            </View>

            <View className='form-item'>
              <Text className='field-label'>密码</Text>
              <Input
                className='form-input'
                password
                placeholder='请输入密码（4-32 个字符）'
                placeholderClass='input-placeholder'
                value={password}
                onInput={this.handlePasswordChange}
                disabled={loading}
              />
            </View>

            <View className='form-item'>
              <Text className='field-label'>确认密码</Text>
              <Input
                className='form-input'
                password
                placeholder='请再次输入密码'
                placeholderClass='input-placeholder'
                value={confirmPassword}
                onInput={this.handleConfirmPasswordChange}
                disabled={loading}
              />
            </View>

            {errorMessage && (
              <View className='error-message'>
                <Text>{errorMessage}</Text>
              </View>
            )}

            <Button
              className='register-button'
              onClick={this.handleRegister}
              loading={loading}
              disabled={loading}
            >
              {loading ? '注册中...' : '注册'}
            </Button>
          </View>

          <View className='register-footer'>
            <Text className='footer-text' onClick={this.goToLogin}>
              已有账号？去登录
            </Text>
          </View>
        </View>
      </View>
    )
  }
}
