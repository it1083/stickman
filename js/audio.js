/**
 * audio.js — 程序化音效系统（WebAudio 合成，零音频资源）
 * 微信端使用 wx.createWebAudioContext（基础库 2.19+），浏览器用 AudioContext，
 * 均不可用时静默降级，不影响游戏运行。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var ac = null;          // AudioContext
  var master = null;      // 主音量节点
  var enabled = true;     // 音效开关
  var noiseBuf = null;    // 白噪声 buffer
  var bgmTimer = null;
  var bgmStep = 0;

  function init() {
    enabled = SF.storage.get('soundOn') !== false;
    try {
      ac = SF.adapter.createAudioContext();
      if (ac) {
        master = ac.createGain();
        master.gain.value = 0.55;
        master.connect(ac.destination);
        // 预生成白噪声 buffer
        var len = ac.sampleRate * 0.5;
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
    } catch (e) { ac = null; }
  }

  function resume() {
    if (ac && ac.state === 'suspended' && ac.resume) { try { ac.resume(); } catch (e) {} }
  }

  /** 振荡器音符 */
  function tone(opts) {
    if (!ac || !enabled) return;
    resume();
    var o = ac.createOscillator();
    var g = ac.createGain();
    var t = ac.currentTime + (opts.delay || 0);
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0 || 440, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t + (opts.dur || 0.1));
    var vol = opts.vol || 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.1));
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + (opts.dur || 0.1) + 0.05);
  }

  /** 噪声（打击感） */
  function noise(opts) {
    if (!ac || !enabled || !noiseBuf) return;
    resume();
    var src = ac.createBufferSource();
    src.buffer = noiseBuf;
    var g = ac.createGain();
    var f = ac.createBiquadFilter();
    f.type = opts.filter || 'lowpass';
    f.frequency.value = opts.cut || 1200;
    var t = ac.currentTime + (opts.delay || 0);
    var vol = opts.vol || 0.3;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.12));
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + (opts.dur || 0.12) + 0.05);
  }

  /** 音效表 */
  var SFX = {
    ui:       function () { tone({ type: 'square', f0: 660, f1: 880, dur: 0.07, vol: 0.15 }); },
    uiBack:   function () { tone({ type: 'square', f0: 440, f1: 330, dur: 0.08, vol: 0.15 }); },
    swing1:   function () { noise({ filter: 'bandpass', cut: 1600, dur: 0.09, vol: 0.18 }); tone({ type: 'sine', f0: 500, f1: 220, dur: 0.08, vol: 0.08 }); },
    swing2:   function () { noise({ filter: 'bandpass', cut: 900, dur: 0.14, vol: 0.22 }); tone({ type: 'sine', f0: 320, f1: 140, dur: 0.12, vol: 0.1 }); },
    hit:      function () { noise({ filter: 'lowpass', cut: 700, dur: 0.13, vol: 0.5 }); tone({ type: 'sine', f0: 160, f1: 60, dur: 0.12, vol: 0.4 }); },
    hitHeavy: function () { noise({ filter: 'lowpass', cut: 500, dur: 0.2, vol: 0.6 }); tone({ type: 'sine', f0: 120, f1: 40, dur: 0.2, vol: 0.5 }); },
    block:    function () { tone({ type: 'square', f0: 1200, f1: 900, dur: 0.06, vol: 0.2 }); noise({ filter: 'highpass', cut: 2500, dur: 0.06, vol: 0.2 }); },
    jump:     function () { tone({ type: 'sine', f0: 260, f1: 520, dur: 0.12, vol: 0.18 }); },
    land:     function () { noise({ filter: 'lowpass', cut: 400, dur: 0.1, vol: 0.25 }); },
    down:     function () { noise({ filter: 'lowpass', cut: 300, dur: 0.3, vol: 0.55 }); tone({ type: 'sine', f0: 100, f1: 35, dur: 0.3, vol: 0.45 }); },
    ko:       function () {
      tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.7, vol: 0.4 });
      noise({ filter: 'lowpass', cut: 600, dur: 0.6, vol: 0.5, delay: 0.02 });
      tone({ type: 'square', f0: 110, f1: 30, dur: 0.8, vol: 0.25, delay: 0.05 });
    },
    special:  function () {
      tone({ type: 'sawtooth', f0: 180, f1: 720, dur: 0.35, vol: 0.3 });
      tone({ type: 'square', f0: 360, f1: 1200, dur: 0.3, vol: 0.15, delay: 0.05 });
      noise({ filter: 'bandpass', cut: 2000, dur: 0.4, vol: 0.25, delay: 0.1 });
    },
    win:      function () {
      tone({ type: 'square', f0: 523, dur: 0.12, vol: 0.2 });
      tone({ type: 'square', f0: 659, dur: 0.12, vol: 0.2, delay: 0.12 });
      tone({ type: 'square', f0: 784, dur: 0.12, vol: 0.2, delay: 0.24 });
      tone({ type: 'square', f0: 1047, dur: 0.25, vol: 0.25, delay: 0.36 });
    },
    coin:     function () {
      tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.18 });
      tone({ type: 'square', f0: 1319, dur: 0.15, vol: 0.18, delay: 0.07 });
    },
    energyFull: function () {
      tone({ type: 'sine', f0: 660, f1: 1320, dur: 0.25, vol: 0.22 });
      tone({ type: 'sine', f0: 990, f1: 1980, dur: 0.2, vol: 0.12, delay: 0.08 });
    }
  };

  function play(name) {
    if (!enabled || !ac) return;
    var fn = SFX[name];
    if (fn) { try { fn(); } catch (e) {} }
  }

  /** 简单 BGM：战斗中的低音律动节拍 */
  var BGM_PATTERN = [55, 0, 55, 0, 73.4, 0, 55, 0, 65.4, 0, 55, 0, 49, 49, 55, 0];
  function startBGM() {
    stopBGM();
    if (!ac || !enabled) return;
    bgmStep = 0;
    bgmTimer = setInterval(function () {
      if (!enabled) return;
      var f = BGM_PATTERN[bgmStep % BGM_PATTERN.length];
      if (f > 0) {
        tone({ type: 'triangle', f0: f, f1: f * 0.99, dur: 0.16, vol: 0.1 });
        if (bgmStep % 4 === 0) noise({ filter: 'lowpass', cut: 300, dur: 0.08, vol: 0.12 });
        if (bgmStep % 8 === 4) tone({ type: 'square', f0: f * 4, dur: 0.06, vol: 0.04 });
      }
      bgmStep++;
    }, 170);
  }
  function stopBGM() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }

  function toggle() {
    enabled = !enabled;
    SF.storage.set('soundOn', enabled);
    if (!enabled) stopBGM();
    return enabled;
  }

  SF.audio = {
    init: init,
    play: play,
    toggle: toggle,
    resume: resume,
    isEnabled: function () { return enabled; },
    startBGM: startBGM,
    stopBGM: stopBGM
  };
})();
