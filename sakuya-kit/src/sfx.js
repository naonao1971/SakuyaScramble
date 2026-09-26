// 効果音。音声ファイルは持たず、Web Audio で矩形波とノイズを合成する。
// 80年代アーケードのチップチューンそのものの音になり、配信容量もライセンスの
// 制約も増えない。
//
// 演出は3階層（頻度と強度は逆相関。全部を鳴らすと何も特別でなくなる）:
//   弱 毎秒        射撃など        極小音・ピッチを散らす
//   中 ときどき    被弾/取得/開始   中音量
//   強 まれ        必殺/終了        専用の音
//
// タイトル固有の音は、ゲーム側で sfx.tone / sfx.noise を組み合わせて作る。
export function createSfx() {
  const SFX = {
    ctx: null,
    master: null,
    muted: false,
    volume: 0.5,
    _noiseBuf: null,

    // AudioContext はユーザー操作を経ないと鳴らせない(特にiOS)。
    // resume() は非同期なので Promise を返し、呼び出し側で await させる
    unlock() {
      if (!SFX.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return Promise.resolve();
        SFX.ctx = new AC();
        SFX.master = SFX.ctx.createGain();
        SFX.master.gain.value = SFX.muted ? 0 : SFX.volume;
        SFX.master.connect(SFX.ctx.destination);
      }
      if (SFX.ctx.state === "suspended") {
        return SFX.ctx.resume().catch(() => {});
      }
      return Promise.resolve();
    },

    setMuted(m) {
      SFX.muted = !!m;
      if (SFX.master) SFX.master.gain.value = SFX.muted ? 0 : SFX.volume;
    },

    // 単発のトーン。type は square/sawtooth/triangle など
    tone({ freq = 440, to = null, dur = 0.12, type = "square", gain = 0.2, delay = 0 } = {}) {
      if (!SFX.ctx || SFX.muted) return;
      const t0 = SFX.ctx.currentTime + delay;
      const osc = SFX.ctx.createOscillator();
      const g = SFX.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      // 立ち上がりを一瞬で、減衰を指数で。矩形波の「カチッ」とした質感が出る
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(SFX.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    // 爆発・ヒット用のホワイトノイズ。バッファは一度だけ作って使い回す
    noise({ dur = 0.2, gain = 0.2, delay = 0, filterFrom = 1800, filterTo = 200 } = {}) {
      if (!SFX.ctx || SFX.muted) return;
      if (!SFX._noiseBuf) {
        const len = SFX.ctx.sampleRate * 1.0;
        const buf = SFX.ctx.createBuffer(1, len, SFX.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        SFX._noiseBuf = buf;
      }
      const t0 = SFX.ctx.currentTime + delay;
      const src = SFX.ctx.createBufferSource();
      src.buffer = SFX._noiseBuf;
      src.loop = true;
      const lp = SFX.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(filterFrom, t0);
      lp.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t0 + dur);
      const g = SFX.ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp).connect(g).connect(SFX.master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },

    // --- シリーズ共通の定番音。タイトル間で同じ意味の音は同じ音にする ---
    shot() {
      const f = 820 + Math.random() * 140;
      SFX.tone({ freq: f, to: f * 0.45, dur: 0.05, type: "square", gain: 0.045 });
    },
    hit() {
      SFX.noise({ dur: 0.22, gain: 0.28, filterFrom: 1400, filterTo: 120 });
      SFX.tone({ freq: 180, to: 60, dur: 0.2, type: "square", gain: 0.16 });
    },
    pickup() {
      SFX.tone({ freq: 660, dur: 0.07, type: "square", gain: 0.15 });
      SFX.tone({ freq: 990, dur: 0.09, type: "square", gain: 0.15, delay: 0.07 });
    },
    bonus() {
      SFX.tone({ freq: 523, dur: 0.08, type: "square", gain: 0.14 });
      SFX.tone({ freq: 659, dur: 0.08, type: "square", gain: 0.14, delay: 0.08 });
      SFX.tone({ freq: 784, dur: 0.14, type: "square", gain: 0.14, delay: 0.16 });
    },
    explode() {
      SFX.noise({ dur: 0.3, gain: 0.22, filterFrom: 900, filterTo: 80 });
    },
    stage() {
      SFX.tone({ freq: 392, dur: 0.1, type: "square", gain: 0.16 });
      SFX.tone({ freq: 523, dur: 0.1, type: "square", gain: 0.16, delay: 0.1 });
      SFX.tone({ freq: 784, dur: 0.22, type: "square", gain: 0.16, delay: 0.2 });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) =>
        SFX.tone({ freq: f, dur: 0.3, type: "square", gain: 0.2, delay: i * 0.18 })
      );
    },
    clear() {
      [523, 659, 784, 1047].forEach((f, i) =>
        SFX.tone({ freq: f, dur: 0.24, type: "square", gain: 0.2, delay: i * 0.13 })
      );
      SFX.tone({ freq: 1319, dur: 0.5, type: "square", gain: 0.22, delay: 0.52 });
    },
  };
  return SFX;
}
