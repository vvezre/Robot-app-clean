#!/bin/bash

# Taro React Native 初始化脚本

echo "🚀 开始配置 Taro React Native 环境..."

# 检查 Node.js 版本
echo "📦 检查 Node.js 版本..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 14 ]; then
  echo "❌ 需要 Node.js 14 或更高版本"
  exit 1
fi
echo "✅ Node.js 版本: $(node -v)"

# 检查是否已安装 React Native CLI
echo "📦 检查 React Native CLI..."
if ! command -v react-native &> /dev/null; then
  echo "⚠️  React Native CLI 未安装，将使用 npx"
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 初始化 RN 项目（如果不存在）
if [ ! -d "ios" ] && [ ! -d "android" ]; then
  echo "📱 初始化 React Native 项目..."
  npx taro init-rn || echo "⚠️  如果 taro init-rn 不可用，请手动运行: npx react-native init robotControlApp"
else
  echo "✅ React Native 项目已存在"
fi

# iOS 配置（仅 macOS）
if [[ "$OSTYPE" == "darwin"* ]]; then
  if [ -d "ios" ]; then
    echo "🍎 配置 iOS 项目..."
    cd ios
    if command -v pod &> /dev/null; then
      pod install
    else
      echo "⚠️  CocoaPods 未安装，请运行: sudo gem install cocoapods"
    fi
    cd ..
  fi
fi

# Android 配置
if [ -d "android" ]; then
  echo "🤖 配置 Android 项目..."
  cd android
  if [ -f "gradlew" ]; then
    chmod +x gradlew
    echo "✅ Android Gradle wrapper 已配置"
  fi
  cd ..
fi

echo ""
echo "✅ React Native 环境配置完成！"
echo ""
echo "📝 下一步："
echo "  1. 开发模式: npm run dev:rn"
echo "  2. 构建: npm run build:rn"
echo "  3. 运行 Android: npx react-native run-android"
echo "  4. 运行 iOS: npx react-native run-ios"
echo ""

