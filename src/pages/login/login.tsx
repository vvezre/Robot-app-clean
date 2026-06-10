import { Component } from 'react'
import { View, Input, Button, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { authService } from '../../services/authService'
import { storage } from '../../utils/storage'
import './login.scss'

const TEST_MODE = false

interface LoginState {
  username: string
  password: string
  loading: boolean
  errorMessage: string
}

export default class Login extends Component<{}, LoginState> {
  state: LoginState = {
    username: '',
    password: '',
    loading: false,
    errorMessage: '',
  }

  componentDidMount() {
    const { username, password } = storage.getLastCredentials()
    if (username || password) {
      this.setState({ username, password })
    }
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

  handleLogin = async () => {
    const { username, password } = this.state

    if (!username || !password) {
      this.setState({ errorMessage: '请输入用户名和密码' })
      return
    }

    this.setState({ loading: true, errorMessage: '' })

    try {
      if (TEST_MODE) {
        if (username !== 'admin' || password !== 'admin123') {
          this.setState({
            errorMessage: '用户名或密码错误（测试模式：admin/admin123）',
            loading: false,
          })
          return
        }

        await new Promise(resolve => setTimeout(resolve, 500))

        const mockToken = 'mock-access-token-for-testing'
        const mockRefreshToken = 'mock-refresh-token-for-testing'
        const mockUserInfo = {
          userId: 1,
          username: 'admin',
          realName: '管理员',
          roleId: 1,
          roleName: '超级管理员',
        }

        storage.setToken(mockToken)
        storage.setRefreshToken(mockRefreshToken)
        storage.setUserInfo(mockUserInfo)
        storage.setLastCredentials(username, password)

        Taro.reLaunch({ url: '/pages/index/index' })
        return
      }

      await authService.login(username, password)
      storage.setLastCredentials(username, password)
      Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error: any) {
      this.setState({
        errorMessage: error.message || '登录失败，请检查用户名和密码',
        loading: false,
      })
    }
  }

  render() {
    const { username, password, loading, errorMessage } = this.state

    return (
      <View className='login-page'>
        <View className='login-container'>
          <View className='frame-glow' />

          <View className='login-header'>
            <Text className='brand-label'>CLOUD ROBOT CONSOLE</Text>
            <Text className='login-title'>中拓智能</Text>
            <Text className='login-subtitle'>设备云端管控平台</Text>
          </View>

          <View className='login-form'>
            <View className='form-item'>
              <Text className='field-label'>账号</Text>
              <Input
                className='form-input'
                placeholder='请输入用户名'
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
                placeholder='请输入密码'
                placeholderClass='input-placeholder'
                value={password}
                onInput={this.handlePasswordChange}
                disabled={loading}
              />
            </View>

            {errorMessage && (
              <View className='error-message'>
                <Text>{errorMessage}</Text>
              </View>
            )}

            <Button
              className='login-button'
              onClick={this.handleLogin}
              loading={loading}
              disabled={loading}
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </View>

          {TEST_MODE && (
            <View className='login-footer'>
              <Text className='footer-text'>测试模式（无需启动后端）</Text>
            </View>
          )}

          <View className='login-footer'>
            <Text className='footer-text' onClick={() => Taro.navigateTo({ url: '/pages/register/register' })}>
              没有账号？注册新账号
            </Text>
          </View>
        </View>
      </View>
    )
  }
}
