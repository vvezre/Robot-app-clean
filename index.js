// 此文件仅用于 React Native 构建
// 微信小程序构建不需要此文件，Taro 会自动从 src/app.tsx 生成小程序入口
// 
// 注意：如果小程序构建报错 "Cannot read property 'mount' of null"，
// 说明此文件被错误地包含在小程序构建中。
// 
// 解决方案：
// 1. 确保 config/index.js 中的 mini.webpackChain 已排除此文件
// 2. 或者删除此文件（如果不需要 RN 构建）
// 3. 或者重命名为 index.rn.js（推荐）

// 空文件，避免小程序构建时执行 RN 相关代码
// RN 构建时会通过其他方式处理入口文件