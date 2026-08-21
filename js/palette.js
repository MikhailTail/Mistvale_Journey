/* =====================================================
 * 雾野列车 — palette.js
 * 调色板 + 像素画渲染工具
 * 色彩理念（致敬《风来之国》）：Sweetie-16 高饱和复古基调
 * 扩展肤色/棕色/雾紫，地下霓虹 + 地表暖调
 * ===================================================== */
window.MIST = window.MIST || {};

MIST.PAL = {
  '.': null,          // 透明
  '0': '#1a1c2c',     // 近黑（轮廓/瞳）
  '1': '#5d275d',     // 暗紫
  '2': '#b13e53',     // 红
  '3': '#ef7d57',     // 橙
  '4': '#ffcd75',     // 黄（灯光）
  '5': '#a7f070',     // 亮绿
  '6': '#38b764',     // 绿
  '7': '#257179',     // 深青
  '8': '#29366f',     // 深蓝
  '9': '#3b5dc9',     // 蓝
  'a': '#41a6f6',     // 天蓝
  'b': '#73eff7',     // 浅青
  'c': '#f4f4f4',     // 白
  'd': '#94b0c2',     // 浅灰蓝
  'e': '#566c86',     // 灰蓝
  'f': '#333c57',     // 暗灰蓝
  'g': '#7a4841',     // 深棕
  'h': '#ad6242',     // 赭石
  'i': '#dabfff',     // 淡紫（菌/瘴雾）
  'j': '#ff9db0',     // 粉（腮红）
  'k': '#ffd8b1',     // 肤色亮
  'l': '#c98d6b',     // 肤色暗
  'm': '#2b1e1a',     // 深棕（洛恩发/须）
  'n': '#4a3626',     // 棕
  'o': '#e8e8e8',     // 灰白
  'p': '#3a2e3f',     // 暗紫灰
  'q': '#8b955f',     // 军绿
  'r': '#c4b57d',     // 卡其工装
  's': '#9a8054',     // 卡其暗
  't': '#5a4a68',     // 雾紫
  'u': '#f7f7ff',     // 雪白（小芽发）
  'v': '#c9c9e8',     // 银发影
  'w': '#7de0d6',     // 芽光青
  'x': '#ff8f3f',     // 亮橙
};

/* 将字符串数组像素画渲染为离屏 canvas */
MIST.makeSprite = function (rows) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = MIST.PAL[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
};

/* 水平镜像 */
MIST.flipH = function (cv) {
  const m = document.createElement('canvas');
  m.width = cv.width; m.height = cv.height;
  const ctx = m.getContext('2d');
  ctx.translate(cv.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cv, 0, 0);
  return m;
};

/* 着色替换（用于同形状不同配色，如敌人变色） */
MIST.recolor = function (cv, map) {
  const m = document.createElement('canvas');
  m.width = cv.width; m.height = cv.height;
  const ctx = m.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  const img = ctx.getImageData(0, 0, m.width, m.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    const to = map[key];
    if (to) {
      const c = MIST._hex(to);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  ctx.putImageData(img, 0, 0);
  return m;
};

MIST._hex = function (hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
};

/* 随机数（带种子，保证草地噪点等稳定） */
MIST.rng = function (seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
