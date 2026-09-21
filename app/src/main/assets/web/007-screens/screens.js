// 多页原型 · 底栏引擎 + 页面切换 + 验证码页 + 全局搜索筛选
const W_SEL = 1.4, W_OTHER = 0.9, W_GAP = 2.1;   /* 中间留白加大：左右 tab 图标不贴 + 号 */
const BAR_H = 69, PILL_H = 34;   /* 微椭圆胶囊（非圆形），BAR_H 对齐新 tab 栏高度 69 */

// ===== 用户数据安全输出 =====
// 所有来自账号 / 标签 / 备份文件的数据在渲染前必须过这两个函数：
//   esc()   —— HTML 文本转义（防破坏布局 / 注入）
//   jsStr() —— 生成可安全嵌入双引号 HTML 属性内、单引号 JS 字符串字面量
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] || m);
}
function jsStr(s) {
  return "'" + String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\//g, '<\\/') + "'";
}

// TABS: 0=密码库 1=验证码 2=⊕ 3=标签 4=设置（图标 = 桌面版同款 lucide）
const TABS = [
  { t: '密码库', ic: icon('lock', { w: 18 }) },
  { t: '验证码', ic: icon('timer', { w: 18 }) },
  null,
  { t: '标签', ic: icon('tag', { w: 18 }) },
  { t: '设置', ic: icon('settings-2', { w: 18 }) },
];

const PAGE_OF = { 0: 'page-vault', 1: 'page-totp', 3: 'page-tags', 4: 'page-settings' };

const tabbar = document.getElementById('tabbar');
let selected = 0;

// ===== 全局筛选状态（单次搜索，不显示、不留痕） =====
let query = '';
// ===== 标签系统（「全部」「收藏」固定不可删改；其余可在标签页增删改 + 选图标） =====
const TAG_ICON_CHOICES = [
  'briefcase', 'gamepad-2', 'shopping-bag', 'music', 'video', 'book',
  'plane', 'heart', 'home', 'wrench', 'camera', 'code',
  'mail', 'phone', 'users', 'coffee', 'dumbbell', 'graduation-cap',
  'wallet', 'key', 'headphones', 'tv', 'car', 'trophy',
];
// 颜色表（iOS 系统色 12 色）—— 新建/编辑标签时自选
const TAG_COLOR_CHOICES = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93',
];
const TAG_COLORS = ['#FB7299', '#3D9BFF', '#30D158', '#BF5AF2', '#FF9F0A', '#64D2FF', '#FFD60A'];   // 旧数据回退用

let TAGS = [
  { id: 'all', name: '全部', icon: '', fixed: true },
  { id: 'fav', name: '收藏', icon: '', fixed: true },
  { id: 't1', name: '娱乐', icon: 'film', color: '#FF2D55' },
  { id: 't2', name: '工作', icon: 'briefcase', color: '#007AFF' },
  { id: 't3', name: '游戏', icon: 'gamepad-2', color: '#5856D6' },
];
// 演示标签版本：改了默认标签就 +1 → 浏览器里的旧演示标签会被重置（避免残留测试标签）
const TAGS_VER = 2;
let activeTagId = 'all';

// 标签颜色：优先自定义色，否则按索引回退（兼容旧数据）
function tagColor(t) {
  if (t && t.color) return t.color;
  const i = TAGS.indexOf(t);
  return TAG_COLORS[(i < 0 ? 0 : i) % TAG_COLORS.length];
}

function saveTags() { try { localStorage.setItem('fvTags', JSON.stringify(TAGS)); } catch (e) {} }
function loadTags() {
  try {
    if (localStorage.getItem('fvTagsVer') !== String(TAGS_VER)) {   // 版本不符 → 丢掉旧演示标签（含测试标签）
      localStorage.setItem('fvTagsVer', String(TAGS_VER));
      localStorage.removeItem('fvTags');
      return;
    }
    const s = JSON.parse(localStorage.getItem('fvTags') || 'null');
    if (Array.isArray(s) && s.length >= 2 && s[0].id === 'all' && s[1].id === 'fav') {
      // 过滤：空名 / 无效标签 / 历史遗留的空标签（名字为 "00" 的那一个，一次性清理）
      TAGS = s.filter((t, i) => {
        if (i < 2) return true;                                   // 全部 / 收藏 固定保留
        if (!t || !t.id) return false;
        const n = String(t.name || '').trim();
        if (!n) return false;
        if (n === '00') return false;                             // 一次性清理遗留空标签
        return true;
      });
      if (TAGS.length !== s.length) saveTags();
    }
  } catch (e) {}
}
function tagById(id) { return TAGS.find(t => t.id === id) || TAGS[0]; }
function newTagId() { return 't' + Date.now().toString(36); }
// 当前标签是否命中某账号
function tagMatch(c) {
  const t = tagById(activeTagId);
  if (t.id === 'all') return true;
  if (t.id === 'fav') return !!c.fav;
  return c.cat === t.name;
}

function matchText(s) {
  if (!query) return true;
  return (s || '').toLowerCase().includes(query.toLowerCase());
}

// ---- 底栏构建 ----
function build() {
  let html = '<div class="tb-row">';
  TABS.forEach((t, i) => {
    if (t === null) {
      html += `<div class="tb-gap" data-i="${i}" style="flex-grow:${W_GAP}"></div>`;
    } else {
      const on = i === selected ? ' on' : '';
      html += `<div class="tb-slot${on}" data-i="${i}" style="flex-grow:${i === selected ? W_SEL : W_OTHER}">
        <div class="ic">${t.ic}</div>
        <div class="lb"><span>${t.t}</span></div></div>`;
    }
  });
  html += '</div>';
  html += `<div class="tb-pill" id="pill"><div class="disp"></div></div>`;
  tabbar.innerHTML = html;

  document.querySelectorAll('#tabbar .tb-slot').forEach(s => {
    const go = () => setSelected(parseInt(s.dataset.i));
    s.onclick = go;
    // 按下即切换（iOS 的 click 有延迟，等 click 会让人以为"没点中"而重复点）
    // setSelected 内部有 i===selected 幂等保护，pointerdown 后的 click 不会重复触发
    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      go();
    }, { passive: true });
  });
}

const slotIndexOf = (tabIdx) => tabIdx < 2 ? tabIdx : tabIdx - 1;   // 5 槽：gap 后槽位 -1

function setSelected(i) {
  if (i === selected) return;
  selected = i;
  document.querySelectorAll('#tabbar .tb-slot').forEach((s) => {
    const tabIdx = parseInt(s.dataset.i);
    const on = tabIdx === i;
    s.classList.toggle('on', on);
    s.style.setProperty('flex-grow', String(on ? W_SEL : W_OTHER));
  });
  switchPage(PAGE_OF[i]);
}


// ===== 强制滚动引擎 =====
// iOS WKWebView 的原生滚动层在切页后可能死亡（表现为滑不动/变长按选择），
// 这里完全绕开原生滚动：touchmove 手动改 scrollTop + 松手惯性，滚动能力永不失效。
function forceScrollBind(id) {
  const el = document.getElementById(id);
  if (!el || el.dataset.fsBound) return;
  el.dataset.fsBound = '1';
  let stY = 0, stX = 0, stTop = 0, lastY = 0, lastT = 0, vy = 0, tracking = false, raf = null;
  const max = () => Math.max(0, el.scrollHeight - el.clientHeight);
  const setST = (v) => { el.scrollTop = Math.min(Math.max(0, v), max()); };

  el.addEventListener('touchstart', (e) => {
    if (raf) { cancelAnimationFrame(raf); raf = null; }   // 打断惯性
    const t = e.touches[0];
    if (!t) return;
    stY = t.clientY; stX = t.clientX; stTop = el.scrollTop;
    lastY = t.clientY; lastT = performance.now(); vy = 0;
    tracking = true;
  }, { passive: true });   // touchstart 不 preventDefault：点按/左滑仍正常

  el.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    if (!t) return;
    const y = t.clientY;
    const dxAbs = Math.abs(t.clientX - stX);
    const dyAbs = Math.abs(y - stY);
    // 方向判定区：手指移动 12px 内先不接管滚动，等方向明确后再决定（真机左滑有弧线，
    // 过早滚动会让卡片上下抖动，用户以为"左滑无效"）
    if (dxAbs >= 12 && dxAbs > dyAbs * 0.9) { tracking = false; return; }   // 横向为主 → 交还左滑
    if (dyAbs < 12) return;                // 未明确方向：不滚、不 preventDefault（点按不受影响）
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    vy = (y - lastY) / dt;                 // px/ms（手指向下为正）
    lastY = y; lastT = now;
    if (e.cancelable) e.preventDefault();  // 阻断原生滚动/长按文本选择
    setST(stTop + (stY - y));              // 手指上移 → 内容下滚
  }, { passive: false });

  const stop = () => { tracking = false; momentum(); };
  el.addEventListener('touchend', stop);
  el.addEventListener('touchcancel', stop);

  function momentum() {                    // 松手惯性（iOS 手感：初速衰减）
    let v = -vy;                           // 内容下滚方向为正
    if (Math.abs(v) < 0.05) return;
    const step = () => {
      setST(el.scrollTop + v * 16);
      v *= 0.945;
      if (Math.abs(v) > 0.02 && max() > 0) raf = requestAnimationFrame(step);
      else raf = null;
    };
    raf = requestAnimationFrame(step);
  }
}

