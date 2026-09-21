// 原生环境兜底：检测到 WKWebView 桥 → 立即进入 App 全屏模式（不管 Swift 注入是否成功）
(function () {
  try {
    if ((window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.vaultSave)
        || location.search.includes('app')) {
      document.documentElement.classList.add('app');
    }
  } catch (e) {}
})();
// 资源路径适配：桌面/bundle 用 ../（资源在 web 同级）；沙盒(云更新) 资源已随包下载到 007-screens 同级子目录
const IS_SANDBOX = /\/Documents\//.test(String(document.location.href));
const RES_BASE = IS_SANDBOX ? 'assets/' : '../assets/';
const RES_BZ = IS_SANDBOX ? 'bz/' : '../bz/';
// 完整版附加逻辑：锁屏 / 账号详情 / 新建编辑 / 密码生成器 / 壁纸切换
// 依赖 screens.js 里的 CARDS、tabbar 等

// ===== 通用 Toast =====
function showToast(text, ms) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), ms || 1700);
}

let clipTimer = null;
function copyVal(text, label) {
  showToast('已复制 ' + label);
  if (navigator.clipboard) navigator.clipboard.writeText(String(text)).catch(() => {});
  // 剪贴板自动清理：30 秒后清空，防止密码残留在剪贴板被别的 App 读到
  clearTimeout(clipTimer);
  clipTimer = setTimeout(() => {
    if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
    showToast('已自动清空剪贴板');
  }, 30000);
}

// ===== 备份提醒 =====
// 备份成功后记录时间（加密导出 / GitHub 备份 / 恢复成功后都算）
function markBackedUp() {
  const now = String(Date.now());
  try {
    localStorage.setItem('fvLastBackup', now);
    localStorage.setItem('fvLastRemind', now);   // 备份成功视同已提醒，7 天周期重算
  } catch (e) {}
}
// 解锁后检查：超过 7 天没备份（或从没备份过）→ 提醒（7 天周期只提醒一次，不每次打开都弹）
function backupReminder() {
  const t = Number(localStorage.getItem('fvLastBackup') || 0);
  const lastRemind = Number(localStorage.getItem('fvLastRemind') || 0);
  if (lastRemind && Date.now() - lastRemind < 7 * 864e5) return;   // 7 天内提醒过 → 不再打扰
  if (!t) {
    try { localStorage.setItem('fvLastRemind', String(Date.now())); } catch (e) {}
    showToast('还没有备份过 · 建议去「设置 → 加密备份」', 4000);
    return;
  }
  if (Date.now() - t > 7 * 864e5) {
    try { localStorage.setItem('fvLastRemind', String(Date.now())); } catch (e) {}
    showToast('已超过 7 天没备份 · 建议去「设置 → 加密备份」', 4000);
  }
}

// 打开网站：App 里交给系统浏览器
// ① 原生壳注册了 openExternal 处理器 → 直接调起 Safari
// ② 浏览器 / 预览窗 → window.open 新标签
function openSite(url) {
  const raw = String(url || '').trim();
  if (!raw || raw === '—') { showToast('这条没有填网站地址'); return; }
  const full = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openExternal) {
      window.webkit.messageHandlers.openExternal.postMessage(full);
      return;
    }
  } catch (e) {}
  window.open(full, '_blank');
}

// App 里禁掉长按菜单与右键（"像软件不像网页"）—— 输入框除外
document.addEventListener('contextmenu', e => {
  const t = e.target;
  const editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (document.documentElement.classList.contains('app') && !editable) e.preventDefault();
}, false);

// ===== 底栏加号：弹动动画 + 触感反馈，然后才开新建页 =====
// 底栏加号（Figma 版）：未触发=+，触发=展开三瓣扇叶 + X 变色
let fabLockT = 0;
function fabNew() {
  // 时间锁：pointerdown 立即响应后，随后的 click 不再触发（否则开了又立刻收起＝"点很多次"）
  const nowT = Date.now();
  if (nowT - fabLockT < 400) return;
  fabLockT = nowT;
  const fab = document.getElementById('fabBtn');
  const outer = document.getElementById('fabOuter');
  const opening = !outer.classList.contains('open');
  if (fab) { fab.classList.remove('tap'); void fab.offsetWidth; fab.classList.add('tap'); }
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
  if (opening) {
    outer.classList.add('open');
    fab.classList.add('open');
  } else {
    outer.classList.remove('open');
    fab.classList.remove('open');
  }
}
// 三个扇叶按钮：收起 + 跳转
let fabLock3T = 0;
function fabNew3(what) {
  const nowT = Date.now();
  if (nowT - fabLock3T < 400) return;    // 同上：pointerdown+click 双触发去重
  fabLock3T = nowT;
  const outer = document.getElementById('fabOuter');
  const fab = document.getElementById('fabBtn');
  if (outer) outer.classList.remove('open');
  if (fab) fab.classList.remove('open');
  setTimeout(() => {
    if (what === 'account') openEditor(null);
    else if (what === 'tag') openTagEditor('');
    else if (what === 'card') { switchVault('card'); openBankForm(null); }
  }, 260);
}

// ===== 编辑页「收藏」开关（edFav 已有载入/保存逻辑，这里补上点击） =====
function toggleEditFav() {
  edFav = !edFav;
  const b = document.getElementById('eFavBtn');
  if (b) b.classList.toggle('on', edFav);
  try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {}
  showToast(edFav ? '已加入收藏' : '已取消收藏');
}

// 免验证功能已删除
// 导出（备份文件 / TOTP 文本）：让用户自己选保存位置
function hasNativeFiles() {
  try { return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.saveFile); } catch (e) { return false; }
}
function nativeSave(filename, content, mime) {
  if (!hasNativeFiles()) return false;
  try {
    window.webkit.messageHandlers.saveFile.postMessage({ name: filename, text: content, mime: mime || 'application/octet-stream' });
    return true;
  } catch (e) { return false; }
}
// 原生「文件」App 选完文件 → Swift 回传内容
window.__fvImported = function (name, text) {
  try {
    if (typeof onRestoreContent === 'function') onRestoreContent(name, text);
    else showToast('已选择：' + name);
  } catch (e) {}
};

// ===== 锁屏（首次设置主密码 / 解锁 + 可选 Face ID） =====
let lockFails = 0;        // 连续错误次数
let lockUntil = 0;        // 临时锁定到期时间戳
let lockTimer = null;     // 锁定倒计时定时器
const LOCK_MAX = 3;       // 最多尝试次数
const LOCK_SEC = 10;      // 锁定时长（秒）
let faceBusy = false;     // Face ID 演示动画进行中（防连点叠放）

// --- 演示状态（首次设置 / Face ID 开关），仅存本机 ---
let fvPwSet = false;      // 是否已设置主密码
let fvFace = false;       // 是否启用（且已录入）Face ID
let fvPwHash = '';        // 主密码摘要（不存明文；真机版由 Keychain 承担）
let faceDescStore = null; // 已录入的人脸特征（128 维向量，不存原图）
try {
  const s = JSON.parse(localStorage.getItem('fvDemo') || '{}');
  fvPwSet = !!s.pwSet; fvFace = !!s.face; fvPwHash = s.pwHash || '';
  faceDescStore = s.faceDesc || null;
  if (fvFace && !faceDescStore && !hasNativeFaceId()) fvFace = false;   // 桌面演示：没录过人脸不算开启；真机系统 Face ID 没有特征向量，豁免
} catch (e) {}
function saveDemo() {
  try { localStorage.setItem('fvDemo', JSON.stringify({ pwSet: fvPwSet, face: fvFace, pwHash: fvPwHash, faceDesc: faceDescStore })); } catch (e) {}
}
// 简单摘要函数（演示用）
function weakHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); }

// 显示锁屏并初始化：未设置主密码 → 首次设置模式；已设置 → 解锁模式
// Face ID 未开启时，解锁界面完全不显示人脸识别
function lockInit(autoFace) {
  // 全面清理可能残留的全屏层（.screen 弹层 / overlay / ＋菜单）—— 任何残留都会吃掉锁屏点击（点不动根因）
  try {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.overlay').forEach(el => el.classList.remove('show'));
    const foX = document.getElementById('fabOuter'); if (foX) foX.classList.remove('open');
    const fbX = document.getElementById('fabBtn'); if (fbX) fbX.classList.remove('open');
  } catch (e) {}
  const lock = document.getElementById('lockScreen');
  const wrap = document.getElementById('pwWrap');
  const msg = document.getElementById('lockMsg');
  const faceBox = document.getElementById('faceBox');
  const label = document.getElementById('faceLabel');
  const inp = document.getElementById('unlockPw');
  clearInterval(lockTimer);
  faceCloseCam();
  lockFails = 0; lockUntil = 0; faceBusy = false;
  lock.style.display = '';
  lock.classList.remove('hide', 'scanning', 'success', 'fail');
  wrap.classList.remove('err', 'ok', 'locked');
  msg.classList.remove('show');
  faceBox.classList.remove('show-actions');
  label.textContent = FACE_NAME + ' 解锁';
  inp.value = ''; inp.type = 'password'; inp.disabled = false;
  document.getElementById('pwEye').innerHTML = (typeof EYE !== 'undefined') ? EYE : '';

  // ① 首次使用：还没有主密码 → 先设置
  if (!fvPwSet) {
    lock.classList.add('mode-setup');
    lock.classList.remove('mode-unlock');
    document.getElementById('lockSub').textContent = '首次使用 · 请先设置主密码';
    document.getElementById('newPw').value = '';
    document.getElementById('newPw2').value = '';
    document.getElementById('setupMsg').classList.remove('show');
    document.getElementById('pwWrapNew').classList.remove('err');
    document.getElementById('pwWrapConfirm').classList.remove('err');
    document.getElementById('newFaceSw').classList.toggle('on', fvFace);
    setTimeout(() => document.getElementById('newPw').focus(), 320);
    return;
  }

  // ② 已设置主密码 → 解锁模式
  lock.classList.remove('mode-setup');
  lock.classList.add('mode-unlock');
  document.getElementById('lockSub').textContent = fvFace ? '使用主密码或 Face ID 解锁' : '输入主密码解锁';
  faceBox.style.display = fvFace ? '' : 'none';   // 没开 Face ID 就不显示
  updateFaceRow();
  setTimeout(() => inp.focus(), 320);             // 自动聚焦
  if (autoFace && fvFace) setTimeout(faceIdAuto, 900);
}

// ===== 首次设置主密码 =====
function doSetup() {
  const p1 = document.getElementById('newPw').value.trim();
  const p2 = document.getElementById('newPw2').value.trim();
  const w1 = document.getElementById('pwWrapNew');
  const w2 = document.getElementById('pwWrapConfirm');
  const msg = document.getElementById('setupMsg');
  w1.classList.remove('err'); w2.classList.remove('err'); msg.classList.remove('show');
  void w1.offsetWidth;

  if (p1.length < 4) {
    w1.classList.add('err');
    msg.textContent = '主密码至少 4 位';
    msg.classList.add('show');
    setTimeout(() => w1.classList.remove('err'), 1300);
    return;
  }
  if (p1 !== p2) {
    w2.classList.add('err');
    msg.textContent = '两次输入不一致，请重新确认';
    msg.classList.add('show');
    setTimeout(() => w2.classList.remove('err'), 1300);
    return;
  }
  fvPwHash = weakHash(p1);
  fvPwSet = true;
  fvFace = document.getElementById('newFaceSw').classList.contains('on');
  saveDemo();
  updateFaceRow();
  showToast(fvFace ? '主密码已设置 · Face ID 已开启' : '主密码已设置');
  w1.classList.add('ok');
  setTimeout(finishUnlock, 620);
}

// 首次设置里的 Face ID 开关：iOS 壳 → 系统 Face ID；桌面演示 → 先录入人脸
function toggleNewFace(btn) {
  if (btn.classList.contains('on')) {
    btn.classList.remove('on');
    fvFace = false; faceDescStore = null; saveDemo(); updateFaceRow();
    return;
  }
  if (hasNativeFaceId()) {
    window.__fvFaceIdCheck = function (r) {
      window.__fvFaceIdCheck = null;
      if (r && r.ok) {
        btn.classList.add('on');
        fvFace = true; saveDemo(); updateFaceRow();
        showToast('Face ID 解锁已开启');
      } else if (r && !r.enrolled) {
        showToast(FACE_ENROLL_TIP, 3200);
      } else {
        showToast(FACE_UNSUPPORTED, 3200);
      }
    };
    try { window.webkit.messageHandlers.faceIdCheck.postMessage(null); } catch (e) {}
    return;
  }
  startEnroll('setup');
}

// 设置页：开关 Face ID
function toggleFaceId() {
  // iOS 壳：直接用系统 Face ID —— 只检查系统是否已录入面容，不需要自己录脸
  if (hasNativeFaceId()) {
    if (fvFace) {                        // 已开 → 关闭
      fvFace = false;
      saveDemo();
      updateFaceRow();
      showToast('Face ID 解锁已关闭');
      return;
    }
    window.__fvFaceIdCheck = function (r) {
      window.__fvFaceIdCheck = null;
      if (r && r.ok) {
        fvFace = true;
        saveDemo();
        updateFaceRow();
        showToast('Face ID 解锁已开启');
      } else if (r && !r.enrolled) {
        showToast(FACE_ENROLL_TIP, 3200);
      } else {
        showToast(FACE_UNSUPPORTED, 3200);
      }
    };
    try { window.webkit.messageHandlers.faceIdCheck.postMessage(null); } catch (e) {}
    return;
  }
  // 桌面演示：开启 → 先录脸
  if (!fvFace) { startEnroll('settings'); return; }
  fvFace = false;
  faceDescStore = null;
  saveDemo();
  updateFaceRow();
  showToast('Face ID 解锁已关闭');
}

// 同步设置页的状态文字
function updateFaceRow() {
  const el = document.getElementById('faceIdState');
  if (el) el.textContent = fvFace ? '已开启' : '已关闭';
}

// 重置演示数据（清掉主密码 → 重新走首次设置）
function resetDemo() {
  fvPwSet = false; fvFace = false; fvPwHash = ''; faceDescStore = null;
  try { localStorage.removeItem('fvDemo'); } catch (e) {}
  faceCloseCam();
  closeDetail(); closeEditor();
  lockInit(false);
  showToast('已重置 · 请重新设置主密码');
}

// =====================================================================
// 人脸识别（face-api.js 本地模型 · 真实摄像头）
//   录入：打开 Face ID 开关 → 摄像头 → 连续 3 帧检出 → 存 128 维特征
//   识别：锁屏自动扫脸 → 与录入特征比对（欧氏距离 < 0.55）
//   摄像头不可用 / 未录入 → 自动回退到演示动画
// =====================================================================
let faceModelsOk = false;       // 模型加载完成
let faceModelLoading = null;    // 加载中的 Promise（防重复）
let faceStream = null;          // 摄像头流
let faceLoopTimer = null;       // 检测循环
let faceEnrollMode = false;     // 是否处于录入模式
let enrollFrames = 0;           // 连续检出帧数
let enrollTarget = 'settings';  // 录入入口：settings / setup

// 载入本地模型
function faceLoadModels() {
  if (faceModelsOk) return Promise.resolve(true);
  if (faceModelLoading) return faceModelLoading;
  if (!window.faceapi) return Promise.resolve(false);
  faceModelLoading = (async () => {
    try {
      const base = 'vendor/models';
      await faceapi.nets.tinyFaceDetector.loadFromUri(base);
      await faceapi.nets.faceLandmark68Net.loadFromUri(base);
      await faceapi.nets.faceRecognitionNet.loadFromUri(base);
      faceModelsOk = true;
      return true;
    } catch (e) {
      console.warn('人脸模型加载失败:', e);
      return false;
    }
  })();
  return faceModelLoading;
}

// 打开摄像头
// 原生壳（iOS）优先：走 Swift 的 AVCaptureSession —— 权限用 AVCaptureDevice.requestAccess，
// iOS 会记住选择（只弹一次），且帧由 Swift 推来（window.__fvFrameSrc），不占 getUserMedia。
async function faceOpenCam(videoEl) {
  // ① 原生模式
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cameraOn) {
      window.__fvCamNative = true;
      window.__fvFrameSrc = null;
      const target = videoEl || document.querySelector('.cam-wrap video, .face-cam');
      const r = target ? target.getBoundingClientRect() : { x: 0, y: 0, width: 200, height: 200 };
      window.webkit.messageHandlers.cameraOn.postMessage({
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      });
      if (target) target.style.opacity = '0';          // 隐藏 HTML 视频，Swift 预览层会盖在原位
      // 等第一帧（最长 6 秒，含用户首次授权弹窗时间）
      const start = Date.now();
      while (!window.__fvFrameSrc && Date.now() - start < 6000) {
        await new Promise(res => setTimeout(res, 120));
      }
      if (!window.__fvFrameSrc) {                       // 用户拒绝或超时
        window.__fvCamNative = false;
        if (target) target.style.opacity = '';
        return false;
      }
      return true;
    }
  } catch (e) { /* 继续走 Web 方案 */ }

  // ② Web 兜底（桌面预览 / 无原生桥）
  try {
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 } },
      audio: false
    });
    videoEl.srcObject = faceStream;
    await videoEl.play().catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

// 关闭摄像头 + 停循环
function faceCloseCam() {
  if (faceStream) { faceStream.getTracks().forEach(t => t.stop()); faceStream = null; }
  const v1 = document.getElementById('faceVideo');
  const v2 = document.getElementById('enrollVideo');
  if (v1) { v1.srcObject = null; v1.style.opacity = ''; }
  if (v2) { v2.srcObject = null; v2.style.opacity = ''; }
  if (window.__fvCamNative) {
    window.__fvCamNative = false;
    window.__fvFrameSrc = null;
    try { window.webkit.messageHandlers.cameraOff.postMessage(null); } catch (e) {}
  }
  const btn = document.getElementById('faceBtn');
  if (btn) btn.classList.remove('cam-on');
  clearInterval(faceLoopTimer); faceLoopTimer = null;
}

// 从视频帧提取人脸特征（Array(128) 或 null）
// 原生摄像头模式：帧由 Swift 推到 window.__fvFrameSrc（base64 JPEG），加载成 Image 再检测
async function faceGrabDescriptor(videoEl) {
  if (!faceModelsOk) return null;
  try {
    let src = videoEl;
    if (window.__fvCamNative && window.__fvFrameSrc) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = rej;
        img.src = window.__fvFrameSrc;
      });
      if (!img.naturalWidth) return null;
      src = img;
    }
    const det = await faceapi
      .detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.40 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return det ? Array.from(det.descriptor) : null;
  } catch (e) { return null; }
}

// 特征比对（欧氏距离）
function faceMatch(desc) {
  if (!faceDescStore || !desc) return false;
  const n = Math.min(faceDescStore.length, desc.length);
  let sum = 0;
  for (let i = 0; i < n; i++) { const d = faceDescStore[i] - desc[i]; sum += d * d; }
  return Math.sqrt(sum) < 0.55;
}

