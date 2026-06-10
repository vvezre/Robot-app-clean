const config = {
  projectName: 'robot-control-app',
  date: '2024-01-01',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [
    '@tarojs/plugin-framework-react',
    // '@tarojs/plugin-platform-rn'  // 只在 RN 构建时使用，小程序构建不需要
    // 注意：Taro 会根据构建类型自动加载相应的平台插件
    // 小程序构建会自动使用 @tarojs/plugin-platform-weapp
    // RN 构建会自动使用 @tarojs/plugin-platform-rn（如果已安装）
  ],
  defineConstants: {
  },
  copy: {
    patterns: [
    ],
    options: {
    }
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      // 关闭开发态远程依赖库（taro_app_library@/remoteEntry.js），
      // 避免微信开发者工具出现模块加载失败。
      enable: false
    }
  },
  cache: {
    enable: false
  },
  mini: {
    webpackChain(chain) {
      // 排除 app.config.js 不被 babel-loader 处理
      chain.module
        .rule('script')
        .exclude
        .add((filepath) => {
          // 排除 app.config.js 和根目录的 index.js（RN 专用）
          return /app\.config\.js$/.test(filepath) || /^.*[\/\\]index\.js$/.test(filepath)
        })
      
      // 注意：小程序环境中 mqtt 库可能不兼容
      // 已在代码中通过条件判断禁用 MQTT 初始化
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {
          selectorBlackList: ['.van-']
        }
      },
      url: {
        enable: true,
        config: {
          limit: 1024
        }
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]'
        }
      }
    }
  },
  h5: {
    publicPath: './', // 相对路径，适配 WebView file:// 协议
    staticDirectory: 'static',
    router: {
      mode: 'hash', // 必须使用 hash 模式，browser 模式在本地文件系统中无法正常跳转
      customRoutes: {}
    },
    // 确保输出结构简单，chunk 文件名正确
    output: {
      filename: 'js/[name].js',
      chunkFilename: 'chunk/[name].js'
    },
    // 通过 webpackChain 显式设置 publicPath
    webpackChain(chain) {
      // 强制设置 publicPath 为相对路径
      chain.output.publicPath('./')
    },
    postcss: {
      autoprefixer: {
        enable: true,
        config: {
        }
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]'
        }
      }
    }
  },
  rn: {
    appName: 'robotControlApp',
    output: {
      ios: './ios',
      android: './android'
    },
    postcss: {
      cssModules: {
        enable: false
      }
    },
    sass: {
      options: {
        includePaths: ['src']
      }
    }
  }
}

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
