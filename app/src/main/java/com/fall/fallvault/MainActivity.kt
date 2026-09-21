package com.fall.fallvault

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.io.File

/**
 * FallVault Android 壳
 *
 * 与 iOS 版共用同一套网页原型（assets/web/007-screens）。
 * 前端代码里用的是 WKWebView 那套 `window.webkit.messageHandlers.<name>.postMessage(...)` 调用，
 * 这里通过 addJavascriptInterface + 注入 shim，把同一套调用转发到 Android 原生方法，
 * 因此 **前端代码零改动**。
 *
 * 桥接口（与 iOS 一一对应）：
 *   vaultSave / vaultLoad  —— 本地数据持久化（filesDir/fvdata.json）
 *   saveFile / pickFile    —— 导出 / 导入备份（系统文件选择器 SAF）
 *   openExternal           —— 用系统浏览器打开网址
 *   （faceIdAuth / faceIdCheck 本版不实现：前端检测不到桥会自动跳过人脸相关流程）
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var filePickerCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSaveJson: String? = null
    private var pendingSaveName: String = "FallVault-backup.fvault"

    private lateinit var createDocLauncher: ActivityResultLauncher<Intent>
    private lateinit var openDocLauncher: ActivityResultLauncher<Intent>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 截图 / 录屏防护（与 iOS 版一致的「应用内截图防护」）
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        // 全屏（隐藏状态栏与导航栏，边到边）
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        webView = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        setContentView(webView)

        // SAF 回调：导出（创建文件）
        createDocLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val json = pendingSaveJson
            pendingSaveJson = null
            if (result.resultCode == Activity.RESULT_OK && json != null) {
                val uri = result.data?.data
                if (uri != null) {
                    try {
                        contentResolver.openOutputStream(uri, "wt")?.use { os ->
                            os.write(json.toByteArray(Charsets.UTF_8))
                            os.flush()
                        }
                        toast("备份已保存 ✓")
                    } catch (e: Exception) {
                        toast("保存失败：" + (e.message ?: "未知错误"))
                    }
                }
            }
        }

        // SAF 回调：导入（打开文件）
        openDocLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val uri = result.data?.data
                if (uri != null) {
                    try {
                        val text = contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
                        val name = uri.lastPathSegment?.substringAfterLast('/') ?: "备份文件"
                        // 交回网页处理（与 iOS 的 onRestoreContent 回调一致）
                        evalJs("window.onRestoreContent(" + jsStr(name) + "," + jsStr(text) + ");")
                    } catch (e: Exception) {
                        toast("读取失败：" + (e.message ?: "未知错误"))
                    }
                }
            }
        }

        setupWebView()
        webView.loadUrl("file:///android_asset/web/007-screens/index.html?app=1")
    }

    private fun setupWebView() {
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true               // localStorage（前端大量使用）
        s.databaseEnabled = true
        s.allowFileAccess = true
        s.allowContentAccess = true
        s.mediaPlaybackRequiresUserGesture = false
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.setSupportZoom(false)
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        s.textZoom = 100                          // 固定字号，避免系统字体放大破坏布局

        webView.addJavascriptInterface(WebBridge(), "FallVaultNative")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                // 站外链接（https/http 非本地）交给系统浏览器
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    if (!url.contains("tauri.localhost")) {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            return true
                        } catch (_: Exception) { }
                    }
                }
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                injectBridgeShim(view)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // 网页里的 <input type="file">（上传卡面图等）
            override fun onShowFileChooser(
                wv: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                filePickerCallback?.onReceiveValue(null)
                filePickerCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }
                    openDocLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    filePickerCallback = null
                    false
                }
            }
        }
    }

    /** 注入 window.webkit.messageHandlers 兼容层 → 前端代码无需修改即可调用原生 */
    private fun injectBridgeShim(view: WebView?) {
        val shim = """
        (function(){
          if (window.__fvShimInstalled) return;
          window.__fvShimInstalled = true;
          window.__FV_NO_FACE = true;   // 本版不含人脸验证：前端据此隐藏相关入口
          function call(name, arg){
            try {
              if (name === 'vaultLoad' || name === 'pickFile') { window.FallVaultNative[name](''); }
              else { window.FallVaultNative[name](JSON.stringify(arg)); }
            } catch (e) { console.error('bridge ' + name + ' failed', e); }
          }
          var handlers = {};
          ['vaultSave','vaultLoad','saveFile','pickFile','openExternal'].forEach(function(n){
            handlers[n] = { postMessage: function(arg){ call(n, arg); } };
          });
          window.webkit = window.webkit || {};
          window.webkit.messageHandlers = handlers;
        })();
        """.trimIndent()
        view?.evaluateJavascript(shim, null)
    }

    private fun evalJs(js: String) {
        runOnUiThread { webView.evaluateJavascript(js, null) }
    }

    private fun toast(msg: String) {
        runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }
    }

    private fun jsStr(s: String): String {
        val sb = StringBuilder("\"")
        for (ch in s) {
            when (ch) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\u2028' -> sb.append("\\u2028")
                '\u2029' -> sb.append("\\u2029")
                else -> if (ch < ' ') sb.append(String.format("\\u%04x", ch.code)) else sb.append(ch)
            }
        }
        sb.append("\"")
        return sb.toString()
    }

    // ==================== 原生桥（供 window.webkit shim 调用） ====================
    inner class WebBridge {

        /** 保存本地数据（等价 iOS 的 vaultSave） */
        @JavascriptInterface
        fun vaultSave(json: String) {
            try {
                val obj = JSONObject(json)
                val data = obj.optString("data", "")
                if (data.isEmpty()) return
                File(filesDir, "fvdata.json").writeText(data, Charsets.UTF_8)
            } catch (_: Exception) { }
        }

        /** 读取本地数据（等价 iOS 的 vaultLoad） */
        @JavascriptInterface
        fun vaultLoad(@Suppress("UNUSED_PARAMETER") unused: String) {
            try {
                val f = File(filesDir, "fvdata.json")
                val text = if (f.exists()) f.readText(Charsets.UTF_8) else "{}"
                evalJs("try{ (window.__fvVaultLoaded||function(){})( " + jsStr(text) + " ); }catch(e){console.error(e);}")
            } catch (_: Exception) {
                evalJs("try{ (window.__fvVaultLoaded||function(){})(\"{}\"); }catch(e){}")
            }
        }

        /** 导出文件：把内容交给系统「保存到」选择器（等价 iOS 的 saveFile） */
        @JavascriptInterface
        fun saveFile(json: String) {
            try {
                val obj = JSONObject(json)
                val content = obj.optString("content", "")
                val name = obj.optString("name", "")
                if (content.isEmpty()) { toast("没有可保存的内容"); return }
                pendingSaveJson = content
                pendingSaveName = if (name.isNullOrBlank()) "FallVault-backup.fvault" else name
                runOnUiThread {
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/octet-stream"
                        putExtra(Intent.EXTRA_TITLE, pendingSaveName)
                    }
                    try {
                        createDocLauncher.launch(intent)
                    } catch (e: Exception) {
                        toast("无法打开文件保存窗口")
                    }
                }
            } catch (e: Exception) {
                toast("导出失败：" + (e.message ?: ""))
            }
        }

        /** 导入文件：系统文件选择器（等价 iOS 的 pickFile） */
        @JavascriptInterface
        fun pickFile(@Suppress("UNUSED_PARAMETER") unused: String) {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                try {
                    openDocLauncher.launch(intent)
                } catch (e: Exception) {
                    toast("无法打开文件选择窗口")
                }
            }
        }

        /** 用系统浏览器打开链接（等价 iOS 的 openExternal） */
        @JavascriptInterface
        fun openExternal(url: String) {
            try {
                runOnUiThread {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            } catch (_: Exception) {
                toast("无法打开链接")
            }
        }
    }

    // ==================== 返回键 ====================
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // 优先交给网页处理（关闭弹层 / 返回上级页面），网页不需要时才退出
        webView.evaluateJavascript(
            "(function(){ try { return (typeof fvHandleBack === 'function') ? (fvHandleBack() ? '1' : '0') : '0'; } catch(e){ return '0'; } })()"
        ) { result ->
            if (result == null || !result.contains("1")) {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        // 退到后台时通知网页（前端据此触发自动锁定）
        evalJs("try{ window.dispatchEvent(new Event('fv-background')); }catch(e){}")
    }
}