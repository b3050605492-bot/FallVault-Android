# FallVault Android

安卓端本地加密密码管理器，与 **FallVault iOS**、**FallVault 桌面版** 使用同一套 `.fvault` 加密备份格式，三端互通。

> 纯本地存储 · 无服务器 · 无账号 · 无云端明文

## 功能

**密码库**
- 账号密码管理（用户名 / 密码 / 网址 / 备注 / 分类 / 收藏）
- 标签筛选、搜索、左滑快速编辑与删除
- 密码强度提示、密码历史
- 密码生成器、详情页（网站一键跳浏览器）

**验证码（TOTP）**
- 标准 RFC 6238 实现，与 Google Authenticator、桌面版 **完全同码**
- 密钥格式全兼容：纯 Base32 密钥、`otpauth://` 链接、`otpauth-migration://` 链接（Google 迁移格式）
- 算法参数自动识别：SHA-1 / SHA-256 / SHA-512、6 位 / 8 位、30 秒 / 自定义周期
- 时间偏移：联网自动校准（多源），也可手动微调；设置本地持久化

**银行卡**
- 卡号 / 有效期（月-年）/ CVV / 持卡人 / 类型
- 自定义卡面图（上传后可裁剪、缩放、拖动调整）
- 账单地址（地址 / 城市 / 省州 / 国家地区 / 邮编，选填）
- 上下滑动切换的 3D 卡片画廊

**外观与安全**
- 锁屏 / 主界面壁纸：内置多张 + 上传自己的图；**记住最后选择，重开仍生效**
- 壁纸主色自动给界面玻璃染色，三套主题（黑白浅蓝 / 樱花粉紫 / 蔚蓝）
- 主密码解锁、自动锁定、连错锁定
- **应用内截图 / 录屏防护**（`FLAG_SECURE`，截图与录屏均为黑屏）
- 加密备份（`.fvault`）与 GitHub 云备份（上传的永远是 AES-256-GCM 密文）

> **生物识别解锁**：对接系统生物识别接口（`BiometricPrompt`）—— **指纹全机型可用**；机型把脸部数据开放给应用时，同一次调用也会走人脸。界面文案显示为「生物识别解锁」。
>
> 说明：安卓大多数人脸是 2D 且厂商常只给系统解锁用，不对第三方应用开放，所以实际以指纹为主（这与 iPhone 的 Face ID 生态不同）。

## 安全设计

- **AES-256-GCM + PBKDF2（15 万次）** 加密备份；主密码绝不上传任何地方
- 保险库数据只存应用私有目录（`filesDir`），已关闭云备份与设备迁移
- 与桌面版 / iOS 版共用同一套加密备份格式，可互相恢复

## 与其它端互通

- **安卓 → 桌面版 / iOS**：导出 `.fvault` → 另一端「恢复备份」直接可读
- **桌面版 / iOS → 安卓**：同上，反向亦可
- **恢复是「合并」不是「覆盖」**：重复条目自动跳过，连续恢复多份备份是累加关系
- 银行卡等 iOS 专属数据会随备份完整往返，不会因为某一端没有对应界面而丢失

> **直接下载**：[FallVault.apk（最新版）](https://github.com/b3050605492-bot/FallVault-Android/releases/latest) —— 全部版本见 [Releases](https://github.com/b3050605492-bot/FallVault-Android/releases)

## 安装

1. 下载构建产物 `FallVault.apk`
2. 手机允许「安装未知来源应用」
3. 点击安装即可（自签 APK，不上架应用商店）

## 构建

推送到 `main` 会由 GitHub Actions 自动构建（`.github/workflows/build-apk.yml`），产物在 Actions 的 Artifacts 里。

本地构建需要 Android SDK + JDK 17：

```bash
gradle assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk
```

## 目录结构

```
app/
├── src/main/
│   ├── AndroidManifest.xml
│   ├── java/com/fall/fallvault/MainActivity.kt   # WebView 壳 + 原生桥
│   ├── assets/web/                                # 网页原型（与 iOS 版同源）
│   │   ├── 007-screens/                           # 界面与业务逻辑
│   │   ├── assets/                                # 应用图标等
│   │   └── bz/                                     # 内置壁纸
│   └── res/                                        # 图标、主题、字符串
└── build.gradle.kts
```

## 说明

- 本项目仅供个人学习与自用，不上架应用商店（自签 APK 安装）。
- 请仅管理**你自己**的账号信息，不要用于存储他人凭据。
- 因遗忘主密码、设备丢失、误删数据造成的损失，作者不承担责任。
- 界面与实现与 FallVault iOS 版共用同一套网页原型；桌面版 FallVault 为独立项目。

## 🔗 其它平台

同一套 `.fvault` 加密备份格式，三端数据互通。

| 平台 | 仓库 |
|---|---|
| Windows 桌面版 | [FallVault](https://github.com/b3050605492-bot/FallVault) |
| iPhone / iPad | [FallVault-iOS](https://github.com/b3050605492-bot/FallVault-iOS) |

## License

MIT