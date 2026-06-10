package com.ztzn.robotcontrol;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 启用 WebView 调试（仅用于开发）
        WebView.setWebContentsDebuggingEnabled(true);
        
        // 确保 WebView 设置正确（Capacitor 应该已经处理，但显式设置更安全）
        // 注意：Capacitor 的 BridgeActivity 会自动配置这些设置
        // 这里只是确保兼容性
    }
}