// ---- 录入流程 ----
async function startEnroll(target) {
  enrollTarget = target || 'settings';
  const modal = document.getElementById('faceEnroll');
  const status = document.getElementById('enrollStatus');
  const wrap = document.querySelector('.cam-wrap');
  const btn = document.getElementById('enrollAction');
  modal.classList.add('show');
  wrap.classList.remove('ok');
  btn.textContent = '开始录入';
  faceEnrollMode = true;
  enrollFrames = 0;
  status.className = 'fm-status';
  status.textContent = '正在加载模型…';

  const ok = await faceLoadModels();
  if (!ok) {
    status.className = 'fm-status err';
    status.textContent = '模型加载失败（检查 vendor/models）';
    faceEnrollMode = false;
    return;
  }
  const camOk = await faceOpenCam(document.getElementById('enrollVideo'));
  if (!camOk) {
    status.className = 'fm-status err';
    status.textContent = '摄像头不可用 — 改用演示模式';
    setTimeout(() => {
      cancelEnroll();
      fvFace = true; faceDescStore = null; saveDemo(); updateFaceRow();
      document.getElementById('newFaceSw').classList.add('on');
      showToast('摄像头不可用 · Face ID 用演示模式');
    }, 1500);
    return;
  }
  status.textContent = '把脸放进取景框…';
  btn.textContent = '重新扫描';
  faceEnrollLoop();
}

// 人脸录入循环
// ⚠️ 关键：绝不能用 setInterval(async ...) —— 它不会等 await，
// 在手机上单次检测要 300~800ms，而循环每 320ms 塞一个新任务 → 任务堆叠 → 主线程堵死 → 界面完全点不动。
// 改成「跑完才排下一次」的递归 setTimeout，并用 busy 标志兜底防重入。
let faceLoopBusy = false;
function faceEnrollLoop() {
  clearTimeout(faceLoopTimer);
  faceLoopTimer = null;
  enrollFrames = 0;
  faceLoopBusy = false;

  const tick = async () => {
    if (!faceEnrollMode) return;
    if (faceLoopBusy) { faceLoopTimer = setTimeout(tick, 400); return; }
    faceLoopBusy = true;
    try {
      const status = document.getElementById('enrollStatus');
      const wrap = document.querySelector('.cam-wrap');
      if (!status) return;
      const desc = await faceGrabDescriptor(document.getElementById('enrollVideo'));
      if (!faceEnrollMode) return;                       // 期间被关掉了
      if (!desc) {
        enrollFrames = 0;
        status.className = 'fm-status';
        status.textContent = '没有检测到人脸…';
        wrap.classList.remove('ok');
        return;
      }
      enrollFrames++;
      if (enrollFrames < 3) {
        status.textContent = '检测到人脸 · 保持不动 (' + enrollFrames + '/3)';
        return;
      }
      // 录入成功
      faceDescStore = desc;
      fvFace = true;
      saveDemo();
      updateFaceRow();
      clearTimeout(faceLoopTimer); faceLoopTimer = null;
      faceEnrollMode = false;
      wrap.classList.add('ok');
      status.className = 'fm-status ok';
      status.textContent = '✓ 录入成功，Face ID 已开启';
      document.getElementById('enrollAction').textContent = '完成';
      setTimeout(() => {
        document.getElementById('faceEnroll').classList.remove('show');
        faceCloseCam();
        if (enrollTarget === 'setup') document.getElementById('newFaceSw').classList.add('on');
        showToast('Face ID 已录入并开启');
      }, 1100);
    } catch (e) {
      const st = document.getElementById('enrollStatus');
      if (st) { st.className = 'fm-status'; st.textContent = '识别出错，请重试'; }
    } finally {
      faceLoopBusy = false;
      if (faceEnrollMode) faceLoopTimer = setTimeout(tick, 420);   // 跑完一轮才排下一轮
    }
  };
  faceLoopTimer = setTimeout(tick, 150);
}

function enrollAction() {
  const modal = document.getElementById('faceEnroll');
  if (!modal.classList.contains('show')) { startEnroll('settings'); return; }
  enrollFrames = 0;   // 已在界面里 → 重新扫描
  const status = document.getElementById('enrollStatus');
  status.className = 'fm-status';
  status.textContent = '把脸放进取景框…';
  document.querySelector('.cam-wrap').classList.remove('ok');
}

function cancelEnroll() {
  faceEnrollMode = false;
  clearInterval(faceLoopTimer); faceLoopTimer = null;
  enrollFrames = 0;
  document.getElementById('faceEnroll').classList.remove('show');
  faceCloseCam();
}

// ---- 锁屏识别 ----
// 已录入 → 真实扫脸；未录入 → 演示动画
async function faceScanReal() {
  const lock = document.getElementById('lockScreen');
  const label = document.getElementById('faceLabel');
  const btn = document.getElementById('faceBtn');
  lock.classList.add('scanning');
  label.textContent = '正在识别…';
  const ok = await faceLoadModels();
  if (!ok) { lock.classList.remove('scanning'); label.textContent = FACE_NAME + ' 解锁'; return; }
  const camOk = await faceOpenCam(document.getElementById('faceVideo'));
  if (!camOk) {
    // 摄像头不可用 → 演示动画
    lock.classList.remove('scanning');
    lock.classList.add('fail');
    label.textContent = 'Face ID 无法识别';
    setTimeout(() => lock.classList.remove('fail'), 700);
    document.getElementById('faceBox').classList.add('show-actions');
    return;
  }
  btn.classList.add('cam-on');
  let tries = 0;
  clearTimeout(faceLoopTimer);
  faceLoopTimer = null;
  // ⚠️ 同录入循环：递归 setTimeout，跑完一轮才排下一轮，绝不堆叠任务
  const tick = async () => {
    const lk = document.getElementById('lockScreen');
    if (!lk || lk.classList.contains('hide') || lk.classList.contains('success')) {
      faceLoopTimer = null; return;                       // 已解锁 / 已关 → 停
    }
    if (faceLoopBusy) { faceLoopTimer = setTimeout(tick, 400); return; }
    faceLoopBusy = true;
    try {
      tries++;
      const desc = await faceGrabDescriptor(document.getElementById('faceVideo'));
      if (!desc) { return; }                              // 没检测到脸 → 下一轮再试
      if (faceMatch(desc)) {
        // 识别成功
        faceLoopTimer = null;
        lk.classList.remove('scanning');
        lk.classList.add('success');
        label.textContent = '已识别';
        setTimeout(() => { faceCloseCam(); finishUnlock(); }, 640);
        return;
      }
      label.textContent = '不是本人 · 再看一次';
      if (tries > 22) {                                   // ≈10 秒没成功 → 转为失败提示
        faceLoopTimer = null;
        faceCloseCam();
        lk.classList.remove('scanning');
        lk.classList.add('fail');
        label.textContent = 'Face ID 无法识别';
        setTimeout(() => lk.classList.remove('fail'), 700);
        document.getElementById('faceBox').classList.add('show-actions');
        return;
      }
    } catch (e) {
      // 检测异常 → 等一下再试，不崩界面
    } finally {
      faceLoopBusy = false;
      if (faceLoopTimer !== null || !document.getElementById('lockScreen')) return;
      const lk2 = document.getElementById('lockScreen');
      if (lk2 && !lk2.classList.contains('hide') && !lk2.classList.contains('success') && tries <= 22) {
        faceLoopTimer = setTimeout(tick, 420);
      }
    }
  };
  faceLoopTimer = setTimeout(tick, 150);
}

// 演示动画（没录入人脸时用）
function faceScanDemo() {
  const lock = document.getElementById('lockScreen');
  const label = document.getElementById('faceLabel');
  lock.classList.add('scanning');
  label.textContent = '正在识别…';
  setTimeout(() => {
    lock.classList.remove('scanning');
    lock.classList.add('fail');
    label.textContent = 'Face ID 无法识别';
    setTimeout(() => lock.classList.remove('fail'), 700);
    document.getElementById('faceBox').classList.add('show-actions');
  }, 950);
}

// 打开时的自动识别：已录入人脸 → 真实扫脸；未录入 → 演示动画
// 生物识别名称：iOS 走系统 Face ID；安卓走系统生物识别（指纹，机型支持时人脸）
// 壳注入 window.__FV_BIOMETRIC 即为安卓，其余端保持 Face ID 文案
var FACE_NAME = (window.__FV_BIOMETRIC ? '生物识别' : 'Face ID');
var FACE_ENROLL_TIP = (window.__FV_BIOMETRIC ? '请先在系统设置里录入指纹或人脸' : '请先在系统设置里录入面容 ID');
var FACE_UNSUPPORTED = (window.__FV_BIOMETRIC ? '设备不支持生物识别' : '设备不支持面容');
// ===== 系统 Face ID（iOS 壳：LocalAuthentication，比 face-api 快得多、更准）=====
function hasNativeFaceId() {
  try { return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.faceIdAuth); } catch (e) { return false; }
}
// Swift 验证结果回调
window.__fvFaceIdResult = function (r) {
  const lock = document.getElementById('lockScreen');
  if (!lock) return;
  window.__fvFaceTimeout && clearTimeout(window.__fvFaceTimeout);
  window.__fvFaceTimeout = null;
  if (r && r.ok) {
    lock.classList.remove('scanning', 'fail');
    lock.classList.add('success');
    document.getElementById('faceLabel').textContent = '已识别';
    setTimeout(finishUnlock, 420);
    return;
  }
  lock.classList.remove('scanning');
  const reason = r ? r.reason : 'fail';
  if (reason === 'cancel') {
    // 用户主动取消系统弹窗 → 安静回到可点状态
    document.getElementById('faceLabel').textContent = FACE_NAME + '解锁';
    document.getElementById('faceBox').classList.remove('show-actions');
    return;
  }
  if (reason === 'no-enroll') {
    document.getElementById('faceLabel').textContent = '未录入' + FACE_NAME;
    showToast(FACE_ENROLL_TIP, 3000);
    document.getElementById('faceBox').classList.add('show-actions');
    return;
  }
  if (reason === 'no-biometry') {
    document.getElementById('faceLabel').textContent = FACE_UNSUPPORTED;
    showToast('此设备不支持面容 / 指纹', 3000);
    document.getElementById('faceBox').classList.add('show-actions');
    return;
  }
  // fail：验证未通过
  lock.classList.add('fail');
  document.getElementById('faceLabel').textContent = '再试一次';
  setTimeout(() => lock.classList.remove('fail'), 700);
  document.getElementById('faceBox').classList.add('show-actions');
};
// 请求系统验证（锁屏按钮 / 自动尝试共用）
function nativeFaceAuth() {
  const lock = document.getElementById('lockScreen');
  lock.classList.add('scanning');
  document.getElementById('faceLabel').textContent = '正在识别…';
  window.__fvFaceTimeout && clearTimeout(window.__fvFaceTimeout);
  window.__fvFaceTimeout = setTimeout(() => {   // 兜底：系统无响应/无面容时不卡死锁屏
    lock.classList.remove('scanning', 'success', 'fail');
    document.getElementById('faceLabel').textContent = FACE_NAME + '解锁';
    showToast(FACE_NAME + '不可用，请用主密码', 2600);
    window.__fvFaceTimeout = null;
  }, 3500);
  try { window.webkit.messageHandlers.faceIdAuth.postMessage(null); }
  catch (e) { lock.classList.remove('scanning'); }
}

function faceIdAuto() {
  const lock = document.getElementById('lockScreen');
  if (!lock || lock.classList.contains('hide')) return;
  if (hasNativeFaceId()) { nativeFaceAuth(); return; }   // iOS 壳 → 系统 Face ID
  if (faceDescStore) faceScanReal(); else faceScanDemo();
}

// 点击 Face ID 圆钮：iOS 壳 → 系统 Face ID；桌面演示 → 真实扫脸/演示动画链
function faceIdTry() {
  const lock = document.getElementById('lockScreen');
  if (!lock || lock.classList.contains('hide')) return;
  document.getElementById('faceBox').classList.remove('show-actions');
  lock.classList.remove('fail', 'success');
  document.getElementById('faceLabel').textContent = FACE_NAME + '解锁';
  if (hasNativeFaceId()) { nativeFaceAuth(); return; }   // iOS 壳 → 系统 Face ID
  if (faceDescStore) { faceScanReal(); return; }   // 真实识别
  if (faceBusy) return;
  faceBusy = true;
  const label = document.getElementById('faceLabel');
  lock.classList.add('fail');
  label.textContent = '再试一次';
  setTimeout(() => {
    lock.classList.remove('fail');
    lock.classList.add('scanning');
    label.textContent = '正在识别…';
    setTimeout(() => {
      lock.classList.remove('scanning');
      lock.classList.add('success');
      label.textContent = '已识别';
      setTimeout(() => { faceBusy = false; finishUnlock(); }, 640);
    }, 900);
  }, 950);
}

// 改用主密码
function usePassword() {
  document.getElementById('faceBox').classList.remove('show-actions');
  document.getElementById('faceLabel').textContent = FACE_NAME + '解锁';
  faceCloseCam();
  document.getElementById('unlockPw').focus();
}

// 密码显示 / 隐藏
function toggleLockPw() {
  const inp = document.getElementById('unlockPw');
  const btn = document.getElementById('pwEye');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show ? EYE_OFF : EYE;
  inp.focus();
}

// 解锁完成（淡出并隐藏锁屏）
function finishUnlock() {
  const lock = document.getElementById('lockScreen');
  clearInterval(lockTimer);
  faceCloseCam();
  lockFails = 0; lockUntil = 0;
  lock.classList.add('hide');
  document.getElementById('pwWrap').classList.remove('ok', 'err', 'locked');
  document.getElementById('lockMsg').classList.remove('show');
  setTimeout(() => { lock.style.display = 'none'; }, 650);
  setTimeout(backupReminder, 1200);   // 解锁后检查备份状态
}

// 重新锁定（设置页"立即锁定"）
function relockApp() {
  lockInit(true);
}

// ===== 主密码验证（演示规则：≥4 位 = 正确；连错 3 次临时锁定 10 秒） =====
function unlockPw() {
  const lock = document.getElementById('lockScreen');
  const wrap = document.getElementById('pwWrap');
  const msg = document.getElementById('lockMsg');
  const inp = document.getElementById('unlockPw');
  if (lockUntil > Date.now()) return;              // 锁定中，忽略提交
  if (wrap.classList.contains('ok')) return;       // 已通过验证，避免重复提交
  const v = inp.value.trim();

  wrap.classList.remove('err', 'ok');
  msg.classList.remove('show');
  void wrap.offsetWidth; // 重置 shake 动画，保证可重复播放

  if (weakHash(v) !== fvPwHash) {
    lockFails++;
    wrap.classList.add('err');
    if (lockFails >= LOCK_MAX) {
      // ③ 连错达上限 → 临时锁定
      lockUntil = Date.now() + LOCK_SEC * 1000;
      wrap.classList.add('locked');
      inp.disabled = true;
      startLockCountdown();
    } else {
      // ① 错误：变红 + 抖动 + 剩余次数提示
      msg.textContent = '主密码错误 · 还可尝试 ' + (LOCK_MAX - lockFails) + ' 次';
      msg.classList.add('show');
      setTimeout(() => wrap.classList.remove('err'), 1300);
      setTimeout(() => { if (lockUntil <= Date.now()) msg.classList.remove('show'); }, 2600);
    }
    return;
  }

  // ② 正确：变绿 + 勾弹出 → 解锁
  lockFails = 0;
  wrap.classList.add('ok');
  setTimeout(finishUnlock, 620);
}

