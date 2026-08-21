/* =====================================================
 * 雾野列车 — main.js
 * 游戏主控制器：状态机 / 场景切换 / 渲染管线 / 光照合成
 * ===================================================== */
window.MIST = window.MIST || {};

(function () {
  const E = MIST.Engine;

  class Game {
    constructor() {
      this.state = 'title';   // title / card / play / pause / help / settings / dead / ending
      this.flags = {};
      this.fadeT = 0; this.fadeDir = 0; this.fadeCb = null;
      this.cardT = 0; this.cardData = null;
      this.pauseSel = 0; this.deathT = 0; this.endingT = 0;
      this.settingsSel = 0;   // 设置界面选中项
      this.settingsFrom = 'title'; // 设置返回目标
      this.shakeT = 0; this.shakeN = 0;
      this.dialogue = new MIST.DialogueSystem(this);
      this.cam = { x: 0, y: 0 };
      this.time = 0;
      this.firstKey = false;
      this._lightCv = document.createElement('canvas');
      this._lightCv.width = E.W; this._lightCv.height = E.H;
      this._lightCtx = this._lightCv.getContext('2d');
    }

    dialogActive() { return this.dialogue.active; }

    shake(n, t) { this.shakeN = Math.max(this.shakeN, n); this.shakeT = Math.max(this.shakeT, t); }

    /* ---------- 场景加载 ---------- */
    loadScene(id, spawnOverride) {
      const def = MIST.STORY.scenes[id];
      this.sceneDef = def;
      this.map = new MIST.GameMap(def);
      const sp = spawnOverride || def.spawn;
      // 保留跨场景的玩家成长（HP上限/钥匙/碎片/金币）
      const keep = this.player ? {
        hp: this.player.hp, maxHp: this.player.maxHp, keys: this.player.keys,
        shards: this.player.shards, coins: this.player.coins,
      } : null;
      this.player = new MIST.Entities.PlayerPair(sp.x, sp.y);
      if (keep) Object.assign(this.player, keep);
      this.npcs = (def.npcs || []).map((n) => new MIST.Entities.NPC(n.x, n.y, n.id, n.dialog));
      // 怪物刷新：重新进入地图即重生（Boss 例外——击败后不再复活）
      this.enemies = (def.enemies || [])
        .filter((e) => !(e.kind === 'boss' && this.flags.bossDefeated))
        .map((e) => new MIST.Entities.Enemy(e.x, e.y, e.kind));
      this.pickups = (def.pickups || [])
        .filter((p) => !(p.kind === 'shard' && this.flags['shard_' + id]))
        .map((p) => new MIST.Entities.Pickup(p.x, p.y, p.kind));
      this.projectiles = [];
      this.triggers = (def.triggers || []).map((t) => ({ ...t }));
      MIST.Particles.clear();
      MIST.Audio.playMusic(def.music);
      this.player.soloMode = false; // 新场景默认跟随模式
      // 章节卡
      if (def.chapterCard && !this.flags['card_' + id]) {
        this.cardData = def.chapterCard;
        this.cardT = 0;
        this.state = 'card';
        this.flags['card_' + id] = true;
      }
      // 入场剧情
      const seen = this.flags['seen_' + id];
      if (def.intro && !seen) {
        this.flags['seen_' + id] = true;
        this.dialogue.runScript(def.intro);
      }
    }

    /* ---------- 状态流转 ---------- */
    toTitle() {
      this.state = 'title';
      this.flags = {};
      MIST.Audio.playMusic('title');
    }

    startNewGame() {
      this.flags = {};
      this.loadScene('town');
    }

    /* ---------- 转场 ---------- */
    fadeTo(cb) {
      if (this.fadeDir !== 0) return;
      this.fadeDir = 1; this.fadeT = 0;
      this.fadeCb = cb;
    }

    updateFade(dt) {
      if (this.fadeDir === 0) return;
      if (this.fadeDir === 1) {
        this.fadeT += dt * 2.5;
        if (this.fadeT >= 1) {
          this.fadeT = 1; this.fadeDir = -1;
          if (this.fadeCb) { this.fadeCb(); this.fadeCb = null; }
        }
      } else {
        this.fadeT -= dt * 2.5;
        if (this.fadeT <= 0) { this.fadeDir = 0; this.fadeT = 0; }
      }
    }

    /* ---------- 主更新 ---------- */
    update(dt) {
      this.time += dt;
      this.updateFade(dt);
      if (this.shakeT > 0) this.shakeT -= dt;

      // 首次按键激活音频
      if (!this.firstKey && E.anyPressed) {
        this.firstKey = true;
        MIST.Audio.resume();
      }

      switch (this.state) {
        case 'title':
          if (E.pressed('interact') || E.pressed('attack')) {
            MIST.Audio.resume();
            MIST.Audio.sfx('select');
            this.fadeTo(() => this.startNewGame());
          }
          if (E.pressed('down')) {
            MIST.Audio.resume();
            MIST.Audio.sfx('select');
            this.settingsFrom = 'title';
            this.state = 'settings';
            this.settingsSel = 0;
          }
          break;
        case 'card':
          this.cardT += dt;
          if (this.cardT > 2.4 || E.pressed('interact')) {
            this.state = 'play';
          }
          break;
        case 'play': this.updatePlay(dt); break;
        case 'pause': this.updatePause(dt); break;
        case 'help':
          if (E.pressed('interact') || E.pressed('menu')) this.state = 'pause';
          break;
        case 'settings': this.updateSettings(dt); break;
        case 'dead':
          this.deathT += dt;
          if (E.pressed('interact')) {
            // 重生：当前场景，半血（保留钥匙/碎片/上限成长）
            this.loadScene(this.sceneDef.id);
            this.player.hp = Math.ceil(this.player.maxHp / 2);
            this.state = 'play';
          }
          break;
        case 'ending':
          this.endingT += dt;
          if (this.endingT > 2 && E.pressed('interact')) {
            this.fadeTo(() => this.toTitle());
          }
          break;
      }
    }

    updatePlay(dt) {
      const p = this.player;

      // 暂停
      if (E.pressed('menu') && !this.dialogue.active) {
        this.state = 'pause'; this.pauseSel = 0;
        MIST.Audio.sfx('select');
        return;
      }

      // 对话中：世界暂停（致敬原作的剧情节奏）
      this.dialogue.update(dt); // 无条件调用：对话关闭后 cooldown 仍需衰减
      if (this.dialogue.active) {
        this.updateCamera(dt);
        return;
      }

      // 玩家/NPC/敌人
      p.update(dt, this);
      for (const n of this.npcs) n.update(dt);
      for (const e of this.enemies) e.update(dt, this);
      this.enemies = this.enemies.filter((e) => !e.dead);

      // 投射物
      for (const pr of this.projectiles) {
        pr.update(dt, this);
        if (pr.dead) continue;
        if (pr.friendly) {
          const big = pr.kind === 'bigBubble';
          const prBox = big ? { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 } : { x: pr.x - 4, y: pr.y - 4, w: 8, h: 8 };
          for (const e of this.enemies) {
            if (e.dead || pr.hitSet.has(e)) continue;
            if (MIST.Battle.aabb(prBox, MIST.Battle.entityBox(e))) {
              MIST.Battle.bubbleHit(e, this, big);
              if (!big) { pr.dead = true; break; }
              pr.hitSet.add(e); // 大泡泡穿透继续飞行
            }
          }
          // 泡泡激活机关
          if (!pr.dead) {
            const tx = Math.floor(pr.x / 16), ty = Math.floor(pr.y / 16);
            if (this.map.at(tx, ty) === '+' && !this.map.crystals[tx + ',' + ty]) {
              MIST.Battle.bubbleHitCrystal(tx, ty, this);
              if (!big) pr.dead = true;
            }
          }
        } else {
          if (MIST.Battle.aabb({ x: pr.x - 3, y: pr.y - 3, w: 6, h: 6 },
            { x: p.x - 5, y: p.y - 10, w: 10, h: 10 })) {
            pr.dead = true;
            p.hurt(1, this, pr.x, pr.y);
          }
        }
      }
      this.projectiles = this.projectiles.filter((pr) => !pr.dead);

      // 压力板联动（冰火人式谜题）
      this.map.updatePlates(this);

      // 钥匙拾取（踩到 'Z' 瓦片）
      const ptx2 = Math.floor(p.x / 16), pty2 = Math.floor(p.y / 16);
      if (this.map.at(ptx2, pty2) === 'Z') {
        this.map.setTile(ptx2, pty2, '.');
        p.keys++;
        MIST.Audio.sfx('questDone');
        MIST.Particles.burst(p.x, p.y - 8, 10, '#ffcd75', 45);
        this.dialogue.start([
          { who: 'narrator', lines: ['【钥匙】捡到一把生锈的钥匙。', '似乎能打开某扇锁住的门……'] },
        ]);
      }

      // 锁门交互（面向的格子是 'M' 时按 E）
      const fx = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing];
      const mtx = Math.floor((p.x + fx[0] * 18) / 16), mty = Math.floor((p.y - 4 + fx[1] * 18) / 16);
      const facingDoor = this.map.at(mtx, mty) === 'M';
      if (facingDoor && E.pressed('interact') && !(this.dialogue.cooldown > 0)) {
        if (p.keys > 0) {
          p.keys--;
          this.map.setTile(mtx, mty, '.');
          MIST.Audio.sfx('door');
          MIST.Audio.sfx('questDone');
          MIST.Particles.burst(mtx * 16 + 8, mty * 16 + 8, 12, '#ffcd75', 50);
          this.dialogue.start([
            { who: 'narrator', lines: ['咔哒——钥匙转动，锁开了。'] },
          ]);
        } else {
          MIST.Audio.sfx('hurt');
          this.dialogue.start([
            { who: 'narrator', lines: ['门锁得死死的。需要一把钥匙。'] },
          ]);
        }
      }

      // 拾取物
      for (const pk of this.pickups) pk.update(dt, this);
      this.pickups = this.pickups.filter((pk) => !pk.dead);

      // 粒子
      MIST.Particles.update(dt);

      // NPC 交互（对话刚结束有冷却，防连按E立即重开）
      if (E.pressed('interact') && !this.dialogue.active && !(this.dialogue.cooldown > 0)) {
        let best = null, bd = 26;
        for (const n of this.npcs) {
          const d = Math.hypot(n.x - p.x, n.y - p.y);
          if (d < bd) { bd = d; best = n; }
        }
        if (best) {
          MIST.Audio.sfx('select');
          // 支线：小石头还球
          if (best.id === 'kid' && this.sceneDef.id === 'village' && this.flags.gotBall && !this.flags.ballReturned) {
            this.flags.ballReturned = true;
            this.player.coins += 3;
            this.dialogue.start([
              { who: 'kid', lines: ['我的铁皮球！谢谢你白头发的姐姐！', '这个亮晶晶的给你——是我最宝贝的东西！'] },
              { who: 'narrator', lines: ['【获得】3 金币（铁皮球里的私房钱）'] },
            ]);
            MIST.Audio.sfx('questDone');
            return;
          }
          let dl = best.dialog;
          if (typeof dl === 'function') dl = dl(this);
          if (dl && dl.length) this.dialogue.start(dl);
          // 标记剧情 flag
          if (best.id === 'mayor') this.flags.talkedMayor = true;
        }
      }

      // 触发器
      for (const t of this.triggers) {
        if (t.done) continue;
        const inX = p.x >= t.x && p.x <= t.x + t.w;
        const inY = p.y >= t.y && p.y <= t.y + t.h;
        if (inX && inY) {
          t.done = true;
          if (t.script) this.dialogue.runScript(t.script);
        }
      }

      // 出口
      const ptx = Math.floor(p.x / 16), pty = Math.floor(p.y / 16);
      for (const ex of (this.sceneDef.exits || [])) {
        if (ptx === ex.tx && pty === ex.ty) {
          if (ex.gate && !this.flags[ex.gate]) {
            if (!this._gateMsgT || this.time - this._gateMsgT > 2) {
              this._gateMsgT = this.time;
              this.dialogue.start(this.sceneDef.exitGateMsg || [
                { who: 'narrator', lines: ['（现在还不能过去。）'] },
              ]);
            }
          } else {
            MIST.Audio.sfx('door');
            this.fadeTo(() => this.loadScene(ex.to, ex.spawn));
          }
        }
      }

      this.updateCamera(dt);
    }

    updateCamera(dt) {
      const p = this.player;
      const tx = p.x - E.W / 2, ty = p.y - 10 - E.H / 2;
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
      this.cam.x = Math.max(0, Math.min(this.map.pxW - E.W, this.cam.x));
      this.cam.y = Math.max(0, Math.min(this.map.pxH - E.H, this.cam.y));
      if (this.map.pxW < E.W) this.cam.x = (this.map.pxW - E.W) / 2;
      if (this.map.pxH < E.H) this.cam.y = (this.map.pxH - E.H) / 2;
    }

    updatePause(dt) {
      if (E.pressed('menu')) { this.state = 'play'; return; }
      if (E.pressed('up')) { this.pauseSel = (this.pauseSel + 3) % 4; MIST.Audio.sfx('select'); }
      if (E.pressed('down')) { this.pauseSel = (this.pauseSel + 1) % 4; MIST.Audio.sfx('select'); }
      if (E.pressed('interact')) {
        MIST.Audio.sfx('select');
        if (this.pauseSel === 0) this.state = 'play';
        else if (this.pauseSel === 1) this.state = 'help';
        else if (this.pauseSel === 2) {
          this.settingsFrom = 'pause';
          this.state = 'settings';
          this.settingsSel = 0;
        }
        else this.fadeTo(() => this.toTitle());
      }
    }

    /* 设置界面：音乐/音效开关 + 音量调节（即时生效） */
    updateSettings(dt) {
      const A = MIST.Audio;
      const nRows = 4;
      if (E.pressed('up')) { this.settingsSel = (this.settingsSel + nRows - 1) % nRows; MIST.Audio.sfx('select'); }
      if (E.pressed('down')) { this.settingsSel = (this.settingsSel + 1) % nRows; MIST.Audio.sfx('select'); }
      const adj = (d) => {
        const s = A.settings;
        if (this.settingsSel === 0) A.setMusicOn(!s.musicOn);
        else if (this.settingsSel === 1) A.setMusicVol(s.musicVol + d * 0.1);
        else if (this.settingsSel === 2) A.setSfxOn(!s.sfxOn);
        else if (this.settingsSel === 3) A.setSfxVol(s.sfxVol + d * 0.1);
        MIST.Audio.sfx('select');
      };
      if (E.pressed('left')) adj(-1);
      if (E.pressed('right')) adj(1);
      if (E.pressed('interact') || E.pressed('menu')) {
        MIST.Audio.sfx('select');
        this.state = this.settingsFrom;
        if (this.settingsFrom === 'pause') this.pauseSel = 0; // 返回时回到"继续冒险"
      }
    }

    /* ---------- 事件回调 ---------- */
    onPlayerDeath() {
      this.state = 'dead';
      this.deathT = 0;
      MIST.Audio.stopMusic();
    }
    onBossDefeated() {
      MIST.Audio.stopMusic();
      this.dialogue.start([
        { who: 'narrator', lines: ['菌王倒下。巨大的菌盖炸开，化作千万片光尘。'] },
        { who: 'sprout', lines: ['……在消失。雾在消失！洛恩，你看！'] },
        { who: 'narrator', lines: ['芽光如潮水漫过林海，漫过草原，漫过矿井的每一层。', '地底三百米的人们涌上矿道，看见了四十年来的第一片晴空。'] },
        { who: 'loen', lines: ['……走了。'] },
        { who: 'sprout', lines: ['去哪儿？'] },
        { who: 'loen', lines: ['下一站，晴原。'] },
      ], () => {
        this.fadeTo(() => {
          this.state = 'ending';
          this.endingT = 0;
          MIST.Audio.playMusic('ending');
        });
      });
    }
    onCrystalActivated() { /* 预留 */ }

    /* ---------- 绘制 ---------- */
    draw(ctx) {
      const U = MIST.UI;
      switch (this.state) {
        case 'title': U.drawTitle(ctx, this.time); break;
        case 'card': U.drawChapterCard(ctx, this.cardData[0], this.cardData[1], this.cardT); break;
        case 'play': case 'pause': case 'help': case 'dead': this.drawWorld(ctx); break;
        case 'settings': U.drawSettings(ctx, this.settingsSel, MIST.Audio.settings); break;
        case 'ending': U.drawEnding(ctx, this.endingT); break;
      }

      // 对话框（覆盖在世界之上）
      if (this.state === 'play' || this.state === 'pause') this.dialogue.draw(ctx);

      // 转场黑幕
      if (this.fadeDir !== 0) {
        ctx.fillStyle = `rgba(13,14,22,${Math.min(1, Math.max(0, this.fadeT))})`;
        ctx.fillRect(0, 0, E.W, E.H);
      }
    }

    drawWorld(ctx) {
      const cam = { ...this.cam };
      if (this.shakeT > 0) {
        cam.x += (Math.random() - 0.5) * this.shakeN * 2;
        cam.y += (Math.random() - 0.5) * this.shakeN * 2;
      }

      // 1. 地面
      this.map.drawGround(ctx, cam, this.time);

      // 2. 实体（y 排序）
      const draws = [];
      for (const n of this.npcs) draws.push({ y: n.y, fn: () => n.draw(ctx, cam) });
      for (const e of this.enemies) draws.push({ y: e.y, fn: () => e.draw(ctx, cam) });
      for (const pk of this.pickups) draws.push({ y: pk.y, fn: () => pk.draw(ctx, cam) });
      draws.push({ y: this.player.y, fn: () => this.player.draw(ctx, cam) });
      draws.sort((a, b) => a.y - b.y);
      for (const d of draws) d.fn();

      // 3. 投射物与粒子
      for (const pr of this.projectiles) pr.draw(ctx, cam);
      MIST.Particles.draw(ctx, cam);

      // 4. 光照合成（复古像素 + 现代光照，致敬原作 2D+3D 混合）
      const lc = this._lightCtx;
      const amb = this.sceneDef.ambient || { tint: '#ffffff', a: 0 };
      lc.globalCompositeOperation = 'source-over';
      // 环境亮度（1-a 亮度）
      const tint = amb.tint;
      const c = MIST._hex(tint);
      const lum = 1 - (amb.a || 0);
      lc.fillStyle = `rgb(${Math.round(c[0] * lum + 255 * (1 - lum) * 0.2)},${Math.round(c[1] * lum + 255 * (1 - lum) * 0.2)},${Math.round(c[2] * lum + 255 * (1 - lum) * 0.25)})`;
      lc.fillRect(0, 0, E.W, E.H);
      // 光源
      lc.globalCompositeOperation = 'lighter';
      for (const l of this.map.collectLights(this.time)) {
        MIST.Draw.light(lc, l.x - cam.x, l.y - cam.y, l.r, l.color, l.a);
      }
      // 玩家自身微光（小芽更亮）
      const p = this.player;
      const pglow = p.active === 'sprout' ? { r: 56, c: '#7de0d6', a: 0.4 } : { r: 40, c: '#ffcd75', a: 0.22 };
      MIST.Draw.light(lc, p.x - cam.x, p.y - 10 - cam.y, pglow.r, pglow.c, pglow.a);
      // 投射物光
      for (const pr of this.projectiles) {
        if (pr.kind === 'bubble') MIST.Draw.light(lc, pr.x - cam.x, pr.y - cam.y, 26, '#7de0d6', 0.5);
        else MIST.Draw.light(lc, pr.x - cam.x, pr.y - cam.y, 12, '#dabfff', 0.3);
      }
      lc.globalCompositeOperation = 'source-over';
      // 叠加
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this._lightCv, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // 5. HUD
      MIST.UI.drawHUD(ctx, this.player, this.sceneDef.name);

      // 交互提示（靠近NPC时）
      if (this.state === 'play' && !this.dialogue.active) {
        for (const n of this.npcs) {
          if (Math.hypot(n.x - p.x, n.y - p.y) < 26) {
            const bob = Math.sin(this.time * 5) * 2;
            MIST.Draw.text(ctx, 'E', n.x - cam.x, n.y - 34 + bob, { size: 10, color: '#ffcd75', align: 'center' });
            break;
          }
        }
      }

      // 暂停/帮助/死亡覆盖层
      if (this.state === 'pause') MIST.UI.drawPause(ctx, this.pauseSel);
      if (this.state === 'help') MIST.UI.drawHelp(ctx);
      if (this.state === 'dead') MIST.UI.drawDeath(ctx, this.deathT);
    }
  }

  /* ---------- 启动 ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    MIST.game = game;
    E.init();
    E.setScene({
      update: (dt) => game.update(dt),
      draw: (ctx) => game.draw(ctx),
    });
    E.start();
    // 预载标题音乐（需用户交互后激活）
    const kick = () => { MIST.Audio.resume(); MIST.Audio.playMusic('title'); window.removeEventListener('keydown', kick); };
    window.addEventListener('keydown', kick);
    document.getElementById('loading').classList.add('hide');
  });
})();
