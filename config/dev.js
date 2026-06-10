module.exports = {
  env: {
    NODE_ENV: '"development"'
  },
  defineConstants: {
  },
  mini: {},
  h5: {
    // 开发环境也使用相对路径，避免 localhost 问题
    publicPath: './',
    router: {
      mode: 'hash'
    }
  }
}


