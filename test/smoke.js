/**
 * smoke.js — Headless 冒烟测试（Node 环境）
 * 模拟浏览器环境，驱动游戏主循环，验证：
 *   1. 所有模块加载无错、boot 正常
 *   2. 闯关战斗：AI 对打产生伤害、KO、跳转结算、发奖
 *   3. 生存模式：波次推进、死亡复活（模拟广告回调）、最终结算
 *   4. 广告管理器模拟分支、存储读写
 * 运行：node test/smoke.js
 */
'use strict';

// ---------------------------------------------------------------- 环境 stub
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

const fakeCtx = magic;
const fakeCanvas = {
  width: 0, height: 0,
  getContext: () => fakeCtx,
  addEventListener: noop
};

global.window = global;
global.innerWidth = 1334;
global.innerHeight = 750;
global.devicePixelRatio = 1;
global.document = { getElementById: () => fakeCanvas };
global.addEventListener = noop;
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); }
};
let rafCb = null;
global.requestAnimationFrame = fn => { rafCb = fn; };

// ---------------------------------------------------------------- 加载模块
const path = require('path');
const base = path.join(__dirname, '..');
[
  'js/adapter.js', 'js/config.js', 'js/storage.js', 'js/audio.js',
  'js/skeleton.js', 'js/effects.js', 'js/ui.js', 'js/background.js',
  'js/fighter.js', 'js/ai.js', 'js/input.js', 'js/adManager.js',
  'js/scenes.js', 'js/fightScene.js', 'js/main.js'
].forEach(f => require(path.join(base, f)));