// 锁定倒计时（到点自动解锁输入框）
function startLockCountdown() {
  const wrap = document.getElementById('pwWrap');
  const msg = document.getElementById('lockMsg');
  const inp = document.getElementById('unlockPw');
  clearInterval(lockTimer);
  const tick = () => {
    const left = Math.ceil((lockUntil - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(lockTimer);
      wrap.classList.remove('locked');
      inp.disabled = false;
      msg.classList.remove('show');
      lockFails = 0; lockUntil = 0;
      inp.focus();
      return;
    }
    msg.textContent = '尝试次数过多 · 请 ' + left + ' 秒后再试';
    msg.classList.add('show');
  };
  tick();
  lockTimer = setInterval(tick, 200);
}

// ===== 账号详情页 =====
let currentIdx = null;
let passShown = false;

// 图标（与桌面版同款 lucide）
const EYE = icon('eye', { w: 14 });
const EYE_OFF = icon('eye-off', { w: 14 });
const COPY = icon('copy', { w: 13 });

function openDetail(name) {
  const idx = CARDS.findIndex(c => c.t === name);
  if (idx < 0) return;
  currentIdx = idx;
  passShown = false;
  document.getElementById('detailScreen').classList.add('show');   // 立即显示（点击马上有反馈）
  requestAnimationFrame(() => { try { renderDetail(idx); } catch (err) {} });   // 内容延后一帧渲染
}

function closeDetail() {
  document.getElementById('detailScreen').classList.remove('show');
}

function renderDetail(idx) {
  const c = CARDS[idx];
  document.getElementById('detailTitle').textContent = c.t;

  const st = passStrength(c.pass);
  const hist = [];   // 演示历史数据已移除（开源清理）

  // 验证码：实时取自 TOTP 引擎（与列表/验证码页同一相位）
  const ti = c.totp ? TOTP_ITEMS.find(x => x.key === c.totp) : null;
  if (ti && !ti.code) ti.code = randCode();
  const totpRow = ti ? `
    <div class="drow">
      <span class="dk">验证码</span>
      <span class="dv mono" id="dcode-${ti.key}" style="color:#64D2FF;font-weight:700;font-size:16px;letter-spacing:2.5px">${ti.code}</span>
      <span id="dsec-${ti.key}" style="font-size:12px;color:rgba(255,255,255,.35);align-self:center">30</span>
      <div class="cp" onclick="copyVal(document.getElementById('dcode-${ti.key}').textContent,'验证码')">${COPY}</div>
    </div>` : '';

  document.getElementById('detailBody').innerHTML = `
    <div class="dhero">
      ${c.icon
        ? `<div class="bigico" style="background:rgba(255,255,255,.12)"><img src="${esc(c.icon)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`
        : `<div class="bigico" style="background:${esc(c.c)}">${esc(c.t[0])}</div>`}
      <div class="dn">${esc(c.t)}</div>
      <div class="dc" onclick="toggleFav()" style="cursor:pointer">
        ${icon('star', { w: 12, cls: 'sfav' + (c.fav ? ' on' : '') })}
        <span>${c.fav ? '已收藏 · 列表置顶' : '点按收藏'}</span>
      </div>
    </div>

    <div class="group">
      <div class="drow"><span class="dk">分类</span><span class="dv">${esc(c.cat || '未分类')}</span></div>
      <div class="drow"><span class="dk">账号</span><span class="dv">${esc(c.user || c.s)}</span>
        <div class="cp" onclick="copyVal(${jsStr(c.user || c.s)},'账号')">${COPY}</div></div>
      <div class="drow"><span class="dk">密码</span><span class="dv mono" id="dPass">••••••••••</span>
        <div class="vi" onclick="togglePass()">${EYE}</div>
        <div class="cp" onclick="copyVal(${jsStr(c.pass || '')},'密码')">${COPY}</div></div>
      ${totpRow}
      <div class="drow"><span class="dk">网站</span><span class="dv sitelink" style="color:#64D2FF" onclick="openSite(${jsStr(c.site || '')})">${esc(c.site || '—')} <span class="out">↗</span></span>
        <div class="cp" onclick="copyVal(${jsStr(c.site || '')},'网站')">${COPY}</div></div>
    </div>

    <div class="dsec">备注</div>
    <div class="group">
      <div class="drow"><span class="dv" style="color:rgba(255,255,255,.75);white-space:normal">${esc(c.note || '无备注')}</span></div>
    </div>

    <div class="dsec">安全</div>
    <div class="group">
      <div class="drow" style="flex-direction:column;align-items:stretch;gap:9px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="dk">密码强度</span><span class="dv" style="color:${st.c};font-weight:600">${st.l} · ${st.t}</span>
        </div>
        <div class="sbar"><i style="width:${st.pct}%;background:${st.c};box-shadow:0 0 12px ${st.c}66"></i></div>
      </div>
      <div class="drow" onclick="showHistory()" style="cursor:pointer"><span class="dk">密码历史</span>
        <span class="dv" style="color:rgba(255,255,255,.5)">${hist.length} 条记录</span>
        <svg class="chev2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></div>
      <div class="drow"><span class="dk">创建时间</span><span class="dv" style="color:rgba(255,255,255,.5)">2025-11-02</span></div>
      <div class="drow"><span class="dk">最近修改</span><span class="dv" style="color:rgba(255,255,255,.5)">30 天前</span></div>
    </div>

    <div class="danger" onclick="delEntry()">${icon('trash-2', { w: 15 })}<span>删除此账号</span></div>
  `;
}

// 密码强度分级（对标桌面版 zxcvbn 的四档 + 破解时间）
function passStrength(p) {
  p = p || '';
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (p.length >= 16) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const T = [
    { l: '很弱', c: '#FF453A', t: '瞬间破解', pct: 14 },
    { l: '弱', c: '#FF9F0A', t: '几分钟破解', pct: 30 },
    { l: '中等', c: '#FFD60A', t: '约 3 年破解', pct: 52 },
    { l: '强', c: '#30D158', t: '约 3 世纪破解', pct: 74 },
    { l: '很强', c: '#30D158', t: '约 200 万年破解', pct: 88 },
    { l: '极强', c: '#0A84FF', t: '数万亿年破解', pct: 100 },
  ];
  const i = Math.min(Math.floor(s * 0.9), 5);
  return Object.assign({ score: s }, T[i]);
}

// 收藏切换（列表置顶）
function toggleFav() {
  const c = CARDS[currentIdx];
  c.fav = !c.fav;
  renderDetail(currentIdx);
  renderCards();
  if (typeof saveCardsData === 'function') saveCardsData();   // 详情页收藏落盘
  showToast(c.fav ? '已收藏 · 列表置顶' : '已取消收藏');
}

;
// 密码历史抽屉
function showHistory() {
  const c = CARDS[currentIdx];
  const hist = [];   // 演示历史数据已移除（开源清理）
  const box = document.getElementById('histList');
  if (!hist.length) {
    box.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.4);font-size:13px">暂无历史记录</div>';
  } else {
    box.innerHTML = hist.map((h, i) => `
      <div class="drow" style="${i ? 'border-top:0.5px solid rgba(255,255,255,.07)' : ''}">
        <span class="dv mono" style="font-size:13px;letter-spacing:1px">${esc(h.p)}</span>
        <span style="font-size:11px;color:rgba(255,255,255,.4);margin-left:auto">${esc(h.d)}</span>
        <div class="cp" onclick="copyVal(${jsStr(h.p)},'历史密码')">${COPY}</div>
      </div>`).join('');
  }
  document.getElementById('histSheet').classList.add('show');
}

function closeHistory() {
  document.getElementById('histSheet').classList.remove('show');
}

function togglePass() {
  const c = CARDS[currentIdx];
  const el = document.getElementById('dPass');
  if (!el) return;
  passShown = !passShown;
  el.textContent = passShown ? (c.pass || '—') : '••••••••••';
  el.style.color = passShown ? '#fff' : '';
  el.style.letterSpacing = passShown ? '1.5px' : '2px';
  const vi = el.parentElement.querySelector('.vi');
  if (vi) vi.innerHTML = passShown ? EYE_OFF : EYE;
}

// ===== 账号数据持久化（增删改立即落盘，刷新不丢）=====
let CARDS_LOADED = false;
function hasVaultBridge() {
  return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.vaultSave);
}
function saveCardsData() {
  const now = Date.now();
  try {
    localStorage.setItem('fvCards', JSON.stringify(CARDS));
    localStorage.setItem('fvTotp', JSON.stringify(TOTP_ITEMS));
    localStorage.setItem('fvCardsTs', String(now));   // 时间戳：与沙盒文件比较取新者
    if (wallCustomData) localStorage.setItem('fvWallCustom', wallCustomData);   // 自定义壁纸（小图能存则存）
  } catch (e) {}
  // 真机：同时写入沙盒文件（WKWebView localStorage 在 iOS 不稳定，文件最可靠）
  if (hasVaultBridge()) {
    try {
      window.webkit.messageHandlers.vaultSave.postMessage({
        data: JSON.stringify({ cards: CARDS, totp: TOTP_ITEMS, ts: Date.now(), wallCustom: wallCustomData, wallState: wallState }),
      });
    } catch (e) {}
  }
}
const FV_DATA_VER = 4;   // 数据版本：升级后旧缓存自动作废（防"删不掉/复活"类旧数据）
function resetCardsStorage() {
  try {
    localStorage.removeItem('fvCards');
    localStorage.removeItem('fvTotp');
    localStorage.removeItem('fvBankCards');
    localStorage.removeItem('fvBankSeed');
    localStorage.removeItem('fvGh');
    localStorage.removeItem('fvGhTokens');
    localStorage.setItem('fvDataVer', String(FV_DATA_VER));
  } catch (e) {}
  if (hasVaultBridge()) {
    try { window.webkit.messageHandlers.vaultSave.postMessage({ data: '' }); } catch (e) {}   // 清空沙盒文件
  }
}
function loadCardsData() {
  if (CARDS_LOADED) return;
  CARDS_LOADED = true;
  try {
    if (localStorage.getItem('fvDataVer') !== String(FV_DATA_VER)) { resetCardsStorage(); return; }
  } catch (e) {}
  try {
    const c = JSON.parse(localStorage.getItem('fvCards') || 'null');
    if (Array.isArray(c) && c.length && c[0] && c[0].t) { CARDS.length = 0; CARDS.push(...c); }
    const t = JSON.parse(localStorage.getItem('fvTotp') || 'null');
    if (Array.isArray(t) && t.length) { TOTP_ITEMS.length = 0; TOTP_ITEMS.push(...t); }
  } catch (e) {}
  // 数据落定后立即渲染（修复：重开软件列表空白，要切收藏/全部才刷新的问题）
  try {
    if (typeof renderCards === 'function') renderCards();
    if (typeof renderTOTP === 'function') renderTOTP();
    if (typeof renderChips === 'function') renderChips();
    if (typeof renderTags === 'function') renderTags();
  } catch (e) {}
  // 真机：从沙盒文件加载（权威数据，晚于 localStorage 到达则覆盖）
  if (hasVaultBridge()) {
    window.__fvVaultLoaded = (json) => {
      try {
        const d = JSON.parse(json || '{}');
        const localTs = parseInt(localStorage.getItem('fvCardsTs') || '0', 10) || 0;
        const fileTs = d.ts || 0;
        // 沙盒文件为权威（含空数组=用户删光了也要生效）；localStorage 明显更新时用本地
        const useFile = Array.isArray(d.cards) && (fileTs >= localTs || !localTs);
        if (useFile) {
          CARDS.length = 0; CARDS.push(...d.cards);
          TOTP_ITEMS.length = 0;
          TOTP_ITEMS.push(...(Array.isArray(d.totp) ? d.totp : []));
          if (d.wallState && d.wallState.type) {                // 壁纸类型随数据恢复
            wallState = d.wallState;
            try { localStorage.setItem('fvWallState', JSON.stringify(wallState)); } catch (e) {}
          }
          if (d.wallCustom) {
            wallCustomData = d.wallCustom;
            try { localStorage.setItem('fvWallCustom', wallCustomData); } catch (e) {}
          }
          restoreWall();                                        // 按记录的类型恢复（内置/自定义）
        }
        if (typeof renderCards === 'function') renderCards();
        if (typeof renderTOTP === 'function') renderTOTP();
      } catch (e) {}
    };
    try { window.webkit.messageHandlers.vaultLoad.postMessage(''); } catch (e) {}
  }
}
function delEntry() {
  if (currentIdx === null) return;
  const name = CARDS[currentIdx].t;
  CARDS.splice(currentIdx, 1);
  // 同步移除验证码页对应项
  const ti = (typeof TOTP_ITEMS !== 'undefined') ? TOTP_ITEMS.findIndex(x => x.t === name) : -1;
  if (ti >= 0) TOTP_ITEMS.splice(ti, 1);
  closeDetail();
  renderChips();
  renderCards();
  if (typeof renderTOTP === 'function') renderTOTP();
  saveCardsData();   // 立即落盘：刷新/重开不复活
  showToast('已删除「' + name + '」');
}

// ===== 新建 / 编辑 =====
let editIdx = null;
let edFav = false, edCat = '未分类', edIcon = null, edPassShown = false;

// 分类选项：与密码库顶部 chips / 标签页 同一数据源（动态）
function eCatList() {
  return ['未分类', ...new Set(CARDS.map(c => c.cat).filter(Boolean))];
}

function openEditor(idx) {
  editIdx = (idx === null || idx === undefined) ? null : idx;
  const isNew = editIdx === null;
  document.getElementById('editorTitle').textContent = isNew ? '新建账号' : '编辑账号';
  const f = (id) => document.getElementById(id);

  if (!isNew) {
    const c = CARDS[editIdx];
    f('fName').value = c.t; f('fUser').value = c.user || ''; f('fPass').value = c.pass || '';
    f('fSite').value = c.site || ''; f('fNote').value = c.note || '';
    f('fTotp').value = c.totp ? '（此账号已配置 2FA，密钥已加密保存）' : '';
    edFav = !!c.fav;
    edCat = c.cat || '未分类';
    edIcon = c.icon || null;
  } else {
    ['fName', 'fUser', 'fPass', 'fSite', 'fNote', 'fTotp'].forEach(id => f(id).value = '');
    edFav = false; edCat = '未分类'; edIcon = null;
  }
  edPassShown = false;
  f('fPass').type = 'password';
  document.getElementById('eEyeBtn').innerHTML = EYE;
  document.getElementById('eTotpHint').style.display = f('fTotp').value.trim() ? 'block' : 'none';
  renderEditor();
  updStrength();
  document.getElementById('editorScreen').classList.add('show');
}

function renderEditor() {
  const f = (id) => document.getElementById(id);
  // 分类（单选：与密码库 chips 同步）
  f('eCats').innerHTML = eCatList().map(c =>
    `<button class="chip2${c === edCat ? ' on' : ''}" onclick="pickCat(${jsStr(c)})">${esc(c)}</button>`).join('');
  // 图标预览
  const img = f('eIconImg'), ph = f('eIconPh');
  if (edIcon) { img.src = edIcon; img.style.display = 'block'; ph.style.display = 'none'; }
  else { img.style.display = 'none'; ph.style.display = 'block'; }
  // 收藏
  f('eFavBtn').classList.toggle('on', edFav);
  renderEdHist();
}

// —— 图标：本地图片上传（FileReader 实时预览） ——
function pickIcon() { document.getElementById('eIconFile').click(); }
function onIconPicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { edIcon = r.result; renderEditor(); showToast('图标已选择 · 保存后生效'); };
  r.readAsDataURL(file);
}

// —— 网站图标（跟随 PC 端逻辑：输入域名取 favicon） ——
function fetchFav() {
  const v = document.getElementById('fSite').value.trim();
  if (!v) { showToast('请先填写网站地址'); return; }
  const dom = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/\s]/)[0];
  edIcon = 'https://' + dom + '/favicon.ico';
  renderEditor();
  showToast('已获取网站图标：' + dom);
}

// —— 分类 ——
function pickCat(c) { edCat = c; renderEditor(); }

// —— 密码历史（编辑已有账号时显示） ——
function renderEdHist() {
  const wrap = document.getElementById('eHistWrap');
  if (editIdx === null) { wrap.style.display = 'none'; return; }
  const hist = [];   // 演示历史数据已移除（开源清理）
  wrap.style.display = hist.length ? 'block' : 'none';
  document.getElementById('eHist').innerHTML = hist.slice(0, 5).map(h => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:11.5px;color:rgba(255,255,255,.45)">
      <span style="font-family:monospace">••••${h.p.slice(-4)}</span>
      <span style="margin-left:auto;color:rgba(255,255,255,.3)">${h.d}</span>
    </div>`).join('');
}

// —— 密码显隐 / 实时强度 ——
function toggleEditPass() {
  edPassShown = !edPassShown;
  document.getElementById('fPass').type = edPassShown ? 'text' : 'password';
  document.getElementById('eEyeBtn').innerHTML = edPassShown ? EYE_OFF : EYE;
}
function updStrength() {
  const p = document.getElementById('fPass').value;
  const wrap = document.getElementById('eStrWrap');
  if (!p) { wrap.style.display = 'none'; return; }
  const st = passStrength(p);
  wrap.style.display = 'flex';
  const bar = document.getElementById('eStrBar');
  bar.style.width = st.pct + '%'; bar.style.background = st.c;
  const lb = document.getElementById('eStrLabel');
  lb.textContent = st.l + ' · ' + st.t; lb.style.color = st.c;
}

function closeEditor() {
  document.getElementById('editorScreen').classList.remove('show');
}