// 列表滚动高度适配：实测顶部占用 + tab 高度 → 设死 #list/#totpList 高度（iOS WKWebView 滚动可靠）
function fitListHeight(opts) {
  try {
    // 完整同步两个滚动滑块（轨道位置 + 热区层 + 拇指），不只在渲染时同步：
    // 切页后 vs 热区层（fixed 定位）会停在旧位置，导致右侧拖动失效
    ['vscL', 'vscT'].forEach(t => { if (typeof vsUpdate === 'function') vsUpdate(t); });
    // 列表高度由纯 CSS 链负责（flex:1 + min-height:0 + 父级 inset:0）——
    // 不再 JS 设高度：设高度 + 反复校准正是切页后 iOS 滚动层混乱的来源
    ['list', 'totpList'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      // 兜底：万一 CSS 链没生效（高度塌陷为 0）→ 保底给个高度
      if (el.offsetParent !== null && el.getBoundingClientRect().height < 120) {
        el.style.height = Math.max(200, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 92 - 16)) + 'px';
      }
    });
  } catch (e) {}
}

// 滚动层复活：iOS WKWebView 的 overflow 容器在页面切走后（opacity≈0 常驻渲染）仍可能丢滚动层。
// 「display 隐藏 → 强制重排 → 恢复」完整拆掉并重建滚动层（display 切换必重建），
// 再按保存的 scrollTop 恢复位置、重同步右侧滑块/热区。
function resurrectScroll(id) {
  try {
    const el = document.getElementById(id);
    if (!el) return;
    const st = el.scrollTop;
    // 保留原显示状态：银行卡视图时 #list 是内联 display:none，不能被复活逻辑恢复成可见
    const prevDisp = el.style.display;
    el.style.display = 'none';
    void el.offsetHeight;                 // 强制重排，滚动层彻底销毁
    el.style.display = prevDisp === 'none' ? 'none' : '';
    el.scrollTop = st;                    // 恢复滚动位置（display 切换会清零，必须手动还原）
    const syncTrack = id === 'list' ? 'vscL' : (id === 'totpList' ? 'vscT' : null);
    if (syncTrack && typeof vsUpdate === 'function') vsUpdate(syncTrack);
  } catch (e) {}
}

function switchPage(pageId) {
  if (!pageId) return;
  const fo = document.getElementById('fabOuter');
  if (fo && fo.classList.contains('open')) {
    fo.classList.remove('open');
    const fb = document.getElementById('fabBtn');
    if (fb) fb.classList.remove('open');
  }
  // 用户要求：切换页面即清空搜索（不留痕）
  if (query) { query = ''; applyFilters(); }
  document.querySelectorAll('.content').forEach(p => {
    p.classList.toggle('active', p.id === pageId);
  });
  // 用户要求：切换页面后顶部标签恢复「全部」——高亮立即改（轻量），重渲染放到下一帧
  const needReset = (pageId === PAGE_OF[0] || pageId === PAGE_OF[1]) && activeTagId !== 'all';
  if (needReset) {
    activeTagId = 'all';
    document.querySelectorAll('.chips .chip').forEach(el => el.classList.toggle('on', el.dataset.t === 'all'));
  }

  // 重活延后到下一帧：页面 class 已经切好（用户立刻看到切换），
  // 布局校准/滚动层复活/重渲染不再阻塞本次点击 → 不必反复点
  requestAnimationFrame(() => {
    try {
      if (needReset) { renderCards(); renderTOTP(); }
      if (pageId === PAGE_OF[1] && typeof renderTOTP === 'function') renderTOTP();   // 进验证码页立即渲染（不等 tick）
      fitListHeight();
      const pageList = { [PAGE_OF[0]]: ['list'], [PAGE_OF[1]]: ['totpList'], [PAGE_OF[3]]: ['tagList'], [PAGE_OF[4]]: ['settingsList'] };
      (pageList[pageId] || []).forEach(id => { resurrectScroll(id); setTimeout(() => resurrectScroll(id), 320); });
    } catch (e) {}
  });
}

// 顶部标签恢复「全部」（两组 chips 一起重置）
function resetChips() {
  if (activeTagId === 'all') return;   // 已经是全部 → 无需重渲染
  activeTagId = 'all';
  document.querySelectorAll('.chips .chip').forEach(el => el.classList.toggle('on', el.dataset.t === 'all'));
  renderCards();
  renderTOTP();
}

// ===== 水滴胶囊引擎（比例速度追踪 + 椭圆形变 + 路过点亮） =====
let pillX = null, pillW = 0, pillH = 44, pillVel = 0;

