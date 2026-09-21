plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fall.fallvault"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fall.fallvault"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.1.9"
        // 中文应用名（strings.xml 里也可改）
        resourceConfigurations += listOf("zh", "en")
    }

    // 签名配置：CI 里通过环境变量提供 keystore（没有则退回 debug 签名）
    signingConfigs {
        create("release") {
            val storePath = System.getenv("FV_KEYSTORE_PATH")
            if (!storePath.isNullOrBlank()) {
                storeFile = file(storePath)
                storePassword = System.getenv("FV_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FV_KEY_ALIAS")
                keyPassword = System.getenv("FV_KEY_PASSWORD")
                storeType = "PKCS12"   // 本项目的签名文件是 PKCS12（非 JKS）
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            val storePath = System.getenv("FV_KEYSTORE_PATH")
            signingConfig = if (!storePath.isNullOrBlank()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
        debug {
            // 测试用，可并存安装
            applicationIdSuffix = ""
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // 网页资源随包分发（前端原型直接放进 assets，不压缩，避免读取出错）
    androidResources {
        noCompress += listOf("html", "js", "css", "json", "jpg", "png", "woff2")
    }
    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.biometric:biometric:1.1.0")   // 系统生物识别（指纹 / 机型支持时的人脸）
}