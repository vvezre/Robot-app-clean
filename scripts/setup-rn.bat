@echo off
REM Taro React Native 初始化脚本 (Windows)

echo 🚀 开始配置 Taro React Native 环境...

REM 检查 Node.js 版本
echo 📦 检查 Node.js 版本...
node --version
if errorlevel 1 (
    echo ❌ Node.js 未安装，请先安装 Node.js
    exit /b 1
)

REM 安装依赖
echo 📦 安装依赖...
call npm install
if errorlevel 1 (
    echo ❌ 依赖安装失败
    exit /b 1
)

REM 初始化 RN 项目（如果不存在）
if not exist "ios" if not exist "android" (
    echo 📱 初始化 React Native 项目...
    call npx taro init-rn
    if errorlevel 1 (
        echo ⚠️  如果 taro init-rn 不可用，请手动运行: npx react-native init robotControlApp
    )
) else (
    echo ✅ React Native 项目已存在
)

REM Android 配置
if exist "android" (
    echo 🤖 配置 Android 项目...
    cd android
    if exist "gradlew.bat" (
        echo ✅ Android Gradle wrapper 已配置
    )
    cd ..
)

echo.
echo ✅ React Native 环境配置完成！
echo.
echo 📝 下一步：
echo   1. 开发模式: npm run dev:rn
echo   2. 构建: npm run build:rn
echo   3. 运行 Android: npx react-native run-android
echo.

