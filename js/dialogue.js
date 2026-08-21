/* =====================================================
 * 雾野列车 — dialogue.js
 * 打字机对话系统：头像 / 分页 / 选项 / 剧情脚本队列
 * 致敬《风来之国》的对话框像素巧思与生动台词
 * ===================================================== */
window.MIST = window.MIST || {};

(function () {
  /* 对话数据格式：
   * { who: 'loen'|'sprout'|'mayor'|..., lines: ['...', '...'], portrait: true }
   * 或旁白 { who: null, lines: [...] }
   * 剧情脚本：按序执行的步骤数组
   *  step: {dialog: [...]} | {music: 'name'} | {setFlag: 'x'} | {fn: function}
   */
  class DialogueSystem {
    constructor(game) {
      this.game = game;
      this.queue = [];       // 待播放对话
      this.current = null;   // 当前对话对象
      this.page = 0;
      this.charT = 0;        // 打字机计数
      this.chars = 0;
      this.active = false;
      this.choiceMode = false;
      this.choiceIndex = 0;
      this.choices = [];
      this.onEnd = null;
      this.script = null;    // 剧情脚本
      this.scriptStep = 0;
      this.cooldown = 0;     // 对话结束后的交互冷却
    }

    start(dialogs, onEnd) {
      this.queue = dialogs.slice();
      this.onEnd = onEnd || null;
      this.active = true;
      this.next();
    }

    runScript(steps) {
      this.script = steps;
      this.scriptStep = 0;
      this.active = true;
      this._runNext();
    }

    _runNext() {
      if (!this.script) return;
      while (this.scriptStep < this.script.length) {
        const s = this.script[this.scriptStep++];
        if (s.dialog) { this.start(s.dialog, () => this._runNext()); return; }
        if (s.music) MIST.Audio.playMusic(s.music);
        if (s.setFlag) this.game.flags[s.setFlag] = true;
        if (s.setSolo !== undefined) this.game.player.soloMode = s.setSolo;
        if (s.fn) { s.fn(this.game); }
        if (s.wait) { setTimeout(() => this._runNext(), s.wait); return; }
      }
      // 脚本结束
      this.script = null;
      this.active = false;
      this.cooldown = 0.35;
    }

    next() {
      if (this.queue.length === 0) {
        this.active = false;
        this.current = null;
        // 交互冷却：防止连按E导致对话"关闭→立即重开"
        this.cooldown = 0.35;
        if (this.onEnd) this.onEnd();
        if (this.script) this._runNext();
        return;
      }
      this.current = this.queue.shift();
      this.page = 0;
      this.chars = 0;
      this.charT = 0;
      if (this.current.choices) {
        this.choiceMode = true;
        this.choiceIndex = 0;
        this.choices = this.current.choices;
      }
    }

    update(dt) {
      if (this.cooldown > 0) this.cooldown -= dt;
      if (!this.active || !this.current) return;
      const line = this.current.lines[this.page] || '';
      if (this.chars < line.length) {
        this.charT += dt * 28; // 打字速度
        while (this.charT >= 1 && this.chars < line.length) {
          this.chars++;
          this.charT -= 1;
          if (this.chars % 2 === 0) MIST.Audio.sfx('talk');
        }
      }
      const E = MIST.Engine;
      if (this.choiceMode && this.chars >= line.length) {
        if (E.pressed('up') || E.pressed('left')) { this.choiceIndex = (this.choiceIndex + this.choices.length - 1) % this.choices.length; MIST.Audio.sfx('select'); }
        if (E.pressed('down') || E.pressed('right')) { this.choiceIndex = (this.choiceIndex + 1) % this.choices.length; MIST.Audio.sfx('select'); }
      }
      if (E.pressed('interact') || E.pressed('attack')) {
        if (this.chars < line.length) {
          this.chars = line.length; // 快进
        } else if (this.choiceMode && this.current.choices) {
          const pick = this.choices[this.choiceIndex];
          this.choiceMode = false;
          if (pick.next) {
            this.start(pick.next);
            return;
          }
          this.next();
        } else {
          this.page++;
          this.chars = 0;
          if (this.page >= this.current.lines.length) {
            if (this.current.fn) this.current.fn(this.game);
            this.next();
          }
        }
      }
    }

    draw(ctx) {
      if (!this.active || !this.current) return;
      const E = MIST.Engine;
      const line = this.current.lines[this.page] || '';
      const shown = line.slice(0, this.chars);

      // 对话框
      const bx = 14, by = 200, bw = 452, bh = 56;
      MIST.Draw.panel(ctx, bx, by, bw, bh, { bg: '#29366f', border: '#94b0c2' });

      // 说话者头像框
      let name = '', faceColor = '#94b0c2';
      const NAMES = {
        loen: ['洛恩', '#c4b57d'], sprout: ['小芽', '#7de0d6'],
        mayor: ['镇长', '#ad6242'], miner: ['老周', '#ffcd75'], granny: ['婆婆', '#b13e53'],
        kid: ['小石头', '#41a6f6'], scientist: ['艾芯', '#f4f4f4'], trader: ['货郎', '#38b764'],
        robot: ['铁蛋', '#94b0c2'], narrator: ['', ''],
      };
      const info = NAMES[this.current.who] || ['', '#94b0c2'];
      name = info[0]; faceColor = info[1];

      if (name) {
        // 名牌
        MIST.Draw.panel(ctx, bx + 6, by - 12, name.length * 10 + 12, 16, { bg: faceColor, border: '#1a1c2c' });
        MIST.Draw.text(ctx, name, bx + 12, by - 8, { size: 10, color: '#1a1c2c', shadow: null });
      }

      // 文本（自动换行）
      ctx.font = '10px "Courier New", "SimHei", monospace';
      const maxW = bw - 24;
      const charsPerLine = Math.floor(maxW / 10);
      let text = shown;
      let ty = by + 10;
      while (text.length > 0) {
        ctx.fillStyle = '#f4f4f4';
        ctx.fillText(text.slice(0, charsPerLine), bx + 12, ty);
        text = text.slice(charsPerLine);
        ty += 13;
      }

      // 继续提示箭头
      if (this.chars >= line.length) {
        if (this.choiceMode && this.current.choices) {
          // 选项列表
          this.current.choices.forEach((c, i) => {
            const cy = by + 34;
            const cx = bx + 20 + i * 100;
            if (i === this.choiceIndex) {
              ctx.fillStyle = '#ffcd75';
              ctx.fillText('▶ ' + c.text, cx, cy);
            } else {
              ctx.fillStyle = '#94b0c2';
              ctx.fillText('  ' + c.text, cx, cy);
            }
          });
        } else if (this.page < this.current.lines.length - 1 || this.queue.length > 0) {
          const bob = Math.sin(E.time * 6) * 2;
          ctx.fillStyle = '#ffcd75';
          ctx.beginPath();
          ctx.moveTo(bx + bw - 18, by + bh - 14 + bob);
          ctx.lineTo(bx + bw - 10, by + bh - 14 + bob);
          ctx.lineTo(bx + bw - 14, by + bh - 8 + bob);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  MIST.DialogueSystem = DialogueSystem;
})();
