const { mergeConfig } = require('metro-config')
const { getMetroConfig } = require('@tarojs/rn-supporter')
const path = require('path')

module.exports = (async function () {
  return mergeConfig({
    // custom your metro config here
    // https://facebook.github.io/metro/docs/configuration
    resolver: {
      // 为 Node.js 内置模块提供 polyfill 或 mock
      extraNodeModules: {
        // MQTT mock - 因为原生 mqtt 库不兼容 RN
        mqtt: path.resolve(__dirname, 'src/utils/mqtt.rn.js'),
        // Node.js polyfills
        url: require.resolve('react-native-url-polyfill'),
        buffer: require.resolve('buffer/'),
        stream: require.resolve('readable-stream'),
        events: require.resolve('events/'),
        process: require.resolve('process/browser'),
      },
    },
  }, await getMetroConfig())
})()