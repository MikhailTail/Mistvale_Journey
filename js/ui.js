/* =====================================================
 * 雾野列车 — ui.js
 * UI：标题画面 / HUD / 暂停菜单 / 章节过场卡 / 死亡与结局
 * ===================================================== */
window.MIST = window.MIST || {};

(function () {
  const E = MIST.Engine, D = MIST.Draw;

  /* ---------- 标题画面 ---------- */
  function drawTitle(ctx, t) {
    // 夜空渐变
    const g = ctx.createLinearGradient(0, 0, 0, 270);
    g.addColorStop(0, '#1a1c2c');
    g.addColorStop(0.6, '#29366f');
    g.addColorStop(1, '#5d275d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 270);

    // 星星
    const r = MIST.rng(42);
    for (let i = 0; i < 40; i++) {
      const x = r() * 480, y = r() * 150;
      const tw = 0.4 + Math.sin(t * 2 + i * 7) * 0.3;
      ctx.fillStyle = `rgba(244,244,244,${tw})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // 月亮
    ctx.fillStyle = '#ffcd75';
    ctx.beginPath(); ctx.arc(390, 52, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1c2c';
    ctx.beginPath(); ctx.arc(383, 48, 19, 0, Math.PI * 2); ctx.fill();
    MIST.Draw.light(ctx, 390, 52, 70, '#ffcd75', 0.25);

    // 远山剪影
    ctx.fillStyle = '#29366f';
    ctx.beginPath();
    ctx.moveTo(0, 190);
    for (let x = 0; x <= 480; x += 40) ctx.lineTo(x, 165 + Math.sin(x * 0.02) * 18);
    ctx.lineTo(480, 270); ctx.lineTo(0, 270);
    ctx.fill();

    // 铁轨
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(0, 236, 480, 34);
    ctx.fillStyle = '#333c57';
    ctx.fillRect(0, 240, 480, 3); ctx.fillRect(0, 254, 480, 3);
    for (let x = ((t * 30) % 24) - 24; x < 480; x += 24) {
      ctx.fillRect(x, 238, 4, 20);
    }

    // 列车剪影（缓缓驶过）
    const trainX = ((t * 26) % 700) - 180;
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(trainX, 208, 130, 26);
    ctx.fillRect(trainX + 130, 214, 30, 20);
    // 车窗暖光
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(255,205,117,.9)';
      ctx.fillRect(trainX + 10 + i * 24, 214, 12, 10);
    }
    // 烟囱烟
    for (let i = 0; i < 5; i++) {
      const st = (t * 0.7 + i * 0.2) % 1;
      ctx.fillStyle = `rgba(148,176,194,${0.35 * (1 - st)})`;
      ctx.beginPath();
      ctx.arc(trainX + 148 - st * 30, 200 - st * 40, 4 + st * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 主标题（像素大字）
    const bob = Math.sin(t * 1.6) * 3;
    D.text(ctx, '雾 野 列 车', 240, 58 + bob, { size: 34, color: '#ffcd75', align: 'center', bold: true, shadow: '#1a1c2c' });
    D.text(ctx, 'MISTVALE JOURNEY', 240, 96 + bob, { size: 10, color: '#73eff7', align: 'center' });
    D.text(ctx, '— 致敬《风来之国》 —', 240, 118, { size: 9, color: '#94b0c2', align: 'center' });

    // 按键提示（闪烁）
    if (Math.floor(t * 1.6) % 2 === 0) {
      D.text(ctx, '按 E 键 或 回车键 出发', 240, 168, { size: 12, color: '#f4f4f4', align: 'center' });
    }
    D.text(ctx, '按 S 键 打开设置', 240, 192, { size: 10, color: '#94b0c2', align: 'center' });
    D.text(ctx, 'WASD移动 · J攻击(长按蓄力) · K切换角色 · E交互', 240, 254, { size: 9, color: '#566c86', align: 'center' });
  }

  /* ---------- HUD ---------- */
  function drawHUD(ctx, player, chapterName) {
    // 左上：心心血条（共用血条，致敬原作）
    const hearts = Math.ceil(player.maxHp / 2);
    for (let i = 0; i < hearts; i++) {
      const hx = 10 + i * 11, hy = 10;
      // 底
      ctx.fillStyle = 'rgba(26,28,44,.6)';
      ctx.fillRect(hx, hy, 9, 8);
      // 血量
      const hpLeft = player.hp - i * 2;
      if (hpLeft >= 2) {
        ctx.drawImage(MIST.Sprites.heart, hx + 1, hy + 1);
      } else if (hpLeft === 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(hx + 1, hy + 1, 4, 8); ctx.clip();
        ctx.drawImage(MIST.Sprites.heart, hx + 1, hy + 1);
        ctx.restore();
      }
    }
    // 心之碎片进度（3 枚合 1 心）
    if (player.shards > 0) {
      for (let i = 0; i < 3; i++) {
        const sx = 10 + i * 10, sy = 22;
        ctx.globalAlpha = i < player.shards ? 1 : 0.25;
        ctx.drawImage(MIST.Sprites.shard, sx, sy);
      }
      ctx.globalAlpha = 1;
    }
    // 金币
    ctx.fillStyle = '#ffcd75';
    ctx.beginPath(); ctx.arc(16, 40, 4, 0, Math.PI * 2); ctx.fill();
    D.text(ctx, '× ' + player.coins, 24, 36, { size: 10, color: '#ffcd75' });

    // 钥匙
    if (player.keys > 0) {
      ctx.drawImage(MIST.Sprites.key, 62, 33);
      D.text(ctx, '× ' + player.keys, 72, 36, { size: 10, color: '#ffcd75' });
    }

    // 右上：当前操控角色
    const who = player.active === 'loen' ? '洛恩·平底锅' : '小芽·芽光泡泡';
    const wc = player.active === 'loen' ? '#c4b57d' : '#7de0d6';
    D.text(ctx, who, 470, 10, { size: 10, color: wc, align: 'right' });
    D.text(ctx, 'K 切换', 470, 22, { size: 8, color: '#566c86', align: 'right' });
    // 分头行动提示
    if (player.soloMode) {
      D.text(ctx, '【分头行动中】', 470, 34, { size: 8, color: '#c9c9e8', align: 'right' });
    }

    // 左下：章节名
    D.text(ctx, chapterName, 10, 258, { size: 9, color: '#94b0c2' });
  }

  /* ---------- 设置界面（音乐/音效 开关+音量） ---------- */
  function drawSettings(ctx, sel, audioSettings) {
    ctx.fillStyle = 'rgba(13,14,22,.88)';
    ctx.fillRect(0, 0, 480, 270);
    D.text(ctx, '— 设 置 —', 240, 34, { size: 16, color: '#ffcd75', align: 'center' });

    const rows = [
      { label: '音 乐', type: 'toggle', value: audioSettings.musicOn },
      { label: '音乐音量', type: 'slider', value: audioSettings.musicVol },
      { label: '音 效', type: 'toggle', value: audioSettings.sfxOn },
      { label: '音效音量', type: 'slider', value: audioSettings.sfxVol },
    ];
    rows.forEach((r, i) => {
      const y = 84 + i * 30;
      const selc = i === sel ? '#ffcd75' : '#94b0c2';
      D.text(ctx, (i === sel ? '▶ ' : '  ') + r.label, 120, y, { size: 12, color: selc });
      if (r.type === 'toggle') {
        const on = r.value;
        // 开关图形
        ctx.fillStyle = on ? '#38b764' : '#5d275d';
        ctx.fillRect(290, y - 2, 34, 14);
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(on ? 310 : 292, y, 12, 10);
        D.text(ctx, on ? '开' : '关', 340, y, { size: 11, color: on ? '#a7f070' : '#b13e53' });
      } else {
        // 音量条（10 格）
        const n = Math.round(r.value * 10);
        for (let b = 0; b < 10; b++) {
          ctx.fillStyle = b < n ? (b < 4 ? '#b13e53' : b < 7 ? '#ef7d57' : '#a7f070') : '#333c57';
          ctx.fillRect(290 + b * 10, y - 1, 7, 12);
        }
        D.text(ctx, '' + n, 396, y, { size: 11, color: '#94b0c2' });
      }
    });
    D.text(ctx, 'A/D 或 ←/→ 调整 · W/S 选择 · E 返回', 240, 224, { size: 10, color: '#566c86', align: 'center' });
  }

  /* ---------- 暂停菜单 ---------- */
  function drawPause(ctx, sel) {
    ctx.fillStyle = 'rgba(13,14,22,.75)';
    ctx.fillRect(0, 0, 480, 270);
    D.text(ctx, '— 暂 停 —', 240, 60, { size: 18, color: '#ffcd75', align: 'center' });
    const items = ['继续冒险', '操作说明', '设 置', '回到标题'];
    items.forEach((it, i) => {
      const c = i === sel ? '#ffcd75' : '#94b0c2';
      D.text(ctx, (i === sel ? '▶ ' : '  ') + it, 240, 105 + i * 22, { size: 12, color: c, align: 'center' });
    });
    D.text(ctx, 'W/S 选择 · E 确认', 240, 210, { size: 9, color: '#566c86', align: 'center' });
  }

  function drawHelp(ctx) {
    ctx.fillStyle = 'rgba(13,14,22,.85)';
    ctx.fillRect(0, 0, 480, 270);
    D.text(ctx, '— 操 作 说 明 —', 240, 26, { size: 14, color: '#ffcd75', align: 'center' });
    const rows = [
      ['WASD / 方向键', '移动'],
      ['J 轻点 / 长按', '普攻 / 蓄力攻击（旋风斩·巨型泡泡）'],
      ['K / X', '切换操控角色'],
      ['E / 空格 / 回车', '对话 · 开锁 · 确认'],
      ['ESC / I', '暂停 · 设置'],
      ['', ''],
      ['· 泡泡麻痹敌人、激活水晶门；长按蓄力释放巨型穿透泡泡', ''],
      ['· 搜寻钥匙打开锁门；集齐 3 枚心之碎片提升生命上限', ''],
      ['· 分头行动时，待命的角色会原地踩住压力板——活用二人之力！', ''],
    ];
    rows.forEach((r, i) => {
      D.text(ctx, r[0], 44, 60 + i * 19, { size: 10, color: '#73eff7' });
      D.text(ctx, r[1], 176, 60 + i * 19, { size: 10, color: '#f4f4f4' });
    });
    D.text(ctx, '按 E 返回', 240, 244, { size: 10, color: '#566c86', align: 'center' });
  }

  /* ---------- 章节过场卡 ---------- */
  function drawChapterCard(ctx, num, title, t) {
    ctx.fillStyle = '#0d0e16';
    ctx.fillRect(0, 0, 480, 270);
    const a = Math.min(1, t * 1.5);
    ctx.globalAlpha = a;
    D.text(ctx, num, 240, 90, { size: 14, color: '#566c86', align: 'center' });
    D.text(ctx, title, 240, 118, { size: 22, color: '#ffcd75', align: 'center', bold: true });
    ctx.globalAlpha = 1;
  }

  /* ---------- 死亡画面 ---------- */
  function drawDeath(ctx, t) {
    ctx.fillStyle = 'rgba(26,28,44,.8)';
    ctx.fillRect(0, 0, 480, 270);
    D.text(ctx, '两人在雾中迷路了……', 240, 110, { size: 14, color: '#dabfff', align: 'center' });
    if (Math.floor(t * 2) % 2 === 0) {
      D.text(ctx, '按 E 从头再来', 240, 150, { size: 11, color: '#94b0c2', align: 'center' });
    }
  }

  /* ---------- 结局画面 ---------- */
  function drawEnding(ctx, t) {
    // 晴空（暖色调，致敬原作地表的明亮感）
    const g = ctx.createLinearGradient(0, 0, 0, 270);
    g.addColorStop(0, '#41a6f6');
    g.addColorStop(0.7, '#73eff7');
    g.addColorStop(1, '#ffcd75');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 270);

    // 太阳光晕
    MIST.Draw.light(ctx, 240, 80, 120, '#ffcd75', 0.5);

    // 飞鸟
    const r = MIST.rng(7);
    for (let i = 0; i < 5; i++) {
      const bx = ((t * 20 + i * 90) % 560) - 40;
      const by = 50 + r() * 40 + Math.sin(t + i) * 4;
      ctx.strokeStyle = '#29366f';
      ctx.lineWidth = 1;
      const flap = Math.sin(t * 6 + i * 2) * 2;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by + flap);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + 4, by + flap);
      ctx.stroke();
    }

    // 草地
    ctx.fillStyle = '#38b764';
    ctx.fillRect(0, 200, 480, 70);
    ctx.fillStyle = '#a7f070';
    for (let x = 0; x < 480; x += 3) {
      ctx.fillRect(x, 200 + Math.sin(x * 0.1) * 2, 1, 3);
    }

    // 两位主角剪影远望
    ctx.fillStyle = 'rgba(26,28,44,.85)';
    ctx.fillRect(214, 178, 10, 22); // 洛恩
    ctx.fillRect(217, 172, 7, 6);
    ctx.fillRect(232, 186, 8, 14); // 小芽
    ctx.fillRect(234, 181, 5, 5);

    D.text(ctx, '瘴雾散尽，晴空万里。', 240, 30, { size: 13, color: '#1a1c2c', align: 'center' });
    D.text(ctx, '「下一站，晴原。」', 240, 52, { size: 11, color: '#29366f', align: 'center' });
    D.text(ctx, '— 感谢游玩 · 未完待续 —', 240, 244, { size: 10, color: '#29366f', align: 'center' });
    if (Math.floor(t * 1.5) % 2 === 0) {
      D.text(ctx, '按 E 回到标题', 240, 228, { size: 9, color: '#1a1c2c', align: 'center' });
    }
  }

  MIST.UI = { drawTitle, drawHUD, drawPause, drawHelp, drawSettings, drawChapterCard, drawDeath, drawEnding };
})();