function saveEntry() {
  const f = (id) => document.getElementById(id).value.trim();
  const name = f('fName');
  if (!name) { showToast('请填写标题'); return; }
  const data = {
    t: name,
    s: (f('fUser') || name) + (f('fSite') ? ' · ' + f('fSite') : ''),
    user: f('fUser'), pass: f('fPass'), site: f('fSite'),
    cat: edCat, note: f('fNote'), fav: edFav,
    icon: edIcon || (f('fSite') ? 'https://icon.horse/icon/' + encodeURIComponent(String(f('fSite')).replace(/^https?:\/\//, '').split('/')[0]) : ''),
  };
  // TOTP 2FA 密钥解析：粘贴 otpauth:// URI 或纯密钥 → 生成验证码条目并关联本账号
  const totpRaw = String(f('fTotp') || '').trim();
  if (totpRaw && totpRaw.indexOf('此账号已配置') !== 0) {
    let secret = totpRaw, tlabel = data.t;
    const mURI = totpRaw.match(/otpauth:\/\/totp\/([^?]+)\?([^#\s]+)/i);
    if (mURI) {
      try { tlabel = decodeURIComponent(mURI[1]); } catch (e) {}
      const qs = mURI[2].split('&');
      for (const kv of qs) {
        const [k, v] = kv.split('=');
        if (k === 'secret') secret = decodeURIComponent(v || '');
      }
    }
    secret = String(secret).replace(/\s+/g, '').toUpperCase();
    if (secret) {
      const key = 'k' + Date.now().toString(36);
      TOTP_ITEMS.push({ key, t: data.t, s: secret, c: (COLORS || [])[CARDS.length % 8], cat: data.cat || '未分类', fav: false, offset: 0 });
      data.totp = key;
    }
  }
  if (editIdx === null) {
    data.c = COLORS[CARDS.length % COLORS.length];
    CARDS.push(data);
      saveCardsData();
  showToast('已创建「' + name + '」');
  } else {
    const old = CARDS[editIdx];
    // 编辑时若填了新 TOTP 密钥 → 关联新条目并移除旧的（否则旧条目变成孤儿留在验证码页）；
    // 没填新密钥 → 保持原关联不变
    if (data.totp && old.totp && old.totp !== data.totp) {
      const oi = TOTP_ITEMS.findIndex(x => x.key === old.totp);
      if (oi >= 0) TOTP_ITEMS.splice(oi, 1);
    }
    Object.assign(old, data, { c: old.c, totp: data.totp || old.totp });
      saveCardsData();
  showToast('已保存「' + name + '」');
  }
  closeEditor();
  renderChips(); renderCards(); renderTags();
  if (editIdx !== null && document.getElementById('detailScreen').classList.contains('show')) renderDetail(editIdx);
}

const COLORS = ['#FB7299', '#24292F', '#2A6DA5', '#1677FF', '#3D9BFF', '#30D158', '#BF5AF2', '#FF9F0A'];

// ===== 密码生成器 =====
let genVal = '';

function openGen() {
  genRun();
  document.getElementById('genOverlay').classList.add('show');
}

function closeGen() {
  document.getElementById('genOverlay').classList.remove('show');
}

function genRun() {
  const len = parseInt(document.getElementById('genRange').value) || 16;
  const up = document.getElementById('swUpper').classList.contains('on');
  const num = document.getElementById('swNum').classList.contains('on');
  const sym = document.getElementById('swSym').classList.contains('on');
  let chars = 'abcdefghijkmnpqrstuvwxyz';
  if (up) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (num) chars += '23456789';
  if (sym) chars += '!@#$%^&*-_+=?';
  genVal = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  document.getElementById('genCode').textContent = genVal;
}

function genUse() {
  document.getElementById('fPass').value = genVal;
  closeGen();
  if (typeof updStrength === 'function') updStrength();
  showToast('已填入生成的密码');
}

// ===== 壁纸切换 =====
const WALLPAPERS = [
  { n: 'BZ2', f: 'bz2.jpg' },
  { n: '黑色', f: 'black' },
];
let wallIdx = 0;

function cycleWall() {
  wallIdx = (wallIdx + 1) % WALLPAPERS.length;
  wallFancy(WALLPAPERS[wallIdx].f, WALLPAPERS[wallIdx].n);
}

// ===== 免验证时长页 =====
// 免验证功能已删除（2026-09 用户要求）

// ===== GitHub 备份页 =====
function openBackup() {
  const cfg = ghConfig();
  const tk = document.getElementById('ghToken');
  const ub = document.getElementById('ghUserBox'), rw = document.getElementById('ghRepoWrap');
  const m = document.getElementById('ghMsg'); if (m) m.textContent = '';
  window.__ghTmpToken = ''; window.__ghTmpUser = ''; window.__ghTmpRepo = cfg.repo || '';
  // 有保存的令牌 → 下拉默认选中该账号并填入；没有 → 留空
  ghRenderTokenSel(cfg.user);
  const list = ghTokenStore();
  const hit = list.findIndex(it => it.user === cfg.user && cfg.user);
  if (hit >= 0) {
    tk.value = list[hit].token;
    window.__ghTmpToken = list[hit].token;
    window.__ghTmpUser = list[hit].user;
    document.getElementById('ghUserName').textContent = '@' + list[hit].user;
    ub.style.display = '';
    rw.style.display = '';
    document.getElementById('ghRepoPicked').textContent = cfg.repo || '未选择';
    ghIdentify(true);
  } else {
    tk.value = '';
    ub.style.display = 'none'; rw.style.display = 'none';
  }
  document.getElementById('screenBackup').classList.add('show');
}
function closeBackup() {
  document.getElementById('screenBackup').classList.remove('show');
}
function ghConfig() {
  try { return JSON.parse(localStorage.getItem('fvGh') || '{}'); } catch (e) { return {}; }
}
function ghMsg(txt, color) {
  const m = document.getElementById('ghMsg');
  if (!m) return;
  m.style.color = color || '#FF6961';
  m.textContent = txt || '';
}
// ===== GitHub API 基础 =====
async function ghApi(path, opts) {
  const cfg = ghConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);   // 超时保护：弱网时不无限挂起
  try {
    const r = await fetch('https://api.github.com' + path, {
      method: (opts && opts.method) || 'GET',
      body: opts && opts.body,
      signal: ctrl.signal,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    return r;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时，请检查网络');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
// ===== 多令牌存储（下拉选择）=====
function ghTokenStore() {
  try {
    const v = JSON.parse(localStorage.getItem('fvGhTokens') || '[]');
    if (Array.isArray(v) && v.length) return v;
    // 兼容旧版单令牌配置：自动迁移进下拉库（只迁移一次，删除后不会复活）
    if (!localStorage.getItem('fvGhTokensMigrated')) {
      const old = JSON.parse(localStorage.getItem('fvGh') || '{}');
      if (old && old.token && old.user) {
        const one = [{ user: old.user, token: old.token, ts: '—' }];
        localStorage.setItem('fvGhTokens', JSON.stringify(one));
        localStorage.setItem('fvGhTokensMigrated', '1');
        return one;
      }
    }
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function ghSaveTokenStore(list) {
  try { localStorage.setItem('fvGhTokens', JSON.stringify(list)); } catch (e) {}
}
function ghRenderTokenSel(preferUser) {
  const lab = document.getElementById('ghTokenSelLabel');
  const menu = document.getElementById('ghTokenMenu');
  if (!lab || !menu) return;
  const list = ghTokenStore();
  const hit = list.find(x => x.user === preferUser);
  lab.textContent = hit ? '@' + hit.user + '（' + (hit.ts || '—') + '）' : '（不选择，手动输入）';
  let opts = `<div class="gs-opt${hit ? '' : ' on'}" onclick="ghPickToken(-1)">（不选择，手动输入）</div>`;
  list.forEach((it, i) => {
    const on = hit && it.user === hit.user ? ' on' : '';
    opts += `<div class="gs-opt${on}" onclick="ghPickToken(${i})">@${esc(it.user)}<span style="font-size:11px;color:rgba(255,255,255,.4)">${esc(it.ts || '—')}</span><span class="gs-del" onclick="event.stopPropagation();ghDelToken(${jsStr(it.user)})">✕ 删除</span></div>`;
  });
  menu.innerHTML = opts;
  menu.style.display = 'none';
}
function ghDelToken(user) {
  const list = ghTokenStore().filter(it => it.user !== user);
  ghSaveTokenStore(list);
  // 删的是当前使用的 → 清空输入、临时状态与旧配置（防止自动迁移复活）
  if (window.__ghTmpUser === user || ghConfig().user === user) {
    const tk = document.getElementById('ghToken');
    if (tk) tk.value = '';
    window.__ghTmpToken = ''; window.__ghTmpUser = '';
    try {
      const cfg = ghConfig();
      localStorage.setItem('fvGh', JSON.stringify({ repo: cfg.repo || '', token: '', user: '' }));
    } catch (e) {}
    ghRenderTokenSel(null);
    ghMsg('已删除 @' + user + ' 的令牌。若这是当前账号，请重新粘贴或选择其他账号');
  } else {
    ghRenderTokenSel(window.__ghTmpUser || ghConfig().user || null);
    ghMsg('已删除 @' + user + ' 的令牌');
  }
  showToast('已删除令牌：@' + user);
}
function ghToggleTokenMenu() {
  const menu = document.getElementById('ghTokenMenu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}
function ghPickToken(v) {
  const tk = document.getElementById('ghToken');
  const menu = document.getElementById('ghTokenMenu');
  if (menu) menu.style.display = 'none';
  if (v === -1) {
    tk.value = '';
    window.__ghTmpToken = ''; window.__ghTmpUser = ''; window.__ghTmpRepo = '';
    ghRenderTokenSel(null);   // 高亮移到「不选择」项
    // 收起账号/仓库区（手动输入还没识别，不该显示上次的仓库）
    const ub = document.getElementById('ghUserBox'), rw = document.getElementById('ghRepoWrap');
    if (ub) ub.style.display = 'none';
    if (rw) rw.style.display = 'none';
    const list = document.getElementById('ghRepoList');
    if (list) list.innerHTML = '';
    const picked = document.getElementById('ghRepoPicked');
    if (picked) picked.textContent = '未选择';
    ghMsg('已清空输入，可手动粘贴新令牌');
    return;
  }
  const it = ghTokenStore()[+v];
  if (!it) return;
  tk.value = it.token;                    // 自动填入
  window.__ghTmpToken = it.token;
  window.__ghTmpUser = it.user;
  ghRenderTokenSel(it.user);              // 高亮移到所选账号
  ghIdentify(true);                       // 自动识别
}
// ① 识别令牌：验证 + 列出仓库（真实 API）
let ghRepos = [];
async function ghIdentify(silent) {
  const token = document.getElementById('ghToken').value.trim();
  if (token.length < 20) { if (!silent) ghMsg('令牌看起来太短（应为 github_pat_ 开头）'); return; }
  // 先用新令牌试验证（可能还没保存）
  let r;
  try {
    r = await fetch('https://api.github.com/user', { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' } });
  } catch (e) { if (!silent) ghMsg('网络不通：' + e.message); return; }
  if (!r.ok) { if (!silent) ghMsg(r.status === 401 ? '令牌无效或已过期（401）' : '验证失败：HTTP ' + r.status); return; }
  const u = await r.json();
  // 令牌有效 → 暂存（用户点保存才正式存）
  window.__ghTmpToken = token;
  window.__ghTmpUser = u.login;
  document.getElementById('ghUserName').textContent = '@' + u.login;
  document.getElementById('ghUserBox').style.display = '';
  document.getElementById('ghRepoWrap').style.display = '';
  ghMsg('令牌有效 ✓ 正在列出仓库…', '#64D2FF');
  // ② 列仓库
  let rr;
  try {
    rr = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' } });
  } catch (e) { ghMsg('列仓库失败：' + e.message); return; }
  if (!rr.ok) { ghMsg('列仓库失败：HTTP ' + rr.status); return; }
  ghRepos = await rr.json();
  ghRenderRepos();
  ghMsg('识别成功：共 ' + ghRepos.length + ' 个仓库，点击选择', '#30D158');
}
function ghRenderRepos() {
  const box = document.getElementById('ghRepoList');
  const cur = window.__ghTmpRepo || ghConfig().repo || '';
  if (!ghRepos.length) { box.innerHTML = '<div class="drow"><span class="dv" style="color:rgba(255,255,255,.5)">没有仓库（可点下方新建）</span></div>'; return; }
  box.innerHTML = ghRepos.map(rp => {
    const sel = ('/' + rp.full_name) === ('/' + cur) || rp.full_name === cur;
    return `<div class="drow" onclick="ghSelectRepo(${jsStr(rp.full_name)})" style="cursor:pointer">
      <span class="dv"><b>${esc(rp.full_name)}</b>${rp.private ? ' <span style="font-size:10.5px;color:#FFD60A">私有</span>' : ''}</span>
      ${sel ? '<svg viewBox="0 0 24 24" style="width:17px;height:17px;stroke:#64D2FF;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12.8l4.3 4.2L19 7.6"/></svg>' : ''}
    </div>`;
  }).join('');
}
function ghSelectRepo(full) {
  window.__ghTmpRepo = full;
  document.getElementById('ghRepoPicked').textContent = full;
  ghRenderRepos();
  ghMsg('已选择 ' + full + '，点「保存配置」生效', '#64D2FF');
}
// ③ 新建私有仓库
async function ghCreateRepo() {
  const token = window.__ghTmpToken || document.getElementById('ghToken').value.trim();
  if (token.length < 20) { ghMsg('请先识别令牌'); return; }
  ghMsg('正在创建 fallvault-backup…', '#64D2FF');
  let r;
  try {
    r = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({ name: 'fallvault-backup', private: true, description: 'FallVault 加密备份（仅存 .fvault）', auto_init: true }),
    });
  } catch (e) { ghMsg('创建失败：' + e.message); return; }
  if (r.status === 422) { ghMsg('仓库 fallvault-backup 已存在，请从列表中选择', '#FFD60A'); ghIdentify(true); return; }
  if (!r.ok) { ghMsg('创建失败：HTTP ' + r.status); return; }
  const repo = await r.json();
  ghMsg('已创建 ' + repo.full_name + ' ✓', '#30D158');
  await ghIdentify(true);
  ghSelectRepo(repo.full_name);
}
// ④ 保存配置（令牌 + 仓库，只存本机）
function saveGhConfig() {
  const token = window.__ghTmpToken || document.getElementById('ghToken').value.trim();
  const user = window.__ghTmpUser || '';
  const repo = window.__ghTmpRepo || ghConfig().repo || '';
  if (token.length < 20) { ghMsg('请先点「识别令牌」验证令牌'); return; }
  if (!repo) { ghMsg('请先选择或新建一个仓库'); return; }
  if (!user) { ghMsg('账号信息缺失，请重新识别令牌'); return; }
  try { localStorage.setItem('fvGh', JSON.stringify({ repo: repo, token: token, user: user })); } catch (e) {}
  // 令牌加入下拉库（同 user 更新，新 user 追加）
  const list = ghTokenStore();
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const ts = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const idx = list.findIndex(it => it.user === user);
  if (idx >= 0) list[idx] = { user: user, token: token, ts: ts };
  else list.push({ user: user, token: token, ts: ts });
  ghSaveTokenStore(list);
  ghRenderTokenSel(user);
  ghMsg('配置已保存 ✓（令牌仅存本机，不会上传）', '#30D158');
  showToast('GitHub 配置已保存：' + repo);
}
// 自绘密码输入弹层（WKWebView 里原生 prompt/confirm 不弹）
function fvPrompt(title, cb) {
  const old = document.getElementById('fvPromptBox');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'fvPromptBox';
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);';
  box.innerHTML = `<div style="width:80%;background:#1c1e28;border-radius:18px;padding:20px 18px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08)">
    <div style="font-size:14.5px;font-weight:700;margin-bottom:12px">${title}</div>
    <input id="fvPromptInput" type="password" autocomplete="one-time-code" inputmode="numeric" style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-size:16px;outline:none" placeholder="备份密码">
    <div style="display:flex;gap:10px;margin-top:16px">
      <button id="fvP1" style="flex:1;padding:11px 0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:14px;border:0">取消</button>
      <button id="fvP2" style="flex:1;padding:11px 0;border-radius:12px;background:linear-gradient(135deg,#64D2FF,#0A84FF);color:#fff;font-size:14px;font-weight:700;border:0">确定</button>
    </div></div>`;
  document.body.appendChild(box);
  const inp = box.querySelector('#fvPromptInput');
  setTimeout(() => inp && inp.focus(), 60);
  box.querySelector('#fvP1').onclick = () => { box.remove(); cb(null); };
  box.querySelector('#fvP2').onclick = () => { const v = inp.value.trim(); box.remove(); cb(v || null); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = inp.value.trim(); box.remove(); cb(v || null); } });
}
// ============================================================
// 加密层：与 Windows 端 FallVault 完全互通（信封加密，同参数）
//   salt(16) + PBKDF2-150k-SHA256 → receiver key
//   随机 dataKey AES-256-GCM 加密 payload；dataKey 用 receiver key 包裹存头部
// ============================================================
function fvB64enc(u8) {
  let bin = ''; const c = 0x8000;
  for (let i = 0; i < u8.length; i += c) bin += String.fromCharCode.apply(null, u8.subarray(i, i + c));
  return btoa(bin);
}
function fvB64dec(b64) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function fvDeriveKey(pw, salt) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
function fvRand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
async function fvAesEnc(key, pt) {
  const iv = fvRand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, pt);
  return { iv: fvB64enc(iv), ct: fvB64enc(new Uint8Array(ct)) };
}
async function fvAesDec(key, iv64, ct64) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fvB64dec(iv64) }, key, fvB64dec(ct64)));
}
// 信封加密（Windows FallVault 同款 .fvault 格式）
async function fvEnvelopeEncrypt(pw, dataObj, created) {
  const salt = fvRand(16);
  const receiverKey = await fvDeriveKey(pw, salt);
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const dataKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
  const wrapped = await fvAesEnc(receiverKey, dataKeyRaw);
  const body = await fvAesEnc(dataKey, new TextEncoder().encode(JSON.stringify(dataObj)));
  return JSON.stringify({
    fvault: 1,
    salt: fvB64enc(salt),
    wrapped_iv: wrapped.iv,
    wrapped_ct: wrapped.ct,
    body_iv: body.iv,
    body_ct: body.ct,
    created: created || new Date().toISOString(),
  });
}
// 信封解密
async function fvEnvelopeDecrypt(pw, text) {
  const header = JSON.parse(text);
  if (!header.fvault || !header.salt || !header.wrapped_iv || !header.wrapped_ct || !header.body_iv || !header.body_ct) {
    throw new Error('备份文件格式不正确');
  }
  const receiverKey = await fvDeriveKey(pw, fvB64dec(header.salt));
  let dataKeyRaw;
  try { dataKeyRaw = await fvAesDec(receiverKey, header.wrapped_iv, header.wrapped_ct); }
  catch (e) { throw new Error('备份密码错误'); }
  const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  let dataBytes;
  try { dataBytes = await fvAesDec(dataKey, header.body_iv, header.body_ct); }
  catch (e) { throw new Error('备份数据损坏或密码错误'); }
  return JSON.parse(new TextDecoder().decode(dataBytes));
}
// ---- 兼容：旧的 iOS 直解格式（早期版本导出的文件仍可恢复）----
async function fvEncryptJSON(pw, obj) {
  const salt = fvRand(16); const iv = fvRand(12);
  const key = await fvDeriveKey(pw, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({ v: 1, kdf: 'PBKDF2-150k-SHA256', cipher: 'AES-256-GCM', salt: fvB64enc(salt), iv: fvB64enc(iv), ct: fvB64enc(new Uint8Array(ct)) });
}
async function fvDecryptJSON(pw, text) {
  const box = JSON.parse(text);
  const key = await fvDeriveKey(pw, fvB64dec(box.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fvB64dec(box.iv) }, key, fvB64dec(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
// ---- 数据映射：iOS 结构 ↔ Windows FallVault 结构 ----
function iosToPc(payload) {
  const totpMap = {};
  (payload.totp || []).forEach(tp => { totpMap[tp.key || tp.t] = tp.secret || tp.s || ''; });
  const dynTags = (payload.tags || []).filter(x => x && !x.fixed);
  return {
    app: 'FallVault',
    version: '1.1.9',
    exportedAt: new Date().toISOString(),
    folders: [],
    tags: dynTags.map((x, i) => ({ id: i + 1, name: x.name || String(i), color: x.color || '#7DD3C0' })),
    entries: (payload.cards || []).map((c, i) => ({
      id: i + 1,
      title: c.t || '',
      username: c.user || '',
      password: c.pass || '',
      website: c.site || '',
      notes: c.note || '',
      totp_secret: totpMap[c.totp] || '',
      icon: (c.icon && /^(https?:|data:|\/)/.test(c.icon)) ? c.icon : '',   // 卡片图标是 URL，原样带回（否则往返后图标全没）
      folder_id: null,
      is_favorite: !!c.fav,
      created_at: '',
      updated_at: '',
      tag_ids: [],
      attachments: undefined,
    })),
    // iOS 专属：银行卡随备份一起交给桌面版保管（桌面版不显示，但会原样透传回来）
    bankCards: (payload.bankCards || []),
  };
}
function pcToIos(pc) {
  const cards = (pc.entries || []).map((e, i) => ({
    t: e.title || ('账号' + (i + 1)),
    s: ((e.username || '') + (e.website ? ' · ' + e.website : '')).trim() || e.title || '',
    c: '#7DD3C0',
    totp: e.totp_secret ? 'k' + i : '',
    user: e.username || '',
    pass: e.password || '',
    site: e.website || '',
    note: e.notes || '',
    cat: '',
    fav: !!e.is_favorite,
    tags: [],
    icon: (e.icon && /^(https?:|data:|\/)/.test(e.icon)) ? e.icon : '',   // 恢复默认图标（不自动获取 favicon）
  }));
  const totp = [];
  (pc.entries || []).forEach((e, i) => {
    if (e.totp_secret) totp.push({
      key: 'k' + i,
      t: e.title || '验证码' + (i + 1),
      s: e.totp_secret,
      c: '#7DD3C0',
      cat: '', fav: false, offset: 0, code: '', lastCycle: -1,
    });
  });
  // 标签映射：PC tags → iOS 动态标签
  const dynTags = (pc.tags || []).map((tg, i) => ({ id: 't' + (i + 1), name: tg.name || String(i + 1), color: tg.color || '#7DD3C0' }));
  const tagNameById = {};
  (pc.tags || []).forEach((tg) => { if (tg && tg.id != null) tagNameById[tg.id] = tg.name; });
  // 关联：entries.tag_ids → cards.tags（名称数组）
  (pc.entries || []).forEach((e, i) => {
    if (cards[i] && Array.isArray(e.tag_ids)) {
      cards[i].tags = e.tag_ids.map(tid => tagNameById[tid]).filter(Boolean);
      if (cards[i].tags.length && !cards[i].cat) cards[i].cat = cards[i].tags[0];
    }
  });
  const out = { cards, totp, tags: dynTags };
  if (pc.bankCards && Array.isArray(pc.bankCards)) out.bankCards = pc.bankCards;   // iOS 卡透传（PC 忽略）
  return out;
}

// ⑤ 立即备份：本地加密 → 上传 .fvault（只传密文）
let backing = false;
function doBackup() {
  if (backing) return;
  const cfg = ghConfig();
  if (!cfg.repo || !cfg.token) { showToast('请先识别令牌、选仓库并保存配置'); return; }
  fvPrompt('输入备份密码（≥4 位，用于加密，忘记无法恢复）', (pw) => {
    if (!pw || pw.length < 4) { showToast('已取消（密码至少 4 位）'); return; }
    doBackupRun(pw);
  });
}
async function doBackupRun(pw) {
  const cfg = ghConfig();
  const info = document.getElementById('lastBackupInfo');
  backing = true;
  info.textContent = '正在加密…'; info.style.color = '#64D2FF';
  try {
    const payload = buildBackupPayload();
    const pcData = iosToPc(payload);
    const cipher = await fvEnvelopeEncrypt(pw, pcData);
    info.textContent = '正在上传 .fvault…';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fname = 'fallvault-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + '.fvault';
    const apiPath = '/repos/' + cfg.repo + '/contents/' + fname;
    let sha = null;
    const g = await ghApi(apiPath);
    if (g.ok) { const j = await g.json(); sha = j.sha; }
    const body = { message: 'FallVault 备份 ' + new Date().toISOString().slice(0, 16), content: fvB64enc(new TextEncoder().encode(cipher)) };
    if (sha) body.sha = sha;
    const r = await ghApi(apiPath, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.text(); info.textContent = '上传失败'; info.style.color = '#FF6961'; ghMsg('备份失败：HTTP ' + r.status + ' ' + e.slice(0, 80)); backing = false; return; }
    // ② 同步维护 Markdown 说明文档（不碰仓库已有的 README.md）
    info.textContent = '正在更新说明文档…';
    try { await ghUploadBackupDoc(payload, fname); } catch (e) {}
    try {
      const r = await ghEnsureReadme(payload);   // 首次备份自动建 README（展示在仓库主页）
      if (r === false) { }   // 用户自建 README：跳过
    } catch (e) {}
    info.textContent = '刚刚'; info.style.color = '#30D158';
    markBackedUp();
    showToast('已备份：' + fname + ' ✓');
  } catch (e) {
    info.textContent = '失败'; info.style.color = '#FF6961';
    ghMsg('备份异常：' + e.message);
  }
  backing = false;
}
// 仓库根 README.md：首次备份时创建（让仓库主页展示备份说明），
// 已是 FallVault 生成的 README → 每次备份更新为最新；用户自建的 README → 绝不覆盖
async function ghEnsureReadme(payload) {
  const cfg = ghConfig();
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const md = [
    '# FallVault 加密备份仓库',
    '',
    '> 本仓库由 **FallVault（iOS）** 自动维护，只存放**加密后**的备份文件（.fvault），不含任何明文数据。',
    '',
    '## 最近一次备份',
    '',
    '| 项目 | 内容 |',
    '|---|---|',
    '| 备份时间 | ' + stamp + ' |',
    '| 密码条目 | ' + (payload.cards || []).length + ' 条 |',
    '| 验证码条目 | ' + (payload.totp || []).length + ' 条 |',
    '| 银行卡 | ' + (payload.bankCards || []).length + ' 张 |',
    '| 数据文件 | `fallvault-*.fvault`（每次备份一份，历史保留） |',
    '',
    '## 加密说明',
    '',
    '- **AES-256-GCM**，密钥由 PBKDF2-SHA256（150,000 次迭代）从备份密码派生',
    '- 备份密码只存在于你的设备，忘记无法恢复；主密码不会离开设备',
    '',
    '## 如何恢复',
    '',
    '1. FallVault（iOS）→ 设置 → **GitHub 云备份**',
    '2. 识别令牌 → 选择本仓库',
    '3. 点「**从云端恢复**」→ 在列表中选择要恢复的备份文件 → 输入备份密码',
    '',
    '---',
    '',
    '*README 由 FallVault 自动维护；详细信息见 `FallVault_Backup.md`。如有你自己的 README 需求，请先删除本文件（App 会尊重你的自定义内容不覆盖）。*',
    '',
  ].join('\n');
  const apiPath = '/repos/' + cfg.repo + '/contents/README.md';
  const g = await ghApi(apiPath);
  if (g.status === 404) {
    // 没有 README → 创建（之后归我们维护）
    const body = { message: 'init readme ' + stamp, content: fvB64enc(new TextEncoder().encode(md)) };
    const r = await ghApi(apiPath, { method: 'PUT', body: JSON.stringify(body) });
    return r.ok;
  }
  if (g.ok) {
    // README 已存在：判断是否我们生成的（内容含特征标记）→ 是则更新，否则跳过
    let txt = '';
    try {
      const j = await g.json();
      txt = new TextDecoder().decode(fvB64dec((j.content || '').replace(/\n/g, '')));
    } catch (e) {}
    if (txt.indexOf('FallVault 加密备份仓库') >= 0) {
      const j2 = await g.json();
      const body = { message: 'update readme ' + stamp, content: fvB64enc(new TextEncoder().encode(md)), sha: j2.sha };
      const r = await ghApi(apiPath, { method: 'PUT', body: JSON.stringify(body) });
      return r.ok;
    }
    return false;   // 用户自建 README → 不动
  }
  return false;
}
// 维护仓库内的 Markdown 说明文档（FallVault_Backup.md，不覆盖任何 README.md）
async function ghUploadBackupDoc(payload, fname) {
  const cfg = ghConfig();
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const md = [
    '# FallVault 备份说明',
    '',
    '> 本文件由 **FallVault（iOS）** 备份时自动更新。仓库中只存放**加密后**的备份，不含任何明文数据。',
    '',
    '## 最近一次备份',
    '',
    '| 项目 | 内容 |',
    '|---|---|',
    '| 备份时间 | ' + stamp + ' |',
    '| 来源设备 | iPhone（iOS App） |',
    '| 密码条目 | ' + (payload.cards || []).length + ' 条 |',
    '| 验证码条目 | ' + (payload.totp || []).length + ' 条 |',
    '| 银行卡 | ' + ((payload.bankCards || []).length) + ' 张 |',
    '| 标签 | ' + (payload.tags || []).length + ' 个 |',
    '| 本次备份文件 | `' + fname + '` |',
    '',
    '## 加密说明',
    '',
    '- 算法：**AES-256-GCM**，密钥由 **PBKDF2-SHA256（150,000 次迭代）** 从备份密码派生',
    '- 备份密码只存在于你的设备上，**忘记无法恢复**',
    '- **主密码不会以任何形式离开设备**，仓库内也不含任何明文',
    '',
    '## 如何恢复',
    '',
    '1. 安装 FallVault（iOS）并打开',
    '2. 设置 → **GitHub 云备份** → 粘贴令牌 → **识别令牌**',
    '3. 选择本仓库 → 点「**从云端恢复**」，输入备份密码即可还原',
    '',
    '---',
    '',
    '*每次备份都会生成带时间戳的 .fvault 文件（历史版本均保留，可从 App「从云端恢复」列表中选择）。此文档自动更新。*',
    '',
  ].join('\n');
  const apiPath = '/repos/' + cfg.repo + '/contents/FallVault_Backup.md';
  let sha = null;
  const g = await ghApi(apiPath);
  if (g.ok) { const j = await g.json(); sha = j.sha; }
  const body = { message: 'update backup doc ' + stamp, content: fvB64enc(new TextEncoder().encode(md)) };
  if (sha) body.sha = sha;
  await ghApi(apiPath, { method: 'PUT', body: JSON.stringify(body) });
}
// ⑥ 从云端恢复
function restoreFromGh() {
  const cfg = ghConfig();
  if (!cfg.repo || !cfg.token) { showToast('请先识别令牌、选仓库并保存配置'); return; }
  ghListVaults().then((list) => {
    if (!list) return;
    if (!list.length) { ghMsg('仓库里没有 .fvault 备份文件'); return; }
    fvPickVault(list, (picked) => {
      if (!picked) return;
      fvPrompt('输入备份密码（解密选定备份）', (pw) => { if (pw) restoreFromGhRun(pw, picked); });
    });
  });
}
async function ghListVaults() {
  const cfg = ghConfig();
  try {
    const r = await ghApi('/repos/' + cfg.repo + '/contents/');
    if (!r.ok) { ghMsg('读取失败：HTTP ' + r.status); return null; }
    const items = await r.json();
    return (Array.isArray(items) ? items : []).filter(x => x.type === 'file' && /^fallvault.*\.fvault$/i.test(x.name))
      .sort((a, b) =>
        a.name === 'fallvault.fvault' ? -1 :
        b.name === 'fallvault.fvault' ? 1 :
        (a.name < b.name ? 1 : -1));   // 主文件（最新备份）恒排第一，历史文件按名字倒序
  } catch (e) { ghMsg('列文件失败：' + e.message); return null; }
}
// 自绘选择列表弹层
function fvPickVault(list, cb) {
  const old = document.getElementById('fvPickBox');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'fvPickBox';
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);';
  const rows = list.map((f, i) =>
    `<div id="fvp${i}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.05);margin-bottom:7px;cursor:pointer">
      <span style="font-size:13px;color:#fff">${f.name}</span>
      <span style="font-size:11px;color:rgba(255,255,255,.45)">${(f.size / 1024).toFixed(1)} KB</span>
    </div>`).join('');
  box.innerHTML = `<div style="width:84%;background:#1c1e28;border-radius:18px;padding:18px 16px;box-shadow:0 18px 50px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08)">
    <div style="font-size:14.5px;font-weight:700;text-align:center;margin-bottom:12px">选择要恢复的备份（${list.length} 份）</div>
    <div style="max-height:300px;overflow-y:auto">${rows}</div>
    <div style="margin-top:12px"><button id="fvpC" style="width:100%;padding:11px 0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:14px;border:0">取消</button></div>
  </div>`;
  document.body.appendChild(box);
  list.forEach((f, i) => {
    box.querySelector('#fvp' + i).onclick = () => { box.remove(); cb(f); };
  });
  box.querySelector('#fvpC').onclick = () => { box.remove(); cb(null); };
}
async function restoreFromGhRun(pw, picked) {
  const cfg = ghConfig();
  showToast('正在下载…');
  try {
    const fileName = (picked && picked.name) || 'fallvault.fvault';
    const r = await ghApi('/repos/' + cfg.repo + '/contents/' + fileName);
    if (!r.ok) { ghMsg('恢复失败：HTTP ' + r.status + (r.status === 404 ? '（云端还没有备份）' : '')); return; }
    const j = await r.json();
    const text = new TextDecoder().decode(fvB64dec(j.content.replace(/\n/g, '')));
    const parsed = JSON.parse(text);
    let iData;
    if (parsed && parsed.fvault === 1) {
      const pc = await fvEnvelopeDecrypt(pw, text);
      iData = pcToIos(pc);   // 含 bankCards：从 PC 备份恢复时把 iOS 卡片带回来
    } else {
      iData = await fvDecryptJSON(pw, text);
    }
    const stat = applyBackupData(iData);
    ghMsg('恢复完成（' + fileName + '）：' + stat, '#30D158');
    showToast('已恢复：' + fileName);
  } catch (e) {
    ghMsg('恢复失败：密码错误或文件损坏（' + e.message + '）');
  }
}


// ===== 锁定应用 =====
function lockNow() {
  relockApp();
  closeDetail(); closeEditor();
  showToast('已锁定');
}

// ===== 修改主密码 =====
function openChpw() {
  ['chpwOld', 'chpwNew', 'chpwNew2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const m = document.getElementById('chpwMsg'); if (m) m.textContent = '';
  document.getElementById('screenChpw').classList.add('show');
}
function closeChpw() { document.getElementById('screenChpw').classList.remove('show'); }
function saveChpw() {
  const oldP = document.getElementById('chpwOld').value;
  const p1 = document.getElementById('chpwNew').value.trim();
  const p2 = document.getElementById('chpwNew2').value.trim();
  const m = document.getElementById('chpwMsg');
  if (weakHash(oldP) !== fvPwHash) { m.style.color = '#FF6961'; m.textContent = '当前主密码不正确'; return; }
  if (p1.length < 4) { m.style.color = '#FF6961'; m.textContent = '新主密码至少 4 位'; return; }
  if (p1 !== p2) { m.style.color = '#FF6961'; m.textContent = '两次输入的新密码不一致'; return; }
  fvPwHash = weakHash(p1); fvPwSet = true; saveDemo();
  m.style.color = '#30D158'; m.textContent = '主密码已更新 ✓';
  showToast('主密码已更新');
  setTimeout(closeChpw, 800);
}

// ===== 加密备份（导出 .fvault）=====
// ===== 备份数据统一构建 / 应用（本地导出 与 GitHub 云备份共用同一格式）=====
function buildBackupPayload() {
  return {
    v: 1, ts: Date.now(), platform: 'ios',
    cards: CARDS,
    totp: TOTP_ITEMS.map(t => ({ key: t.key, t: t.t, s: t.s, cat: t.cat, fav: t.fav })),   // key 必须带：导出时靠它关联卡片，否则验证码密钥全丢
    tags: TAGS,
    bankCards: (typeof BANK_CARDS !== 'undefined' ? BANK_CARDS : []),
  };
}
function applyBackupData(data) {
  // 合并去重（与桌面版行为一致）：恢复第二个备份是「追加」，不是覆盖。
  // 桌面版恢复用明文字段比对去重；这里同样用明文比较，重复条目跳过。
  let addedCards = 0, skippedCards = 0, addedTotp = 0, skippedTotp = 0, addedBank = 0, skippedBank = 0;

  if (data.cards && Array.isArray(data.cards)) {
    data.cards.forEach(c => {
      const dup = CARDS.some(x =>
        (x.t || '') === (c.t || '') && (x.user || '') === (c.user || '') &&
        (x.pass || '') === (c.pass || '') && (x.site || '') === (c.site || ''));
      if (dup) { skippedCards++; return; }
      CARDS.push(c); addedCards++;
    });
  }

  if (data.totp && Array.isArray(data.totp)) {
    data.totp.forEach(t => {
      const dup = TOTP_ITEMS.some(x => (x.t || '') === (t.t || '') && (x.s || '') === (t.s || ''));
      if (dup) { skippedTotp++; return; }
      TOTP_ITEMS.push(t); addedTotp++;
    });
  }

  // 标签：按名称合并（固定标签 全部/收藏 始终保留在最前）
  if (!TAGS.some(x => x.id === 'all')) TAGS.unshift({ id: 'all', name: '全部', icon: '', fixed: true });
  if (!TAGS.some(x => x.id === 'fav')) TAGS.splice(1, 0, { id: 'fav', name: '收藏', icon: '', fixed: true });
  if (data.tags && Array.isArray(data.tags)) {
    data.tags.forEach(tg => {
      if (!tg || !tg.name) return;
      if (TAGS.some(x => x.name === tg.name)) return;   // 同名标签不重复添加
      TAGS.push(tg);
    });
  }

  // 银行卡：按卡号 + 组织去重
  if (data.bankCards && typeof BANK_CARDS !== 'undefined' && Array.isArray(data.bankCards)) {
    data.bankCards.forEach(bc => {
      const dup = BANK_CARDS.some(x => (x.num || '') === (bc.num || '') && (x.org || '') === (bc.org || ''));
      if (dup) { skippedBank++; return; }
      BANK_CARDS.push(bc); addedBank++;
    });
    try { saveBankCards(); } catch (e) {}
  }

  saveCardsData();   // 双保险：localStorage + 沙盒文件桥（iOS localStorage 不可靠，重开不丢）
  try { if (typeof saveTags === 'function') saveTags(); else localStorage.setItem('fvTags', JSON.stringify(TAGS)); } catch (e) {}
  // 渲染放空闲期执行（不阻塞恢复完成时的手指交互——数据多时 renderCards/FLIP 同步跑会卡住点击）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof renderCards === 'function') renderCards(true);
      if (typeof renderTOTP === 'function') renderTOTP();
      if (typeof renderTags === 'function') renderTags();
      if (typeof renderChips === 'function') renderChips();
      if (typeof renderBankGallery === 'function') renderBankGallery();
    });
  });
  // 恢复后强制回到密码库视图，确保用户直接看到数据
  try { switchVault('pw'); closeDetail(); closeRestore(); } catch (e) {}

  let msg = '新增 ' + addedCards + ' 条密码 / ' + addedTotp + ' 条验证码 / ' + addedBank + ' 张银行卡';
  const skippedTotal = skippedCards + skippedTotp + skippedBank;
  if (skippedTotal > 0) msg += '（跳过 ' + skippedTotal + ' 条已存在）';
  return msg;
}
function openExport() {
  document.getElementById('exportCount').textContent = CARDS.length + ' 条';
  document.getElementById('exportTotp').textContent = TOTP_ITEMS.length + ' 条';
  const m = document.getElementById('exportMsg'); if (m) m.textContent = '';
  document.getElementById('screenExport').classList.add('show');
}
function closeExport() { document.getElementById('screenExport').classList.remove('show'); }
function doExport() {
  const p1 = document.getElementById('exportPw').value.trim();
  const p2 = document.getElementById('exportPw2').value.trim();
  const m = document.getElementById('exportMsg');
  if (p1.length < 4) { m.style.color = '#FF6961'; m.textContent = '备份密码至少 4 位'; return; }
  if (p1 !== p2) { m.style.color = '#FF6961'; m.textContent = '两次输入的备份密码不一致'; return; }
  m.style.color = '#64D2FF'; m.textContent = '正在加密（AES-256-GCM）…';
  setTimeout(async () => {
    try {
      const pcData = iosToPc(buildBackupPayload());                  // 转 PC 结构
      const enc = await fvEnvelopeEncrypt(p1, pcData);               // 信封加密（与 Windows 端互通的 .fvault 格式）
      const fname = 'FallVault_' + new Date().toISOString().slice(0, 10) + '.fvault';
      const done = () => {
        m.style.color = '#30D158'; m.textContent = '已保存 ✓（AES-256-GCM 加密）';
        const eh = document.getElementById('exportHint'); if (eh) eh.textContent = '刚刚导出';
        try { markBackedUp(); } catch (e) {}
        showToast('加密备份已导出');
      };
      // ① iOS App：系统「文件」App 选保存位置
      if (nativeSave(fname, enc, 'application/octet-stream')) { done(); return; }
      // ② 桌面：另存为
      const blob = new Blob([enc], { type: 'application/octet-stream' });
      if (window.showSaveFilePicker) {
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('picker-timeout')), 12000));
        try {
          const handle = await Promise.race([
            window.showSaveFilePicker({
              suggestedName: fname,
              types: [{ description: 'FallVault 加密备份', accept: { 'application/octet-stream': ['.fvault'] } }],
            }),
            timeout,
          ]);
          const w = await handle.createWritable();
          await w.write(blob); await w.close();
          done(); return;
        } catch (e) {
          if (e && e.name === 'AbortError') { m.style.color = '#FF9F0A'; m.textContent = '已取消保存'; return; }
          if (e && e.message === 'picker-timeout') { /* 选择器没弹出来 → 走下方回退下载 */ }
          else { /* 其他异常 → 也走回退 */ }
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      done();
    } catch (e) {
      m.style.color = '#FF6961'; m.textContent = '导出失败：' + e.message;
    }
  }, 400);
}

// ===== 恢复备份 =====
let restoreFileObj = null;
function openRestore() {
  restoreFileObj = null;
  document.getElementById('restoreFile').textContent = '选择 .fvault';
  document.getElementById('restorePw').value = '';
  const m = document.getElementById('restoreMsg'); if (m) m.textContent = '';
  document.getElementById('screenRestore').classList.add('show');
}
function closeRestore() { document.getElementById('screenRestore').classList.remove('show'); }
function pickRestoreFile() {
  // ① 直接用系统文件选择器：WKWebView 原生支持 file input（弹 iOS「文件」选择器，无需桥）
  const inp = document.getElementById('restoreInput');
  if (inp) {
    try { inp.click(); return; } catch (e) {}
  }
  // ② 桌面新版 File System Access API（WebView2/Edge 直接弹文件选择器，可选任意文件）
  if (window.showOpenFilePicker) {
    window.showOpenFilePicker({
      types: [{ description: 'FallVault 备份', accept: { 'application/octet-stream': ['.fvault'] } }],
    }).then(async (handles) => {
      if (handles && handles[0]) {
        const f = await handles[0].getFile();
        onRestoreFile({ files: [f] });
      }
    }).catch((e) => {
      if (!(e && e.name === 'AbortError')) showToast('未选择文件');
    });
    return;
  }
  // ③ 最后兜底：再点一次 input
  const inp3 = document.getElementById('restoreInput');
  if (inp3) {
    try { inp3.click(); }
    catch (e) { showToast('无法打开文件选择器，请重试'); }
  }
}
function onRestoreFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  restoreFileObj = f;
  document.getElementById('restoreFile').textContent = f.name;
}
// 原生「文件」App 选完 → Swift 回传内容
function onRestoreContent(name, text) {
  restoreFileObj = { name: name, text: text };
  const kb = Math.max(1, Math.round((text || '').length / 1024));
  document.getElementById('restoreFile').textContent = name + '（已读取约 ' + kb + ' KB）';
  showToast('已选择：' + name);
}
function doRestore() {
  const m = document.getElementById('restoreMsg');
  const pw = document.getElementById('restorePw').value.trim();
  if (!restoreFileObj) { m.style.color = '#FF6961'; m.textContent = '请先选择 .fvault 文件'; return; }
  if (pw.length < 4) { m.style.color = '#FF6961'; m.textContent = '请输入备份密码'; return; }
  m.style.color = '#64D2FF'; m.textContent = '正在解密并恢复…';
  (async () => {
    try {
      let text = '';
      if (typeof restoreFileObj.text === 'string') text = restoreFileObj.text;         // 原生「文件」App 回传
      else if (typeof restoreFileObj.text === 'function') text = await restoreFileObj.text();   // 浏览器 File 对象
      else throw new Error('无法读取文件');
      let data;
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.fvault === 1) {                     // PC/新版信封格式
          const pc = await fvEnvelopeDecrypt(pw, text);
          data = pcToIos(pc);   // 含 bankCards：从 PC 备份恢复时把 iOS 卡片带回来
        } else {                                                 // 旧 iOS 直解格式
          data = await fvDecryptJSON(pw, text);
        }
      } catch (e) { throw e; }
      const stat = applyBackupData(data);
      m.style.color = '#30D158'; m.textContent = '恢复完成 ✓ ' + stat;
      const rh = document.getElementById('restoreHint'); if (rh) rh.textContent = '已恢复';
      showToast('备份已恢复：' + stat);
    } catch (e) {
      m.style.color = '#FF6961'; m.textContent = '恢复失败：密码错误或文件损坏';
    }
  })();
}

// ===== TOTP 导出 / 导入 =====
function openTotpIO() {
  document.getElementById('totpExportList').innerHTML = '';
  document.getElementById('totpImportBox').value = '';
  document.getElementById('screenTotpIO').classList.add('show');
}
function closeTotpIO() { document.getElementById('screenTotpIO').classList.remove('show'); }
function exportTotp() {
  const box = document.getElementById('totpExportList');
  // 真实 otpauth 链接（含密钥，可直接用于导入 Authenticator）
  const lines = TOTP_ITEMS.map(it =>
    'otpauth://totp/' + encodeURIComponent(it.t) + '?secret=' + encodeURIComponent(it.s || '') + '&issuer=FallVault&algorithm=SHA1&digits=6&period=30'
  );
  box.innerHTML = TOTP_ITEMS.map(it =>
    '<div class="drow"><span class="dk">' + it.t + '</span><span class="dv" style="color:rgba(255,255,255,.45);font-size:11px">' + (it.s ? '密钥已就绪 ✓' : '⚠ 无密钥') + '</span></div>'
  ).join('');
  if (!TOTP_ITEMS.length) { showToast('还没有验证码条目'); return; }
  const fname = 'FallVault_TOTP_' + new Date().toISOString().slice(0, 10) + '.txt';
  const content = lines.join('\n') + '\n';
  const done = (where) => showToast('TXT 已导出：' + where);
  // ① iOS App：系统「文件」App 让用户自己挑保存位置
  if (nativeSave(fname, content, 'text/plain')) { done('已选位置'); return; }
  // ② 桌面：另存为（用户自选路径）
  const blob = new Blob([content], { type: 'text/plain' });
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: fname,
      types: [{ description: 'TXT 文本', accept: { 'text/plain': ['.txt'] } }],
    }).then(async (handle) => {
      const w = await handle.createWritable();
      await w.write(blob); await w.close();
      done('已选位置');
    }).catch((e) => { if (!(e && e.name === 'AbortError')) done('已取消'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  done('下载文件夹');
}
function importTotp() {
  const raw = document.getElementById('totpImportBox').value.trim();
  if (!raw) { showToast('请粘贴 otpauth:// 链接'); return; }
  const lines = raw.split(/\s+/).filter(s => s.indexOf('otpauth://') === 0);
  if (!lines.length) { showToast('没有识别到有效的 otpauth:// 链接'); return; }
  let added = 0;
  lines.forEach(line => {
    const mURI = line.match(/otpauth:\/\/totp\/([^?]+)\?([^#\s]+)/i);
    if (!mURI) return;
    let label = '';
    try { label = decodeURIComponent(mURI[1]); } catch (e) { label = mURI[1]; }
    let secret = '';
    for (const kv of mURI[2].split('&')) {
      const [k, v] = kv.split('=');
      if (k === 'secret') { try { secret = decodeURIComponent(v || ''); } catch (e) { secret = v || ''; } }
    }
    secret = String(secret).replace(/\s+/g, '').toUpperCase();
    if (!secret) return;
    if (TOTP_ITEMS.some(it => it.s === secret)) return;   // 密钥去重，避免重复导入
    const key = 'k' + Date.now().toString(36) + added.toString(36);
    TOTP_ITEMS.push({ key, t: label || '验证码', s: secret, c: '#64D2FF', cat: '未分类', fav: false, offset: 0 });
    added++;
  });
  if (!added) { showToast('没有新增条目（可能是重复密钥）'); return; }
  saveCardsData();   // 立即落盘（localStorage + 沙盒桥）
  renderChips(); renderCards(); renderTOTP(); renderTags();
  showToast('已导入 ' + added + ' 条验证码');
}

// ===== 更改壁纸 =====
let pendingWall = null;   // 待应用的自定义壁纸（dataURL）
function openWall() {
  pendingWall = null;
  renderWallGrid();
  document.getElementById('screenWall').classList.add('show');
}
function closeWall() { document.getElementById('screenWall').classList.remove('show'); }
function renderWallPreview() { /* 预览改由裁剪框承担（openCrop） */ }
function renderWallGrid() {
  document.getElementById('wallGrid').innerHTML = WALLPAPERS.map((w, i) =>
    '<div class="wall-thumb' + (i === wallIdx ? ' sel' : '') + '" data-i="' + i + '" onclick="setWall(' + i + ')" title="' + w.n + '"><img src="' + (typeof WALL_INLINE !== 'undefined' && WALL_INLINE[w.f] ? WALL_INLINE[w.f] : (RES_BZ + w.f)) + '" onerror="this.src=\'' + RES_BZ + w.f + '\'" alt=""></div>'
  ).join('');
}
function pickWallFile() { document.getElementById('wallInput').click(); }
// 上传的壁纸统一优化：按手机比例居中裁剪 → 缩放 → 压成 JPEG
// 理由：原图（相机照片可达 4000px）直接当 dataURL 会撑爆 localStorage、渲染卡顿，而且比例不对时会被 cover 裁歪
const WALL_TW = 828;                                     // 目标宽（≈ 手机 2x 分辨率，清晰又不臃肿）
const WALL_TH = Math.round(WALL_TW * 690 / 340);         // 目标高 = 手机原型比例（340×690）
// 核心：任意尺寸图 → 按手机比例居中裁剪 → 缩放 → JPEG。横图竖图都不变形、不撑爆存储
function optimizeWallImage(img, cb) {
  try {
    const tAspect = WALL_TW / WALL_TH;
    const sAspect = img.width / img.height;
    let sw, sh, sx, sy;
    if (sAspect > tAspect) {                              // 原图更宽 → 左右居中裁
      sh = img.height; sw = Math.round(sh * tAspect);
      sx = Math.round((img.width - sw) / 2); sy = 0;
    } else {                                              // 原图更高 → 上下居中裁
      sw = img.width; sh = Math.round(sw / tAspect);
      sx = 0; sy = Math.round((img.height - sh) / 2);
    }
    const c = document.createElement('canvas');
    c.width = WALL_TW; c.height = WALL_TH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, WALL_TW, WALL_TH);
    cb(c.toDataURL('image/jpeg', 0.82));                  // 压缩：通常 80~250KB
  } catch (e) { cb(null); }
}
function onWallFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => openCrop(r.result);   // 选好图片 → 打开裁剪框让用户调位置
  r.readAsDataURL(f);
}

// ===== 壁纸裁剪框：拖动 / 缩放 / 应用 =====
let cropImgURL = null;                    // 正在编辑的图片（dataURL）
let cropNat = { w: 0, h: 0 };             // 原图尺寸
let cropBase = 1;                         // "铺满框"所需的基础缩放（cover）
let cropScale = 1;                        // 用户额外缩放（滑杆 1.00 ~ 4.00）
let cropOff = { x: 0, y: 0 };             // 图片左上角相对框的偏移（屏幕 px）
let cropDrag = null;

function cropStageSize() {
  const st = document.getElementById('cropStage');
  const r = st.getBoundingClientRect();
  return { w: r.width || 260, h: r.height || 528 };
}
function cropClamp() {                    // 图片必须始终盖满框 → 偏移限制在 [框-图, 0]
  const s = cropStageSize();
  const w = cropNat.w * cropBase * cropScale;
  const h = cropNat.h * cropBase * cropScale;
  cropOff.x = Math.max(Math.min(0, s.w - w), Math.min(0, cropOff.x));
  cropOff.y = Math.max(Math.min(0, s.h - h), Math.min(0, cropOff.y));
}
function cropRender() {
  const img = document.getElementById('cropImg');
  const k = cropBase * cropScale;
  img.style.width = (cropNat.w * k) + 'px';
  img.style.height = (cropNat.h * k) + 'px';
  // 先镜像（以元素中心为原点）再平移 —— 与最终烘焙的 canvas 变换一致
  img.style.transform = 'translate(' + cropOff.x + 'px,' + cropOff.y + 'px)';
  const z = document.getElementById('cropZoom');
  if (z) z.value = Math.round(cropScale * 100);
}
function openCrop(dataURL) {
  cropImgURL = dataURL;
  const ov = document.getElementById('cropOverlay');
  ov.classList.add('show');
  const img = document.getElementById('cropImg');
  img.onload = () => {
    cropNat = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
    const s = cropStageSize();
    cropBase = Math.max(s.w / cropNat.w, s.h / cropNat.h);   // cover：短边铺满
    cropScale = 1;
    cropOff = { x: (s.w - cropNat.w * cropBase) / 2, y: (s.h - cropNat.h * cropBase) / 2 };
    cropClamp(); cropRender();
  };
  img.src = dataURL;
  cropBind();
}
function closeCrop() {
  document.getElementById('cropOverlay').classList.remove('show');
  cropImgURL = null;
  // 还原裁剪框比例：卡面裁剪（876/540）设置过 aspect-ratio，不还原会污染下次壁纸裁剪
  const st = document.getElementById('cropStage');
  if (st) st.style.aspectRatio = '';
}
function resetCrop() {
  const s = cropStageSize();
  cropScale = 1;
  cropOff = { x: (s.w - cropNat.w * cropBase) / 2, y: (s.h - cropNat.h * cropBase) / 2 };
  cropClamp(); cropRender();
}
function zoomCrop(v) {
  const s = cropStageSize();
  const oldK = cropBase * cropScale;
  const next = Math.max(1, (parseInt(v, 10) || 100) / 100);
  const cx = s.w / 2, cy = s.h / 2;                        // 以框中心为锚点缩放
  const ix = (cx - cropOff.x) / oldK;
  const iy = (cy - cropOff.y) / oldK;
  cropScale = next;
  const nk = cropBase * cropScale;
  cropOff.x = cx - ix * nk;
  cropOff.y = cy - iy * nk;
  cropClamp(); cropRender();
}
function cropBind() {
  const st = document.getElementById('cropStage');
  if (st.dataset.bound === '1') return;
  st.dataset.bound = '1';
  st.addEventListener('pointerdown', e => {
    cropDrag = { x: e.clientX, y: e.clientY, ox: cropOff.x, oy: cropOff.y };
    try { st.setPointerCapture(e.pointerId); } catch (err) {}
  });
  st.addEventListener('pointermove', e => {
    if (!cropDrag) return;
    cropOff.x = cropDrag.ox + (e.clientX - cropDrag.x);
    cropOff.y = cropDrag.oy + (e.clientY - cropDrag.y);
    cropClamp(); cropRender();
  });
  const end = () => { cropDrag = null; };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', e => {                      // 桌面滚轮缩放
    e.preventDefault();
    const z = document.getElementById('cropZoom');
    const nv = Math.max(100, Math.min(400, (parseInt(z.value, 10) || 100) + (e.deltaY < 0 ? 12 : -12)));
    z.value = nv; zoomCrop(nv);
  }, { passive: false });
}
function applyCrop() {
  if (!cropImgURL || !cropNat.w) { showToast('请先选择图片'); return; }
  const s = cropStageSize();
  const k = cropBase * cropScale;
  const img = document.getElementById('cropImg');
  const outW = _cropCb ? _cropCb.w : WALL_TW;
  const outH = _cropCb ? _cropCb.h : WALL_TH;
  // 源矩形（原图坐标系）：框左上角对应的原图位置 + 可见区域大小
  const sx0 = -cropOff.x / k, sy0 = -cropOff.y / k, sw0 = s.w / k, sh0 = s.h / k;

  // ① 超大图先缩到安全尺寸：iOS 上 iPhone 原图（4000×3000）直接画会因内存限制失败 → 输出全黑
  const MAXS = 3072;
  const sc = Math.min(1, MAXS / Math.max(cropNat.w || 1, cropNat.h || 1));
  let srcEl = img, fit = 1;
  if (sc < 1) {
    try {
      const mid = document.createElement('canvas');
      mid.width = Math.max(1, Math.round(cropNat.w * sc));
      mid.height = Math.max(1, Math.round(cropNat.h * sc));
      const mctx = mid.getContext('2d');
      mctx.imageSmoothingQuality = 'high';
      mctx.drawImage(img, 0, 0, mid.width, mid.height);
      srcEl = mid; fit = mid.width / cropNat.w;
    } catch (e) { srcEl = img; fit = 1; }
  }

  // ② 输出画布（JPEG 无透明通道，未绘制区域会变成纯黑 → 先铺底色，任何情况下都不会整张黑）
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.drawImage(srcEl, sx0 * fit, sy0 * fit, sw0 * fit, sh0 * fit, 0, 0, outW, outH);
  } catch (e) {
    showToast('图片处理失败，请换一张图试试');
    return;
  }
  const out = c.toDataURL('image/jpeg', 0.85);
  if (_cropCb) {
    const cb = _cropCb; _cropCb = null;
    closeCrop();
    cb.fn(out);
    return;
  }
  // 壁纸：存本地 + 存沙盒文件（重进软件仍生效）
  wallCustomData = out;
  wallState = { type: 'custom', idx: -1, name: '自定义' };
  try { localStorage.setItem('fvWallCustom', out); } catch (e) {}
  saveWallState();   // 记类型 + 存沙盒文件
  applyWallpaper('url(' + out + ')', '自定义');
  closeCrop(); closeWall();
  showToast('壁纸已应用 ✓');
}
function setWall(i) {
  wallIdx = i;
  // 选内置壁纸 = 不再使用自定义 → 必须清掉自定义记录，否则重启又被它覆盖
  wallCustomData = '';
  try { localStorage.removeItem('fvWallCustom'); } catch (e) {}
  wallState = { type: 'builtin', idx: i, name: WALLPAPERS[i].n };
  wallFancy(WALLPAPERS[i].f, WALLPAPERS[i].n);
  renderWallGrid();
  saveWallState();
}
// 壁纸一律走这：内嵌 base64（App 自带，永不失效）优先 → 本地 bz/ 资源兜底。背景与染色都用它
function wallFancy(f, name) {
  if (typeof WALL_INLINE !== 'undefined' && WALL_INLINE[f]) {
    applyWallpaper(WALL_INLINE[f], name);
    return;
  }
  // 本地资源兜底（WALL_INLINE 缺图时）：直接应用，不再走已删除的网络 CDN 路径
  applyWallpaper(RES_BZ + f, name);
  applyTint(RES_BZ + f);
}
// 自定义壁纸数据（base64 较大：localStorage 可能超限，主要靠沙盒文件持久化）
let wallCustomData = '';
// 用户最后选的壁纸类型：{ type: 'builtin'|'custom', idx, name } —— 决定重启后恢复哪张
let wallState = { type: '', idx: 0, name: '' };
try {
  const _ws = JSON.parse(localStorage.getItem('fvWallState') || 'null');
  if (_ws && _ws.type) wallState = _ws;
} catch (e) {}
function saveWallState() {
  try { localStorage.setItem('fvWallState', JSON.stringify(wallState)); } catch (e) {}
  try { if (typeof saveCardsData === 'function') saveCardsData(); } catch (e) {}
}
// 启动时按「用户最后选的壁纸」恢复（内置 or 自定义）—— 不能无条件套自定义壁纸
function restoreWall(apply) {
  if (apply === false) return false;
  let data = '';
  try { data = localStorage.getItem('fvWallCustom') || ''; } catch (e) {}
  if (!data) data = wallCustomData || '';
  const st = wallState || {};
  if (st.type === 'custom') {
    if (!data) return false;
    wallCustomData = data;
    if (typeof applyWallpaper === 'function') applyWallpaper('url(' + data + ')', '自定义', true);
    return true;
  }
  if (st.type === 'builtin' && typeof WALLPAPERS !== 'undefined' && WALLPAPERS[st.idx]) {
    wallIdx = st.idx;
    if (typeof wallFancy === 'function') wallFancy(WALLPAPERS[st.idx].f, WALLPAPERS[st.idx].n);
    try { renderWallGrid(); } catch (e) {}
    return true;
  }
  // 旧数据兜底：没有类型记录时，只有自定义图才恢复它
  if (data) {
    wallCustomData = data;
    if (typeof applyWallpaper === 'function') applyWallpaper('url(' + data + ')', '自定义', true);
    return true;
  }
  return false;
}

