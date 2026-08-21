/* =====================================================
 * 雾野列车 — entities.js
 * 实体系统：玩家双角色 / 跟随AI / NPC / 敌人AI / 投射物 / 粒子
 * 双角色设计致敬《风来之国》：
 *   洛恩 = 近战输出（平底锅挥击）
 *   小芽 = 远程控制（能量泡泡减速麻痹敌人）
 *   共用血条 / 随时切换 / 未操控角色智能跟随
 * ===================================================== */
window.MIST = window.MIST || {};

(function () {
  const S = MIST.Sprites;

  /* ---------- 粒子 ---------- */
  const particles = [];
  MIST.Particles = {
    spawn(x, y, opts = {}) {
      particles.push({
        x, y,
        vx: opts.vx || (Math.random() - 0.5) * 40,
        vy: opts.vy || -Math.random() * 30,
        life: opts.life || 0.5, t: 0,
        color: opts.color || '#ffcd75',
        size: opts.size || 2,
        grav: opts.grav === undefined ? 60 : opts.grav,
      });
    },
    burst(x, y, n, color, spd = 50) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.spawn(x, y, {
          vx: Math.cos(a) * spd * Math.random(),
          vy: Math.sin(a) * spd * Math.random() - 20,
          color, life: 0.4 + Math.random() * 0.4,
        });
      }
    },
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += dt;
        if (p.t >= p.life) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
      }
    },
    draw(ctx, cam) {
      for (const p of particles) {
        const a = 1 - p.t / p.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const s = Math.max(1, p.size * a);
        ctx.fillRect(p.x - cam.x - s / 2, p.y - cam.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    },
    clear() { particles.length = 0; },
  };

  /* ---------- 基类 ---------- */
  class Entity {
    constructor(x, y) {
      this.x = x; this.y = y;      // x=中心 y=脚底
      this.cw = 10; this.ch = 8;   // 碰撞盒（脚部）
      this.dead = false;
      this.z = 0;                  // 跳跃高度（视觉）
    }
    get bottom() { return this.y; }
    update(dt) {}
    draw(ctx, cam) {}
  }

  /* =====================================================
   * 玩家（双角色）
   * ===================================================== */
  class PlayerPair extends Entity {
    constructor(x, y) {
      super(x, y);
      this.active = 'loen';        // 当前操控 loen / sprout
      this.speed = 88;
      this.hp = 10; this.maxHp = 10;
      this.coins = 0;
      this.keys = 0;               // 钥匙数（开锁门）
      this.shards = 0;             // 心之碎片（3 枚 +1 心）
      this.attackCd = 0;
      this.attackT = 0;            // 攻击动画计时
      this.attackDir = 'down';
      this.invuln = 0;
      this.facing = 'down';
      this.animT = 0;
      this.moving = false;
      this.stepT = 0;
      this.charging = false;       // 蓄力状态
      this.chargeT = 0;            // 蓄力时长
      this.spinT = 0;              // 旋风斩动画
      this.soloMode = false;       // 分头行动模式（另一角色原地待命）
      // 跟随者
      this.follower = { x: x, y: y + 14, facing: 'up', animT: 0, moving: false, tx: x, ty: y };
    }

    get sprite() { return this.active === 'loen' ? S.loen : S.sprout; }
    get followSprite() { return this.active === 'loen' ? S.sprout : S.loen; }

    /* 收集心之碎片：3 枚合成 1 颗心（塞尔达式成长） */
    addShard(game) {
      this.shards++;
      MIST.Audio.sfx('questDone');
      MIST.Particles.burst(this.x, this.y - 10, 14, '#ff9db0', 50);
      if (this.shards >= 3) {
        this.shards = 0;
        this.maxHp += 2;
        this.hp = this.maxHp;
        MIST.Particles.burst(this.x, this.y - 10, 20, '#ef7d57', 70);
        game.dialogue.start([
          { who: 'narrator', lines: ['【§心之碎片§】三枚碎片合而为一！§生命上限提升§了！', '（当前上限：' + (this.maxHp / 2) + ' 颗心）'] },
        ]);
      } else {
        game.dialogue.start([
          { who: 'narrator', lines: ['【§心之碎片§】获得一枚心之碎片（' + this.shards + '/3）。', '集满三枚，§生命上限§便会提升。'] },
        ]);
      }
    }

    swap() {
      if (this.soloMode) {
        // 分头行动：只切换操控，另一角色原地待命
        this.active = this.active === 'loen' ? 'sprout' : 'loen';
        this.attackT = 0;
        this.attackCd = 0.15;
        this.charging = false; this.chargeT = 0;
        MIST.Particles.burst(this.x, this.y - 8, 8, '#c9c9e8', 35);
        MIST.Audio.sfx('swap');
        return;
      }
      // 交换位置：跟随者走上前来
      const fx = this.follower.x, fy = this.follower.y, ff = this.follower.facing;
      this.follower.x = this.x; this.follower.y = this.y; this.follower.facing = this.facing;
      this.x = fx; this.y = fy; this.facing = ff;
      this.active = this.active === 'loen' ? 'sprout' : 'loen';
      this.attackT = 0;
      this.attackCd = 0.15; // 切换后短冷却，防止连打（攻击冷却不跨角色残留）
      this.charging = false; this.chargeT = 0;
      MIST.Particles.burst(this.x, this.y - 8, 10, '#7de0d6', 40);
      MIST.Audio.sfx('swap');
    }

    update(dt, game) {
      const E = MIST.Engine;
      this.cooldownTick(dt);
      this.moveTick(dt, game);
      this.attackTick(dt, game);
      this.followTick(dt, game);
      if (this.invuln > 0) this.invuln -= dt;
    }

    cooldownTick(dt) {
      if (this.attackCd > 0) this.attackCd -= dt;
      if (this.attackT > 0) this.attackT -= dt;
      if (this.spinT > 0) this.spinT -= dt;
    }

    moveTick(dt, game) {
      const E = MIST.Engine;
      let dx = 0, dy = 0;
      if (E.down('up')) dy -= 1;
      if (E.down('down')) dy += 1;
      if (E.down('left')) dx -= 1;
      if (E.down('right')) dx += 1;
      this.moving = !!(dx || dy);
      if (this.moving) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
        else this.facing = dy > 0 ? 'down' : 'up';
        const spd = this.speed * (this.attackT > 0 ? 0.4 : 1);
        const nx = this.x + dx * spd * dt;
        const ny = this.y + dy * spd * dt;
        // 分轴碰撞，可贴墙滑动
        if (game.map.canMove(this, nx, this.y)) this.x = nx;
        if (game.map.canMove(this, this.x, ny)) this.y = ny;
        this.animT += dt * (this.attackT > 0 ? 4 : 8);
        this.stepT += dt;
        if (this.stepT > 0.28) {
          this.stepT = 0;
          MIST.Audio.sfx('step');
          if (Math.random() < 0.4) MIST.Particles.spawn(this.x, this.y, { color: '#94b0c2', life: 0.3, vy: -8 });
        }
      } else {
        this.animT = 0;
      }
    }

    attackTick(dt, game) {
      const E = MIST.Engine;
      if (E.pressed('swap') && !game.dialogActive()) {
        this.swap();
        return;
      }
      if (game.dialogActive()) { this.charging = false; this.chargeT = 0; return; }

      /* 蓄力攻击（2D 塞尔达）：按住 J 蓄力，松开释放；轻点即普攻 */
      const held = E.down('attack');
      const tapped = E.pressed('attack');
      if (held && this.attackCd <= 0) {
        if (!this.charging) { this.charging = true; this.chargeT = 0; }
        this.chargeT = Math.min(1, this.chargeT + dt);
        // 蓄力粒子
        if (this.chargeT > 0.3 && Math.random() < 0.3) {
          const col = this.active === 'loen' ? '#ffcd75' : '#7de0d6';
          const a = Math.random() * Math.PI * 2;
          MIST.Particles.spawn(this.x + Math.cos(a) * 10, this.y - 8 + Math.sin(a) * 10, {
            color: col, life: 0.3, vx: -Math.cos(a) * 25, vy: -Math.sin(a) * 25, grav: 0,
          });
        }
        return;
      }
      if (this.charging && !held) {
        // 松开：根据蓄力时长选择攻击方式
        const charged = this.chargeT >= 0.45;
        this.charging = false; this.chargeT = 0;
        this.attackDir = this.facing;
        if (this.active === 'loen') {
          if (charged) this.spinAttack(game);
          else this.panAttack(game);
        } else {
          if (charged) this.bigBubbleAttack(game);
          else this.bubbleAttack(game);
        }
        return;
      }
      // 轻点（按下与松开发生在同一帧，未形成按住状态）→ 直接普攻
      if (tapped && !held && !this.charging && this.attackCd <= 0) {
        this.attackDir = this.facing;
        if (this.active === 'loen') this.panAttack(game);
        else this.bubbleAttack(game);
      }
    }

    /* 普攻：平底锅挥击 */
    panAttack(game) {
      this.attackT = 0.22;
      this.attackCd = 0.38;
      MIST.Audio.sfx('swing');
      const hit = this.attackBox();
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (MIST.Battle.aabb(hit, MIST.Battle.entityBox(e))) {
          MIST.Battle.damage(e, 1, this.knockDir(), 90, game);
        }
      }
    }

    /* 蓄力：旋风斩（360° 范围，伤害 2，强击退） */
    spinAttack(game) {
      this.attackT = 0.34;
      this.spinT = 0.34;
      this.attackCd = 0.75;
      MIST.Audio.sfx('bossRoar');
      game.shake(5, 0.25);
      const hit = { x: this.x - 26, y: this.y - 8 - 26, w: 52, h: 52 };
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (MIST.Battle.aabb(hit, MIST.Battle.entityBox(e))) {
          const kx = e.x - this.x, ky = e.y - this.y;
          const len = Math.hypot(kx, ky) || 1;
          MIST.Battle.damage(e, 2, [kx / len, ky / len], 170, game);
        }
      }
      // 环形粒子
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        MIST.Particles.spawn(this.x + Math.cos(a) * 20, this.y - 8 + Math.sin(a) * 20, {
          color: '#ffcd75', life: 0.4, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, grav: 0,
        });
      }
    }

    /* 普攻：能量泡泡 */
    bubbleAttack(game) {
      this.attackCd = 0.5;
      MIST.Audio.sfx('bubble');
      const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.facing];
      game.projectiles.push(new Projectile(
        this.x + dir[0] * 10, this.y - 8 + dir[1] * 10,
        dir[0] * 150, dir[1] * 150, 'bubble', true
      ));
    }

    /* 蓄力：巨型泡泡（穿透，强麻痹 3s，多段命中） */
    bigBubbleAttack(game) {
      this.attackCd = 0.9;
      MIST.Audio.sfx('bubble');
      MIST.Audio.sfx('heal');
      const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.facing];
      game.projectiles.push(new Projectile(
        this.x + dir[0] * 12, this.y - 8 + dir[1] * 12,
        dir[0] * 110, dir[1] * 110, 'bigBubble', true
      ));
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        MIST.Particles.spawn(this.x + Math.cos(a) * 8, this.y - 8 + Math.sin(a) * 8, {
          color: '#7de0d6', life: 0.35, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, grav: 0,
        });
      }
    }

    attackBox() {
      const d = this.attackDir;
      let bx = this.x, by = this.y - 6;
      if (d === 'down') { by = this.y + 6; }
      else if (d === 'up') { by = this.y - 18; }
      else if (d === 'left') { bx = this.x - 16; }
      else if (d === 'right') { bx = this.x + 16; }
      return { x: bx - 12, y: by - 12, w: 24, h: 24 };
    }

    knockDir() {
      return { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.attackDir];
    }

    followTick(dt, game) {
      const f = this.follower;
      // 分头行动模式：待命角色原地不动（冰火人式分工解谜）
      if (this.soloMode) { f.moving = false; f.animT = 0; return; }
      // 目标：主角身后
      const back = { down: [0, -16], up: [0, 16], left: [16, 0], right: [-16, 0] }[this.facing];
      const tx = this.x + back[0], ty = this.y + back[1];
      const dist = Math.hypot(f.x - this.x, f.y - this.y);
      if (dist > 130) { // 卡住/太远 → 瞬移
        f.x = tx; f.y = ty;
        MIST.Particles.burst(f.x, f.y - 8, 6, '#c9c9e8', 30);
        return;
      }
      if (dist > 20) {
        const ang = Math.atan2(ty - f.y, tx - f.x);
        const nx = f.x + Math.cos(ang) * 70 * dt;
        const ny = f.y + Math.sin(ang) * 70 * dt;
        const tmp = { cw: 8, ch: 6 };
        if (game.map.canMove({ cw: 8, ch: 6, x: f.x, y: f.y }, nx, f.y)) f.x = nx;
        if (game.map.canMove({ cw: 8, ch: 6, x: f.x, y: f.y }, f.x, ny)) f.y = ny;
        f.moving = true;
        if (Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang))) f.facing = Math.cos(ang) > 0 ? 'right' : 'left';
        else f.facing = Math.sin(ang) > 0 ? 'down' : 'up';
        f.animT += dt * 8;
      } else {
        f.moving = false; f.animT = 0;
      }
    }

    hurt(dmg, game, fromX, fromY) {
      if (this.invuln > 0) return;
      this.hp -= dmg;
      this.invuln = 1.2;
      MIST.Audio.sfx('hurt');
      MIST.Particles.burst(this.x, this.y - 8, 12, '#b13e53', 70);
      game.shake(6, 0.3);
      // 击退
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      const nx = this.x + Math.cos(a) * 14, ny = this.y + Math.sin(a) * 14;
      if (game.map.canMove(this, nx, ny)) { this.x = nx; this.y = ny; }
      if (this.hp <= 0) game.onPlayerDeath();
    }

    heal(n) {
      this.hp = Math.min(this.maxHp, this.hp + n);
      MIST.Audio.sfx('heal');
      MIST.Particles.burst(this.x, this.y - 12, 10, '#a7f070', 40);
    }

    drawChar(ctx, cam, which, x, y, facing, moving, animT, blink) {
      const sheets = which === 'loen' ? S.loen : S.sprout;
      const frames = sheets[facing] || sheets.down;
      let idx = 0;
      if (moving) idx = 1 + (Math.floor(animT) % 2);
      const spr = frames[idx];
      if (blink && Math.floor(MIST.Engine.frame / 4) % 2 === 0) return; // 无敌闪烁
      const yo = Math.sin(animT * 2) * 0; // 呼吸浮动（跟随者）
      ctx.drawImage(spr, Math.round(x - 8 - cam.x), Math.round(y - spr.height - cam.y + yo));
      // 影子
      ctx.fillStyle = 'rgba(26,28,44,.35)';
      ctx.fillRect(Math.round(x - 5 - cam.x), Math.round(y - 1 - cam.y), 10, 2);
    }

    draw(ctx, cam) {
      // 跟随者先画
      this.drawChar(ctx, cam, this.active === 'loen' ? 'sprout' : 'loen',
        this.follower.x, this.follower.y, this.follower.facing, this.follower.moving, this.follower.animT, false);
      // 主角
      this.drawChar(ctx, cam, this.active, this.x, this.y, this.facing, this.moving, this.animT, this.invuln > 0);
      // 攻击特效：平底锅挥弧
      if (this.attackT > 0 && this.active === 'loen' && this.spinT <= 0) {
        const prog = 1 - this.attackT / 0.22;
        const angBase = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[this.attackDir];
        const ang = angBase + (prog - 0.5) * 2.2;
        const px = this.x + Math.cos(ang) * 14 - cam.x;
        const py = this.y - 8 + Math.sin(ang) * 14 - cam.y;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + Math.PI / 4);
        ctx.drawImage(S.pan, -8, -5);
        ctx.restore();
        // 挥击光弧
        ctx.strokeStyle = 'rgba(255,205,117,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - 8 - cam.y, 16, angBase - 1.1, angBase + 1.1);
        ctx.stroke();
      }
      // 旋风斩特效（蓄力攻击）
      if (this.spinT > 0) {
        const prog = 1 - this.spinT / 0.34;
        const ang = prog * Math.PI * 4;
        const px = this.x + Math.cos(ang) * 18 - cam.x;
        const py = this.y - 8 + Math.sin(ang) * 18 - cam.y;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.drawImage(S.pan, -8, -5);
        ctx.restore();
        // 旋转光环
        ctx.strokeStyle = `rgba(255,205,117,${0.8 * this.spinT / 0.34})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - 8 - cam.y, 20 + prog * 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 蓄力指示（角色身边聚气光圈）
      if (this.charging && this.chargeT > 0.15) {
        const col = this.active === 'loen' ? '#ffcd75' : '#7de0d6';
        const r = 14 + this.chargeT * 10;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.5 + Math.sin(MIST.Engine.time * 20) * 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - 9 - cam.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (this.chargeT >= 0.45) {
          MIST.Draw.text(ctx, '!', this.x - cam.x, this.y - 38 - cam.y, { size: 10, color: col, align: 'center' });
        }
      }
      // 主角头顶标记（当前操控）
      const bob = Math.sin(MIST.Engine.time * 5) * 1.5;
      ctx.fillStyle = this.active === 'loen' ? '#ffcd75' : '#7de0d6';
      ctx.beginPath();
      ctx.moveTo(this.x - cam.x, this.y - 30 + bob);
      ctx.lineTo(this.x - 3 - cam.x, this.y - 34 + bob);
      ctx.lineTo(this.x + 3 - cam.x, this.y - 34 + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* =====================================================
   * NPC
   * ===================================================== */
  const NPC_SPRITES = {
    mayor: { spr: () => S.npcMayor, name: '镇长' },
    miner: { spr: () => S.npcMiner, name: '老周' },
    granny: { spr: () => S.npcGranny, name: '婆婆' },
    kid: { spr: () => S.npcKid, name: '小石头', dy: -12 },
    scientist: { spr: () => S.npcScientist, name: '艾芯' },
    trader: { spr: () => S.npcTrader, name: '货郎' },
    robot: { spr: () => S.npcRobot, name: '铁蛋' },
  };

  class NPC extends Entity {
    constructor(x, y, id, dialog) {
      super(x, y);
      this.id = id;
      this.def = NPC_SPRITES[id] || NPC_SPRITES.miner;
      this.dialog = dialog || [];
      this.t = Math.random() * 10;
      this.bobT = Math.random() * 10;
    }
    update(dt) {
      this.t += dt;
      this.bobT += dt;
    }
    draw(ctx, cam) {
      const spr = this.def.spr();
      const dy = this.def.dy || 0;
      const bob = Math.sin(this.bobT * 2) * 0.8;
      ctx.fillStyle = 'rgba(26,28,44,.35)';
      ctx.fillRect(Math.round(this.x - 5 - cam.x), Math.round(this.y - 1 - cam.y), 10, 2);
      ctx.drawImage(spr, Math.round(this.x - 8 - cam.x), Math.round(this.y - spr.height - cam.y + dy + bob));
    }
  }

  /* =====================================================
   * 投射物
   * ===================================================== */
  class Projectile extends Entity {
    constructor(x, y, vx, vy, kind, friendly) {
      super(x, y);
      this.vx = vx; this.vy = vy;
      this.kind = kind;       // bubble / bigBubble / spore
      this.friendly = friendly;
      this.t = 0;
      this.dead = false;
      this.hitSet = new Set(); // 穿透弹已命中目标（防重复伤害）
    }
    update(dt, game) {
      this.t += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const big = this.kind === 'bigBubble';
      // 碰墙消亡；机关水晶门例外：泡泡触碰即激活
      if (game.map.isSolidPx(this.x, this.y)) {
        const tx = Math.floor(this.x / 16), ty = Math.floor(this.y / 16);
        if (game.map.at(tx, ty) === '+') {
          if (!big) this.dead = true;
          MIST.Battle.bubbleHitCrystal(tx, ty, game);
          if (!big) return;
        } else if (!big) {
          this.dead = true;
          MIST.Particles.burst(this.x, this.y, 5, this.friendly ? '#7de0d6' : '#dabfff', 30);
          if (this.kind === 'bubble') MIST.Audio.sfx('bubblePop');
          return;
        } else {
          // 大泡泡撞墙减速反弹一次
          this.vx *= -0.4; this.vy *= -0.4;
          MIST.Particles.burst(this.x, this.y, 4, '#7de0d6', 25);
        }
      }
      if (this.t > (big ? 1.6 : 2.2)) this.dead = true;
      if (this.kind === 'spore') {
        // 孢子轻微追踪
        const p = game.player;
        const a = Math.atan2(p.y - 8 - this.y, p.x - this.x);
        this.vx += Math.cos(a) * 40 * dt;
        this.vy += Math.sin(a) * 40 * dt;
      }
    }
    draw(ctx, cam) {
      if (this.kind === 'bubble' || this.kind === 'bigBubble') {
        const pulse = 1 + Math.sin(this.t * 12) * 0.12;
        const s = this.kind === 'bigBubble' ? S.bigBubble : S.bubble;
        const w = s.width * pulse, h = s.height * pulse;
        ctx.drawImage(s, this.x - w / 2 - cam.x, this.y - h / 2 - cam.y, w, h);
        MIST.Draw.light(ctx, this.x - cam.x, this.y - cam.y, this.kind === 'bigBubble' ? 26 : 14, '#7de0d6', 0.4);
      } else {
        // 毒孢子
        const r = 3 + Math.sin(this.t * 10) * 0.6;
        ctx.fillStyle = '#dabfff';
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - cam.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5d275d';
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - cam.y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* =====================================================
   * 敌人
   * ===================================================== */
  class Enemy extends Entity {
    constructor(x, y, kind) {
      super(x, y);
      this.kind = kind;
      const defs = {
        slug: { hp: 2, speed: 22, dmg: 1, touch: true },
        shroom: { hp: 3, speed: 0, dmg: 1, touch: true },
        hound: { hp: 4, speed: 95, dmg: 1, touch: true },
        boss: { hp: 60, speed: 40, dmg: 2, touch: true },
      };
      const d = defs[kind];
      this.hp = d.hp; this.speed = d.speed; this.dmg = d.dmg; this.touch = d.touch;
      this.t = Math.random() * 10;
      this.vx = 0; this.vy = 0;
      this.stun = 0;       // 被小芽泡泡麻痹
      this.hitFlash = 0;
      this.facing = 'left';
      this.wanderAng = Math.random() * Math.PI * 2;
      this.wanderT = 0;
      this.shootT = 1 + Math.random();
      this.chargeT = 0;
      this.phase = 1;
    }

    update(dt, game) {
      this.t += dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.stun > 0) {
        this.stun -= dt;
        // 麻痹粒子
        if (Math.random() < 0.2) MIST.Particles.spawn(this.x, this.y - 12, { color: '#7de0d6', life: 0.4, vy: -20 });
        return;
      }
      const p = game.player;
      const dx = p.x - this.x, dy = p.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (this.kind === 'slug') {
        // 漫游 + 缓慢接近
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 1.5 + Math.random() * 2;
          const toP = dist < 120 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
          this.wanderAng = toP + (Math.random() - 0.5);
        }
        this.tryMove(game, Math.cos(this.wanderAng) * this.speed * dt, Math.sin(this.wanderAng) * this.speed * dt);
        this.facing = Math.cos(this.wanderAng) > 0 ? 'right' : 'left';
      } else if (this.kind === 'shroom') {
        // 定点射击
        this.shootT -= dt;
        if (this.shootT <= 0 && dist < 160) {
          this.shootT = 2.2 + Math.random() * 0.8;
          this.shooting = 0.3;
          MIST.Audio.sfx('bubble');
          const a = Math.atan2(p.y - 8 - (this.y - 8), p.x - this.x);
          game.projectiles.push(new Projectile(this.x, this.y - 10, Math.cos(a) * 70, Math.sin(a) * 70, 'spore', false));
        }
        if (this.shooting > 0) this.shooting -= dt;
      } else if (this.kind === 'hound') {
        // 发现→蓄力→冲刺
        if (this.chargeT > 0) {
          this.chargeT -= dt;
          const a = this.chargeAng;
          this.tryMove(game, Math.cos(a) * this.speed * 1.8 * dt, Math.sin(a) * this.speed * 1.8 * dt);
          if (Math.random() < 0.5) MIST.Particles.spawn(this.x, this.y, { color: '#94b0c2', life: 0.3, vy: -10 });
        } else if (dist < 130) {
          this.aimT = (this.aimT || 0) - dt;
          if (this.aimT === undefined || this.aimT <= 0) {
            this.chargeAng = Math.atan2(dy, dx);
            this.chargeT = 0.55;
            this.aimT = 1.4;
          }
          this.facing = dx > 0 ? 'right' : 'left';
        } else {
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 2 + Math.random() * 2;
            this.wanderAng = Math.random() * Math.PI * 2;
          }
          this.tryMove(game, Math.cos(this.wanderAng) * 30 * dt, Math.sin(this.wanderAng) * 30 * dt);
          this.facing = Math.cos(this.wanderAng) > 0 ? 'right' : 'left';
        }
      } else if (this.kind === 'boss') {
        this.updateBoss(dt, game, dist, dx, dy);
      }

      // 接触伤害
      if (this.touch && !p.deadFlag) {
        if (MIST.Battle.aabb(
          { x: this.x - 8, y: this.y - 14, w: 16, h: 14 },
          { x: p.x - 6, y: p.y - 10, w: 12, h: 10 }
        )) {
          p.hurt(this.dmg, game, this.x, this.y);
        }
      }
    }

    updateBoss(dt, game, dist, dx, dy) {
      const p = game.player;
      this.phase = this.hp > 40 ? 1 : this.hp > 20 ? 2 : 3;
      this.bossT = (this.bossT || 0) + dt;

      if (this.chargeT > 0) {
        this.chargeT -= dt;
        this.tryMove(game, Math.cos(this.chargeAng) * this.speed * 2.4 * dt, Math.sin(this.chargeAng) * this.speed * 2.4 * dt);
        game.shake(2, 0.1);
        return;
      }

      if (this.phase === 1) {
        // 徘徊 + 吐孢子扇形
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 2; this.wanderAng = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2; }
        this.tryMove(game, Math.cos(this.wanderAng) * this.speed * dt, Math.sin(this.wanderAng) * this.speed * dt);
        this.shootT -= dt;
        if (this.shootT <= 0) {
          this.shootT = 1.8;
          const base = Math.atan2(p.y - 8 - (this.y - 10), p.x - this.x);
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.25;
            game.projectiles.push(new Projectile(this.x, this.y - 12, Math.cos(a) * 65, Math.sin(a) * 65, 'spore', false));
          }
          MIST.Audio.sfx('bossRoar');
        }
      } else if (this.phase === 2) {
        // 召唤 + 冲撞
        this.summonT = (this.summonT || 0) - dt;
        if (this.summonT <= 0) {
          this.summonT = 5;
          for (let i = 0; i < 2; i++) {
            const e = new Enemy(this.x + (Math.random() - 0.5) * 60, this.y + (Math.random() - 0.5) * 40, 'slug');
            game.enemies.push(e);
            MIST.Particles.burst(e.x, e.y - 6, 8, '#38b764', 40);
          }
        }
        this.chargeCd = (this.chargeCd || 2) - dt;
        if (this.chargeCd <= 0 && dist < 140) {
          this.chargeCd = 3;
          this.chargeAng = Math.atan2(dy, dx);
          this.chargeT = 0.6;
          MIST.Audio.sfx('bossRoar');
          game.shake(4, 0.3);
        }
        this.tryMove(game, Math.cos(Math.atan2(dy, dx)) * 20 * dt, Math.sin(Math.atan2(dy, dx)) * 20 * dt);
      } else {
        // 狂暴：快速徘徊 + 密集孢子
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 1.2; this.wanderAng = Math.atan2(dy, dx) + (Math.random() - 0.5); }
        this.tryMove(game, Math.cos(this.wanderAng) * this.speed * 1.5 * dt, Math.sin(this.wanderAng) * this.speed * 1.5 * dt);
        this.shootT -= dt;
        if (this.shootT <= 0) {
          this.shootT = 1.1;
          const base = Math.atan2(p.y - 8 - (this.y - 10), p.x - this.x);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.3;
            game.projectiles.push(new Projectile(this.x, this.y - 12, Math.cos(a) * 80, Math.sin(a) * 80, 'spore', false));
          }
        }
      }
    }

    tryMove(game, dx, dy) {
      if (game.map.canMove({ cw: 12, ch: 8, x: this.x, y: this.y }, this.x + dx, this.y)) this.x += dx;
      if (game.map.canMove({ cw: 12, ch: 8, x: this.x, y: this.y }, this.x, this.y + dy)) this.y += dy;
    }

    draw(ctx, cam) {
      let spr;
      if (this.kind === 'slug') {
        const squish = Math.sin(this.t * 6) > 0 ? 0 : 1;
        spr = S.enemySlug[squish];
      } else if (this.kind === 'shroom') {
        spr = S.enemyShroom[this.shooting > 0 ? 1 : 0];
      } else if (this.kind === 'hound') {
        spr = S.enemyHound[this.facing || 'left'][0];
      } else if (this.kind === 'boss') {
        spr = S.enemyBoss[this.phase >= 2 ? 1 : 0];
      }
      // 影子
      const shW = this.kind === 'boss' ? 26 : 12;
      ctx.fillStyle = 'rgba(26,28,44,.35)';
      ctx.fillRect(Math.round(this.x - shW / 2 - cam.x), Math.round(this.y - 1 - cam.y), shW, 2);
      const dx = Math.round(this.x - spr.width / 2 - cam.x);
      const dy = Math.round(this.y - spr.height - cam.y + (this.kind === 'hound' ? 2 : 0));
      if (this.hitFlash > 0) {
        ctx.globalAlpha = 0.9;
        ctx.drawImage(spr, dx, dy);
        // 受击白闪覆盖
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.fillRect(dx, dy, spr.width, spr.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(spr, dx, dy);
      }
      if (this.stun > 0) {
        // 麻痹标记
        MIST.Draw.text(ctx, '✦', this.x - cam.x, this.y - spr.height - 10 - cam.y, { size: 8, color: '#7de0d6' });
      }
      // Boss 血条
      if (this.kind === 'boss') {
        const bw = 60;
        MIST.Draw.panel(ctx, 480 / 2 - bw / 2 - 1, 8, bw + 2, 8, { bg: '#5d275d', border: '#dabfff' });
        ctx.fillStyle = '#b13e53';
        ctx.fillRect(480 / 2 - bw / 2 + 1, 9, (bw - 2) * Math.max(0, this.hp) / 60, 6);
        MIST.Draw.text(ctx, '菌王', 480 / 2, 19, { size: 7, color: '#dabfff', align: 'center' });
      }
    }
  }

  /* ---------- 拾取物 ---------- */
  class Pickup extends Entity {
    constructor(x, y, kind) {
      super(x, y);
      this.kind = kind; // heart / coin / potion / shard
      this.t = Math.random() * 5;
      this.life = kind === 'shard' ? 999 : 14;
    }
    update(dt, game) {
      this.t += dt;
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
      const p = game.player;
      if (Math.hypot(p.x - this.x, p.y - this.y) < 12) {
        this.dead = true;
        if (this.kind === 'heart') {
          p.heal(2);
        } else if (this.kind === 'potion') {
          p.heal(3);
          MIST.Particles.burst(this.x, this.y - 6, 8, '#b13e53', 40);
        } else if (this.kind === 'shard') {
          game.flags['shard_' + game.sceneDef.id] = true; // 防止重进地图再刷
          p.addShard(game);
        } else {
          p.coins++;
          MIST.Audio.sfx('select');
          MIST.Particles.burst(this.x, this.y - 4, 6, '#ffcd75', 30);
        }
      }
    }
    draw(ctx, cam) {
      const bob = Math.sin(this.t * 4) * 2;
      if (this.kind === 'heart') {
        ctx.drawImage(S.heart, Math.round(this.x - 3 - cam.x), Math.round(this.y - 10 + bob - cam.y));
      } else if (this.kind === 'potion') {
        ctx.drawImage(S.potion, Math.round(this.x - 4 - cam.x), Math.round(this.y - 12 + bob - cam.y));
        MIST.Draw.light(ctx, this.x - cam.x, this.y - 8 - cam.y, 10, '#b13e53', 0.25);
      } else if (this.kind === 'shard') {
        ctx.drawImage(S.shard, Math.round(this.x - 4 - cam.x), Math.round(this.y - 11 + bob - cam.y));
        MIST.Draw.light(ctx, this.x - cam.x, this.y - 7 - cam.y, 14, '#ff9db0', 0.35);
      } else {
        ctx.fillStyle = '#ffcd75';
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - 6 + bob - cam.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef7d57';
        ctx.fillRect(this.x - 1 - cam.x, this.y - 7 + bob - cam.y, 1, 1);
      }
      if (this.life < 3 && Math.floor(this.t * 6) % 2 === 0) ctx.globalAlpha = 0.4;
      ctx.globalAlpha = 1;
    }
  }

  MIST.Entities = { PlayerPair, NPC, Enemy, Projectile, Pickup };
})();