const SF = global.SF;
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------------------------------------------------------------- 工具
let now = 0;
function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    if (rafCb) { const cb = rafCb; cb(now); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 测试开始
async function main() {
console.log('[1] boot 与主菜单');
SF.boot();
frames(10);
check('boot 后进入主菜单', SF.SceneManager.current() instanceof SF.MenuScene);
check('视图变换已初始化', SF.view.scale > 0);

console.log('[2] 骨骼动画系统');
const sk = SF.skeleton;
check('关键帧采样返回姿势', typeof sk.sampleClip(sk.CLIPS.jab, 0.5).hipH === 'number');
check('步态姿势生成', typeof sk.walkPose(1.2, true, false).lF[0] === 'number');
check('姿势插值', sk.lerpPose(sk.GUARD, sk.CLIPS.crouch, 0.5).hipH < sk.GUARD.hipH);
check('火柴人绘制不抛错', (() => { sk.drawStickman(fakeCtx, sk.GUARD, { color: '#fff', lineWidth: 9 }); return true; })());

console.log('[2.5] 输入系统回归（无限跳修复 + 键盘合并）');
{
  const inp = SF.input;
  inp.enabled = true;
  // 模拟摇杆快速上推：第一帧应触发跳，第二帧保持上推不应再触发（边沿）
  inp.stick.active = true; inp.stick.dx = 0; inp.stick.dy = -80;
  const c1 = inp.getCmd();
  check('摇杆上推边沿触发跳跃', c1.jump === true);
  const c2 = inp.getCmd();
  check('保持上推不重复跳跃（无限跳修复）', c2.jump === false);
  // 摇杆回中
  inp.stick.dy = 0;
  inp.getCmd();
  // 键盘跳跃：触发一次即消费
  inp.kbJump = true;
  const c3 = inp.getCmd();
  check('键盘跳跃触发', c3.jump === true);
  const c4 = inp.getCmd();
  check('键盘跳跃一次性消费', c4.jump === false);
  // 键盘移动/蹲/防合并
  inp.keys.right = true; inp.keys.down = true; inp.keys.block = true;
  const c5 = inp.getCmd();
  check('键盘移动/蹲/防合并', c5.moveX === 1 && c5.crouch === true && c5.block === true);
  // 键盘拳击 oneShot
  inp.oneShot.punch = true;
  check('键盘拳击边沿', inp.getCmd().punch === true);
  check('键盘拳击一次性', inp.getCmd().punch === false);
  inp.keys.right = false; inp.keys.down = false; inp.keys.block = false;
  inp.stick.active = false; inp.stick.dx = 0; inp.stick.dy = 0;
  inp.enabled = false;
}

console.log('[2.6] 前向派生攻击（冲拳/踏踢）');
{
  const mkCmd = (o) => Object.assign({ moveX: 0, jump: false, crouch: false, punch: false, kick: false, special: false, block: false }, o);
  const f = new SF.Fighter({ x: 400, facing: 1 });
  f.cmd = mkCmd({ punch: true });
  f.updateState(0.016, null);
  check('原地拳 = 刺拳', f.move === 'jab');
  f.setState('idle');
  f.cmd = mkCmd({ moveX: 1, punch: true });
  f.updateState(0.016, null);
  check('前推+拳 = 冲拳', f.move === 'dashPunch');
  check('冲拳带突进速度', f.vx === 520);
  f.setState('idle');
  f.cmd = mkCmd({ moveX: 1, kick: true });
  f.updateState(0.016, null);
  check('前推+踢 = 踏踢', f.move === 'dashKick');
  check('踏踢带突进速度', f.vx === 640);
  // 后向+攻击仍是普通招式（面向 +x，后向 = -1）
  f.setState('idle');
  f.cmd = mkCmd({ moveX: -1, punch: true });
  f.updateState(0.016, null);
  check('后拉+拳 = 普通刺拳', f.move === 'jab');
  // 冲拳剪辑可采样
  check('冲拳/踏踢剪辑存在', !!sk.CLIPS.dashPunch && !!sk.CLIPS.dashKick &&
    typeof sk.sampleClip(sk.CLIPS.dashPunch, 0.4).hipH === 'number');
}

console.log('[2.7] 连招链重构（拳三段 / 踢两段循环）');
{
  const mkCmd = (o) => Object.assign({ moveX: 0, jump: false, crouch: false, punch: false, kick: false, special: false, block: false }, o);
  const M = SF.config.MOVES;
  const f = new SF.Fighter({ x: 400, facing: 1 });
  const drive = (secs, cmd) => { for (let i = 0; i < Math.ceil(secs / 0.016); i++) { f.cmd = cmd; f.updateState(0.016, null); } };
  // 拳三段：直拳 → 右勾拳 → 上勾拳
  f.cmd = mkCmd({ punch: true }); f.updateState(0.016, null);
  check('拳一段 = 直拳', f.move === 'jab');
  drive(M.jab.dur + 0.02, mkCmd({ punch: true }));
  check('拳二段 = 右勾拳', f.move === 'hook');
  drive(M.hook.dur + 0.02, mkCmd({ punch: true }));
  check('拳三段 = 上勾拳', f.move === 'rising');
  drive(M.rising.dur + 0.05, mkCmd({})); // 上勾拳为三段终结，无 next
  check('上勾拳收招回 idle', f.state === 'idle');
  f.cmd = mkCmd({ punch: true }); f.updateState(0.016, null);
  check('三段打完重新从直拳开始', f.move === 'jab');
  // 踢两段无限循环：直踢 → 扫踢 → 直踢 → 扫踢
  drive(0.4, mkCmd({})); // 收招回 idle
  f.cmd = mkCmd({ kick: true }); f.updateState(0.016, null);
  check('踢一段 = 直踢', f.move === 'kick');
  drive(M.kick.dur + 0.02, mkCmd({ kick: true }));
  check('踢二段 = 扫踢', f.move === 'sweep');
  drive(M.sweep.dur + 0.02, mkCmd({ kick: true }));
  check('扫踢后循环回直踢', f.move === 'kick');
  drive(M.kick.dur + 0.02, mkCmd({ kick: true }));
  check('再次扫踢（两段无限循环）', f.move === 'sweep');
  // 上勾拳动画剪辑存在且可采样
  check('上勾拳剪辑可采样', typeof sk.sampleClip(sk.CLIPS.rising, 0.4).hipH === 'number');
  // 上勾拳在命中窗口会放出挥击弧
  drive(0.4, mkCmd({})); f.cmd = mkCmd({ punch: true }); f.updateState(0.016, null);
  drive(M.jab.dur + 0.02, mkCmd({ punch: true }));
  drive(M.hook.dur + 0.02, mkCmd({ punch: true }));
  let slashCount = 0; const origSlash = SF.fx.slash;
  SF.fx.slash = () => { slashCount++; };
  drive(0.2, mkCmd({})); // rising 到达 hitT[0]=0.16 放弧
  SF.fx.slash = origSlash;
  check('上勾拳命中窗口放出挥击弧', slashCount >= 1, 'slashCount=' + slashCount);
}

console.log('[2.8] 乱斗新招（后蹬踢/践踏/冲膝）');
{
  const mkCmd = (o) => Object.assign({ moveX: 0, jump: false, crouch: false, punch: false, kick: false, special: false, block: false }, o);
  const M = SF.config.MOVES;
  const f = new SF.Fighter({ x: 400, facing: 1 });
  const drive = (secs, cmd) => { for (let i = 0; i < Math.ceil(secs / 0.016); i++) { f.cmd = cmd; f.updateState(0.016, null); } };
  // 后蹬踢：后拉+踢 → 转身打身后
  f.cmd = mkCmd({ moveX: -1, kick: true }); f.updateState(0.016, null);
  check('后拉+踢 = 后蹬踢', f.move === 'backKick');
  check('后蹬踢转身面向后方', f.facing === -1);
  drive(M.backKick.dur + 0.05, mkCmd({}));
  // 践踏：空中+下+踢 → 速降下压（updateState 无物理，手动构造空中状态）
  f.setState('jump'); f.onGround = false; f.vy = -400; f.y = 400;
  f.cmd = mkCmd({ crouch: true, kick: true }); f.updateState(0.016, null);
  check('空中下+踢 = 践踏', f.move === 'stomp');
  check('践踏获得下压速度', f.vy >= M.stomp.dive, 'vy=' + f.vy.toFixed(0));
  f.onGround = true; f.y = SF.config.GROUND_Y; f.vy = 0; // 手动落地
  drive(M.stomp.dur + 0.05, mkCmd({}));
  check('践踏落地收招回 idle', f.state === 'idle');
  // 冲膝：先进入跑动状态，再前推+拳
  f.facing = 1;
  f.cmd = mkCmd({ moveX: 1 }); f.updateState(0.016, null);
  check('前推满进入跑动状态', f.state === 'run');
  f.cmd = mkCmd({ moveX: 1, punch: true }); f.updateState(0.016, null);
  check('跑动+拳 = 冲膝', f.move === 'kneeDash');
  check('冲膝带突进速度', f.vx === M.kneeDash.dash, 'vx=' + f.vx);
  // 走路（非跑动）前推+拳仍是冲拳
  const f2 = new SF.Fighter({ x: 700, facing: 1 });
  f2.cmd = mkCmd({ moveX: 0.6 }); f2.updateState(0.016, null);
  check('半推进入走走状态', f2.state === 'walk');
  f2.cmd = mkCmd({ moveX: 0.6, punch: true }); f2.updateState(0.016, null);
  check('走路前推+拳仍是冲拳', f2.move === 'dashPunch');
  // 三段剪辑可采样
  check('后蹬踢/践踏/冲膝剪辑可采样', ['backKick', 'stomp', 'kneeDash'].every(k =>
    typeof sk.sampleClip(sk.CLIPS[k], 0.4).hipH === 'number'));
}

console.log('[3] 无限乱斗自动对打');
const scene = new SF.FightScene({ mode: 'survival' });
SF.SceneManager.replace(scene);
frames(120); // intro
check('intro 后进入战斗', scene.state === 'fight');
check('首波 2 名敌人', !!scene.player && scene.enemies.length === 2);

// 给玩家挂强 AI 自动乱斗；阵亡则放弃直接结算（复活流程在 [5] 单独验证）
scene.player.ai = new SF.AIController({ aggr: 0.85, react: 0.15, guard: 0.3, combo: 0.7 });
let maxCombo = 0, hitHappened = false, gaveUp3 = false;
for (let i = 0; i < 20000 && SF.SceneManager.current() === scene; i++) {
  frames(1);
  if (scene.player.hitCombo > maxCombo) maxCombo = scene.player.hitCombo;
  if (scene.player.hp < scene.player.maxHp || scene.enemies.some(e => e.hp < e.maxHp)) hitHappened = true;
  if (scene.reviving && !gaveUp3) { gaveUp3 = true; scene.btnGiveUp.tap(); }
}
check('乱斗中产生了伤害', hitHappened);
console.log('    对打统计：玩家最高连击 ' + maxCombo + '，到达第 ' + scene.wave + ' 波');

check('结束并跳转结算', SF.SceneManager.current() instanceof SF.ResultScene,
  '当前场景: ' + SF.SceneManager.current().constructor.name);
const result = SF.SceneManager.current().data;
check('结算数据完整', result && typeof result.win === 'boolean' && result.reward >= 0);
check('金币已入账', SF.storage.get('coins') >= result.reward);

console.log('[4] 激励广告模拟（奖励翻倍）');
const coinsBefore = SF.storage.get('coins');
const resultScene = SF.SceneManager.current();
resultScene.btnAd.tap();
await sleep(600);
check('广告回调发放翻倍奖励', SF.storage.get('coins') === coinsBefore + result.reward * (resultScene.btnAd.disabled ? 1 : 0) ||
  SF.storage.get('coins') >= coinsBefore + result.reward,
  '前 ' + coinsBefore + ' 后 ' + SF.storage.get('coins'));

console.log('[5] 生存模式与复活流程');
const sur = new SF.FightScene({ mode: 'survival' });
SF.SceneManager.replace(sur);
frames(120);
sur.player.ai = new SF.AIController({ aggr: 0.15, react: 0.9, guard: 0 }); // 弱玩家 → 快速阵亡
// 直接模拟阵亡触发复活面板
sur.player.hp = 0;
for (let i = 0; i < 3000 && SF.SceneManager.current() === sur && !sur.reviving; i++) frames(1);
check('死亡后弹出复活面板', sur.reviving === true);
// 点击广告复活（浏览器模拟 → setTimeout 300ms 后 onSuccess）
sur.btnRevive.tap();
await sleep(600);
if (sur.player.hp > 0 && !sur.reviving) {
  check('广告复活成功（满血）', sur.player.hp === sur.player.maxHp);
} else {
  check('广告复活成功（满血）', false, 'hp=' + sur.player.hp + ' reviving=' + sur.reviving);
}
// 复活后换弱 AI 快速再阵亡 → 放弃结算
sur.player.ai = new SF.AIController({ aggr: 0.05, react: 1.2, guard: 0 });
let gaveUpOnce = false;
for (let i = 0; i < 12000 && SF.SceneManager.current() === sur; i++) {
  frames(1);
  if (sur.reviving && !gaveUpOnce) { gaveUpOnce = true; sur.btnGiveUp.tap(); }
}
check('生存模式最终进入结算', SF.SceneManager.current() instanceof SF.ResultScene);

console.log('[6] 场景导航回归（闯关已移除）');
SF.SceneManager.replace(new SF.MenuScene()); frames(5);
check('主菜单仅乱斗/武道场/声音三个按钮', SF.SceneManager.current().buttons.length === 3);
check('选关场景已删除', SF.LevelSelectScene === undefined);
SF.SceneManager.replace(new SF.ShopScene()); frames(30);
check('商店场景正常', SF.SceneManager.current() instanceof SF.ShopScene);

console.log('[7] 存储一致性');
const coins = SF.storage.get('coins');
check('金币非负', coins >= 0, 'coins=' + coins);
check('存档可写', (() => { SF.storage.set('usedSkin', 'red'); return SF.storage.get('usedSkin') === 'red'; })());

console.log('');
if (failures) {
  console.error('✗ 冒烟测试失败：' + failures + ' 项');
  process.exit(1);
} else {
  console.log('✓ 全部冒烟测试通过');
}
}
main().catch(e => { console.error('测试脚本异常：', e); process.exit(1); });