function applyWallpaper(img, name, silent) {
  const phone = document.getElementById('phone');
  // dataURL（内嵌壁纸）必须包 url()，否则 background-image 整条无效
  const cssImg = /^url\(/i.test(img) ? img : "url('" + img + "')";
  phone.style.setProperty('--wallpaper', cssImg);
  phone.style.backgroundImage = 'linear-gradient(180deg, rgba(0,0,0,.30) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.55) 100%), ' + cssImg;
  // 锁屏壁纸层直设（不依赖 CSS 变量继承链 —— WebKit 上变量在 blur 层可能失效）
  const lbg = document.querySelector('.lock .lock-bg');
  if (lbg) lbg.style.backgroundImage = cssImg;
  document.getElementById('wallHint').textContent = name;
  applyTint(img);   // 提取壁纸主色 → 给玻璃染色
  if (!silent) showToast('壁纸：' + name);
}

// ===== 壁纸主色提取 → 玻璃染色（--tint）=====
// 把壁纸画到 8×8 的 canvas 求平均色，再按饱和度做"提色"：
// 越灰的壁纸推得越狠，避免染色完全看不出来；彩色壁纸只轻微加强。
function extractWallTint(src, cb) {
  const m = /^url\(['"]?([^'")]+)['"]?\)$/.exec(String(src).trim());
  const url = m ? m[1] : String(src).trim();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const N = 8;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (!n) { cb(null); return; }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = (mx - mn) / 255;
      const boost = sat < 0.1 ? 1.75 : (sat < 0.25 ? 1.4 : 1.15);
      const push = v => Math.max(0, Math.min(255, Math.round((v - 128) * boost + 128)));
      cb([push(r), push(g), push(b)]);
    } catch (e) { cb(null); }
  };
  img.onerror = () => cb(null);
  img.src = url;
}

