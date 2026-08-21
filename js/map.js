/* =====================================================
 * 雾野列车 — map.js
 * 瓦片地图：程序化瓦片生成 / 碰撞 / 镜头 / 光照层
 * 视觉理念（致敬《风来之国》）：
 *   复古像素瓦片 + 每格噪点变体（生活细节感）
 *   + 现代径向光照层（地下霓虹 / 地表暖阳）
 * ===================================================== */
window.MIST = window.MIST || {};

(function () {
  const TS = 16; // 瓦片尺寸

  /* ---------- 程序化瓦片生成 ---------- */
  function tileCanvas(fn) {
    const cv = document.createElement('canvas');
    cv.width = TS; cv.height = TS;
    fn(cv.getContext('2d'));
    return cv;
  }
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }

  // 基于坐标的稳定哈希（选择瓦片变体）
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = (h ^ (h >> 13)) * 1274126177 >>> 0;
    return (h ^ (h >> 16)) >>> 0;
  }

  /* 各主题瓦片集：floor 变体数组 + 其他类型 */
  function makeThemeTiles(theme) {
    const T = {};
    const P = MIST.PAL;

    if (theme === 'underground') {
      // 地下石砖地：暗蓝灰砖 + 噪点
      T.floor = [0, 1, 2, 3].map((v) => tileCanvas((ctx) => {
        ctx.fillStyle = P.f; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P.e;
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 8, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(8, 8, 1, 8);
        ctx.fillRect(4, 0, 1, 8); ctx.fillRect(12, 8, 1, 8);
        const r = MIST.rng(100 + v);
        for (let i = 0; i < 6; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, P.e);
        if (v === 3) { // 裂纹变体
          ctx.fillStyle = P['0'];
          px(ctx, 6, 3, P['0']); px(ctx, 7, 4, P['0']); px(ctx, 7, 5, P['0']); px(ctx, 8, 6, P['0']);
        }
      }));
      // 砖墙
      T.wall = tileCanvas((ctx) => {
        ctx.fillStyle = P['0']; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P.p;
        ctx.fillRect(1, 1, 6, 5); ctx.fillRect(9, 1, 6, 5);
        ctx.fillRect(1, 8, 3, 5); ctx.fillRect(6, 8, 6, 5); ctx.fillRect(14, 8, 1, 5);
        ctx.fillStyle = P.f;
        ctx.fillRect(2, 2, 4, 2); ctx.fillRect(10, 2, 4, 2); ctx.fillRect(7, 9, 4, 2);
      });
      // 矿石墙
      T.ore = tileCanvas((ctx) => {
        ctx.drawImage(T.wall, 0, 0);
        ctx.fillStyle = P.i; ctx.fillRect(5, 5, 3, 3); ctx.fillRect(9, 8, 2, 2);
        px(ctx, 6, 6, P.c); px(ctx, 9, 8, P.c);
        ctx.fillStyle = P['4']; px(ctx, 4, 4, P['4']); px(ctx, 11, 10, P['4']);
      });
      // 铁轨
      T.rail = tileCanvas((ctx) => {
        ctx.fillStyle = P.f; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P['8'];
        ctx.fillRect(0, 2, 16, 2); ctx.fillRect(0, 12, 16, 2);
        ctx.fillStyle = P.e;
        for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 16);
      });
      T.grass = T.floor; // 地下用同款
    } else if (theme === 'dungeon') {
      T.floor = [0, 1, 2].map((v) => tileCanvas((ctx) => {
        ctx.fillStyle = P.p; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P['1'];
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(5, 0, 1, 8); ctx.fillRect(11, 8, 1, 8);
        const r = MIST.rng(300 + v);
        for (let i = 0; i < 5; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, P.t);
        if (v === 2) { // 苔藓变体
          ctx.fillStyle = P['6']; px(ctx, 3, 3, P['6']); px(ctx, 4, 3, P['6']); px(ctx, 3, 4, P['6']);
          px(ctx, 12, 11, P['6']);
        }
      }));
      T.wall = tileCanvas((ctx) => {
        ctx.fillStyle = '#241f33'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P['1'];
        ctx.fillRect(1, 1, 6, 5); ctx.fillRect(9, 1, 6, 5);
        ctx.fillRect(1, 8, 4, 5); ctx.fillRect(7, 8, 5, 5); ctx.fillRect(14, 8, 1, 5);
        ctx.fillStyle = P.t;
        ctx.fillRect(2, 2, 3, 2); ctx.fillRect(10, 2, 3, 2);
        // 藤蔓
        ctx.fillStyle = P['6'];
        ctx.fillRect(3, 0, 1, 3); ctx.fillRect(12, 0, 1, 2);
      });
      T.ore = tileCanvas((ctx) => {
        ctx.drawImage(T.wall, 0, 0);
        ctx.fillStyle = P['2']; ctx.fillRect(5, 5, 3, 3); ctx.fillRect(10, 9, 2, 2);
        px(ctx, 6, 6, P['4']);
      });
      T.rail = tileCanvas((ctx) => {
        ctx.fillStyle = P.p; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P['1'];
        ctx.fillRect(0, 2, 16, 2); ctx.fillRect(0, 12, 16, 2);
        ctx.fillStyle = P.t;
        for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 16);
      });
      T.grass = T.floor;
    } else if (theme === 'field' || theme === 'forest') {
      const dark = theme === 'forest';
      const baseC = dark ? P['7'] : P['6'];
      const hiC = dark ? P['6'] : P['5'];
      T.floor = [0, 1, 2, 3].map((v) => tileCanvas((ctx) => {
        // 草地
        ctx.fillStyle = baseC; ctx.fillRect(0, 0, 16, 16);
        const r = MIST.rng(500 + v + (dark ? 50 : 0));
        for (let i = 0; i < 10; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, dark ? P['6'] : P['5']);
        for (let i = 0; i < 6; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, dark ? P['7'] : P['6']);
        if (v >= 2) { // 草叶
          const gx = 2 + ((r() * 10) | 0), gy = 2 + ((r() * 10) | 0);
          px(ctx, gx, gy, hiC); px(ctx, gx, gy - 1, hiC); px(ctx, gx + 1, gy, hiC);
        }
        if (v === 3 && !dark) { // 小花
          px(ctx, 7, 6, P['4']); px(ctx, 8, 6, P.j); px(ctx, 7, 7, P.j); px(ctx, 8, 7, P['4']);
        }
      }));
      // 泥土路
      T.road = [0, 1].map((v) => tileCanvas((ctx) => {
        ctx.fillStyle = P.r; ctx.fillRect(0, 0, 16, 16);
        const r = MIST.rng(700 + v);
        for (let i = 0; i < 8; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, P.s);
        for (let i = 0; i < 4; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, P.h);
      }));
      T.wall = tileCanvas((ctx) => {
        // 地表石块
        ctx.fillStyle = P['0']; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = P.e; ctx.fillRect(1, 2, 14, 13);
        ctx.fillStyle = P.d; ctx.fillRect(2, 1, 12, 4); ctx.fillRect(2, 6, 5, 3); ctx.fillRect(9, 6, 5, 3);
        ctx.fillStyle = P.f; ctx.fillRect(2, 10, 12, 4);
        px(ctx, 4, 3, P.c); px(ctx, 5, 3, P.c);
      });
      T.ore = T.wall;
      T.rail = tileCanvas((ctx) => {
        ctx.fillStyle = baseC; ctx.fillRect(0, 0, 16, 16);
        const r = MIST.rng(900);
        for (let i = 0; i < 6; i++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, dark ? P['6'] : P['5']);
        ctx.fillStyle = P.h;
        ctx.fillRect(0, 3, 16, 2); ctx.fillRect(0, 11, 16, 2);
        ctx.fillStyle = P.s;
        for (let x = 1; x < 16; x += 5) ctx.fillRect(x, 1, 2, 14);
      });
      T.grass = T.floor;
      // 高草丛（可通行）
      T.bush = tileCanvas((ctx) => {
        ctx.fillStyle = dark ? P['7'] : P['6']; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = dark ? P['6'] : P['5'];
        for (let x = 1; x < 15; x += 2) {
          const h = 4 + ((x * 7) % 5);
          ctx.fillRect(x, 16 - h, 1, h);
          px(ctx, x - 1, 16 - h + 1, dark ? P['6'] : P['5']);
        }
        ctx.fillStyle = dark ? P['5'] : P['6'];
        ctx.fillRect(2, 8, 1, 6); ctx.fillRect(8, 6, 1, 8); ctx.fillRect(13, 9, 1, 5);
      });
    }

    // 通用：水（动画由渲染时处理）
    T.water = tileCanvas((ctx) => {
      ctx.fillStyle = P['8']; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = P['9']; ctx.fillRect(0, 0, 16, 6);
      ctx.fillStyle = P.a; ctx.fillRect(0, 0, 16, 2);
    });
    // 木箱
    T.crate = tileCanvas((ctx) => {
      ctx.fillStyle = P.g; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = P.h; ctx.fillRect(1, 1, 14, 14);
      ctx.fillStyle = P.n;
      ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
      ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
      ctx.fillStyle = P.r; ctx.fillRect(2, 7, 12, 2); ctx.fillRect(7, 2, 2, 12);
    });
    // 灯柱（绘制时向上偏移16px，光源在顶端）
    T.lamp = tileCanvas((ctx) => {
      ctx.fillStyle = P['0']; ctx.fillRect(6, 16, 4, 16);
      ctx.fillStyle = P.e; ctx.fillRect(7, 16, 2, 16);
      ctx.fillStyle = P['4']; ctx.fillRect(4, 0, 8, 8);
      ctx.fillStyle = P.x; ctx.fillRect(5, 1, 6, 6);
      ctx.fillStyle = P.c; ctx.fillRect(6, 2, 4, 3);
      ctx.fillStyle = P['0']; ctx.fillRect(5, 8, 6, 2); ctx.fillRect(3, 9, 2, 1); ctx.fillRect(11, 9, 2, 1);
    });
    // 树（物件，绘制时向上偏移32px）
    T.tree = tileCanvas((ctx) => {
      // 16x48 树
      ctx.fillStyle = P.g; ctx.fillRect(6, 24, 4, 22);
      ctx.fillStyle = P.n; ctx.fillRect(7, 24, 2, 22);
      ctx.fillStyle = dark_leaf();
      ctx.fillRect(1, 4, 14, 16); ctx.fillRect(3, 0, 10, 6);
      ctx.fillStyle = leaf_hi();
      ctx.fillRect(3, 5, 10, 8); ctx.fillRect(5, 2, 6, 4);
      ctx.fillStyle = P['6'];
      px(ctx, 4, 6, P['5']); px(ctx, 9, 8, P['5']); px(ctx, 6, 10, P['5']);
      function dark_leaf() { return theme === 'forest' ? P['7'] : P['6']; }
      function leaf_hi() { return theme === 'forest' ? P['6'] : P['5']; }
    });
    // 机关（珊激活）
    T.crystal = tileCanvas((ctx) => {
      ctx.fillStyle = P.t; ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = P.i; ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = P.w; ctx.fillRect(6, 5, 3, 3);
      ctx.fillStyle = P.b; px(ctx, 7, 6, P.b);
    });
    T.crystalOn = tileCanvas((ctx) => {
      ctx.fillStyle = P.t; ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = P.w; ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = P.c; ctx.fillRect(6, 5, 3, 3);
      ctx.fillStyle = P.b; px(ctx, 7, 6, P.b);
    });
    // 门
    T.door = tileCanvas((ctx) => {
      ctx.fillStyle = P.g; ctx.fillRect(1, 0, 14, 16);
      ctx.fillStyle = P.h; ctx.fillRect(2, 1, 12, 15);
      ctx.fillStyle = P.n;
      ctx.fillRect(2, 1, 12, 2); ctx.fillRect(2, 1, 2, 15); ctx.fillRect(12, 1, 2, 15);
      ctx.fillStyle = P['4']; ctx.fillRect(10, 8, 2, 2);
      ctx.fillStyle = P.m; ctx.fillRect(3, 4, 10, 1); ctx.fillRect(3, 10, 10, 1);
    });
    // 锁门（带锁孔，需要钥匙）
    T.lockedDoor = tileCanvas((ctx) => {
      ctx.fillStyle = P.m; ctx.fillRect(1, 0, 14, 16);
      ctx.fillStyle = P.n; ctx.fillRect(2, 1, 12, 15);
      ctx.fillStyle = P.m;
      ctx.fillRect(2, 1, 12, 2); ctx.fillRect(2, 1, 2, 15); ctx.fillRect(12, 1, 2, 15);
      ctx.fillStyle = P['4'];
      ctx.fillRect(6, 5, 4, 4); ctx.fillRect(7, 9, 2, 3); // 金锁
      ctx.fillStyle = P.m; ctx.fillRect(7, 6, 2, 2);
    });
    // 压力板（未踩下）
    T.plate = tileCanvas((ctx) => {
      ctx.fillStyle = P.e; ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = P.d; ctx.fillRect(3, 3, 10, 10);
      ctx.fillStyle = P['9']; ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = P.b; ctx.fillRect(6, 6, 2, 2);
    });
    // 压力板（踩下）
    T.plateOn = tileCanvas((ctx) => {
      ctx.fillStyle = P.e; ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = P['7']; ctx.fillRect(3, 3, 10, 10);
      ctx.fillStyle = P.w; ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = P.c; ctx.fillRect(6, 6, 2, 2);
    });
    // 压力板控制的机关门（石栅栏门）
    T.gate = tileCanvas((ctx) => {
      ctx.fillStyle = P['0']; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = P.e; ctx.fillRect(1, 0, 3, 16); ctx.fillRect(7, 0, 3, 16); ctx.fillRect(13, 0, 3, 16);
      ctx.fillStyle = P.d; ctx.fillRect(0, 3, 16, 2); ctx.fillRect(0, 11, 16, 2);
    });
    return T;
  }

  /* =====================================================
   * 地图类
   * ===================================================== */
  class GameMap {
    constructor(def) {
      this.def = def;
      this.theme = def.theme;
      this.tiles = def.tiles.map((r) => r.split('')); // 转为可变二维数组
      this.h = this.tiles.length;
      this.w = this.tiles[0].length;
      this.T = makeThemeTiles(this.theme);
      this.pxW = this.w * TS;
      this.pxH = this.h * TS;
      this.crystals = {}; // 机关激活状态 key: tx,ty
      this.plates = (def.plates || []).map((p) => ({ ...p, on: false }));
      this.fridgeGlow = 0; // 冰箱保存时的发光计时
    }

    at(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return '#';
      return this.tiles[ty][tx];
    }

    setTile(tx, ty, c) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
      this.tiles[ty][tx] = c;
    }

    isSolid(tx, ty) {
      const c = this.at(tx, ty);
      if (c === '+') return !this.crystals[tx + ',' + ty]; // 机关未激活时为障碍
      if (c === 'G') return true;  // 压力板机关门（由板联动控制开合）
      if (c === 'M') return true;  // 锁门（钥匙开启后变 '.'）
      if (c === 'F') return true;  // 冰箱存档点（实体障碍）
      return '#~TBXLrO'.includes(c);
    }

    /* 恢复持久化状态：已激活的水晶门 / 已开的锁门（来自游戏 flags） */
    restorePersistent(flags, sceneId) {
      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < this.w; tx++) {
          const c = this.tiles[ty][tx];
          const key = tx + ',' + ty;
          if (c === '+' && flags['crystal_' + sceneId + '_' + key]) {
            this.crystals[key] = true;
          } else if (c === 'M' && flags['door_' + sceneId + '_' + key]) {
            this.tiles[ty][tx] = '.';
          }
        }
      }
    }

    isSolidPx(x, y) {
      return this.isSolid(Math.floor(x / TS), Math.floor(y / TS));
    }

    // AABB 碰撞检测（实体脚部碰撞盒）
    canMove(e, nx, ny) {
      const hw = e.cw / 2;
      const x1 = nx - hw, x2 = nx + hw - 1;
      const y1 = ny, y2 = ny + e.ch - 1;
      for (let ty = Math.floor(y1 / TS); ty <= Math.floor(y2 / TS); ty++) {
        for (let tx = Math.floor(x1 / TS); tx <= Math.floor(x2 / TS); tx++) {
          if (this.isSolid(tx, ty)) return false;
        }
      }
      return true;
    }

    drawGround(ctx, cam, time) {
      const x0 = Math.max(0, Math.floor(cam.x / TS));
      const y0 = Math.max(0, Math.floor(cam.y / TS));
      const x1 = Math.min(this.w - 1, Math.ceil((cam.x + 480) / TS));
      const y1 = Math.min(this.h - 1, Math.ceil((cam.y + 270) / TS));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const c = this.tiles[ty][tx];
          const v = hash2(tx, ty);
          const dx = tx * TS - cam.x, dy = ty * TS - cam.y;
          switch (c) {
            case '.': case '+': case 'Z':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              break;
            case 'D':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.door, dx, dy);
              break;
            case 'M':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.lockedDoor, dx, dy);
              break;
            case 'G':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.gate, dx, dy);
              break;
            case 'P': {
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              const plate = this.plates.find((p) => p.x === tx && p.y === ty);
              ctx.drawImage(plate && plate.on ? this.T.plateOn : this.T.plate, dx, dy);
              break;
            }
            case 'F': {
              // 冰箱存档点：微微浮动 + 顶部指示灯呼吸
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              const spr = (this.fridgeGlow > 0) ? MIST.Sprites.fridgeOn : MIST.Sprites.fridge;
              ctx.drawImage(spr, dx, dy - 8);
              break;
            }
            case ',': // 小路
              if (this.T.road) ctx.drawImage(this.T.road[v % this.T.road.length], dx, dy);
              else ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              break;
            case 'g':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.bush || this.T.floor[0], dx, dy);
              break;
            case '#':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.wall, dx, dy);
              break;
            case 'X': case 'O':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.ore, dx, dy);
              break;
            case '=':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.rail, dx, dy);
              break;
            case '~': {
              ctx.drawImage(this.T.water, dx, dy);
              // 水面波光动画
              const ph = Math.sin(time * 2 + tx * 1.3 + ty * 2.1);
              if (ph > 0.55) {
                ctx.fillStyle = 'rgba(115,239,247,.5)';
                ctx.fillRect(dx + ((v % 8)), dy + 3 + ((v % 6)), 4, 1);
                ctx.fillRect(dx + ((v % 5) + 8), dy + 10, 3, 1);
              }
              break;
            }
            case 'T': {
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.tree, dx - 0, dy - 32);
              break;
            }
            case 'B':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.crate, dx, dy);
              break;
            case 'L': {
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.lamp, dx + 4, dy - 16);
              break;
            }
            case 'r':
              ctx.drawImage(this.T.floor[v % this.T.floor.length], dx, dy);
              ctx.drawImage(this.T.wall, dx, dy);
              break;
          }
          // 机关水晶（激活态覆盖）
          if (c === '+') {
            ctx.drawImage(this.crystals[tx + ',' + ty] ? this.T.crystalOn : this.T.crystal, dx, dy);
          }
          // 钥匙（浮动动画）
          if (c === 'Z') {
            const bob = Math.sin(time * 3 + tx) * 2;
            ctx.drawImage(MIST.Sprites.key, dx + 4, dy + 3 + bob);
            MIST.Draw.light(ctx, dx + 8, dy + 8, 12, '#ffcd75', 0.3);
          }
        }
      }
    }

    /* 压力板联动（冰火人式双角色谜题核心）：
     * 任一角色（主角或跟随者）站在板上即激活；
     * 多块板可 OR 控制同一道门；全部松开时门关闭恢复 */
    updatePlates(game) {
      const chars = [
        { x: game.player.x, y: game.player.y },
        { x: game.player.follower.x, y: game.player.follower.y },
      ];
      let changed = false;
      for (const plate of this.plates) {
        const was = plate.on;
        plate.on = chars.some((c) => Math.floor(c.x / TS) === plate.x && Math.floor(c.y / TS) === plate.y);
        if (was !== plate.on) changed = true;
      }
      if (changed) this.syncGates();
    }

    syncGates() {
      const gatePlates = {};
      for (const p of this.plates) {
        for (const d of p.doors) {
          const k = d[0] + ',' + d[1];
          (gatePlates[k] = gatePlates[k] || []).push(p);
        }
      }
      for (const k in gatePlates) {
        const [gx, gy] = k.split(',').map(Number);
        if (gatePlates[k].some((p) => p.on)) {
          if (this.at(gx, gy) === 'G') {
            this.setTile(gx, gy, '.');
            MIST.Audio.sfx('door');
            MIST.Particles.burst(gx * TS + 8, gy * TS + 8, 8, '#73eff7', 40);
          }
        } else if (this.at(gx, gy) === '.') {
          this.setTile(gx, gy, 'G');
        }
      }
    }

    // 收集光源 [{x,y,r,color}]
    collectLights(time) {
      const lights = [];
      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < this.w; tx++) {
          const c = this.tiles[ty][tx];
          if (c === 'L') {
            const fl = 0.9 + Math.sin(time * 6 + tx * 3) * 0.1;
            lights.push({ x: tx * TS + 8, y: ty * TS - 12, r: 42 * fl, color: '#ffcd75', a: 0.5 });
          } else if (c === '+' && this.crystals[tx + ',' + ty]) {
            lights.push({ x: tx * TS + 8, y: ty * TS + 8, r: 36, color: '#7de0d6', a: 0.55 });
          } else if (c === 'F') {
            // 冰箱冷光（保存瞬间更亮）
            const boost = this.fridgeGlow > 0 ? 1.8 : 1;
            lights.push({ x: tx * TS + 8, y: ty * TS, r: 34 * boost, color: '#73eff7', a: 0.4 * boost });
          }
        }
      }
      return lights;
    }
  }

  MIST.TS = TS;
  MIST.GameMap = GameMap;
  MIST.hash2 = hash2;
})();
