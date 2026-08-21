/* =====================================================
 * 雾野列车 — audio.js
 * WebAudio 程序化合成：chiptune BGM + 音效
 * 致敬《风来之国》16bit 复古配乐氛围
 * ===================================================== */
window.MIST = window.MIST || {};

MIST.Audio = (function () {
  let ac = null, master = null, musicGain = null, sfxGain = null;
  let currentTrack = null, schedTimer = null, noteIndex = 0, nextTime = 0;

  function ensure() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
      sfxGain = ac.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    } catch (e) { return false; }
    return true;
  }

  /* ---------- 音量控制（设置界面用） ---------- */
  const settings = {
    musicOn: true, musicVol: 0.35,
    sfxOn: true, sfxVol: 0.5,
  };

  function applyVolumes() {
    if (!ac) return;
    musicGain.gain.value = settings.musicOn ? settings.musicVol : 0;
    sfxGain.gain.value = settings.sfxOn ? settings.sfxVol : 0;
  }

  function setMusicOn(on) { settings.musicOn = on; applyVolumes(); }
  function setSfxOn(on) { settings.sfxOn = on; applyVolumes(); }
  function setMusicVol(v) { settings.musicVol = Math.max(0, Math.min(1, v)); applyVolumes(); }
  function setSfxVol(v) { settings.sfxVol = Math.max(0, Math.min(1, v)); applyVolumes(); }

  function resume() {
    if (ensure() && ac.state === 'suspended') ac.resume();
  }

  /* ---------- 音符表 ---------- */
  const N = {
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.5, 'D6': 1174.7, 'E6': 1318.5, 'G6': 1568.0,
  };

  // 音轨：[bpm, 旋律[[音,拍],...], 低音[[音,拍],...]]
  const TRACKS = {
    // 标题：悠远孤独（致敬东行列车主题的开阔感）
    title: [76,
      [['E4', 1], ['G4', 1], ['B4', 1.5], ['A4', .5], ['G4', 1], ['E4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['A4', 1.5], ['B4', .5], ['C5', 1], ['B4', 1], ['A4', 2], ['G4', 1], ['A4', 1], ['B4', 1.5], ['C5', .5], ['D5', 1], ['B4', 1], ['A4', 2], ['G4', 1], ['E4', 1], ['D4', 1.5], ['E4', .5], ['G4', 1], ['A4', 1], ['G4', 2]],
      [['C3', 2], ['G3', 2], ['A3', 2], ['E3', 2], ['F3', 2], ['C3', 2], ['G3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['A3', 2], ['E3', 2], ['F3', 2], ['G3', 2], ['C3', 2], ['C3', 2]],
    ],
    // 地下矿镇：温暖静谧的方波小调
    town: [92,
      [['A4', 1], ['C5', 1], ['E5', 1], ['C5', 1], ['B4', .5], ['A4', .5], ['B4', 1], ['G4', 1], ['A4', 1], ['C5', 1], ['B4', 1], ['A4', 2], ['G4', 1], ['A4', 1], ['B4', 1], ['E4', 2], ['A4', 1], ['C5', 1], ['E5', 1], ['D5', 1], ['C5', .5], ['B4', .5], ['A4', 1], ['B4', 1], ['C5', 1], ['B4', 1], ['A4', 1], ['G4', 1], ['A4', 2]],
      [['A3', 2], ['E3', 2], ['F3', 2], ['C3', 2], ['G3', 2], ['E3', 2], ['A3', 2], ['E3', 2], ['A3', 2], ['E3', 2], ['F3', 2], ['C3', 2], ['D3', 2], ['E3', 2], ['A3', 2], ['A3', 2]],
    ],
    // 地牢矿道：紧张脉冲
    dungeon: [104,
      [['E4', .5], ['E4', .5], ['G4', 1], ['E4', .5], ['D4', .5], ['E4', 1], ['B3', 1], ['C4', 1], ['D4', .5], ['D4', .5], ['F4', 1], ['D4', .5], ['C4', .5], ['D4', 1], ['A3', 1], ['B3', 1], ['C4', .5], ['C4', .5], ['E4', 1], ['C4', .5], ['B3', .5], ['C4', 1], ['G3', 1], ['A3', 1], ['B3', .5], ['B3', .5], ['D4', 1], ['B3', .5], ['A3', .5], ['B3', 1], ['E3', 1], ['E3', 1]],
      [['A3', 1], ['A3', 1], ['A3', 1], ['A3', 1], ['G3', 1], ['G3', 1], ['G3', 1], ['G3', 1], ['F3', 1], ['F3', 1], ['F3', 1], ['F3', 1], ['E3', 1], ['E3', 1], ['E3', 1], ['E3', 1], ['A3', 1], ['A3', 1], ['A3', 1], ['A3', 1], ['G3', 1], ['G3', 1], ['G3', 1], ['G3', 1], ['F3', 1], ['F3', 1], ['F3', 1], ['F3', 1], ['E3', 1], ['E3', 1], ['E3', 1], ['E3', 1]],
    ],
    // 地表草原：明亮大调
    field: [100,
      [['C5', 1], ['E5', 1], ['G5', 1], ['E5', 1], ['D5', .5], ['C5', .5], ['D5', 1], ['G4', 1], ['C5', 1], ['D5', 1], ['E5', 2], ['G5', 1], ['E5', 1], ['D5', 1], ['C5', 1], ['D5', 1], ['B4', 2], ['C5', 1], ['E5', 1], ['G5', 1], ['A5', 1], ['G5', .5], ['E5', .5], ['D5', 1], ['C5', 1], ['D5', 1], ['C5', 2]],
      [['C3', 2], ['G3', 2], ['A3', 2], ['F3', 2], ['C3', 2], ['G3', 2], ['F3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['A3', 2], ['F3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['C3', 2]],
    ],
    // Boss 战：急促小调
    boss: [132,
      [['A4', .5], ['A4', .5], ['C5', .5], ['A4', .5], ['E5', 1], ['D5', .5], ['C5', .5], ['B4', 1], ['A4', .5], ['A4', .5], ['C5', .5], ['A4', .5], ['F5', 1], ['E5', .5], ['D5', .5], ['C5', 1], ['E5', .5], ['E5', .5], ['A5', .5], ['E5', .5], ['G5', 1], ['F5', .5], ['E5', .5], ['D5', 1]],
      [['A3', 1], ['A3', 1], ['A3', 1], ['A3', 1], ['F3', 1], ['F3', 1], ['G3', 1], ['G3', 1], ['A3', 1], ['A3', 1], ['A3', 1], ['A3', 1], ['F3', 1], ['F3', 1], ['E3', 1], ['E3', 1], 'x'],
    ],
    // 结局：温暖释然
    ending: [72,
      [['G4', 1], ['C5', 1], ['E5', 1.5], ['D5', .5], ['C5', 1], ['D5', 1], ['G4', 2], ['A4', 1], ['D5', 1], ['F5', 1.5], ['E5', .5], ['D5', 1], ['E5', 1], ['D5', 2], ['G4', 1], ['C5', 1], ['E5', 1], ['G5', 1], ['A5', 1], ['G5', 1], ['E5', 1], ['C5', 2]],
      [['C3', 2], ['G3', 2], ['F3', 2], ['C3', 2], ['D3', 2], ['G3', 2], ['C3', 2], ['C3', 2]],
    ],
  };

  /* ---------- 合成器 ---------- */
  function tone(freq, t, dur, type, vol, dest, slide) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function playMusic(name) {
    if (!ensure()) return;
    if (currentTrack === name) return;
    stopMusic();
    currentTrack = name;
    const track = TRACKS[name];
    if (!track) return;
    const [bpm, mel, bass] = track;
    const beat = 60 / bpm;
    noteIndex = 0; nextTime = ac.currentTime + 0.1;
    const totalBeats = mel.reduce((s, n) => s + n[1], 0);

    schedTimer = setInterval(() => {
      if (!ac) return;
      while (nextTime < ac.currentTime + 0.5) {
        // 主旋律（方波，明亮）
        const m = mel[noteIndex % mel.length];
        tone(N[m[0]] || 440, nextTime, m[1] * beat * 0.9, 'square', 0.16, musicGain);
        // 低音（三角波，柔和）
        const b = bass[noteIndex % bass.length];
        if (b !== 'x') tone(N[b[0]] / 2, nextTime, b[1] * beat * 0.95, 'triangle', 0.22, musicGain);
        // 简单打击（噪声 hat）
        if (noteIndex % 2 === 1) noise(nextTime, 0.03, 0.05, 6000);
        nextTime += m[1] * beat;
        noteIndex++;
        void totalBeats;
      }
    }, 120);
  }

  function noise(t, dur, vol, freq) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq || 4000;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t);
  }

  function stopMusic() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    currentTrack = null;
  }

  /* ---------- 音效 ---------- */
  const SFX = {
    swing: () => { tone(320, ac.currentTime, 0.12, 'sawtooth', 0.25, sfxGain, 90); },
    hit: () => { tone(180, ac.currentTime, 0.15, 'square', 0.3, sfxGain, 60); noise(ac.currentTime, 0.1, 0.2, 2000); },
    hurt: () => { tone(220, ac.currentTime, 0.25, 'sawtooth', 0.35, sfxGain, 70); },
    bubble: () => { tone(600, ac.currentTime, 0.2, 'sine', 0.3, sfxGain, 1200); },
    bubblePop: () => { tone(900, ac.currentTime, 0.12, 'sine', 0.25, sfxGain, 300); },
    talk: () => { tone(880, ac.currentTime, 0.05, 'square', 0.08, sfxGain); },
    select: () => { tone(660, ac.currentTime, 0.08, 'square', 0.2, sfxGain); tone(990, ac.currentTime + 0.08, 0.1, 'square', 0.2, sfxGain); },
    swap: () => { tone(440, ac.currentTime, 0.1, 'triangle', 0.3, sfxGain, 660); tone(660, ac.currentTime + 0.1, 0.15, 'triangle', 0.3, sfxGain, 880); },
    door: () => { tone(110, ac.currentTime, 0.3, 'sawtooth', 0.25, sfxGain, 55); },
    heal: () => { tone(523, ac.currentTime, 0.1, 'sine', 0.25, sfxGain); tone(659, ac.currentTime + 0.1, 0.1, 'sine', 0.25, sfxGain); tone(784, ac.currentTime + 0.2, 0.2, 'sine', 0.25, sfxGain); },
    enemyDie: () => { tone(300, ac.currentTime, 0.3, 'sawtooth', 0.25, sfxGain, 40); noise(ac.currentTime, 0.25, 0.2, 1000); },
    bossRoar: () => { tone(80, ac.currentTime, 0.8, 'sawtooth', 0.5, sfxGain, 45); noise(ac.currentTime, 0.6, 0.3, 400); },
    questDone: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, ac.currentTime + i * 0.12, 0.3, 'square', 0.2, sfxGain)); },
    step: () => { tone(140, ac.currentTime, 0.04, 'triangle', 0.06, sfxGain); },
  };

  function sfx(name) {
    if (!ensure()) return;
    if (ac.state === 'suspended') return;
    if (SFX[name]) SFX[name]();
  }

  return {
    resume, playMusic, stopMusic, sfx,
    setMusicOn, setSfxOn, setMusicVol, setSfxVol,
    get settings() { return settings; },
    get enabled() { return !!ac; },
  };
})();