function applyTint(src) {
  const phone = document.getElementById('phone');
  if (!phone) return;
  extractWallTint(src, rgb => {
    if (!rgb) { phone.style.removeProperty('--tint'); window.__tint = ''; return; }
    phone.style.setProperty('--tint', rgb[0] + ',' + rgb[1] + ',' + rgb[2]);
    window.__tint = rgb.join(',');
  });
}

// ===== TOTP 时间偏移校正 =====
function openTotpOffset() {
  const r = document.getElementById('totpOffsetRange');
  if (r) r.value = totpOffset;
  document.getElementById('totpOffsetVal').textContent = (totpOffset > 0 ? '+' : '') + totpOffset + ' 秒';
  const ct = document.getElementById('totpCalTime');
  if (ct) {
    try {
      const t = parseInt(localStorage.getItem('fvTotpCalT') || '0', 10);
      ct.textContent = t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '尚未校准';
    } catch (e) { ct.textContent = '尚未校准'; }
  }
  document.getElementById('screenTotpOffset').classList.add('show');
}
function closeTotpOffset() { document.getElementById('screenTotpOffset').classList.remove('show'); }
function setTotpOffset(v) {
  totpOffset = parseInt(v, 10) || 0;
  try { localStorage.setItem('fvTotpOffset', String(totpOffset)); } catch (e) {}   // 落盘：重进软件仍生效
  document.getElementById('totpOffsetVal').textContent = (totpOffset > 0 ? '+' : '') + totpOffset + ' 秒';
  document.getElementById('totpOffsetHint').textContent = (totpOffset > 0 ? '+' : '') + totpOffset + ' 秒';
  TOTP_ITEMS.forEach(it => { it.lastCycle = -1; });   // 强制立刻换码，方便看效果
}
function resetTotpOffset() {
  setTotpOffset(0);
  const r = document.getElementById('totpOffsetRange'); if (r) r.value = 0;
  showToast('时间偏移已重置');
}

