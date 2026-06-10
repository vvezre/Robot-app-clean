// React Native 环境下的 MQTT mock
// 因为原生 mqtt 库依赖 Node.js 核心模块，在 RN 中无法运行

export function connect(url, options) {
  console.warn('MQTT: 在 React Native 环境中 MQTT 不可用')
  return {
    connected: false,
    on: () => {},
    subscribe: () => {},
    publish: () => {},
    end: () => {},
    unsubscribe: () => {},
  }
}

export default { connect }
