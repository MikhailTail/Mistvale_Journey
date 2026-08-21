/* =====================================================
 * 雾野列车 — engine.js
 * 引擎核心：游戏循环 / 输入 / 场景管理 / 缩放 / 光照
 * ===================================================== */
window.MIST = window.MIST || {};

MIST.Engine = (function () {
  const W = 480, H = 270;
  let canvas, ctx;
  let scene = null;
  let running = false;
  let lastTime = 0;
  const keys = {};
  const justPressed = {};
  let anyPressed = false;
  let frame = 0, gameTime = 0;

  /* ---------- 初始化 ---------- */
  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // 输入
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // 阻止方向键/空格滚动页面
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!keys[k]) justPressed[k] = true;
      anyPressed = true;
      keys[k] = true;
    });
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('blur', () => {
      for (const k in keys) keys[k] = false;
    });

    resize();
    window.addEventListener('resize', resize);
  }

  /* ---------- 保持 16:9 的整数倍缩放 ---------- */
  function resize() {
    const sw = window.innerWidth, sh = window.innerHeight;
    let scale = Math.min(sw / W, sh / H);
    scale = Math.max(1, Math.floor(scale * 2) / 2); // 允许 0.5 步进
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }

  /* ---------- 场景管理 ---------- */
  function setScene(s) {
    scene = s;
    if (scene.enter) scene.enter();
  }

  /* ---------- 输入查询 ---------- */
  const KEYMAP = {
    up: ['w', 'arrowup'],
    down: ['s', 'arrowdown'],
    left: ['a', 'arrowleft'],
    right: ['d', 'arrowright'],
    attack: ['j', 'z'],
    swap: ['k', 'x'],
    interact: ['e', ' ', 'enter'],
    menu: ['escape', 'i'],
    fullscreen: ['f'],
  };
  function down(action) {
    return KEYMAP[action].some((k) => keys[k]);
  }
  function pressed(action) {
    return KEYMAP[action].some((k) => justPressed[k]);
  }

  /* ---------- 主循环 ---------- */
  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - lastTime) / 1000, 1 / 20);
    lastTime = t;
    gameTime += dt;
    frame++;

    if (scene && scene.update) scene.update(dt);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (scene && scene.draw) scene.draw(ctx);

    // 帧末清空 justPressed
    for (const k in justPressed) justPressed[k] = false;
    anyPressed = false;

    requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  return {
    W, H, init, start, setScene, down, pressed,
    get ctx() { return ctx; },
    get canvas() { return canvas; },
    get frame() { return frame; },
    get time() { return gameTime; },
    get anyPressed() { return anyPressed; },
  };
})();

/* ---------- 通用绘制工具 ---------- */
MIST.Draw = {
  // 清晰像素感文字：微软雅黑粗体 + 四向粗描边 + 整数坐标
  text(ctx, str, x, y, opts = {}) {
    const size = opts.size || 10;
    const color = opts.color || '#f4f4f4';
    const shadow = opts.shadow === undefined ? '#1a1c2c' : opts.shadow;
    ctx.font = `${opts.bold === false ? '' : 'bold '}${size}px "Microsoft YaHei","PingFang SC","SimHei",sans-serif`;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'top';
    x = Math.round(x); y = Math.round(y);
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(str, x + 1, y + 1);
      ctx.fillText(str, x - 1, y + 1);
      ctx.fillText(str, x + 1, y - 1);
      ctx.fillText(str, x, y + 2);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  },
  /* 富文本绘制：§红字§ 标记（关键剧情/人物/道具）
   * richWrap：逐字测量自动换行；clipN 只绘制前 N 个可见字符（打字机用）；返回行数 */
  _richSeg(ctx, seg, isRed, redColor, baseColor, shadow, x, y) {
    const color = isRed ? redColor : baseColor;
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(seg, x + 1, y + 1);
      ctx.fillText(seg, x - 1, y + 1);
      ctx.fillText(seg, x + 1, y - 1);
      ctx.fillText(seg, x, y + 2);
    }
    ctx.fillStyle = color;
    ctx.fillText(seg, x, y);
  },
  // 逐字测量自动换行的富文本绘制（返回总行数）
  richWrap(ctx, str, x, y, maxW, opts = {}) {
    const size = opts.size || 10;
    ctx.font = `${opts.bold === false ? '' : 'bold '}${size}px "Microsoft YaHei","PingFang SC","SimHei",sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = opts.baseline || 'top';
    const clip = opts.clipN === undefined ? Infinity : opts.clipN;
    const redC = opts.red || '#ff5a5a';
    const baseC = opts.color || '#f4f4f4';
    const shadow = opts.shadow === undefined ? '#1a1c2c' : opts.shadow;
    // 展开为 [字符, 是否红] 序列
    const chars = [];
    let red = false;
    for (const ch of str) {
      if (ch === '§') { red = !red; continue; }
      chars.push([ch, red]);
    }
    let lineChars = [], drawn = 0, ly = y, lines = 0;
    const flush = () => {
      // 按红白分段绘制当前行
      let seg = '', segRed = null, lx = x;
      for (const [ch, r] of lineChars) {
        if (segRed === null) { segRed = r; }
        if (r !== segRed) {
          this._richSeg(ctx, seg, segRed, redC, baseC, shadow, lx, ly);
          lx += ctx.measureText(seg).width;
          seg = ''; segRed = r;
        }
        seg += ch;
      }
      if (seg) this._richSeg(ctx, seg, segRed, redC, baseC, shadow, lx, ly);
      lineChars = []; ly += (opts.lineH || size + 4); lines++;
    };
    for (const cr of chars) {
      if (drawn >= clip) break;
      const lineStr = lineChars.map((c) => c[0]).join('') + cr[0];
      if (lineChars.length && ctx.measureText(lineStr).width > maxW) flush();
      lineChars.push(cr); drawn++;
    }
    if (lineChars.length > 0) flush();
    return lines;
  },
  // 像素风圆角矩形对话框底
  panel(ctx, x, y, w, h, opts = {}) {
    const c1 = opts.bg || '#333c57', c2 = opts.border || '#94b0c2';
    ctx.fillStyle = 'rgba(26,28,44,.85)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = c1;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = c2;
    // 像素描边角
    ctx.fillRect(x + 2, y, w - 4, 2); ctx.fillRect(x + 2, y + h - 2, w - 4, 2);
    ctx.fillRect(x, y + 2, 2, h - 4); ctx.fillRect(x + w - 2, y + 2, 2, h - 4);
    ctx.fillRect(x + 1, y + 1, 2, 2); ctx.fillRect(x + w - 3, y + 1, 2, 2);
    ctx.fillRect(x + 1, y + h - 3, 2, 2); ctx.fillRect(x + w - 3, y + h - 3, 2, 2);
  },
  // 径向光（叠加到光照层）
  light(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, MIST.Draw._rgba(color, alpha));
    g.addColorStop(0.6, MIST.Draw._rgba(color, alpha * 0.35));
    g.addColorStop(1, MIST.Draw._rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  },
  _rgba(hex, a) {
    const c = MIST._hex(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  },
};
