/* =====================================================
 * 雾野列车 — cutscene.js
 * 过场动画系统：镜头特写（pan / zoom）、分镜字幕、淡入淡出
 * 在世界观层面与「列车」接壤：结局乘列车进入新章节《晴原》
 * 用法：
 *   MIST.Cutscene.play(game, { shots: [...], onDone })
 * 每个 shot 类型：
 *   focus  {type:'focus', tx, ty, zoom, dur, sfx?}  镜头平滑移向 (tx,ty) 并缩放
 *   fade   {type:'fade', dir:'in'|'out'|'hold', dur} 黑幕：in=渐显(露出画面) out=渐隐(盖黑) hold=保持
 *   text   {type:'text', who, lines, dur?}           分镜字幕（复用 richWrap，支持 §红字§）
 *   sfx    {type:'sfx', name}                         音效
 *   wait   {type:'wait', dur}                         停留
 *   zoom   （同 focus 但可单独用）
 * ===================================================== */
window.MIST = window.MIST || {};

(function () {
  const E = MIST.Engine;
  const Draw = MIST.Draw;
  const Audio = MIST.Audio;

  let active = null;   // 当前过场
  let gameRef = null;

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // 计算相机，使其聚焦 (tx,ty) 且缩放 zoom，画面中心对准目标
  function camForFocus(tx, ty, zoom) {
    zoom = zoom || 1;
    const vw = E.W / zoom, vh = E.H / zoom;
    let cx = tx - vw / 2;
    let cy = ty - vh / 2;
    // 限制在地图范围内
    const m = gameRef.map;
    if (m.pxW < vw) cx = (m.pxW - vw) / 2;
    else cx = Math.max(0, Math.min(m.pxW - vw, cx));
    if (m.pxH < vh) cy = (m.pxH - vh) / 2;
    else cy = Math.max(0, Math.min(m.pxH - vh, cy));
    return { x: cx, y: cy, zoom };
  }

  const Cutscene = {
    get active() { return !!active; },

    /* 启动一个过场 */
    play(game, def) {
      gameRef = game;
      // 备份相机，结束后还原
      const back = { x: game.cam.x, y: game.cam.y, zoom: game.cam.zoom || 1 };
      active = {
        shots: def.shots || [],
        i: -1,
        t: 0,
        fade: 1,                 // 1=全黑 0=透明
        cam: { ...game.cam, zoom: game.cam.zoom || 1 },
        target: null,
        text: null,
        textShown: 0,
        onDone: def.onDone,
        back,
        done: false,
        train: def.train || null, // 可选：列车动画参数
      };
      game.state = 'cinematic';
      this._next();
    },

    _next() {
      const a = active;
      a.i++;
      a.t = 0;
      a.text = null;
      a.textShown = 0;
      // 列车动画每镜重置推进
      if (a.train) a.train.t = 0;

      if (a.i >= a.shots.length) { this._finish(); return; }
      const sh = a.shots[a.i];
      if (sh.type === 'focus') {
        a.target = camForFocus(sh.tx, sh.ty, sh.zoom);
        a.focusDur = sh.dur || 1.2;
        if (sh.sfx) Audio.sfx(sh.sfx);
      } else if (sh.type === 'fade') {
        a.fadeDir = sh.dir;       // 'in' | 'out' | 'hold'
        a.fadeDur = sh.dur || 1.0;
        a.fadeFrom = a.fade;
        a.fadeTo = sh.dir === 'out' ? 1 : (sh.dir === 'in' ? 0 : a.fade);
      } else if (sh.type === 'text') {
        a.text = sh;
        a.textFull = sh.lines.slice();
        a.textShown = 0;
        a.textTimer = 0;
        a.textComplete = false;       // advance 置 true 表示「已显示全句」
        a.textChars = sh.lines.join('\n').length + 4;
        a.textDur = sh.dur || Math.max(2.2, a.textChars * 0.045);
        if (sh.sfx) Audio.sfx(sh.sfx);
      } else if (sh.type === 'sfx') {
        Audio.sfx(sh.name);
        this._next();
      } else if (sh.type === 'wait') {
        a.waitDur = sh.dur || 1.0;
      }
    },

    _finish() {
      const a = active;
      a.done = true;
      const cb = a.onDone;
      const back = a.back;
      active = null;
      // 还原相机
      gameRef.cam.x = back.x; gameRef.cam.y = back.y; gameRef.cam.zoom = back.zoom;
      if (cb) cb();
    },

    /* 玩家推进（空格/回车/E）：文本直接显示完整，focus/wait 可快进 */
    advance() {
      if (!active) return;
      const sh = active.shots[active.i];
      if (sh.type === 'text') {
        if (!active.textComplete) {
          active.textComplete = true;       // 第一次：立即显示全句
          active.textShown = active.textChars;
        } else {
          this._next();                     // 第二次：进入下一镜
        }
      } else {
        // focus / fade / wait 直接结束本镜
        this._next();
      }
    },

    update(dt) {
      if (!active) return;
      const a = active;
      a.t += dt;
      const sh = a.shots[a.i];

      // 相机插值（focus）
      if (sh.type === 'focus' && a.target) {
        const k = Math.min(1, dt * 4.5);    // 平滑跟随
        a.cam.x += (a.target.x - a.cam.x) * k;
        a.cam.y += (a.target.y - a.cam.y) * k;
        a.cam.zoom += (a.target.zoom - a.cam.zoom) * k;
        // 列车若启用，随时间驶入
        if (a.train) {
          a.train.t += dt;
        }
      } else if (sh.type === 'fade') {
        const p = Math.min(1, a.t / a.fadeDur);
        a.fade = a.fadeFrom + (a.fadeTo - a.fadeFrom) * easeInOut(p);
      } else if (sh.type === 'text') {
        // 打字机（advance 已显示全句时保持 full，不回退）
        a.textTimer += dt;
        if (!a.textComplete) {
          const per = a.textDur / a.textChars;
          a.textShown = Math.min(a.textChars, Math.floor(a.textTimer / per));
        } else {
          a.textShown = a.textChars;
        }
        // 自动结束（停留）
        if (a.textShown >= a.textChars && a.t > a.textDur + 0.6) {
          this._next();
        }
      } else if (sh.type === 'wait') {
        if (a.t >= a.waitDur) this._next();
      }

      // 写入 game.cam 供 world 渲染
      gameRef.cam.x = a.cam.x;
      gameRef.cam.y = a.cam.y;
      gameRef.cam.zoom = a.cam.zoom;
    },

    /* 渲染：复用真实世界渲染（无 HUD/交互），叠加字幕与黑幕 */
    draw(ctx) {
      if (!active) return;
      const a = active;
      const g = gameRef;

      // 用当前过场相机渲染世界（精简版，不画 HUD 与交互提示）
      const cam = { x: a.cam.x, y: a.cam.y, zoom: a.cam.zoom };
      g.map.drawGround(ctx, cam, g.time);
      const draws = [];
      for (const n of g.npcs) draws.push({ y: n.y, fn: () => n.draw(ctx, cam) });
      for (const e of g.enemies) draws.push({ y: e.y, fn: () => e.draw(ctx, cam) });
      for (const pk of g.pickups) draws.push({ y: pk.y, fn: () => pk.draw(ctx, cam) });
      draws.push({ y: g.player.y, fn: () => g.player.draw(ctx, cam) });
      draws.sort((a2, b2) => a2.y - b2.y);
      for (const d of draws) d.fn();
      for (const pr of g.projectiles) pr.draw(ctx, cam);
      MIST.Particles.draw(ctx, cam);

      // 列车动画（若启用）
      if (a.train) this._drawTrain(ctx, cam, a.train);

      // 字幕层
      if (a.text) this._drawText(ctx, a.text, a.textShown);

      // 黑幕
      if (a.fade > 0.001) {
        ctx.fillStyle = `rgba(13,14,22,${a.fade})`;
        ctx.fillRect(0, 0, E.W, E.H);
      }
    },

    _drawTrain(ctx, cam, tr) {
      // 列车从画面右侧驶入站台的剪影，停靠在 (tr.tx, tr.ty)
      const x = tr.tx - cam.x, y = tr.ty - cam.y;
      const prog = Math.min(1, tr.t / (tr.dur || 2.5));
      const fromX = E.W + 120;
      const curX = fromX + (x - fromX) * easeInOut(prog);
      ctx.save();
      // 车身（深色长条 + 暖窗光）
      ctx.fillStyle = '#1b1c2e';
      ctx.fillRect(curX - 110, y - 30, 220, 34);
      ctx.fillStyle = '#2a2b40';
      ctx.fillRect(curX - 110, y - 30, 220, 6);
      // 车头圆角
      ctx.beginPath();
      ctx.moveTo(curX - 110, y - 30);
      ctx.lineTo(curX - 120, y - 14);
      ctx.lineTo(curX - 110, y + 4);
      ctx.fill();
      // 车窗暖光
      ctx.fillStyle = '#ffcd75';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(curX - 96 + i * 40, y - 24, 22, 12);
      }
      // 车轮
      ctx.fillStyle = '#0d0e16';
      ctx.beginPath(); ctx.arc(curX - 70, y + 6, 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(curX + 10, y + 6, 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(curX + 80, y + 6, 5, 0, 7); ctx.fill();
      // 头灯
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(curX - 118, y - 18, 5, 6);
      ctx.restore();
    },

    _drawText(ctx, text, shown) {
      const W = E.W;
      // 字幕条
      const boxH = 64;
      ctx.fillStyle = 'rgba(13,14,22,0.82)';
      ctx.fillRect(0, E.H - boxH, W, boxH);
      ctx.fillStyle = '#3a3f5c';
      ctx.fillRect(0, E.H - boxH, W, 2);

      // 说话人
      const who = text.who || 'narrator';
      const nameColor = who === 'loen' ? '#ffcd75' : who === 'sprout' ? '#7de0d6' : '#c0c5e0';
      const name = who === 'loen' ? '洛恩' : who === 'sprout' ? '小芽' : who === 'narrator' ? '旁白' : who;
      Draw.text(ctx, name, 16, E.H - boxH + 14, { size: 11, color: nameColor, bold: true });

      // 正文（打字机，逐字符显示，支持 §红字§）
      const full = text.lines.join('\n');
      const visible = full.slice(0, shown);
      Draw.richWrap(ctx, visible, 16, E.H - boxH + 30, {
        size: 10, color: '#e8eaf2', lineH: 14, maxW: W - 32,
        redColor: '#ef5350', align: 'left',
      });

      // 推进提示
      if (shown >= full.length) {
        const blink = (Math.sin(active.t * 6) > 0);
        if (blink) Draw.text(ctx, '▶ 空格继续', W - 16, E.H - 16, { size: 9, color: '#9aa0c0', align: 'right' });
      }
    },
  };

  MIST.Cutscene = Cutscene;
})();
