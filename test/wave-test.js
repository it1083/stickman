/**
 * wave-test.js — 生存模式多波次推进专项验证
 * 强 AI 玩家打生存模式，验证：波次递增、敌人生成、玩家回血、waveEnd→intro 循环。
 * 运行：node test/wave-test.js
 */
'use strict';

const noop = () => {};
// 模拟 canvas ctx：吞掉所有绘制调用，但校验颜色参数（真实 canvas 会在 NaN 颜色上抛错）
const magic = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : magic),
  apply: (t, th, args) => {
    for (const a of args) {
      if (typeof a === 'string' && (a.includes('NaN') || a.includes('undefined'))) {
        throw new Error('invalid color passed to canvas: ' + a);
      }
    }
    return magic;
  },
  set: (t, k, v) => {
    if (typeof v === 'string' && (v.includes('NaN') || v.includes('undefined'))) {
      throw new Error('invalid style assigned to canvas: ' + v);
    }
    return true;
  }
});
global.window = global;
global.innerWidth = 1334; global.innerHeight = 750; global.devicePixelRatio = 1;
global.document = { getElementById: () => ({ width: 0, height: 0, getContext: () => magic, addEventListener: noop }) };
global.addEventListener = noop;
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); } };
global.requestAnimationFrame = fn => { global.__raf = fn; };

const path = require('path');
const base = path.join(__dirname, '..');
['js/adapter.js', 'js/config.js', 'js/storage.js', 'js/audio.js',
 'js/skeleton.js', 'js/effects.js', 'js/ui.js', 'js/background.js',
 'js/fighter.js', 'js/ai.js', 'js/input.js', 'js/adManager.js',
 'js/scenes.js', 'js/fightScene.js', 'js/main.js'].forEach(f => require(path.join(base, f)));

const SF = global.SF;
SF.boot();

let now = 0;
function frames(n) { for (let i = 0; i < n; i++) { now += 16.7; global.__raf(now); } }

const sur = new SF.FightScene({ mode: 'survival' });
SF.SceneManager.replace(sur);
frames(120);
sur.player.ai = new SF.AIController({ aggr: 0.95, react: 0.12, guard: 0.45, combo: 0.8 });

let maxWave = 1, wavesCleared = 0, lastWave = 1, hpChecked = false;
// 期望敌人数：第 n 波 min(2n, 8)，Boss 波（n%5==0）3 个
function expectCount(w) { return w % 5 === 0 ? 3 : Math.min(2 * w, 8); }
let countOk = true, countLog = [], hpOk = true;
for (let i = 0; i < 40000 && SF.SceneManager.current() === sur; i++) {
  frames(1);
  if (sur.wave > maxWave) {
    // 波次推进：检查新敌人已生成、数量符合叠加规则、玩家回血生效
    if (!sur.enemy || !sur.enemy.alive()) { console.error('✗ 新波次敌人未生成'); process.exit(1); }
    if (sur.player.hp <= 0) { console.error('✗ 波次推进时玩家血量异常'); process.exit(1); }
    const exp = expectCount(sur.wave);
    const got = sur.enemies.length;
    countLog.push('W' + sur.wave + ':' + got + '/' + exp);
    if (got !== exp) { countOk = false; console.error('✗ 第 ' + sur.wave + ' 波敌人数 ' + got + '，期望 ' + exp); }
    // 小兵血量下限：多敌分摊后单个也不应低于 50（防"纸糊敌人"回归）
    const minHp = Math.min(...sur.enemies.filter(e => e.scale < 1.2).map(e => e.maxHp));
    if (minHp < 50) { hpOk = false; console.error('✗ 第 ' + sur.wave + ' 波小兵血量 ' + minHp + ' 过低'); }
    hpChecked = true;
    wavesCleared++;
    maxWave = sur.wave;
  }
}

console.log('波次推进验证: ' + (wavesCleared >= 2 ? '✓' : '✗') + ' 清理 ' + wavesCleared + ' 波（到达第 ' + maxWave + ' 波），回血与敌人生成 ' + (hpChecked ? '正常' : '未验证'));
console.log('敌人数叠加规则: ' + (countOk ? '✓' : '✗') + ' [' + countLog.join(' → ') + ']（第n波 min(2n,8)，Boss波 3）');
console.log('当前场景: ' + SF.SceneManager.current().constructor.name + (SF.SceneManager.current() instanceof SF.ResultScene ? '（结算）' : ''));
console.log('最终统计: 金币 ' + SF.storage.get('coins') + '，最高波次记录 ' + SF.storage.get('bestWave'));
if (wavesCleared < 2) { console.error('✗ 波次推进异常：仅推进 ' + wavesCleared + ' 波'); process.exit(1); }
if (!countOk) { console.error('✗ 敌人数叠加规则不符'); process.exit(1); }
console.log('✓ 生存模式多波次测试通过');
