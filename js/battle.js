/* =====================================================
 * 雾野列车 — battle.js
 * 战斗结算：伤害 / 击退 / 掉落 / 玩家泡泡命中麻痹
 * ===================================================== */
window.MIST = window.MIST || {};

MIST.Battle = (function () {
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function entityBox(e) {
    const w = e.kind === 'boss' ? 34 : 14;
    const h = e.kind === 'boss' ? 30 : 12;
    return { x: e.x - w / 2, y: e.y - h, w, h };
  }

  function damage(enemy, dmg, knock, knockSpd, game) {
    enemy.hp -= dmg;
    enemy.hitFlash = 0.15;
    game.shake(3, 0.15);
    MIST.Audio.sfx('hit');
    MIST.Particles.burst(enemy.x, enemy.y - 8, 8, '#ef7d57', 60);
    if (knock && !enemy.dead) {
      const nx = enemy.x + knock[0] * knockSpd * 0.12;
      const ny = enemy.y + knock[1] * knockSpd * 0.12;
      if (game.map.canMove({ cw: 12, ch: 8, x: enemy.x, y: enemy.y }, nx, ny)) {
        enemy.x = nx; enemy.y = ny;
      }
    }
    if (enemy.hp <= 0) {
      enemy.dead = true;
      MIST.Audio.sfx('enemyDie');
      MIST.Particles.burst(enemy.x, enemy.y - 8, 16, enemy.kind === 'boss' ? '#dabfff' : '#38b764', 80);
      MIST.Particles.burst(enemy.x, enemy.y - 8, 8, '#ef7d57', 50);
      // 掉落
      if (enemy.kind === 'boss') {
        for (let i = 0; i < 6; i++) {
          game.pickups.push(new MIST.Entities.Pickup(enemy.x + (Math.random() - 0.5) * 40, enemy.y + (Math.random() - 0.5) * 30, 'coin'));
        }
        game.pickups.push(new MIST.Entities.Pickup(enemy.x, enemy.y, 'heart'));
        game.onBossDefeated(enemy);
      } else if (Math.random() < 0.4) {
        game.pickups.push(new MIST.Entities.Pickup(enemy.x, enemy.y, Math.random() < 0.5 ? 'heart' : 'coin'));
      }
    }
  }

  /* 泡泡命中敌人：小伤害 + 麻痹（致敬珊的控制定位） */
  function bubbleHit(enemy, game) {
    enemy.hp -= 0.34; // 三发一个 slug
    enemy.hitFlash = 0.1;
    enemy.stun = 1.6;
    MIST.Audio.sfx('bubblePop');
    MIST.Particles.burst(enemy.x, enemy.y - 8, 6, '#7de0d6', 40);
    if (enemy.hp <= 0) {
      damage(enemy, 0, null, 0, game); // 走统一死亡逻辑
    }
  }

  /* 泡泡命中机关（激活水晶） */
  function bubbleHitCrystal(tx, ty, game) {
    const key = tx + ',' + ty;
    if (game.map.crystals[key]) return false;
    game.map.crystals[key] = true;
    MIST.Audio.sfx('questDone');
    MIST.Particles.burst(tx * 16 + 8, ty * 16 + 8, 14, '#7de0d6', 60);
    game.shake(3, 0.2);
    game.onCrystalActivated(key);
    return true;
  }

  return { aabb, entityBox, damage, bubbleHit, bubbleHitCrystal };
})();