function engine() {
  const pill = document.getElementById('pill');
  if (!pill) return;

  // 槽位位置缓存：只读布局 → 每 100ms 刷新一次（之前每帧 6 次 getBoundingClientRect，真机上 layout 抖动=动画看着慢/卡）
  let slotCache = [], slotCacheT = 0;
  const BASE_W = 44, BASE_H = PILL_H;
  const readSlots = () => {
    const barRect = tabbar.getBoundingClientRect();
    const els = [...document.querySelectorAll('#tabbar .tb-slot')];
    slotCache = els.map((s, i) => {
      const r = s.getBoundingClientRect();
      // 测量槽内内容轮廓（.ic 图标 + .lb 文字）→ pill 贴合内容尺寸 + 用「内容联合中心」定位（不是槽中心，防视觉偏移）
      let ccw = 0, chh = 0, ccx = null;
      const ico = s.querySelector('.ic');
      const lab = s.querySelector('.lb');
      const a = ico ? ico.getBoundingClientRect() : null;
      const b = lab ? lab.getBoundingClientRect() : null;
      if (a) { ccw = Math.max(ccw, a.width); chh += a.height; }
      if (b) { ccw = Math.max(ccw, b.width); chh += b.height; }
      if (a && b) ccx = (a.left + a.width / 2 + b.left + b.width / 2) / 2;
      else if (a) ccx = a.left + a.width / 2;
      else if (b) ccx = b.left + b.width / 2;
      const cw = ccw > 0 ? ccw + 26 : 0;   // 左右 +13
      // vision 实测补偿：联合中心 +6px（画面上框子比内容偏左，右侧更紧）
      const cx = ccx != null ? (ccx - barRect.left + 6) : (r.left - barRect.left + r.width / 2 + 6);
      return { cx, w: r.width, cw, el: els[i] };
    });
    slotCacheT = performance.now();
  };
  readSlots();

  const step = () => {
    if (performance.now() - slotCacheT > 60) readSlots();   // 槽位缓存 60ms 刷新，追 flex 动画更快
    const target = slotCache[slotIndexOf(selected)];
    if (target) {
      // 高度固定包住「图标+文字」：18(图标行) + 4(间隙) + 12(文字) + 上下留白10 = 44
      const targetW = target.cw ? Math.min(target.cw, 64) : Math.max(Math.min(target.w * 0.85, 54), 34);
      const targetH = 44;
      const targetX = target.cx;
      if (pillX === null) { pillX = targetX; pillW = targetW; pillH = targetH; }

      const dist = targetX - pillX;
      // 速度：上限 16px/帧；加速 .5 → 跟手且平滑
      const vTarget = dist > 0 ? Math.min(dist * 0.72, 32) : Math.max(dist * 0.72, -32);
      pillVel += (vTarget - pillVel) * 0.72;
      pillX += pillVel;
      pillW += (targetW - pillW) * 0.2;
      pillH += (targetH - pillH) * 0.2;

      // 无水滴变形：尺寸贴合内容，只水平滑动
      const w = pillW, h = pillH;
      const cx = pillX - w / 2;
      const cy = (BAR_H - h) / 2;

      pill.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(1, 1)`;

      for (const sl of slotCache) {
        const d = Math.abs(pillX - sl.cx);
        const reach = Math.max(sl.w * 0.80, 46);
        const lit = Math.pow(Math.max(0, 1 - d / reach), 1.5);
        if (sl.el) sl.el.style.setProperty('--lit', lit.toFixed(3));
      }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ===== 密码库页 =====
const CARDS = [];   // 无内置测试账号（全新用户从空开始）
// 密码库卡片所用的小圆环（r=9.5）
const MR = 9.5, MCIRC = 2 * Math.PI * MR;

// 把选中的 chip 平滑滚到可视区中间 —— 只滚动 chips 容器自身，绝不带动整页
function scrollChipToCenter(chip) {
  const box = chip.closest('.chips');
  if (!box) return;
  const target = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
  const left = Math.max(0, target);
  if (typeof box.scrollTo === 'function') box.scrollTo({ left: left, behavior: 'smooth' });
  else box.scrollLeft = left;   // 兜底：老 WebView 无 Element.scrollTo
}

// 同步 chips 两端模糊遮罩（滚到最左 → 左侧遮罩隐；滚到最右 → 右侧遮罩隐）
function syncChipEdges() {
  document.querySelectorAll('.chips').forEach(box => {
    const rail = box.parentElement;
    if (!rail || !rail.classList.contains('chips-rail')) return;
    const max = box.scrollWidth - box.clientWidth;
    rail.classList.toggle('edge-l', box.scrollLeft > 4);
    rail.classList.toggle('edge-r', box.scrollLeft < max - 4);
  });
}

// 标签栏滑动 —— 重做版（极简、零状态残留）
// 设计原则：
//   ① `dragging` 类只影响光标与 scroll-behavior，**绝不碰 pointer-events**（旧版就是死在这）
//   ② 点击判定纯用坐标比较（click 时的 clientX vs 按下的位置），**不设任何会残留的标志位**
//   ③ `e.buttons === 0` 直接返回 —— 没按着就不管（松手丢失事件也天然无害）
function chipsDragBind() {
  document.querySelectorAll('.chips').forEach(box => {
    if (box.dataset.chipsBound) return;      // 防重复绑定（reviveList 会重调）
    box.dataset.chipsBound = '1';
    box.addEventListener('scroll', syncChipEdges, { passive: true });
    let downX = null, startScroll = 0, drag = false, moved = 0;   // downX 初始必须为 null：未按下的容器在 window 级 touchmove 里直接返回（否则另一组 chips 会被误拖）
    let lastX = 0, lastT = 0, vx = 0, raf = null;

    box.addEventListener('touchstart', e => {
          const t = e.touches[0]; if (!t) return;
          if (e.target.closest('.swipe-wrap') || e.target.closest('.card')) { downX = null; return; }  // 卡片区左滑归卡片，标签不抢
          if (raf) { cancelAnimationFrame(raf); raf = null; }   // 再次按住 → 停下惯性
          downX = lastX = t.clientX;
          startScroll = box.scrollLeft;
          lastT = performance.now(); vx = 0; drag = false; moved = 0;
        }, { passive: true });

        window.addEventListener('touchmove', e => {
          if (downX === null) return;              // 本次按下在卡片区 → 不参与标签拖动
          const t = e.touches[0]; if (!t) return;
          const dx = t.clientX - downX;
      if (!drag) {
        if (Math.abs(dx) < 8) return;              // 阈值内 → 还不算拖动（鼠标点击手抖几像素是常态）
        drag = true;
        moved = Math.abs(dx);
        box.classList.add('dragging');
      }
      moved = Math.max(moved, Math.abs(dx));       // 本次按下的真实位移（点击判定用）
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) vx = vx * 0.7 + ((t.clientX - lastX) / dt) * 0.3;   // 平滑速度（抗抖）
      lastX = t.clientX; lastT = now;
      box.scrollLeft = startScroll - dx;           // 拖多少滑多少
    }, { passive: true });

    window.addEventListener('touchend', () => {
      box.classList.remove('dragging');
      if (!drag) return;
      drag = false;
      let v = -vx * 14;                            // ---- 惯性甩动：松手后按速度继续滑 ----
      if (Math.abs(v) < 1.2) return;
      const glide = () => {
        const before = box.scrollLeft;
        box.scrollLeft += v;
        v *= 0.94;                                 // 每帧衰减 6%
        if (box.scrollLeft === before || Math.abs(v) <= 0.4) { raf = null; return; }   // 顶到边界/速度耗尽 → 停
        raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    }, { passive: true });

    // 拖过 8px 就不当点击（按"本次按下"的位移判定，连点第二个标签不再被误吞）
    box.addEventListener('click', e => {
      if (moved > 8) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });
}

// 标签 chips（密码库 + 验证码页共用；点选时只切 class 不重建，保证动画流畅）
function renderChips() {
  // 标签 chips（仅密码库页；验证码页已移除标签功能，始终显示全部验证码）
  ['vaultChips'].forEach(boxId => {
    const box = document.getElementById(boxId);
    if (!box) return;
    const isTotp = false;
    box.innerHTML = TAGS.map(t => {
      const on = t.id === activeTagId ? ' on' : '';
      const ic = t.icon ? `<span class="chip-ic" style="--tc:${tagColor(t)}">${icon(t.icon, { w: 13 })}</span>` : '';
      return `<button class="chip${on}" data-t="${t.id}" onclick="setChip('${t.id}'${isTotp ? ',true' : ''})">${ic}<span>${esc(t.name)}</span></button>`;
    }).join('');
  });
  syncChipEdges();   // 渲染后刷新两端模糊遮罩
}

// 切换标签：只作用于「点击的那一组 chips」（密码库 / 验证码 各自独立高亮，互不干扰）
function setChip(id, fromTotp) {
  activeTagId = id;
  if (fromTotp) totpPage = 0; else listPage = 0;   // 切标签回第一页
  const box = document.getElementById(fromTotp ? 'totpChips' : 'vaultChips');
  if (box) {
    box.querySelectorAll('.chip').forEach(el => el.classList.toggle('on', el.dataset.t === id));
    const hit = box.querySelector('.chip[data-t="' + id + '"]');
    if (hit) {
      hit.classList.remove('pop');
      void hit.offsetWidth;          // 强制重排以重启动画
      hit.classList.add('pop');
      scrollChipToCenter(hit);       // 滑块：只滚 chips 自身，不带动整页
    }
  }
  // 重渲染延后到下一帧：标签高亮/pop 动画已经立即生效，
  // 列表渲染不再阻塞本次点击（iOS 上重渲染会让人以为"没点上"而重复点）
  requestAnimationFrame(() => {
    try { renderCards(true); renderTOTP(); } catch (e) {}
  });
}

let listPage = 0, totpPage = 0;   // 分页翻页（▲▼ 按钮上下调节，告别 iOS 滚动）
const PAGE_SIZE_MIN = 3, PAGE_SIZE_MAX = 10;
let pageSize = 6;   // 自适应：每页条数按屏幕剩余高度计算
// 屏幕自适应：可用高度 → 每页条数（保证内容 + 分页条完整在 tab 栏上方）
function calcPageSize() {
  const el = document.getElementById('list') || document.getElementById('totpList');
  if (!el) return pageSize;
  const avail = el.clientHeight || (window.innerHeight - 330);
  if (avail < 120) return pageSize;
  // 精确：卡片行高用真实样例实测（含间距），分页条约 50px + 底部余量 8
  let rowH = 92;
  const sample = el.querySelector('.swipe-wrap, .totp-card');
  if (sample) rowH = Math.round(sample.getBoundingClientRect().height + 9);
  const n = Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, Math.floor((avail - 50 - 8) / rowH)));
  pageSize = n;
  return n;
}
// ===== 右侧竖向滚动滑块（草图方案：拖动滑块上下浏览，不依赖 iOS 触摸滚动） =====
const VSCROLLS = {};
function bindVScroll(trackId, listId) {
  // 【弃用】右侧滑块已删除，滚动回归纯原生（CSS 高度链 + overflow）。函数空转，
  // VSCROLLS 保持空 → vsUpdate/vsPlace 内部 guard 自动跳过，零副作用。
  return;
  const track = document.getElementById(trackId);
  const list = document.getElementById(listId);
  if (!track || !list) return;
  if (VSCROLLS[trackId]) {
    if (VSCROLLS[trackId].zone) VSCROLLS[trackId].zone.remove();   // 重绑前清理旧热区层
    return;
  }
  const thumb = track.querySelector('.vs-thumb');
  VSCROLLS[trackId] = { track, list, thumb };
  list.addEventListener('scroll', () => { vsUpdate(trackId); }, { passive: true });
  const py = (e) => {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? t.clientY : (e.clientY || 0);
  };
  const attachMove = (down) => {
    // 增量拖动：按下时记住起点（位置 + 当前 scrollTop），拖动距离 × 比例映射到内容滚动
    const startY = py(down);
    const startST = list.scrollTop;
    const rStart = track.getBoundingClientRect();
    const max0 = Math.max(0, list.scrollHeight - list.clientHeight);
    const k = max0 / Math.max(1, rStart.height - 24);   // 内容可滚长 / 轨道长 → 拖动放大系数
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const y = py(ev);
      const dy = y - startY;
      list.scrollTop = Math.min(Math.max(0, startST + dy * k), Math.max(0, list.scrollHeight - list.clientHeight));
      vsUpdate(trackId);
    };
    const up = () => {
      track.classList.remove('active', 'hold');
      try { safeBottom(list); } catch (e) {}     // 松手兜底（safeBottom 内部已 220ms 防抖，不打断惯性）
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    track.classList.add('active', 'hold');
    // 增量拖动：按下已记起点，无需额外调用
  };
  // 触屏（轨道上）
  track.addEventListener('touchstart', (e) => { e.preventDefault(); attachMove(e); }, { passive: false });
  // 鼠标（预览窗/桌面调试）
  track.addEventListener('mousedown', (e) => { if (e.button === 0) attachMove(e); });
  // 独立热区层（touch-action:none）：列表右缘快速按下即进入滑块拖动
  // 不寄生 list：iOS 才不会把拖动当原生滚动手势（list pan-y 上 preventDefault → 松手重置回顶）
  const zone = document.createElement('div');
  zone.className = 'vs-zone';
  zone.style.position = 'fixed';       // fixed：脱离 .phone stacking context，永在最顶可命中
  document.body.appendChild(zone);
  VSCROLLS[trackId].zone = zone;
  zone.addEventListener('touchstart', (e) => { e.preventDefault(); attachMove(e); }, { passive: false });
  zone.addEventListener('mousedown', (e) => { if (e.button === 0) attachMove(e); });
  // 卡片左滑展开时 zone 让位（不挡展开的按钮）；收起恢复
  document.addEventListener('swipeState', (e) => {
    zone.style.pointerEvents = e.detail.open ? 'none' : '';
  });
  try { vsUpdate(trackId); } catch (e) {}
}
// 轨道范围对齐：顶部不超过标签块，底部不超过 tab 栏（实测列表容器矩形）
function vsPlace(trackId, listId) {
  const track = document.getElementById(trackId);
  const list = document.getElementById(listId);
  if (!track || !list) return;
  try {
    // 相对页面（.phone 内）定位：预览窗手机框内与真机行为一致，绝不跑出软件范围
    const page = list.closest('.content') || list.parentElement;
    const pr = page.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const tab = document.getElementById('tabbar');
    const tabRect = tab ? tab.getBoundingClientRect() : { top: window.innerHeight - 92 };
    track.style.position = 'absolute';
    track.style.top = Math.round(lr.top - pr.top) + 'px';
    track.style.left = 'auto';
    track.style.bottom = 'auto';
    track.style.right = '0';
    // 范围：顶=列表顶（标签块下方），底=tab 栏上方留 4px（相对同一坐标系）
    const h = Math.max(60, Math.round((tabRect.top - pr.top) - (lr.top - pr.top) - 12));   // 底距 tab 留 12px
    track.style.height = h + 'px';
  } catch (e) {}
}
// 到底安全校正：WebKit 的 scrollHeight 不含 padding-bottom → 滚到底最后一条会被 tab 挡
// 这里直接按"最后一条卡底 ≤ tab 上方 14px"自校正（任何引擎都生效）
function safeBottom(list) {
  // 防抖：滚动停止 220ms 后才校正 —— 滚动中修改 scrollTop 会打断 iOS 原生滚动/惯性
  clearTimeout(list.__safeT);
  list.__safeT = setTimeout(() => {
    try {
      const cards = list.querySelectorAll('.swipe-wrap, .totp-card');
      const last = cards[cards.length - 1];
      if (!last) return;
      const tab = document.getElementById('tabbar');
      const tabTop = tab ? tab.getBoundingClientRect().top : window.innerHeight - 92;
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      const lb0 = last.getBoundingClientRect();
      // 校正条件：①滚动已到底（最后一条可能整条被 tab 遮住）或 ②最后一条部分露出但底越线
      // 中途滚动（最后一条还在屏幕深处）绝不干预 —— 否则拖动会被拉回
      if ((list.scrollTop >= max - 4 || lb0.top < tabTop) && lb0.bottom > tabTop - 14) {
        // 一步到位：直接算目标 scrollTop（到位后条件自然为 false，不再触发 → 无拉锯）
        list.scrollTop = Math.max(0, list.scrollTop - (lb0.bottom - (tabTop - 14)));
      }
    } catch (e) {}
  }, 220);
}
function vsUpdate(trackId) {
  const v = VSCROLLS[trackId];
  if (!v) return;
  safeBottom(v.list);            // 滚动/拖动后自校正（最后一条永远完整在 tab 上方）
  // zone 位置同步到轨道（覆盖轨道 ± 余量）
  if (v.zone) {
    const tr = v.track.getBoundingClientRect();
    v.zone.style.top = Math.max(0, Math.round(tr.top - 3)) + 'px';
    v.zone.style.height = Math.max(40, Math.round(tr.height + 6)) + 'px';
  }
  vsPlace(trackId, v.list.id);           // 每次刷新同时校准范围（实时精确）
  const max = Math.max(0, v.list.scrollHeight - v.list.clientHeight);
  const th = Math.max(30, Math.round(v.track.clientHeight * v.list.clientHeight / Math.max(1, v.list.scrollHeight)));
  v.thumb.style.height = th + 'px';
  const top = max > 0 ? (v.list.scrollTop / max) * (v.track.clientHeight - th) : 0;
  v.thumb.style.transform = 'translate(-50%, ' + top + 'px)';   // 保留居中 + 纵向位移
  // 自适应显示：内容超高才浮现（scrollHeight 与内容估算双判定，手机 WKWebView 也稳）
  let needScroll = v.list.scrollHeight > v.list.clientHeight + 2;
  if (!needScroll) {
    const cnt = v.list.querySelectorAll('.swipe-wrap, .totp-card').length;
    needScroll = cnt > 0 && (cnt * 96 > v.list.clientHeight);
  }
  // 常驻可见：内容少时低透明(0.25)，可滚动时全亮(1)——始终能看到滑块，可用性自适应
  v.track.style.opacity = needScroll ? '1' : '0.25';
  v.track.style.transition = 'opacity .3s ease';
  v.track.classList.toggle('show', needScroll);
}

function renderCards(animate) {
  const box = document.getElementById('list');
  const items = CARDS.filter(c => tagMatch(c) && matchText(c.t + ' ' + c.s))
    .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));  // 收藏置顶（对标桌面版）

  // FLIP ①：记录旧卡片纵向位置（按账号名作 key）
  const oldTop = {};
  if (animate) {
    box.querySelectorAll('.card').forEach(el => {
      if (el.dataset.t) oldTop[el.dataset.t] = el.getBoundingClientRect().top;
    });
  }

  if (!items.length) {
    box.innerHTML = '<div class="empty">没有匹配的账号</div>';
    if (animate) box.querySelector('.empty').classList.add('enter');
    return;
  }

  // 全量渲染 + 右侧竖向滚动滑块（草图方案：拖动滑块上下浏览，不用左右翻页）
  box.innerHTML = items.map((c, i) => {
    // 验证码：接入实时 TOTP 引擎（同账号 = 同码同相位，与验证码页同步）
    const ti = c.totp ? TOTP_ITEMS.find(x => x.key === c.totp) : null;
    if (ti && !ti.code) ti.code = randCode();
    const totp = ti ? `<div class="mtotp">
        <code class="mcode" id="mcode-${ti.key}">${ti.code}</code>
        <svg class="mring" id="mring-${ti.key}" width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(-90deg)">
          <circle cx="12" cy="12" r="${MR}" fill="none" stroke="rgba(100,210,255,.18)" stroke-width="3"/>
          <circle class="mbar" cx="12" cy="12" r="${MR}" fill="none" stroke="#64D2FF" stroke-width="3" stroke-linecap="round"
            stroke-dasharray="${MCIRC}" stroke-dashoffset="0"/>
        </svg></div>` : '';
const star = c.fav ? icon('star', { w: 13, cls: 'fstar' }) : '';
    const ico = c.icon
      ? `<div class="ico" style="background:rgba(255,255,255,.12)"><img src="${esc(c.icon)}" alt="" data-d="${esc(c.site || '')}" onerror="this.onerror=null;var d=this.dataset.d||'';d=d.replace(/^https?:\/\//,'').split('/')[0];if(d)this.src='https://icons.duckduckgo.com/ip3/'+encodeURIComponent(d)+'.ico'" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`
      : `<div class="ico" style="background:${esc(c.c)}">${esc(c.t[0])}</div>`;
    const ci = CARDS.indexOf(c);
    return `<div class="swipe-wrap">
      <div class="swipe-actions">
        <button class="sw-btn sw-del" onclick="swipeAct(event,${ci},'del')" title="删除">${icon('trash-2', { w: 17 })}</button>
        <button class="sw-btn sw-fav" onclick="swipeAct(event,${ci},'fav')" title="${c.fav ? '取消收藏' : '收藏'}">${icon('star', { w: 17 })}</button>
        <button class="sw-btn sw-edit" onclick="swipeAct(event,${ci},'edit')" title="编辑">${icon('pencil', { w: 17 })}</button>
      </div>
      <div class="card" data-t="${esc(c.t)}" onclick="openDetail(${jsStr(c.t)})">
        ${ico}
        <div class="meta"><div class="t">${esc(c.t)}</div><div class="s">${esc(c.s)}</div></div>
        ${totp}
        ${star}
        <svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>`;
  }).join('');
  fitListHeight();          // 渲染后设死列表可视高度（轨道范围随之精确对齐）
  vsUpdate('vscL');

  // FLIP ②：留存的卡片平滑滑到新位置；新出现的卡片交错入场
  if (animate) {
    box.querySelectorAll('.card').forEach((el, i) => {
      const prev = oldTop[el.dataset.t];
      if (prev != null) {
        const dy = prev - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) {
          el.style.transition = 'none';
          el.style.transform = 'translateY(' + dy + 'px)';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = 'transform .4s cubic-bezier(.22,1,.36,1)';
            el.style.transform = '';
            setTimeout(() => { el.style.transition = ''; }, 440);
          }));
        }
      } else {
        el.classList.add('enter');
        el.style.animationDelay = (i * 0.045) + 's';
        // 动画播完必须摘掉 .enter：cardIn 是 fill-mode:both，
        // 残留的动画 transform 会永久压过左滑写入的内联 transform（表现为"左滑不显示"）
        setTimeout(() => {
          el.classList.remove('enter');
          el.style.animationDelay = '';
        }, 340 + i * 45 + 80);
      }
    });
  }
}

// ===== 卡片左滑（全局委托：一个处理器管所有卡片，重建 DOM 也不需要重新绑定） =====
const SW_W = 146;   // 按钮区总宽（3×42 + 间距）

let swSt = null;        // 当前滑动状态
let swJustMoved = false; // 抑制拖动后的误点击

// 每个按钮「刚开始露出」的宽度（DOM 顺序：删除 / 收藏 / 编辑）
// 布局：padding-right 6 → 编辑(6~48) → gap → 收藏(55~97) → gap → 删除(104~146)
// 只要开始露出一点点就触发弹动（不等完整露出）
const SW_NEED = [105, 56, 7];

// 按当前露出宽度，给"刚开始露出"的按钮触发弹入动画
function syncBtnPop(actions, revealW) {
  if (!actions) return;
  actions.querySelectorAll('.sw-btn').forEach((btn, i) => {
    const need = SW_NEED[i] !== undefined ? SW_NEED[i] : 105;
    if (revealW >= need && btn.dataset.shown !== '1') {
      btn.dataset.shown = '1';
      btn.classList.remove('pop');
      void btn.offsetWidth;          // 重排以重启动画
      btn.classList.add('pop');
    } else if (btn.dataset.shown === '1' && revealW < need - 4) {
      btn.dataset.shown = '';        // 收回一点后可再次弹（4px 滞回防抖动）
      btn.classList.remove('pop');
    }
  });
}

function swipeReset(wrap) {
  if (!wrap) return;                      // 防护：列表被筛选清空时可能拿到 undefined
  const card = wrap.querySelector('.card');
  const actions = wrap.querySelector('.swipe-actions');
  if (!card) return;
  card.style.transition = 'transform .44s cubic-bezier(.22,1.28,.36,1), border-radius .44s ease, box-shadow .44s ease';
  card.style.transform = '';
  card.style.borderRadius = '';
  card.style.boxShadow = '';
  wrap.style.borderRadius = '';
  if (actions) {
    actions.querySelectorAll('.sw-btn').forEach(b => { b.dataset.shown = ''; b.classList.remove('pop'); });
    actions.style.transition = 'width .44s cubic-bezier(.22,1.28,.36,1)';
    actions.style.width = '0px';
  }
  wrap.classList.remove('sw-open');
  try { document.dispatchEvent(new CustomEvent('swipeState', { detail: { open: false } })); } catch (e) {}
}

function closeOtherSwipe(except) {
  document.querySelectorAll('#list .swipe-wrap.sw-open').forEach(w => {
    if (w === except) return;
    swipeReset(w);
  });
}

function swipeFinish() {
  const st = swSt;
  if (!st) return;
  swSt = null;
  // 速度感知：快速左滑（甩动）+ 已滑出一定距离 → 即使没过半也展开
  const flung = st.vx < -0.32 && Math.abs(st.dx) >= 40;   // 甩动阈值放宽（真机 touchmove 采样频率低，vx 偏小）
  const shouldOpen = flung || Math.abs(st.dx) >= st.cardW * 0.30;   // 滑过 30% 即展开
  const spring = 'cubic-bezier(.22,1.28,.36,1)';   // 轻微过冲 → 弹簧感
  st.card.style.transition = 'transform .44s ' + spring + ', border-radius .44s ease, box-shadow .44s ease';
  if (st.actions) st.actions.style.transition = 'width .44s ' + spring;
  if (shouldOpen) {
    st.card.style.transform = 'translateX(-' + SW_W + 'px) scale(.985)';
    st.card.style.borderRadius = '20px';
    st.card.style.boxShadow = '0 12px 30px rgba(0,0,0,.42)';
    st.wrap.style.borderRadius = '20px';
    if (st.actions) st.actions.style.width = SW_W + 'px';
    st.wrap.classList.add('sw-open');
    syncBtnPop(st.actions, SW_W);   // 补弹（快速甩动时没来得及逐个露出的按钮）
    closeOtherSwipe(st.wrap);
    try { document.dispatchEvent(new CustomEvent('swipeState', { detail: { open: true } })); } catch (e) {}
  } else {
    st.card.style.transform = '';        // 不到一半且没甩动 → 弹性回弹
    st.card.style.borderRadius = '';
    st.card.style.boxShadow = '';
    st.wrap.style.borderRadius = '';
    if (st.actions) st.actions.style.width = '0px';
    st.wrap.classList.remove('sw-open');
  }
  if (st.moved) {
    swJustMoved = true;
    setTimeout(() => { swJustMoved = false; }, 60);
  }
}


// 滚动层重生（已废弃：改用纯 CSS 高度链 + opacity 常驻渲染，不再重建节点）

function swipeBind() {
  const list = document.getElementById('list');
  if (!list || list.dataset.swBound) return;
  list.dataset.swBound = '1';

  // 按下（被动监听，绝不拖慢滚动判定）：识别是哪张卡片
  list.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    const wrap = e.target.closest('.swipe-wrap');
    if (!wrap) return;
    if (e.target.closest('.sw-btn')) return;      // 按钮交给自己的 onclick
    const card = wrap.querySelector('.card');
    const actions = wrap.querySelector('.swipe-actions');
    const isOpen = wrap.classList.contains('sw-open');
    const cardW = card.offsetWidth || 300;
    if (card.classList.contains('enter')) card.classList.remove('enter');   // 摘掉入场动画，保证左滑 transform 生效
    swSt = {
      wrap, card, actions, cardW,
      sx: t.clientX, sy: t.clientY,
      base: isOpen ? -SW_W : 0,
      dx: isOpen ? -SW_W : 0,
      limit: Math.max(SW_W + 30, cardW * 0.6),
      moved: false, active: false,
      vx: 0, lastX: t.clientX, lastT: performance.now(),
    };
  }, { passive: true });

  // 移动（passive:false 仅用于"横向激活后"阻止原生手势；纵向从未 preventDefault → 滚动永不被吞）
  document.addEventListener('touchmove', (e) => {
    if (!swSt) return;
    const t = e.touches[0];
    if (!t) return;
    const mx = t.clientX - swSt.sx, my = t.clientY - swSt.sy;
    if (!swSt.active) {
      // 纵向为主 → 直接放弃横向手势，滚动交还浏览器（不 preventDefault）
      if (Math.abs(my) > Math.abs(mx) * 1.1 && Math.abs(my) > 14) {
        swipeReset(swSt.wrap);
        swSt = null;
        return;
      }
      // 横向 ≥12px 且不弱于纵向即激活（真机左滑带弧线：阈值太严会被判成滚动→左滑失效）
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 0.9) return;
      swSt.active = true;
      swSt.card.style.transition = 'none';
      if (swSt.actions) swSt.actions.style.transition = 'none';
      e.preventDefault();                          // 激活后锁住原生手势，全权交给 JS 滑动
    }
    // 速度追踪（px/ms，负值 = 向左甩）
    const now = performance.now();
    const dt = Math.max(1, now - swSt.lastT);
    swSt.vx = (t.clientX - swSt.lastX) / dt;
    swSt.lastX = t.clientX; swSt.lastT = now;

    if (Math.abs(mx) > 5) swSt.moved = true;
    swSt.dx = Math.max(-swSt.limit, Math.min(0, swSt.base + mx));

    // 卡片形态随进度变化：轻微缩小 + 圆角张开 + 浮起阴影
    const p = Math.min(1, Math.abs(swSt.dx) / SW_W);
    swSt.card.style.transform = 'translateX(' + swSt.dx + 'px) scale(' + (1 - p * 0.015).toFixed(4) + ')';
    swSt.card.style.borderRadius = (16 + p * 5).toFixed(1) + 'px';
    swSt.wrap.style.borderRadius = (16 + p * 5).toFixed(1) + 'px';
    swSt.card.style.boxShadow = p > 0.04
      ? '0 ' + (3 + p * 10).toFixed(1) + 'px ' + (10 + p * 18).toFixed(0) + 'px rgba(0,0,0,' + (0.15 + p * 0.25).toFixed(2) + ')'
      : '';
    // 按钮层裁切：卡片让出多少就显示多少（玻璃下永不透色）+ 完整露出一个就弹一次
    if (swSt.actions) {
      const revealW = Math.min(Math.abs(swSt.dx), SW_W);
      swSt.actions.style.width = revealW + 'px';
      syncBtnPop(swSt.actions, revealW);
    }
  }, { passive: false });

  document.addEventListener('touchend', () => { if (swSt) swipeFinish(); }, { passive: true });
  document.addEventListener('touchcancel', () => { if (swSt) swipeFinish(); }, { passive: true });

  // 点击：拖动后抑制误触；已展开时点卡片 = 收起
  list.addEventListener('click', (e) => {
    const wrap = e.target.closest('.swipe-wrap');
    if (!wrap) return;
    if (e.target.closest('.sw-btn')) return;
    if (swJustMoved) { e.stopPropagation(); e.preventDefault(); return; }
    if (wrap.classList.contains('sw-open')) {
      e.stopPropagation(); e.preventDefault();
      swipeReset(wrap);
    }
  }, true);
}


function swipeAct(e, idx, act) {
  if (e) e.stopPropagation();
  const c = CARDS[idx];
  if (!c) return;
  if (act === 'del') {
    const name = c.t;
    CARDS.splice(idx, 1);
    const ti = (typeof TOTP_ITEMS !== 'undefined') ? TOTP_ITEMS.findIndex(x => x.t === name) : -1;
    if (ti >= 0) TOTP_ITEMS.splice(ti, 1);
    renderChips(); renderCards(); renderTags();
    if (typeof renderTOTP === 'function') renderTOTP();
    if (typeof saveCardsData === 'function') saveCardsData();   // 左滑删除立即落盘（重开不复活）
    showToast('已删除「' + name + '」');
  } else if (act === 'fav') {
    c.fav = !c.fav;
    renderCards();
    if (typeof saveCardsData === 'function') saveCardsData();   // 收藏状态落盘
    showToast(c.fav ? '已收藏「' + c.t + '」' : '已取消收藏「' + c.t + '」');
  } else if (act === 'edit') {
    openEditor(idx);
  }
}

// ===== 验证码页（实时倒计时 + 可筛选） =====
const TOTP_ITEMS = [];   // 无内置测试验证码
const PERIOD = 30;
let totpOffset = 0;   // TOTP 时间偏移校正（秒），设置 → 高级里调整
try { totpOffset = parseInt(localStorage.getItem('fvTotpOffset') || '0', 10) || 0; } catch (e) {}   // 重进软件后仍生效
const R = 11.5, CIRC = 2 * Math.PI * R;

function randCode() {
  const n = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return n.slice(0, 3) + ' ' + n.slice(3);
}

// ===== 真 TOTP 引擎（RFC 6238：base32 → HMAC-SHA1 → 动态截断，与 PC 端/Google Authenticator 同码） =====
function b32Decode(s) {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s || '').replace(/[^A-Za-z2-7]/g, '').toUpperCase();
  let bits = 0, val = 0; const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = ALPHA.indexOf(clean[i]);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}
function sha1Bytes(bytes) {
  const l = bytes.length;
  const ml = (((l + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(ml);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(ml - 8, Math.floor((l * 8) / 0x100000000));
  dv.setUint32(ml - 4, (l * 8) >>> 0);
  const h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
  const w = new Array(80);
  for (let i = 0; i < ml; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4);
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = ((x << 1) | (x >>> 31)) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = tmp;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 5; i++) odv.setUint32(i * 4, h[i] >>> 0);
  return out;
}
function hmacSha1(key, msg) {
  const B = 64;
  let k = key;
  if (k.length > B) k = sha1Bytes(k);
  const ipad = new Uint8Array(B), opad = new Uint8Array(B);
  for (let i = 0; i < B; i++) { ipad[i] = 0x36; opad[i] = 0x5c; }
  for (let i = 0; i < k.length; i++) { ipad[i] ^= k[i]; opad[i] ^= k[i]; }
  const inner = sha1Bytes(new Uint8Array([...ipad, ...msg]));
  return sha1Bytes(new Uint8Array([...opad, ...inner]));
}
// ===== 验证码参数解析 =====
// PC 端的密钥可能是「纯 base32」也可能是「完整 otpauth:// 链接」（Google 迁移导入的格式，
// 可能带 SHA256/SHA512、8 位码、自定义周期）—— 必须按链接里的参数生成，否则与 PC 端不同码。
const OTP_PARSE_CACHE = {};

// ---- Google 迁移链接解析（otpauth-migration://offline?data=BASE64PROTOBUF）----
// PC 端导入 Google 验证器时存的就是这种链接；iOS 必须解出里面的真实密钥，
// 否则把整串链接当 base32 解码 → 与 PC 端完全不同码。
function b64ToBytes(b64) {
  const s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function protoVarint(b, pos) {
  let result = 0, shift = 0, p = pos;
  while (p < b.length) {
    const byte = b[p]; result |= (byte & 0x7f) << shift; p++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, p];
}
function protoFields(b) {
  const out = []; let pos = 0;
  while (pos < b.length) {
    let tag; const r0 = protoVarint(b, pos); tag = r0[0]; pos = r0[1];
    const fieldNo = tag >> 3, wireType = tag & 7;
    if (wireType === 0) { const r1 = protoVarint(b, pos); out.push({ tag: fieldNo, v: r1[0] }); pos = r1[1]; }
    else if (wireType === 2) {
      const r2 = protoVarint(b, pos); const len = r2[0]; pos = r2[1];
      out.push({ tag: fieldNo, v: b.slice(pos, pos + len) }); pos += len;
    } else break;
  }
  return out;
}
function bytesToB32(b) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < b.length; i++) bits += b[i].toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function parseMigrationUri(uri) {
  try {
    const u = new URL(uri);
    const data = u.searchParams.get('data');
    if (!data) return [];
    const buf = b64ToBytes(data);
    const list = [];
    protoFields(buf).forEach(f => {
      if (f.tag !== 1 || !(f.v && f.v.length !== undefined)) return;   // otp_parameters
      let secret = '', name = '', issuer = '', algo = 'SHA-1', digits = 6, period = 30;
      protoFields(f.v).forEach(g => {
        if (g.tag === 1 && g.v && g.v.length !== undefined) secret = bytesToB32(g.v);
        else if (g.tag === 2 && g.v && g.v.length !== undefined) name = String.fromCharCode.apply(null, g.v);
        else if (g.tag === 3 && g.v && g.v.length !== undefined) issuer = String.fromCharCode.apply(null, g.v);
        else if (g.tag === 4) algo = g.v === 2 ? 'SHA-256' : (g.v === 3 ? 'SHA-512' : 'SHA-1');
        else if (g.tag === 5) digits = g.v === 2 ? 8 : 6;
        else if (g.tag === 7) period = g.v || 30;
      });
      if (secret) list.push({ secret: secret, name: name, issuer: issuer, algo: algo, digits: digits, period: period });
    });
    return list;
  } catch (e) { return []; }
}

function otpParams(str) {
  const raw = String(str == null ? '' : str).trim();
  if (OTP_PARSE_CACHE[raw]) return OTP_PARSE_CACHE[raw];
  let out = { secret: raw, algo: 'SHA-1', digits: 6, period: 30 };
  // Google 迁移链接：解出第一条的真实密钥与参数
  if (/^otpauth-migration:\/\//i.test(raw)) {
    const list = parseMigrationUri(raw);
    if (list.length) {
      out = { secret: list[0].secret, algo: list[0].algo, digits: list[0].digits, period: list[0].period };
    }
    OTP_PARSE_CACHE[raw] = out;
    return out;
  }
  if (/^otpauth:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const sec = u.searchParams.get('secret') || '';
      let al = (u.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      al = al.indexOf('256') >= 0 ? 'SHA-256' : (al.indexOf('512') >= 0 ? 'SHA-512' : 'SHA-1');
      out = {
        secret: sec,
        algo: al,
        digits: parseInt(u.searchParams.get('digits') || '6', 10) || 6,
        period: parseInt(u.searchParams.get('period') || '30', 10) || 30,
      };
    } catch (e) {}
  }
  OTP_PARSE_CACHE[raw] = out;
  return out;
}
// 窗口计数（按 period 换算，支持非 30 秒周期）
function otpCounter(period, offset) {
  const now = Date.now() / 1000 + (Number(offset) || 0);
  return { counter: Math.floor(now / period), t0: now };
}
function otpTruncate(h, digits) {
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % Math.pow(10, digits)).padStart(digits, '0');
}

// SHA-1 路径（纯 JS 同步，绝大多数验证码走这里）
function totpNow(secret, offset) {
  try {
    const pr = otpParams(secret);
    const key = b32Decode(pr.secret);
    if (!key.length) return '------';
    const { counter } = otpCounter(pr.period, offset);
    const msg = new ArrayBuffer(8);
    const dv = new DataView(msg);
    dv.setUint32(0, Math.floor(counter / 0x100000000));
    dv.setUint32(4, counter >>> 0);
    return otpTruncate(hmacSha1(key, new Uint8Array(msg)), pr.digits);
  } catch (e) { return '------'; }
}

// SHA-256 / SHA-512 路径（Web Crypto 异步；结果按「周期+参数」缓存，避免重复计算）
const OTP_ASYNC_CACHE = {};
function totpAsync(secret, offset) {
  try {
    const pr = otpParams(secret);
    if (pr.algo === 'SHA-1') return Promise.resolve(totpNow(secret, offset));
    const key = b32Decode(pr.secret);
    if (!key.length) return Promise.resolve('------');
    const { counter } = otpCounter(pr.period, offset);
    const cacheKey = pr.algo + '|' + pr.digits + '|' + pr.period + '|' + counter + '|' + secret;
    if (OTP_ASYNC_CACHE[cacheKey]) return Promise.resolve(OTP_ASYNC_CACHE[cacheKey]);
    const msg = new ArrayBuffer(8);
    const dv = new DataView(msg);
    dv.setUint32(0, Math.floor(counter / 0x100000000));
    dv.setUint32(4, counter >>> 0);
    return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: pr.algo }, false, ['sign'])
      .then(k => crypto.subtle.sign('HMAC', k, new Uint8Array(msg)))
      .then(sig => {
        const code = otpTruncate(new Uint8Array(sig), pr.digits);
        // 缓存只保留最近 40 条（跨窗口自动失效）
        const keys = Object.keys(OTP_ASYNC_CACHE);
        if (keys.length > 40) delete OTP_ASYNC_CACHE[keys[0]];
        OTP_ASYNC_CACHE[cacheKey] = code;
        return code;
      })
      .catch(() => '------');
  } catch (e) { return Promise.resolve('------'); }
}

function renderTOTP() {
  fitListHeight();
  // 验证码页已移除标签功能：不再按标签筛选，始终显示全部（仅保留搜索过滤）
  const items = TOTP_ITEMS.filter(it => matchText(it.t + ' ' + it.s));
  const box = document.getElementById('totpList');
  if (!items.length) { box.innerHTML = '<div class="empty">没有匹配的验证码</div>'; vsUpdate('vscT'); return; }
  // 全量渲染（同密码库：右侧滚动滑块）
  box.innerHTML = items.map(it => {
    if (!it.code) {
      const pr0 = otpParams(it.s);
      if (pr0.algo === 'SHA-1') it.code = totpNow(it.s, it.offset);
      else {
        it.code = '······';
        (function (item) {
          totpAsync(item.s, item.offset).then(c => {
            item.code = c;
            const el = document.getElementById('code-' + item.key);
            if (el) el.textContent = c;
          });
        })(it);
      }
    }
    // 关联账号：副标题显示"对应账号"(用户名/邮箱)，无则显示账号标题；图标按网站自动获取
    const acct = CARDS.find(c => c.totp && c.totp === it.key);
    const site = (acct && acct.site) ? acct.site : '';
    const acctName = (acct && (acct.user || acct.t)) ? (acct.user || acct.t) : '';
    const iconUrl = site
      ? (acct.icon || 'https://icon.horse/icon/' + encodeURIComponent(String(site).replace(/^https?:\/\//, '').split('/')[0]))
      : '';
    const icoHtml = iconUrl
      ? `<div class="ico" style="background:rgba(255,255,255,.12)"><img src="${esc(iconUrl)}" alt="" data-d="${esc(site)}" onerror="this.onerror=null;var d=this.dataset.d||'';d=d.replace(/^https?:\/\//,'').split('/')[0];if(d)this.src='https://icons.duckduckgo.com/ip3/'+encodeURIComponent(d)+'.ico'" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`
      : `<div class="ico" style="background:${esc(it.c)}">${esc(it.t[0])}</div>`;
    const sHtml = acctName ? `<div class="s">${esc(acctName)}</div>` : '';   // 账号名，不是网址
    return `<div class="totp-card" data-key="${it.key}">
      ${icoHtml}
      <div class="meta"><div class="t">${esc(it.t)}</div>${sHtml}</div>
      <div class="code" id="code-${it.key}">${it.code}</div>
      <div class="ring" id="ring-${it.key}">
        <svg width="30" height="30" viewBox="0 0 30 30">
          <circle class="track" cx="15" cy="15" r="${R}"/>
          <circle class="bar" cx="15" cy="15" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>
        </svg>
        <div class="sec" id="sec-${it.key}">30</div>
      </div>
    </div>`;
  }).join('');
  fitListHeight();
  vsUpdate('vscT');

  document.querySelectorAll('.totp-card').forEach(card => {
    card.onclick = () => {
      const it = TOTP_ITEMS.find(x => x.key === card.dataset.key);
      if (it) copyToast(it.t, it.code || randCode());
    };
  });
}

function tickTOTP() {
  const now = Date.now() / 1000 + totpOffset;   // totpOffset：设置里手动校正的时间偏移（秒）
  TOTP_ITEMS.forEach(it => {
    const pr = otpParams(it.s);                   // 每条目自己的周期/算法/位数（otpauth 链接可能不同）
    const period = pr.period || PERIOD;
    const phase = (now + it.offset) % period;
    const remain = period - phase;
    const cycle = Math.floor((now + it.offset) / period);
    const frac = remain / period;
    const expiring = remain <= 5;

    // 换新码：验证码页 + 密码库卡片 + 详情页 同步
    if (it.lastCycle !== cycle) {
      it.lastCycle = cycle;
      if (pr.algo === 'SHA-1') {
        it.code = totpNow(it.s, it.offset);     // 同步：绝大多数验证码
        const ce = document.getElementById('code-' + it.key);
        if (ce) ce.textContent = it.code;
        const mce0 = document.getElementById('mcode-' + it.key);
        if (mce0) mce0.textContent = it.code;
      } else {
        it.code = '······';                      // SHA256/512：异步算，先占位
        const ce = document.getElementById('code-' + it.key);
        if (ce) ce.textContent = it.code;
        totpAsync(it.s, it.offset).then(code => {
          it.code = code;
          const c1 = document.getElementById('code-' + it.key);
          if (c1) c1.textContent = code;
          const c2 = document.getElementById('mcode-' + it.key);
          if (c2) c2.textContent = code;
          const c3 = document.getElementById('dcode-' + it.key);
          if (c3) c3.textContent = code;
        });
      }
    }

    // 验证码页：倒计时圆环 + 秒数
    const ring = document.getElementById('ring-' + it.key);
    if (ring) {
      ring.querySelector('.bar').setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
      const sec = document.getElementById('sec-' + it.key);
      if (sec) sec.textContent = Math.ceil(remain);
      ring.classList.toggle('expiring', expiring);
      const ce = document.getElementById('code-' + it.key);
      if (ce) ce.classList.toggle('expiring', expiring);
    }

    // 密码库卡片：小圆环 + 到期变色（实时）
    const mring = document.getElementById('mring-' + it.key);
    if (mring) {
      mring.querySelector('.mbar').setAttribute('stroke-dashoffset', String(MCIRC * (1 - frac)));
      mring.classList.toggle('expiring', expiring);
      const mce = document.getElementById('mcode-' + it.key);
      if (mce) mce.classList.toggle('expiring', expiring);
    }

    // 详情页验证码：实时同步 + 到期变色 + 剩余秒数
    const dce = document.getElementById('dcode-' + it.key);
    if (dce) {
      if (dce.textContent !== it.code) dce.textContent = it.code;
      dce.style.color = expiring ? '#FF9F0A' : '#64D2FF';
    }
    const dsec = document.getElementById('dsec-' + it.key);
    if (dsec) dsec.textContent = Math.ceil(remain);
  });
  requestAnimationFrame(tickTOTP);
}

// ===== 标签页（数据同源：与密码库 chips 共用 TAGS） =====

function tagCount(t) {
  if (t.id === 'all') return CARDS.length;
  if (t.id === 'fav') return CARDS.filter(c => c.fav).length;
  return CARDS.filter(c => c.cat === t.name).length;
}

function renderTags() {
  const box = document.getElementById('tagList');
  const items = TAGS.filter(t => matchText(t.name));
  const cards = items.map(t => {
    const c = tagColor(t);
    const ic = t.icon ? icon(t.icon, { w: 17 }) : '';
    const lead = ic
      ? `<div class="tag-ic" style="color:${c}">${ic}</div>`
      : `<div class="dot" style="background:${c}"></div>`;
    const tail = t.fixed
      ? `<span class="tag-fixed">固定</span>`
      : `<button class="tag-edit" onclick="event.stopPropagation();openTagEditor('${t.id}')" aria-label="编辑标签">${icon('pencil', { w: 13 })}</button>`;
    return `
    <div class="tag-card" onclick="openTag('${t.id}')">
      ${lead}
      <div class="n">${esc(t.name)}</div>
      <div class="c">${tagCount(t)} 项</div>
      ${tail}
    </div>`;
  }).join('');
  box.innerHTML = cards;   // 新建入口已移到右上角 + 号
}

// 点标签 → 跳到密码库并自动选中该标签（只高亮密码库顶部那组，验证码页的不受影响）
function openTag(id) {
  if (selected !== 0) setSelected(0);   // 先回密码库（切页会先把标签重置为全部）
  query = '';                            // 清掉搜索
  activeTagId = id;
  const vc = document.getElementById('vaultChips');
  if (vc) {
    vc.querySelectorAll('.chip').forEach(el => el.classList.toggle('on', el.dataset.t === id));
    const hit = vc.querySelector('.chip[data-t="' + id + '"]');
    if (hit) {
      hit.classList.remove('pop'); void hit.offsetWidth; hit.classList.add('pop');
      scrollChipToCenter(hit);
    }
  }
  renderCards(true);   // 交错入场
  renderTOTP();
  renderTags();
}

// ===== 标签编辑（新建 / 改名 / 选图标 / 删除） =====
let editingTagId = null;   // null = 新建

function openTagEditor(id) {
  editingTagId = id || null;
  const t = id ? TAGS.find(x => x.id === id) : null;
  document.getElementById('tagEditorTitle').textContent = t ? '编辑标签' : '新建标签';
  document.getElementById('tagNameInput').value = t ? t.name : '';
  document.getElementById('tagDeleteWrap').style.display = t ? '' : 'none';
  renderIconGrid(t ? t.icon : '');
  renderColorGrid(t ? tagColor(t) : TAG_COLOR_CHOICES[6]);   // 新建时默认蓝色
  document.getElementById('tagEditor').classList.add('show');
  setTimeout(() => document.getElementById('tagNameInput').focus(), 350);
}

function renderIconGrid(sel) {
  const grid = document.getElementById('tagIconGrid');
  grid.innerHTML = TAG_ICON_CHOICES.map(n =>
    `<div class="icon-cell${n === sel ? ' sel' : ''}" data-ic="${n}" onclick="pickTagIcon('${n}')">${icon(n, { w: 20 })}</div>`
  ).join('');
}

function pickTagIcon(n) {
  document.querySelectorAll('#tagIconGrid .icon-cell').forEach(el => el.classList.toggle('sel', el.dataset.ic === n));
}

function selectedTagIcon() {
  const el = document.querySelector('#tagIconGrid .icon-cell.sel');
  return el ? el.dataset.ic : '';
}

// 颜色表（12 色）—— 图标与标签卡片都跟着这个颜色走
function renderColorGrid(sel) {
  const grid = document.getElementById('tagColorGrid');
  if (!grid) return;
  grid.innerHTML = TAG_COLOR_CHOICES.map(c =>
    `<div class="color-cell${c === sel ? ' sel' : ''}" data-color="${c}" style="--cc:${c}" onclick="pickTagColor('${c}')"><i></i></div>`
  ).join('');
}

function pickTagColor(c) {
  document.querySelectorAll('#tagColorGrid .color-cell').forEach(el => el.classList.toggle('sel', el.dataset.color === c));
}

function selectedTagColor() {
  const el = document.querySelector('#tagColorGrid .color-cell.sel');
  return el ? el.dataset.color : TAG_COLOR_CHOICES[6];
}

function saveTagEditor() {
  const name = document.getElementById('tagNameInput').value.trim();
  if (!name) { showToast('请输入标签名称'); return; }
  const dup = TAGS.find(t => t.name === name && t.id !== editingTagId);
  if (dup) { showToast('已存在同名标签'); return; }
  const ic = selectedTagIcon();
  const col = selectedTagColor();
  if (editingTagId) {
    const t = TAGS.find(x => x.id === editingTagId);
    const oldName = t.name;
    t.name = name; t.icon = ic; t.color = col;
    if (oldName !== name) {   // 改名 → 同步账号与验证码的分类
      CARDS.forEach(c => { if (c.cat === oldName) c.cat = name; });
      TOTP_ITEMS.forEach(it => { if (it.cat === oldName) it.cat = name; });
    }
    showToast('标签已更新');
  } else {
    TAGS.push({ id: newTagId(), name, icon: ic, color: col });
    showToast('已新建标签「' + name + '」');
  }
  saveTags();
  closeTagEditor();
  renderChips(); renderTags(); renderCards(); renderTOTP();
}

function deleteTag() {
  if (!editingTagId) return;
  const t = TAGS.find(x => x.id === editingTagId);
  if (!t || t.fixed) return;
  const n = t.name;
  TAGS = TAGS.filter(x => x.id !== editingTagId);
  CARDS.forEach(c => { if (c.cat === n) c.cat = ''; });        // 账号归入未分类
  TOTP_ITEMS.forEach(it => { if (it.cat === n) it.cat = ''; });
  if (activeTagId === editingTagId) activeTagId = 'all';
  saveTags();
  closeTagEditor();
  renderChips(); renderTags(); renderCards(); renderTOTP();
  showToast('已删除标签「' + n + '」');
}

function closeTagEditor() {
  document.getElementById('tagEditor').classList.remove('show');
  editingTagId = null;
}

// ===== 搜索 & 筛选 =====
function openSearch() {
  const ov = document.getElementById('searchOverlay');
  ov.classList.add('show');
  const inp = document.getElementById('searchInput');
  inp.value = '';
  setTimeout(() => inp.focus(), 70);
}

function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('show');
}

function doSearch() {
  const inp = document.getElementById('searchInput');
  // 每次搜索直接替换当前筛选（空输入 = 清空筛选）
  query = inp.value.trim();
  closeSearch();
  renderCards(true);   // 结果刷新用交错入场
  renderTOTP();
  renderTags();
}

function applyFilters() {
  listPage = 0; totpPage = 0;   // 搜索/筛选后回第一页
  renderCards();
  renderTOTP();
  renderTags();
}

// ===== Toast =====
let toastTimer = null;
function copyToast(name, code) {
  const t = document.getElementById('toast');
  t.textContent = `已复制 ${code} · ${name}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  if (navigator.clipboard) navigator.clipboard.writeText(String(code).replace(' ', '')).catch(() => {});
  // 剪贴板自动清理：30 秒后清空（与 extra.js copyVal 同一策略）
  clearTimeout(window.__clipTimer);
  window.__clipTimer = setTimeout(() => {
    if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
    t.textContent = '已自动清空剪贴板';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }, 30000);
}

// ---- 事件绑定 ----
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
  if (e.key === 'Escape') closeSearch();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSearch();
});

// ---- 启动 ----
build();
swipeBind();      // 左滑（全局委托，只需一次）
loadTags();       // 读取用户自定义标签（localStorage）
chipsDragBind();  // chips 鼠标拖拽滑动
renderChips();
renderCards();
renderTOTP();
renderTags();
tickTOTP();
engine();
window.addEventListener('resize', fitListHeight);
// 强制滚动引擎：JS 全接管列表手势（不依赖 iOS 原生滚动层——切页后永不失效）
try { ['list', 'totpList', 'tagList', 'settingsList'].forEach(forceScrollBind); } catch (e) {}

// 竖向滚动滑块绑定（密码库 / 验证码）
setTimeout(() => {
  try { bindVScroll('vscL', 'list'); bindVScroll('vscT', 'totpList'); } catch (e) {}
}, 400);
