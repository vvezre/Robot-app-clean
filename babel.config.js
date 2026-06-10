const path = require('path')

module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
      // 确保兼容低版本 WebView
      targets: {
        android: '4.4' // 兼容 Android 4.4+ (WebView 30+)
      }
    }]
  ],
  ignore: [
    function(filepath) {
      // 排除 app.config.js
      return /app\.config\.js$/.test(filepath)
    }
  ]
}

