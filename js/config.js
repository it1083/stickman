/**
 * config.js — 全局常量与数值配置
 * 设计分辨率：1334 x 750（横屏），游戏世界使用设计坐标绘制。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

SF.config = {
  DESIGN_W: 1334,        // 设计宽
  DESIGN_H: 750,         // 设计高
  GROUND_Y: 640,         // 地面 y（脚底基准）
  STAGE_L: 80,           // 舞台左边界
  STAGE_R: 1254,         // 舞台右边界

  GRAVITY: 2600,         // 重力 px/s^2
  WALK_SPEED: 250,       // 走路速度
  RUN_SPEED: 430,        // 跑步速度
  JUMP_VY: -950,         // 起跳初速
  FRICTION: 2200,        // 地面摩擦减速
  AIR_CONTROL: 0.75,     // 空中操控系数

  MAX_HP: 100,           // 玩家血量
  MAX_ENERGY: 100,       // 必杀能量上限
  ENERGY_PER_HIT: 7,     // 命中获得能量
  ENERGY_PER_TAKEN: 4,   // 受击获得能量
  ROUND_TIME: 99,        // 回合时间（秒）

  COMBO_WINDOW: 0.9,     // 连招输入窗口（秒）
  BLOCK_REDUCE: 0.82,    // 格挡减伤比例
  BODY_PUSH: 130,        // 双方推挤分离速度

  // 攻击定义：dmg 伤害 / kb 击退 / up 击飞 / dur 动作时长 / hitT 命中帧区间 / box 攻击盒(相对自身,已含朝向) / down 击倒 / guardBreak 破防
  MOVES: {
    jab:       { name: '直拳',   dmg: 6,  kb: 180,  up: 0,    dur: 0.30, hitT: [0.08, 0.18], box: { x: 30, y: -96, w: 78, h: 34 },  next: 'hook',   sfx: 'swing1' },
    hook:      { name: '右勾拳', dmg: 9,  kb: 320,  up: -60,  dur: 0.42, hitT: [0.12, 0.24], box: { x: 26, y: -104, w: 84, h: 44 },  next: 'rising', sfx: 'swing2' },
    rising:    { name: '上勾拳', dmg: 12, kb: 330,  up: -280, dur: 0.50, hitT: [0.16, 0.30], box: { x: 16, y: -150, w: 72, h: 100 }, next: null,    sfx: 'swing2' }, // 拳三段终结（小浮空，可追击）
    dashPunch: { name: '冲拳',   dmg: 8,  kb: 280,  up: 0,    dur: 0.42, hitT: [0.10, 0.22], box: { x: 34, y: -96, w: 94, h: 36 },  next: 'hook',   sfx: 'swing2', dash: 520 },
    dashKick:  { name: '踏踢',   dmg: 12, kb: 470,  up: -150, dur: 0.50, hitT: [0.14, 0.28], box: { x: 26, y: -88, w: 112, h: 46 }, next: 'sweep',  sfx: 'swing2', dash: 640 },
    spin:      { name: '回旋踢', dmg: 13, kb: 520,  up: -220, dur: 0.55, hitT: [0.18, 0.32], box: { x: 20, y: -90, w: 104, h: 56 },  next: null,    sfx: 'swing2', knockdown: true },
    kick:      { name: '直踢',   dmg: 10, kb: 380,  up: -80,  dur: 0.40, hitT: [0.12, 0.24], box: { x: 30, y: -84, w: 96, h: 40 },   next: 'sweep',  sfx: 'swing1' },
    sweep:     { name: '扫踢',   dmg: 8,  kb: 260,  up: 0,    dur: 0.50, hitT: [0.16, 0.30], box: { x: 18, y: -40, w: 104, h: 36 },  next: 'kick',   sfx: 'swing1', low: true, knockdown: true }, // 两段循环：扫踢后按踢接回直踢
    uppercut:  { name: '升龙拳', dmg: 15, kb: 240,  up: -680, dur: 0.60, hitT: [0.14, 0.26], box: { x: 14, y: -150, w: 70, h: 110 }, next: null,    sfx: 'swing2', launcher: true, airOk: true },
    airkick:   { name: '飞踢',   dmg: 11, kb: 300,  up: -100, dur: 0.45, hitT: [0.06, 0.34], box: { x: 22, y: -80, w: 92, h: 46 },   next: null,    sfx: 'swing1', airOnly: true },
    backKick:  { name: '后蹬踢', dmg: 10, kb: 360,  up: -60,  dur: 0.44, hitT: [0.12, 0.26], box: { x: 26, y: -92, w: 98, h: 44 },  next: null,    sfx: 'swing2', turn: true, knockdown: true }, // 后拉+踢：转身蹬踹身后敌人
    stomp:     { name: '践踏',   dmg: 13, kb: 240,  up: 0,    dur: 0.55, hitT: [0.08, 0.5],  box: { x: -6, y: -70, w: 92, h: 78 },  next: null,    sfx: 'swing2', airOnly: true, airOk: true, dive: 780, knockdown: true }, // 空中+下+踢：速降下压
    kneeDash:  { name: '冲膝',   dmg: 10, kb: 300,  up: -120, dur: 0.46, hitT: [0.12, 0.26], box: { x: 22, y: -104, w: 78, h: 50 }, next: 'hook', sfx: 'swing2', dash: 560 }, // 跑动+拳：弓步顶膝
    special:   { name: '奥义·烈焰连舞', dmg: 34, kb: 640, up: -420, dur: 1.5, hitT: [0, 1.5], box: { x: -30, y: -170, w: 190, h: 170 }, next: null, sfx: 'special', guardBreak: true, knockdown: true }
  },

  // 闯关关卡：enemy 属性 —— hp/atk(伤害倍率)/spd(速度倍率)/aggr(侵略性 0~1)/react(反应秒数)/guard(防御倾向 0~1)/scale(体型)/skin(颜色)/ai 技能集
  LEVELS: [
    { id: 1,  name: '道场 · 白带学徒', bg: 'dojo',   reward: 60,
      enemy: { hp: 70,  atk: 0.75, spd: 0.85, aggr: 0.45, react: 0.55, guard: 0.10, scale: 1.0, skin: '#d9843f' } },
    { id: 2,  name: '码头 · 混混头目', bg: 'sunset', reward: 80,
      enemy: { hp: 90,  atk: 0.85, spd: 0.95, aggr: 0.55, react: 0.45, guard: 0.15, scale: 1.0, skin: '#8f6f4f' } },
    { id: 3,  name: '竹林 · 蓝带高手', bg: 'bamboo', reward: 100,
      enemy: { hp: 105, atk: 0.95, spd: 1.0,  aggr: 0.62, react: 0.38, guard: 0.28, scale: 1.0, skin: '#3f7fd9' } },
    { id: 4,  name: '夜幕 · 影子忍者', bg: 'night',  reward: 120,
      enemy: { hp: 100, atk: 1.0,  spd: 1.2,  aggr: 0.72, react: 0.30, guard: 0.35, scale: 0.96, skin: '#6f4f9f' } },
    { id: 5,  name: '工厂 · 铁塔壮汉', bg: 'factory', reward: 150,
      enemy: { hp: 150, atk: 1.15, spd: 0.8,  aggr: 0.6,  react: 0.42, guard: 0.2,  scale: 1.18, skin: '#7a8a99' } },
    { id: 6,  name: '雨夜 · 黑带宗师', bg: 'rain', reward: 180,
      enemy: { hp: 135, atk: 1.2,  spd: 1.08, aggr: 0.78, react: 0.28, guard: 0.45, scale: 1.02, skin: '#c9c9c9' } },
    { id: 7,  name: '火山 · 狂暴战鬼', bg: 'volcano', reward: 220,
      enemy: { hp: 165, atk: 1.32, spd: 1.12, aggr: 0.88, react: 0.24, guard: 0.30, scale: 1.1, skin: '#d43f3f' } },
    { id: 8,  name: '巅峰 · 无冕拳王', bg: 'volcano', reward: 300, boss: true,
      enemy: { hp: 230, atk: 1.4, spd: 1.05, aggr: 0.9, react: 0.2, guard: 0.5, scale: 1.26, skin: '#1f1f1f' } }
  ],

  // 生存模式波次
  SURVIVAL: {
    baseHp: 80,
    hpGrow: 6,          // 每波 +hp
    atkGrow: 0.03,      // 每波 +atk 倍率
    healPerWave: 12,    // 每波结束回血
    rewardPerWave: 18,
    maxEnemies: 8,      // 单波敌人数上限（第 n 波 min(2n, 上限) 个）
    themes: ['ink', 'street', 'night', 'rain', 'bamboo', 'sunset', 'factory', 'dojo']  // 非 Boss 波轮换场景（首波水墨）
  },

  // 皮肤（color: 描边主色；price: -1 表示看广告解锁；0 为默认已解锁）
  SKINS: [
    { id: 'blue',   name: '热血蓝', color: '#3fa9f5', head: '#e8f4ff', price: 0 },
    { id: 'red',    name: '赤焰',   color: '#e74c3c', head: '#ffe8e8', price: 100 },
    { id: 'green',  name: '翠竹',   color: '#2ecc71', head: '#e8fff0', price: 200 },
    { id: 'purple', name: '紫电',   color: '#9b59b6', head: '#f5e8ff', price: 350 },
    { id: 'gold',   name: '鎏金',   color: '#f1c40f', head: '#fffbe8', price: 600 },
    { id: 'shadow', name: '暗影',   color: '#2c3e50', head: '#d8dee9', price: -1 }  // -1 = 观看激励广告解锁
  ]
};