// ===== 自动校准：联网读取标准时间，算出本机偏差（无需手动调） =====
let calibrating = false;
function applyCalibration(serverMs, localMs) {
  let off = Math.round((serverMs - localMs) / 1000);
  off = Math.max(-30, Math.min(30, off));          // 夹在 ±30 秒（与手动档位一致）
  setTotpOffset(off);
  try { localStorage.setItem('fvTotpCalT', String(Date.now())); } catch (e) {}
  const r = document.getElementById('totpOffsetRange');
  if (r) r.value = off;
  return off;
}
async function autoCalibrateTime(silent) {
  if (calibrating) return null;
  calibrating = true;
  const report = (off) => {
    calibrating = false;
    if (!silent) {
      showToast(off === 0 ? '时间已校准（本机准确）'
        : ('已自动校准：本机时间' + (off > 0 ? '慢了 ' + off + ' 秒' : '快了 ' + (-off) + ' 秒') + '，已自动补偿'));
    }
    return off;
  };
  // 多源依次尝试（浏览器跨域只能读「允许 CORS 的 JSON 接口」，读不到普通站点的 Date 头）
  const sources = [
    // ① 淘宝时间接口（国内）
    { url: 'https://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp',
      pick: (j) => (j && j.data && j.data.t) ? Number(j.data.t) : 0 },
    // ② 苏宁时间接口（国内）
    { url: 'https://quan.suning.com/getSysTime.do',
      pick: (j) => {
        const s = j && (j.sysTime2 || j.sysTime1 || j.sysTime);
        if (!s) return 0;
        const t = new Date(String(s).replace(/-/g, '/')).getTime();
        return isFinite(t) ? t : 0;
      } },
    // ③ 世界时间 API（海外，需代理）
    { url: 'https://worldtimeapi.org/api/timezone/Etc/UTC',
      pick: (j) => (j && j.unixtime) ? j.unixtime * 1000 : 0 },
    // ④ timeapi.io（海外，需代理）
    { url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
      pick: (j) => {
        if (!j || !j.dateTime) return 0;
        const t = new Date(j.dateTime).getTime();
        return isFinite(t) ? t : 0;
      } },
  ];
  for (const src of sources) {
    try {
      const t0 = Date.now();
      const r = await fetch(src.url, { cache: 'no-store' });
      const t1 = Date.now();
      if (!r.ok) continue;
      const j = await r.json();
      const serverMs = src.pick(j);
      if (serverMs > 0) {
        return report(applyCalibration(serverMs, Math.round((t0 + t1) / 2)));   // 往返中点补偿
      }
    } catch (e) { /* 换下一个源 */ }
  }
  calibrating = false;
  if (!silent) showToast('校准失败（网络不可达；可手动调整，设置会保存）');
  return null;
}
// 启动/进验证码页时静默校准（12 小时最多一次）
function maybeAutoCalibrate() {
  try {
    const t = parseInt(localStorage.getItem('fvTotpCalT') || '0', 10);
    if (Date.now() - t > 12 * 3600 * 1000) autoCalibrateTime(true);
  } catch (e) {}
}

// ===== 设置项交互（演示反馈） =====
function settingTap(name) {
  showToast('「' + name + '」演示项');
}

// ===== 启动 =====
// 资源路径修正：沙盒(云更新后)下 logo 图标在 assets/ 子目录而非 ../assets/
(function fixLogo(){
  try { const lg = document.querySelector('#lockScreen img') || document.querySelector('.appicon img');
        if (lg) lg.src = RES_BASE + 'fallvault-logo.png'; } catch (e) {}
})();
// 启动：先加载本地持久化数据（刷新不还原演示数据）
try { loadCardsData(); } catch (e) {}
// 安卓壳注入 window.__FV_BIOMETRIC：文案由「Face ID」换成「生物识别」（系统指纹 / 机型支持时的人脸）。
// 录入弹层（faceEnroll）是 iOS 的摄像头录脸 / 桌面演示用，安卓走系统弹窗，故隐藏。
if (window.__FV_BIOMETRIC) {
  try {
    const fr = document.getElementById('faceSetRow');
    if (fr) { const kk = fr.querySelector('.k'); if (kk) kk.textContent = '生物识别解锁'; }
    const fl = document.getElementById('faceLabel');
    if (fl) fl.textContent = '生物识别解锁';
    const fe = document.getElementById('faceEnroll'); if (fe) fe.style.display = 'none';
  } catch (e) {}
}

// 后台静默校准验证码时间（12 小时最多一次；失败静默跳过，不影响使用）
setTimeout(() => { try { maybeAutoCalibrate(); } catch (e) {} }, 2500);
// 打开即呈现锁屏：自动聚焦密码框 + 自动尝试一次 Face ID
// 启动壁纸：优先按用户记录恢复（内置/自定义）；只有从未设过壁纸时才用默认 BZ2
let _wallRestored = false;
try { _wallRestored = restoreWall(); } catch (e) {}
if (!_wallRestored) wallFancy('bz2.jpg', 'BZ2');   // 首次启动：默认壁纸
lockInit(true);
// 预热人脸模型：第一次 Face ID 验证要加载 3 个模型（约 8MB），
// 冷加载会让首次识别"卡"几秒；这里启动后后台异步加载，首次验证时模型已在内存
setTimeout(() => { faceLoadModels().catch(() => {}); }, 900);

// 解锁输入框回车 → 密码验证
document.getElementById('unlockPw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlockPw();
});

// 2FA 密钥输入 → 显示提示
const ftEl = document.getElementById('fTotp');
if (ftEl) ftEl.addEventListener('input', () => {
  document.getElementById('eTotpHint').style.display = ftEl.value.trim() ? 'block' : 'none';
});

// 自检（URL 带 ?debug=1 时启用：自动测试关键交互并输出到顶部）



// 启动初始化（必须放在模块声明之后 —— const/let 有 TDZ 死区，提前调用会抛 ReferenceError）

// =====================================================================
// 银行卡卡片（密码库页「密码 | 卡片」分段切换 · 上下滑动切换的卡片画廊）
//   卡面配色由 FallVault 设计（渐变色 + 光泽 + 芯片 + 卡组织标）
//   数据存 localStorage fvBankCards，随 .fvault 一起备份
// =====================================================================
const BANK_PALETTES = [
  { name: '招行红金', a: '#7E1B26', b: '#C93A4C', c: '#F0A35E' },
  { name: '建行蓝',   a: '#00376E', b: '#0A6BC0', c: '#63B7F0' },
  { name: '农行绿',   a: '#0A4A32', b: '#12855A', c: '#5FD39A' },
  { name: '工行红',   a: '#7A0B10', b: '#C4161C', c: '#F07A5A' },
  { name: '中行红',   a: '#8C1526', b: '#C42B43', c: '#F08A9A' },
  { name: '交行深蓝', a: '#0E1F52', b: '#2946A0', c: '#7C9AE8' },
  { name: '邮储绿蓝', a: '#0B5E3F', b: '#1B7EA6', c: '#7AD3E8' },
  { name: '雅黑金',   a: '#1C1C22', b: '#3A3A46', c: '#D8B26A' },
  { name: '紫罗兰',   a: '#3A1D5E', b: '#6A3AA0', c: '#C098E8' },
  { name: '橙霞',     a: '#8A3A10', b: '#D0702A', c: '#F0B86A' },
];
const ORG_LABEL = { unionpay: 'UnionPay', visa: 'VISA', mastercard: 'MasterCard', other: 'BANK CARD' };

let BANK_CARDS = [];
let bankSel = 0;          // 当前选中的卡（画廊中间）
let bankDrag = null;

function bankEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] || m); }
function bankMask(n) { return String(n || '').replace(/\s/g, '').slice(-4).padStart(4, '0'); }
function bankGroup(n) { return String(n || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim(); }

function loadBankCards() {
  try { BANK_CARDS = JSON.parse(localStorage.getItem('fvBankCards') || '[]'); } catch (e) { BANK_CARDS = []; }
  if (!Array.isArray(BANK_CARDS)) BANK_CARDS = [];
}
function saveBankCards() { try { localStorage.setItem('fvBankCards', JSON.stringify(BANK_CARDS)); } catch (e) {} }
// seedBankCards 已移除：不再内置任何演示卡
// 渲染画廊：数量没变 → 只更新各卡 transform（transition 生效 → 弹性滑动过渡）；
// 数量变化（增删首次）→ 重建 DOM
function renderBankGallery() {
  bankRefreshGeo();
  const stage = document.getElementById('bankStage');
  if (!stage) return;
  if (bankSel < 0) bankSel = 0;
  if (bankSel >= BANK_CARDS.length) bankSel = Math.max(0, BANK_CARDS.length - 1);
  if (!BANK_CARDS.length) {
    stage.innerHTML = '<div class="bcard2 ghost-card"  onclick="openBankForm(null)">＋ 添加第一张银行卡</div>';
    return;
  }
  const live = stage.querySelectorAll('.bcard2:not(.ghost-card)');   // 排除空态占位卡（否则第一张真卡永远被误判为"数量不变"不重建）
  if (live.length !== BANK_CARDS.length) {
    stage.innerHTML = BANK_CARDS.map((c, i) => bankCardEl(c, i)).join('');   // 首次/增删 → 重建
    BANK_CARDS.forEach((c, i) => { const el = stage.querySelector(`.bcard2[data-i="${i}"]`); if (el) positionCard(el, i); });   // ⚠️ 重建后必须定位，否则全叠中间
  } else {
    BANK_CARDS.forEach((c, i) => {
      const el = stage.querySelector(`.bcard2[data-i="${i}"]`);
      if (!el) return;
      positionCard(el, i);
    });
  }
}
let bankH = 640;      // stage 实际高度（自适应缓存，resize/进入卡片页时更新）
let BANK_W = 330, BANK_H = 204;   // 卡片实际尺寸（按屏宽自适应）
let BANK_SP = 107;                 // 卡片间距（px）
function bankRefreshGeo() {
  const st = document.querySelector('.bank-stage');
  if (st) {
    bankH = st.clientHeight || 640;
    // 卡片宽 = 舞台宽 86%（上限 330），高按黄金比例 1.618
    BANK_W = Math.min(330, Math.round(st.clientWidth * 0.86));
    BANK_H = Math.round(BANK_W / 1.618);
    st.style.setProperty('--bcw', BANK_W + 'px');
    st.style.setProperty('--bch', BANK_H + 'px');
  }
}
function bankMID()  { return -Math.min(58, bankH * 0.09); }   // 常规中间偏移（小屏收敛）
function bankTOP()  { return -Math.min(118, bankH * 0.17); }  // 第一张顶位（小屏收敛）
function bankCardY(off) {
  if (bankSel !== 0) return off * BANK_SP + bankMID();
  if (off === 0) return bankTOP();
  // 第二张只露下半张（偏移 = 卡高一半），之后恢复间距
  const half = Math.round(BANK_H / 2);
  if (off === 1) return bankTOP() + half;
  return bankTOP() + half + (off - 1) * BANK_SP;
}
function positionCard(el, i) {
  const off = i - bankSel;
  const scale = off === 0 ? 1 : 0.9;
  el.style.transform = `translateY(${bankCardY(off)}px) scale(${scale})`;
  // 不透明 + 非中间卡模糊（blur 由 CSS class 控制，避免每帧字符串）
  el.style.opacity = Math.abs(off) > 2 ? 0 : 1;
  el.style.zIndex = 10 - Math.abs(off);
  el.classList.toggle('bc-blur', off !== 0);
}
function orgBadge(c) {
  const key = c.org === 'custom' ? 'custom' : (c.org || 'other');
  const label = c.orgLabel || ORG_LABEL[c.org] || 'BANK CARD';
  return `<span class="org-badge org-${key}"><i class="ob-ico"></i><b>${bankEsc(label)}</b></span>`;
}
function bankCardEl(c, i) {
  const pal = BANK_PALETTES[c.pal % BANK_PALETTES.length] || BANK_PALETTES[0];
  const face = c.face ? faceImgTag(c.face) : '';
  const bg = c.face ? '' : `background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);`;
  return `<div class="bcard2" data-i="${i}" style="${bg}" onclick="bankCardTap(${i})">
    ${face}
    <div class="bcb-ol"></div>
    <div class="shine"></div>
    <div class="brow top"><span class="bankname">${bankEsc(c.bank || '银行')}</span>${orgBadge(c)}</div>
    <div class="brow num">•••• •••• •••• ${bankMask(c.num)}</div>
    <div class="brow bottom"><span>${bankEsc(c.holder || '—')} · ${bankEsc(c.type || '储蓄卡')}</span><b>${bankEsc(c.exp || 'MM/YY')}</b></div>
  </div>`;
}

// 密码 / 卡片 视图切换（照 Figma：滑块滑到对应侧）
let currentVaultMode = null;   // 当前分段模式（幂等保护：touchstart+click 双触发不会重复渲染）
function switchVault(mode) {
  const slider = document.getElementById('vsegSlider');
  const pw = document.getElementById('vsegPw');
  const cd = document.getElementById('vsegCard');
  const isCard = mode === 'card';
  if (currentVaultMode === mode) return;    // 已经在该模式 → 直接返回（防重复触发卡顿）
  currentVaultMode = mode;
  pw.classList.toggle('on', !isCard);
  cd.classList.toggle('on', isCard);
  if (slider) slider.style.transform = isCard ? 'translateX(119px)' : 'translateX(0)';
  document.getElementById('vaultSearch').style.display = isCard ? 'none' : '';
  document.getElementById('vaultChipsRail').style.display = isCard ? 'none' : '';
  document.getElementById('list').style.display = isCard ? 'none' : '';
  document.getElementById('bankView').classList.toggle('on', isCard);
  // 画廊渲染较重（3D 定位）→ 延后到下一帧：分段滑块和高亮先立即到位，点击不再被阻塞
  if (isCard) requestAnimationFrame(() => { try { renderBankGallery(); } catch (err) {} });
}

// 点卡片：中间的打开详情；上下的切换为中间
function bankCardTap(i) {
  if (i === bankSel) { bankDetail(); return; }
  bankSel = i;
  renderBankGallery();
  try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {}
}

// 上下滑动切换（手势跟随 + 松手切卡）
(function bindBankSwipe() {
  const bind = () => {
    const stage = document.getElementById('bankStage');
    if (!stage || stage.dataset.bound) return;
    stage.dataset.bound = '1';
    let sy = 0, moved = 0;
    stage.addEventListener('touchstart', e => {
      const t = e.touches[0]; if (!t) return;
      sy = t.clientY; moved = 0; bankDrag = true;
    }, { passive: true });
    stage.addEventListener('touchmove', e => {
      if (!bankDrag) return;
      const t = e.touches[0]; if (!t) return;
      e.preventDefault();                       // 卡片区上下滑动归画廊，不滚页面
      moved = t.clientY - sy;
      const cards = stage.querySelectorAll('.bcard2');
      cards.forEach(el => {
        const i = Number(el.dataset.i || 0);
        const off = i - bankSel;
        el.style.transition = 'none';   // 拖动跟手：瞬移
        el.style.transform = `translateY(${bankCardY(off) + moved * 0.55}px) scale(${off === 0 ? 1 : 0.9})`;
      });
    }, { passive: false });
    const finish = () => {
      if (!bankDrag) return;
      bankDrag = false;
      const cards = stage.querySelectorAll('.bcard2');
      cards.forEach(el => { el.style.transition = ''; });   // 恢复过渡 → 松手后弹性滑到位
      if (Math.abs(moved) > 55) {
        if (moved < 0 && bankSel < BANK_CARDS.length - 1) bankSel++;        // 上滑 → 下一张
        else if (moved > 0 && bankSel > 0) bankSel--;                        // 下滑 → 上一张
      }
      renderBankGallery();
    };
    stage.addEventListener('touchend', finish, { passive: true });
    stage.addEventListener('touchcancel', finish, { passive: true });
  };
  bind();
  const vi = setInterval(() => {
    if (document.getElementById('bankStage')) { clearInterval(vi); bind(); }
  }, 300);
})();

function bankDetail() {
  const c = BANK_CARDS[bankSel];
  if (!c) return;
  document.getElementById('detailTitle').textContent = c.bank;
  const editBtn = document.getElementById('detailEditBtn');
  editBtn.onclick = () => openBankForm(c.id);
  const pal = BANK_PALETTES[c.pal % BANK_PALETTES.length] || BANK_PALETTES[0];
  const face = c.face ? faceImgTag(c.face) : '';
  const bg = c.face ? '' : `background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);`;
  const orgTxt = c.orgLabel || ORG_LABEL[c.org] || 'BANK CARD';
  document.getElementById('detailBody').innerHTML = `
    <div class="d-bigcard"><div class="bcard2" style="${bg} position:relative; margin:0; width:100%; height:176px; border-radius:14px;">
      ${face}<div class="bcb-ol"></div><div class="shine"></div>
      <div class="brow top"><span class="bankname">${bankEsc(c.bank || '银行')}</span>${orgBadge(c)}</div>
      <div class="brow num" id="dBNum" onclick="dBNumToggle()">•••• •••• •••• ${bankMask(c.num)}</div>
      <div class="brow bottom"><span>${bankEsc(c.holder || '—')} · ${bankEsc(c.type || '储蓄卡')}</span><b>${bankEsc(c.exp || 'MM/YY')}</b></div>
    </div></div>
    <div class="drow"><span class="dk">卡号</span><span class="dv" id="dBNumRow">•••• ${bankMask(c.num)}</span><button class="cp" onclick="copyVal(${jsStr(c.num)},'卡号')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">CVV 安全码</span><span class="dv" id="dBCvv">${c.cvv ? '•••' : '—'}</span>${c.cvv ? '<button class="cp" onclick="dBCvvToggle()">显示</button><button class="cp" onclick="dBCvvCopy()">' + (typeof COPY !== 'undefined' ? COPY : '复制') + '</button>' : ''}</div>
    <div class="drow"><span class="dk">持卡人</span><span class="dv">${bankEsc(c.holder || '—')}</span><button class="cp" onclick="copyVal(${jsStr(c.holder || '')},'持卡人')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">有效期</span><span class="dv">${bankEsc(c.exp || '—')}</span><button class="cp" onclick="copyVal(${jsStr(c.exp || '')},'有效期')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">卡组织</span><span class="dv">${bankEsc(orgTxt)}</span><button class="cp" onclick="copyVal(${jsStr(orgTxt)},'卡组织')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">卡种</span><span class="dv">${bankEsc(c.type || '储蓄卡')}</span><button class="cp" onclick="copyVal(${jsStr(c.type || '储蓄卡')},'卡种')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    ${(c.addr || c.city || c.state || c.country || c.zip) ? `
    <div class="dsec">账单地址</div>
    <div class="group">
      ${c.addr ? `<div class="drow"><span class="dk">地址</span><span class="dv">${bankEsc(c.addr)}</span><button class="cp" onclick="copyVal(${jsStr(c.addr)},'地址')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>` : ''}
      ${c.city ? `<div class="drow"><span class="dk">城市</span><span class="dv">${bankEsc(c.city)}</span></div>` : ''}
      ${c.state ? `<div class="drow"><span class="dk">省/州</span><span class="dv">${bankEsc(c.state)}</span></div>` : ''}
      ${c.country ? `<div class="drow"><span class="dk">国家/地区</span><span class="dv">${bankEsc(c.country)}</span></div>` : ''}
      ${c.zip ? `<div class="drow"><span class="dk">邮编</span><span class="dv">${bankEsc(c.zip)}</span><button class="cp" onclick="copyVal(${jsStr(c.zip)},'邮编')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>` : ''}
    </div>` : ''}
    <div class="drow" style="margin-top:10px;"><button class="egbtn cancel" style="width:100%; margin:0; color:#FF6961; border-color:rgba(255,105,97,.4);" onclick="delBankFromDetail()">删除这张卡片</button></div>
  `;
  closeDetail();   // 保险：确保非 show
  document.getElementById('detailScreen').classList.add('show');
}
let dBNumShown = false, dBCvvShown = false;
function dBNumToggle() {
  const c = BANK_CARDS[bankSel]; if (!c) return;
  dBNumShown = !dBNumShown;
  const el = document.getElementById('dBNum'), row = document.getElementById('dBNumRow');
  const full = bankGroup(c.num);
  if (el) el.textContent = dBNumShown ? full : ('•••• •••• •••• ' + bankMask(c.num));
  if (row) row.textContent = dBNumShown ? full : ('•••• ' + bankMask(c.num));
}
function dBCvvCopy() {
  const c = BANK_CARDS[bankSel]; if (!c || !c.cvv) return;
  copyVal(String(c.cvv), 'CVV');
}
function dBCvvToggle() {
  const c = BANK_CARDS[bankSel]; if (!c) return;
  dBCvvShown = !dBCvvShown;
  const el = document.getElementById('dBCvv');
  if (el) {
    el.textContent = dBCvvShown ? c.cvv : '•••';
    el.style.color = dBCvvShown ? '#FFD60A' : '';
  }
  setTimeout(() => { dBCvvShown = false; if (el) { el.textContent = '•••'; el.style.color = ''; } }, 8000);
}


let bfFace = '';   // 自传卡面图（dataURL）

// 卡面图统一生成（预览/画廊/详情三处共用）
function faceImgTag(src, extraStyle) {
  const style = (extraStyle || '');
  return '<img class="bcb-img" src="' + src + '" alt=""' + (style ? ' style="' + style + '"' : '') + '>';
}
// 有效期：月/年（MM/YY）—— 只允许数字，满4位自动加 /，只校验月份 1~12
let bfExpBad = false;
function bfExpKey(ev) {
  const el = ev.target;
  let v = el.value.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
  el.value = v;
  bfExpBad = false;
  el.style.borderColor = '';
  if (v.length === 5) {
    const m = +v.slice(0, 2);
    if (m < 1 || m > 12) { bfExpBad = true; el.style.borderColor = '#FF6961'; showToast('月份需在 01~12 之间'); }
  }
  if (typeof bfPreview === 'function') bfPreview();
}


// ===== 新建 / 编辑卡片 =====
function delBankFromDetail() {
  const c = BANK_CARDS[bankSel];
  if (!c) return;
  // 云更新已删：直接删除（不再弹确认）
  BANK_CARDS = BANK_CARDS.filter(x => x.id !== c.id);
  saveBankCards();
  if (bankSel >= BANK_CARDS.length) bankSel = Math.max(0, BANK_CARDS.length - 1);
  closeDetail();
  renderBankGallery();
  showToast('卡片已删除');
}
// 自传卡面图：相册选图 → 压缩 876×540 → dataURL 存 bfFace（保存时进卡片数据）
function onBfFacePicked(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    openCropEx(rd.result, 876, 540, (out) => {
      bfFace = out;
      bfPreview();
      showToast('已使用调整后的卡面图');
    });
  };
  rd.readAsDataURL(f);
}
let bfNumBad = false;
function bfNumKey(ev) {
  const el = ev.target;
  let v = el.value.replace(/\D/g, '').slice(0, 19);
  el.value = v.replace(/(\d{4})(?=\d)/g, '$1 ');
  bfNumBad = !(v.length >= 13 && v.length <= 19);
  el.style.borderColor = bfNumBad ? '#FF6961' : '';
  bfPreview();
}
function bfTypeChange() {
  const sel = document.getElementById('bfTypeSel');
  const custom = document.getElementById('bfTypeCustom');
  custom.style.display = sel.value === 'custom' ? '' : 'none';
  bfPreview();
}
function bfTypeLabelOf() {
  const sel = document.getElementById('bfTypeSel');
  if (!sel) return '储蓄卡';
  return sel.value === 'custom' ? (document.getElementById('bfTypeCustom').value.trim() || '其他卡') : sel.value;
}
// 通用裁剪：把现有壁纸裁剪器转给卡面用（横版比例 + 回调）
let _cropCb = null;
function openCropEx(dataURL, cw, ch, onDone) {
  _cropCb = { w: cw, h: ch, fn: onDone };
  const st = document.getElementById('cropStage');
  if (st) st.style.aspectRatio = cw + ' / ' + ch;
  document.querySelector('.crop-head').textContent = '调整卡面图片';
  document.querySelector('.crop-sub').textContent = '拖动图片移动位置 · 滑杆缩放';
  openCrop(dataURL);
}
let bfEditId = null, bfPal = 0, bfOrgVal = 'unionpay';
function openBankForm(id) {
  bfEditId = id || null;
  const c = bfEditId ? BANK_CARDS.find(x => x.id === bfEditId) : null;
  // 关键修复：每次打开表单必须按当前卡片重置卡面图。
  // 旧代码 bfFace 从不重置 → 上一张卡的自选图一直残留：
  // ① 新建第二张卡时预览永远显示旧图，选自带配色「看起来无效」（有图时配色被忽略）
  // ② 保存时第二张卡会错误继承上一张的卡面图
  bfFace = c ? (c.face || '') : '';
  document.getElementById('bankFormTitle').textContent = c ? '编辑银行卡' : '新建银行卡';
  document.getElementById('bfBank').value = c ? c.bank : '';
  document.getElementById('bfNum').value = c ? c.num.replace(/(\d{4})(?=\d)/g, '$1 ') : '';
  document.getElementById('bfHolder').value = c ? c.holder : '';
  document.getElementById('bfExp').value = c ? c.exp : '';
  document.getElementById('bfCvv').value = c ? c.cvv : '';
  // 账单地址回填（选填，旧卡片无此字段则为空）
  const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setV('bfAddr', c && c.addr); setV('bfCity', c && c.city); setV('bfState', c && c.state);
  setV('bfCountry', c && c.country); setV('bfZip', c && c.zip);
  bfPal = c ? (c.pal || 0) : 0;
  const ts = document.getElementById('bfTypeSel');
  if (ts) ts.value = (c && c.type) ? (['储蓄卡','信用卡','借记卡','虚拟卡','贷记卡'].includes(c.type) ? c.type : 'custom') : '储蓄卡';
  const tc = document.getElementById('bfTypeCustom');
  if (tc) { tc.style.display = ts && ts.value === 'custom' ? '' : 'none'; tc.value = (c && c.type && !['储蓄卡','信用卡','借记卡','虚拟卡','贷记卡'].includes(c.type)) ? c.type : ''; }
  bfOrgVal = c ? (c.org || 'unionpay') : 'unionpay';
  bfOrgLabel = c && c.orgLabel ? c.orgLabel : '';
  const sel = document.getElementById('bfOrgSel');
  if (sel) sel.value = bfOrgVal === 'custom' ? 'custom' : (ORG_LABEL[bfOrgVal] ? bfOrgVal : 'custom');
  const custom = document.getElementById('bfOrgCustom');
  if (custom) { custom.style.display = bfOrgVal === 'custom' ? '' : 'none'; custom.value = bfOrgLabel; }
  renderBfColors();
  bfPreview();
  document.getElementById('bankForm').classList.add('show');
}
function closeBankForm() { document.getElementById('bankForm').classList.remove('show'); }
let bfOrgLabel = '';   // 自定义组织名
function bfOrgChange() {
  const sel = document.getElementById('bfOrgSel');
  bfOrgVal = sel.value;
  const custom = document.getElementById('bfOrgCustom');
  custom.style.display = bfOrgVal === 'custom' ? '' : 'none';
  if (bfOrgVal === 'custom') {
    bfOrgLabel = custom.value.trim() || 'BANK CARD';
  } else {
    bfOrgLabel = ORG_LABEL[bfOrgVal] || 'BANK CARD';
  }
  bfPreview();
}
function bfOrgLabelOf() {
  return bfOrgVal === 'custom' ? (document.getElementById('bfOrgCustom').value.trim() || 'BANK CARD') : (ORG_LABEL[bfOrgVal] || 'BANK CARD');
}
function renderBfColors() {
  const box = document.getElementById('bfColors');
  box.innerHTML = BANK_PALETTES.map((p, i) =>
    `<div class="bf-color${i === bfPal ? ' on' : ''}" style="background: linear-gradient(145deg, ${p.a}, ${p.b});" onclick="bfPal=${i};renderBfColors();bfPreview();" title="${p.name}"></div>`
  ).join('');
}
function bfPreview() {
  const box = document.getElementById('bfPreview');
  if (!box) return;
  const tmp = {
    id: bfEditId || 'tmp', pal: bfPal, org: bfOrgVal, type: '储蓄卡',
    bank: document.getElementById('bfBank').value || '银行名称',
    num: document.getElementById('bfNum').value.replace(/\s/g, '') || '0000000000000000',
    holder: (document.getElementById('bfHolder').value || '持卡人').toUpperCase(),
    exp: document.getElementById('bfExp').value || 'MM/YY',
    type: bfTypeLabelOf(),
  };
  const pal = BANK_PALETTES[bfPal % BANK_PALETTES.length];
  const faceImg = bfFace ? faceImgTag(bfFace) : '';
  const bg = bfFace ? '' : `background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);`;
  box.innerHTML = `<div class="bcard2" style="${bg}">
    ${faceImg}<div class="bcb-ol"></div>
    <div class="shine"></div>
    <div class="brow top"><span class="bankname">${bankEsc(tmp.bank)}</span><span class="org-badge org-${bfOrgVal === 'custom' ? 'custom' : bfOrgVal}"><i class="ob-ico"></i><b>${bankEsc(bfOrgLabelOf())}</b></span></div>
    <div class="brow num">${bankGroup(tmp.num) || '•••• •••• •••• ••••'}</div>
    <div class="brow bottom"><span>${bankEsc(tmp.holder)} · ${bankEsc(tmp.type)}</span><b>${bankEsc(tmp.exp)}</b></div>
  </div>`;
}
function saveBankForm() {
  const bank = document.getElementById('bfBank').value.trim();
  if (!bank) { showToast('请填写银行名称'); return; }
  if (bfExpBad) { showToast('有效期格式不对（月份需 01~12）'); return; }
  const num = document.getElementById('bfNum').value.replace(/\s/g, '');
  if (num.length < 13 || num.length > 19) { showToast('卡号需 13~19 位数字'); return; }
  const card = {
    id: bfEditId || ('k' + Date.now()),
    bank,
    org: bfOrgVal,
    orgLabel: bfOrgVal === 'custom' ? bfOrgLabelOf() : null,
    type: bfTypeLabelOf(),
    holder: document.getElementById('bfHolder').value.trim().toUpperCase(),
    num: /^\d{12,19}$/.test(num) ? num : (num || ''),
    exp: document.getElementById('bfExp').value.trim(),
    cvv: document.getElementById('bfCvv').value.trim(),
    pal: bfPal,
    face: bfFace || null,
    // 账单地址（选填，随卡片保存并随备份透传）
    addr: (document.getElementById('bfAddr') || { value: '' }).value.trim(),
    city: (document.getElementById('bfCity') || { value: '' }).value.trim(),
    state: (document.getElementById('bfState') || { value: '' }).value.trim(),
    country: (document.getElementById('bfCountry') || { value: '' }).value.trim(),
    zip: (document.getElementById('bfZip') || { value: '' }).value.trim(),
  };
  const i = BANK_CARDS.findIndex(x => x.id === card.id);
  if (i >= 0) { BANK_CARDS[i] = card; showToast('卡片已更新'); }
  else { BANK_CARDS.push(card); bankSel = BANK_CARDS.length - 1; showToast('卡片已添加'); }
  saveBankCards();
  closeBankForm();
  renderBankGallery();
}

// 启动初始化（模块在文件末尾，声明已就位）
loadBankCards();   // 仅从本地加载，无演示卡

// ＋ 号与扇叶按钮：按下立即响应（iOS 的 click 有延迟，等 click 会让人重复点 → 反而触发收起）
(function bindFabFastTap() {
  try {
    const fb = document.getElementById('fabBtn');
    if (fb) fb.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      fabNew();
    }, { passive: true });
    document.querySelectorAll('#fabOuter .fab-act').forEach((el, i) => {
      const what = ['tag', 'account', 'card'][i];   // HTML 顺序：a1=标签 a2=账号 a3=卡片
      if (!what) return;
      el.addEventListener('pointerdown', (ev) => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        fabNew3(what);
      }, { passive: true });
    });
  } catch (err) {}
})();

// 银行卡卡片页自检（模块定义在文件末尾）
if (location.search.includes('debug')) {
  setTimeout(() => {
    try {
      switchVault('card');
      const stage = document.getElementById('bankStage');
      const cards = document.querySelectorAll('#bankStage .bcard2');
      const sliderX = document.getElementById('vsegSlider').style.transform;
      const midBig = (() => {
        const mid = [...cards].find(el => Number(el.dataset.i) === bankSel);
        return mid ? mid.style.transform.includes('scale(1)') && !mid.style.transform.includes('scale(0.89)') : false;
      })();
      const upSmall = (() => {
        const up = [...cards].find(el => Number(el.dataset.i) === bankSel - 1);
        return up ? up.style.transform.includes('scale(0.89)') : 'N/A';
      })();
      // 模拟上滑切换
      const before = bankSel;
      const st = document.getElementById('bankStage');
      const rect = st.getBoundingClientRect();
      const mk = (type, y) => {
        const ev = new PointerEvent(type, { bubbles: true, cancelable: true });
        try { Object.defineProperty(ev, 'clientY', { value: y, configurable: true }); } catch (e) {}
        try { Object.defineProperty(ev, 'clientX', { value: rect.left + 150, configurable: true }); } catch (e) {}
        try { Object.defineProperty(ev, 'buttons', { value: 1, configurable: true }); } catch (e) {}
        return ev;
      };
      st.dispatchEvent(mk('pointerdown', rect.top + 300));
      st.dispatchEvent(mk('pointermove', rect.top + 200));   // 上滑 -100px
      st.dispatchEvent(mk('pointerup', rect.top + 200));
      const swiped = bankSel === before + 1;
      const formOK = (() => { openBankForm(null); const ok = !!document.getElementById('bankForm').classList.contains('show') && document.querySelectorAll('#bfColors .bf-color').length === 10; closeBankForm(); return ok; })();
      switchVault('pw');
      document.querySelector('.hdr p').textContent +=
        ' || 卡片页: 分段滑块=' + (sliderX.includes('119px') ? 'ok' : sliderX) + ' 画廊卡=' + cards.length + ' 中卡大=' + midBig + ' 上卡小=' + upSmall
        + ' 上滑切换=' + swiped + '(' + before + '→' + bankSel + ')' + ' 新建表单=' + formOK;
    } catch (e) {
      document.querySelector('.hdr p').textContent += ' || 卡片页自检异常: ' + e.message;
    }
  }, 2200);
}
