/**
 * skeleton.js — 火柴人骨骼动画系统
 *
 * 设计：
 *  - 姿势(pose)描述 12 个关节参数（骨盆高度/躯干倾角/头/双臂[肩,肘]/双腿[髋,膝]/重心偏移），单位度
 *  - 攻击/受击等动作用「关键帧剪辑」采样 + 插值；走/跑用程序化正弦步态（无限流畅）
 *  - Fighter 每帧将当前姿势向目标姿势做指数混合，状态切换天然平滑无跳变
 *
 * 角度约定（局部坐标系，+x = 面朝方向，y 向下）：
 *  - 手臂/大腿：0 = 垂直向下，正值向前(+x)抬起，90 = 前平举，180 = 上举
 *  - 肘：相对上臂，正值前臂向前弯；膝：相对大腿，正值小腿向后弯
 *  - lean：躯干倾角，正值向面朝方向前倾
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var D2R = Math.PI / 180;

  // 骨骼长度（设计像素）
  var BONE = {
    thigh: 31, shin: 30,
    torso: 38, neck: 7, headR: 11.5,
    upperArm: 22, foreArm: 21,
    handR: 4.5, footL: 11
  };

  // 基础格斗站姿（所有姿势的缺省模板）
  var BASE = {
    hipH: 53,   // 骨盆离地高度
    lean: 8,    // 躯干前倾
    head: -6,   // 头部附加角（微抬）
    aF: [68, 72],  // 前臂：肩角, 肘角
    aB: [44, 96],  // 后臂（护脸）
    lF: [20, -14], // 前腿
    lB: [-24, 20], // 后腿
    rootX: 0
  };

  /** 构造姿势：overrides 覆盖缺省字段 */
  function P(o) {
    var p = {
      hipH: BASE.hipH, lean: BASE.lean, head: BASE.head,
      aF: BASE.aF.slice(), aB: BASE.aB.slice(),
      lF: BASE.lF.slice(), lB: BASE.lB.slice(),
      rootX: BASE.rootX
    };
    if (o) for (var k in o) {
      if (o[k] instanceof Array) p[k] = o[k].slice();
      else p[k] = o[k];
    }
    return p;
  }

  /** 姿势线性插值 */
  function lerpPose(a, b, t) {
    var r = {};
    var keys = ['hipH', 'lean', 'head', 'rootX'];
    for (var i = 0; i < keys.length; i++) r[keys[i]] = a[keys[i]] + (b[keys[i]] - a[keys[i]]) * t;
    var arrKeys = ['aF', 'aB', 'lF', 'lB'];
    for (var j = 0; j < arrKeys.length; j++) {
      var k = arrKeys[j];
      r[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
    }
    return r;
  }

  // ---------------------------------------------------------------- 关键帧剪辑
  // frames: [{t:0~1, pose}]，采样时在相邻帧间插值；ease 可选缓动

  var GUARD = P();

  var CLIPS = {
    // -- 攻击剪辑（progress 0~1 对应 config.MOVES.dur 时间段）--
    jab: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.16, pose: P({ lean: -10, aF: [28, 118], aB: [46, 98], lF: [14, -20], lB: [-28, 26], rootX: -7, hipH: 50 }) },  // 沉胯后引蓄力
      { t: 0.34, pose: P({ lean: 26, aF: [95, -3], aB: [16, 112], lF: [38, -4], lB: [-34, 28], rootX: 13, hipH: 51 }) },  // 爆发直拳（前腿蹬地送胯）
      { t: 0.58, pose: P({ lean: 21, aF: [89, 10], aB: [24, 106], rootX: 10, hipH: 52 }) },                                // 定格随挥
      { t: 1,    pose: GUARD }
    ]},

    hook: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.2,  pose: P({ lean: -14, head: 8, aF: [8, 126], aB: [56, 88], lF: [10, -24], lB: [-30, 28], rootX: -10, hipH: 49 }) }, // 拧腰收拳蓄力
      { t: 0.46, pose: P({ lean: 31, aF: [82, 76], aB: [4, 118], lF: [36, -8], lB: [-36, 32], rootX: 15, hipH: 49 }) },  // 横抡爆发
      { t: 0.66, pose: P({ lean: 24, aF: [97, 96], aB: [18, 110], lF: [30, -10], lB: [-32, 28], rootX: 11, hipH: 50 }) }, // 随挥过头（惯性）
      { t: 1,    pose: GUARD }
    ]},

    // 前向派生：弓步突进冲拳（前推+拳）
    dashPunch: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.14, pose: P({ lean: -8, aF: [18, 122], aB: [50, 92], lF: [10, -18], lB: [-30, 26], rootX: -8, hipH: 50 }) },   // 后坐蓄力
      { t: 0.32, pose: P({ lean: 34, aF: [98, -6], aB: [10, 118], lF: [52, -18], lB: [-46, 40], rootX: 18, hipH: 47 }) },  // 弓步前扑直拳（后腿蹬直）
      { t: 0.56, pose: P({ lean: 28, aF: [92, 4], aB: [18, 110], lF: [46, -14], lB: [-42, 36], rootX: 14, hipH: 48 }) },   // 定格
      { t: 1,    pose: GUARD }
    ]},

    // 前向派生：大踏步侧踹（前推+踢）
    dashKick: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.16, pose: P({ lean: -10, lF: [-8, -36], lB: [-30, 24], hipH: 50, aF: [30, 96], aB: [26, 104], rootX: -6 }) },  // 提膝后撤
      { t: 0.4,  pose: P({ lean: 22, lF: [92, -8], lB: [-52, 52], hipH: 45, aF: [-20, 40], aB: [64, 20], rootX: 16 }) },    // 弓步踏前侧踹
      { t: 0.6,  pose: P({ lean: 18, lF: [86, -10], lB: [-48, 48], hipH: 46, aF: [-14, 46], aB: [58, 26], rootX: 12 }) },   // 定格
      { t: 1,    pose: GUARD }
    ]},

    // 拳三段终结：上勾拳（沉胯坠拳蓄力 → 拧胯拔起由下向上撩击，小浮空）
    rising: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.18, pose: P({ hipH: 44, lean: 12, head: 6, aF: [-26, 110], aB: [40, 96], lF: [20, -30], lB: [-28, 36], rootX: -6 }) },  // 沉胯坠拳
      { t: 0.42, pose: P({ hipH: 63, lean: -6, head: -6, aF: [128, 26], aB: [30, 100], lF: [30, -26], lB: [-20, 26], rootX: 8 }) },  // 拧胯拔起上撩
      { t: 0.6,  pose: P({ hipH: 61, lean: -4, head: -4, aF: [118, 36], aB: [26, 102], lF: [28, -24], lB: [-18, 24], rootX: 7 }) },  // 定格随挥
      { t: 1,    pose: GUARD }
    ]},

    // 后蹬踢（后拉+踢）：拧身回头蓄力 → 转身平蹬（facing 已由引擎翻转，画出来即打向身后）
    backKick: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.18, pose: P({ lean: -12, head: 14, lF: [-6, -40], lB: [-28, 20], hipH: 50, aF: [20, 110], aB: [46, 96], rootX: -8 }) },   // 拧身提膝回头望
      { t: 0.42, pose: P({ lean: -18, head: 10, lF: [80, -2], lB: [-24, 16], hipH: 51, aF: [30, 60], aB: [-10, 120], rootX: -10 }) }, // 上身后仰压胯平蹬
      { t: 0.62, pose: P({ lean: -14, head: 8, lF: [74, -6], lB: [-22, 18], hipH: 51 }) },                                            // 定格
      { t: 1,    pose: GUARD }
    ]},

    // 践踏（空中+下+踢）：团身收腿 → 高扬双臂双腿猛插地面
    stomp: { frames: [
      { t: 0,    pose: P({ lean: 8, aF: [40, 100], aB: [36, 96], lF: [30, -50], lB: [24, -44], hipH: 58 }) },       // 空中团身
      { t: 0.3,  pose: P({ lean: 14, head: 8, aF: [66, 20], aB: [58, 30], lF: [16, -6], lB: [12, -4], hipH: 62 }) }, // 双臂高扬蓄势
      { t: 0.52, pose: P({ lean: -4, head: -4, aF: [96, 10], aB: [88, 14], lF: [4, 2], lB: [2, 0], hipH: 56 }) },    // 猛然下踏
      { t: 0.72, pose: P({ lean: -2, aF: [86, 16], aB: [78, 20], lF: [8, 0], lB: [4, -2], hipH: 54 }) },             // 踏定
      { t: 1,    pose: GUARD }
    ]},

    // 冲膝（跑动+拳）：弓步前冲提膝前顶，双手后拉压肩
    kneeDash: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.14, pose: P({ lean: 6, aF: [36, 100], aB: [50, 92], lF: [26, -60], lB: [-30, 26], hipH: 52, rootX: -4 }) },  // 提膝夹臂
      { t: 0.36, pose: P({ lean: 26, aF: [70, 60], aB: [40, 110], lF: [58, -96], lB: [-50, 44], hipH: 54, rootX: 14 }) }, // 弓步顶膝
      { t: 0.56, pose: P({ lean: 22, aF: [64, 66], aB: [36, 108], lF: [54, -90], lB: [-46, 40], hipH: 54, rootX: 12 }) }, // 定格
      { t: 1,    pose: GUARD }
    ]},

    spin: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.22, pose: P({ lean: -12, aF: [20, 116], aB: [60, 80], rootX: -8, hipH: 48, lF: [8, -18], lB: [-14, 26] }) },
      { t: 0.45, pose: P({ lean: 30, aF: [96, 10], aB: [70, 40], lF: [78, -6], lB: [-10, 60], hipH: 46, rootX: 6 }) }, // 回旋踢（前腿横扫）
      { t: 0.62, pose: P({ lean: 34, aF: [90, 14], aB: [74, 36], lF: [96, 4], lB: [-6, 66], hipH: 46, rootX: 4 }) },
      { t: 0.82, pose: P({ lean: 18, aF: [70, 60], lF: [40, -10], hipH: 50 }) },
      { t: 1,    pose: GUARD }
    ]},

    kick: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.2,  pose: P({ lean: -6, lF: [-14, -30], lB: [-26, 22], hipH: 52, aF: [40, 90], aB: [36, 100] }) }, // 提膝
      { t: 0.46, pose: P({ lean: -14, lF: [86, -4], lB: [-20, 14], hipH: 51, aF: [10, 60], aB: [-30, 110], rootX: -4 }) }, // 正蹬踢出
      { t: 0.64, pose: P({ lean: -10, lF: [80, -6], lB: [-20, 16], hipH: 51 }) },
      { t: 1,    pose: GUARD }
    ]},

    sweep: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.22, pose: P({ hipH: 38, lean: 16, lF: [30, -40], lB: [-20, 44], aF: [30, 70], aB: [20, 80] }) }, // 深蹲
      { t: 0.46, pose: P({ hipH: 20, lean: 24, lF: [84, -2], lB: [-16, 30], aF: [50, 40], aB: [70, 30], rootX: 8 }) }, // 贴地扫腿
      { t: 0.66, pose: P({ hipH: 22, lean: 22, lF: [70, -8], lB: [-14, 34], rootX: 6 }) },
      { t: 1,    pose: GUARD }
    ]},

    uppercut: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.22, pose: P({ hipH: 40, lean: 14, aF: [-30, 116], aB: [30, 100], lF: [24, -36], lB: [-26, 40] }) }, // 下蹲沉拳
      { t: 0.48, pose: P({ hipH: 74, lean: -10, aF: [150, 8], aB: [60, 90], lF: [30, -30], lB: [-16, 24], rootX: 6 }) }, // 猛然拔起上勾
      { t: 0.68, pose: P({ hipH: 66, lean: -6, aF: [140, 14], aB: [56, 92] }) },
      { t: 1,    pose: GUARD }
    ]},

    airkick: { frames: [
      { t: 0,    pose: P({ lean: 6, aF: [50, 80], aB: [40, 90], lF: [40, -20], lB: [-20, 40] }) },
      { t: 0.16, pose: P({ lean: 12, aF: [58, 96], aB: [46, 100], lF: [66, -94], lB: [40, -70], hipH: 58 }) },          // 跃起团身蓄势
      { t: 0.38, pose: P({ lean: -20, head: -14, aF: [-36, 18], aB: [60, 28], lF: [99, -2], lB: [-44, 80], rootX: 8, hipH: 56 }) }, // 爆发侧蹬（后仰+双臂展开）
      { t: 0.64, pose: P({ lean: -16, head: -10, aF: [-30, 24], aB: [54, 34], lF: [94, -4], lB: [-40, 76], rootX: 7, hipH: 56 }) }, // 滞空定格
      { t: 0.86, pose: P({ lean: 8, aF: [40, 76], aB: [36, 84], lF: [34, -56], lB: [-10, -36], hipH: 57 }) },           // 收腿备落
      { t: 1,    pose: P({ lean: 6, aF: [50, 80], lF: [30, -24], lB: [-22, 44] }) }
    ]},

    // -- 受击 --
    hit: { frames: [
      { t: 0,   pose: P({ lean: -18, head: 10, aF: [30, 40], aB: [24, 50], lF: [10, -10], lB: [-30, 30], hipH: 50 }) },
      { t: 1,   pose: GUARD }
    ]},
    hitHeavy: { frames: [
      { t: 0,   pose: P({ lean: -34, head: 18, aF: [-10, 30], aB: [-16, 36], lF: [4, -6], lB: [-40, 40], hipH: 47, rootX: -6 }) },
      { t: 1,   pose: GUARD }
    ]},
    down: { frames: [
      { t: 0,   pose: P({ lean: -52, head: 24, aF: [-30, 20], aB: [-36, 26], lF: [50, -10], lB: [30, 8], hipH: 34, rootX: -10 }) },
      { t: 1,   pose: P({ lean: -84, head: 26, aF: [-52, 10], aB: [-58, 16], lF: [76, -6], lB: [58, 12], hipH: 12, rootX: -16 }) }
    ]},
    // 倒地起身（从躺到站）
    getup: { frames: [
      { t: 0,   pose: P({ lean: -84, head: 26, aF: [-52, 10], aB: [-58, 16], lF: [76, -6], lB: [58, 12], hipH: 12, rootX: -16 }) },
      { t: 0.5, pose: P({ lean: -40, head: 12, aF: [-10, 40], aB: [-14, 44], lF: [50, -30], lB: [-20, 50], hipH: 32 }) },
      { t: 1,   pose: GUARD }
    ]},

    block: P({ lean: 2, head: 4, aF: [62, 104], aB: [58, 108], lF: [14, -18], lB: [-20, 26], hipH: 49, rootX: -4 }),

    crouch: P({ hipH: 40, lean: 14, lF: [34, -52], lB: [-30, 58], aF: [56, 84], aB: [48, 96] }),

    jump: P({ lean: 4, aF: [46, 62], aB: [40, 70], lF: [56, -76], lB: [16, -52], hipH: 58 }),
    fall: P({ lean: 10, aF: [64, 40], aB: [58, 46], lF: [36, -26], lB: [-16, -20], hipH: 56 }),

    victory: { procedural: function (t) {
      var s = Math.sin(t * 6);
      return P({
        lean: -4, head: -10,
        aF: [150 + s * 12, 10], aB: [160 - s * 12, 6],
        lF: [8, -8], lB: [-16, 14],
        hipH: 54 + Math.abs(Math.sin(t * 6)) * 6
      });
    }},

    // -- 必杀：蓄力 → 突进乱舞 → 终结升龙 --
    special: { frames: [
      { t: 0,    pose: GUARD },
      { t: 0.12, pose: P({ hipH: 42, lean: -18, head: 12, aF: [-24, 100], aB: [-18, 96], lF: [16, -40], lB: [-34, 46], rootX: -10 }) },   // 沉身蓄力
      { t: 0.2,  pose: P({ hipH: 46, lean: -14, aF: [-20, 96], aB: [-14, 92], lF: [18, -38], lB: [-32, 44], rootX: -8 }) },
      { t: 0.3,  pose: P({ hipH: 52, lean: 26, aF: [92, 4], aB: [30, 96], lF: [36, -12], lB: [-30, 26], rootX: 12 }) },   // 突进第一拳
      { t: 0.38, pose: P({ hipH: 51, lean: 22, aF: [78, 66], aB: [88, 6], lF: [34, -10], lB: [-28, 24], rootX: 10 }) },  // 交替
      { t: 0.46, pose: P({ hipH: 51, lean: 26, aF: [92, 4], aB: [30, 96], lF: [36, -12], lB: [-30, 26], rootX: 12 }) },
      { t: 0.54, pose: P({ hipH: 50, lean: 22, aF: [74, 70], aB: [86, 8], lF: [34, -10], lB: [-28, 24], rootX: 10 }) },
      { t: 0.62, pose: P({ hipH: 48, lean: 24, lF: [86, -4], lB: [-16, 30], aF: [20, 60], aB: [-26, 110], rootX: 8 }) },  // 横踢
      { t: 0.72, pose: P({ hipH: 40, lean: 14, aF: [-26, 112], aB: [28, 100], lF: [24, -36], lB: [-26, 40] }) },        // 终结前沉拳
      { t: 0.84, pose: P({ hipH: 76, lean: -12, aF: [152, 6], aB: [64, 88], lF: [30, -30], lB: [-14, 22], rootX: 6 }) }, // 升龙终结
      { t: 1,    pose: GUARD }
    ]}
  };

  /** 剪辑采样：clip + progress(0~1) → pose */
  function sampleClip(clip, p) {
    if (clip.procedural) return clip.procedural(p);
    var frames = clip.frames;
    if (p <= frames[0].t) return frames[0].pose;
    var last = frames[frames.length - 1];
    if (p >= last.t) return last.pose;
    for (var i = 0; i < frames.length - 1; i++) {
      var a = frames[i], b = frames[i + 1];
      if (p >= a.t && p <= b.t) {
        var t = (p - a.t) / Math.max(0.0001, b.t - a.t);
        t = t * t * (3 - 2 * t); // smoothstep 缓动，出手快收招稳
        return lerpPose(a.pose, b.pose, t);
      }
    }
    return last.pose;
  }

  // ---------------------------------------------------------------- 程序化步态
  /** 走/跑步态：phase 随速度累加，返回姿势 */
  function walkPose(phase, run, crouch) {
    var amp = run ? 42 : 26;          // 大腿摆幅
    var armAmp = run ? 38 : 22;
    var lean = run ? 16 : 6;
    if (crouch) lean += 10;
    var s = Math.sin(phase);
    var c = Math.cos(phase);
    // 抬腿阶段（腿从后向前摆）膝盖弯曲更大
    var kneeF = Math.max(0, Math.sin(phase - 0.9)) * (run ? 78 : 42);
    var kneeB = Math.max(0, Math.sin(phase - 0.9 + Math.PI)) * (run ? 78 : 42);
    return P({
      hipH: (run ? 52 : 53) - Math.abs(c) * 2 - (crouch ? 12 : 0),
      lean: lean,
      head: run ? -8 : -4,
      aF: [70 - s * armAmp, run ? 74 : 64 - Math.max(0, -s) * 40],
      aB: [70 + s * armAmp, run ? 74 : 64 - Math.max(0, s) * 40],
      lF: [s * amp, -kneeF],
      lB: [-s * amp, kneeB * 0.9],
      rootX: run ? 6 : 0
    });
  }

  /** 空中姿势（按垂直速度混合 jump→fall） */
  function airPose(vyNorm) {
    // vyNorm: -1 上升 → +1 下落
    var t = Math.min(1, Math.max(0, (vyNorm + 1) / 2));
    var jump = P({ lean: 4, aF: [46, 62], aB: [40, 70], lF: [56, -76], lB: [16, -52], hipH: 58 });
    return lerpPose(jump, CLIPS.fall, t);
  }

  // ---------------------------------------------------------------- 绘制
  /**
   * 绘制火柴人。约定：调用前 ctx 已 translate 到脚底中心并 scale(facing,1)。
   * style: { color, headColor, lineWidth, alpha, flash(0~1 受击闪白), glow, scale }
   */
  function drawStickman(ctx, pose, style) {
    var lw = (style.lineWidth || 9) * (style.scale || 1);
    var s = style.scale || 1;
    var color = style.flash > 0.02 ? mixColor(style.color, '#ffffff', style.flash) : style.color;

    ctx.save();
    ctx.globalAlpha = style.alpha !== undefined ? style.alpha : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (style.glow) {
      ctx.shadowColor = style.glow;
      ctx.shadowBlur = 22;
    }

    // 骨盆与躯干
    var hip = { x: pose.rootX * s, y: -pose.hipH * s };
    var leanR = pose.lean * D2R;
    var upX = Math.sin(leanR), upY = -Math.cos(leanR);             // 躯干向上方向
    var neck = { x: hip.x + upX * BONE.torso * s, y: hip.y + upY * BONE.torso * s };
    var shoulder = { x: hip.x + upX * (BONE.torso - 6) * s, y: hip.y + upY * (BONE.torso - 6) * s };

    ctx.strokeStyle = color;
    ctx.lineWidth = lw;

    // 大腿+小腿（先画后侧肢体，视觉层次）
    drawLeg(ctx, hip, pose.lB, s, lw);
    drawArm(ctx, shoulder, pose.aB, s, lw, style);

    // 躯干
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(neck.x, neck.y);
    ctx.stroke();

    // 前腿+前臂
    drawLeg(ctx, hip, pose.lF, s, lw);
    drawArm(ctx, shoulder, pose.aF, s, lw, style);

    // 头
    var headR = pose.head * D2R;
    var hx = Math.sin(leanR + headR), hy = -Math.cos(leanR + headR);
    var headC = { x: neck.x + hx * (BONE.neck + BONE.headR) * s, y: neck.y + hy * (BONE.neck + BONE.headR) * s };
    ctx.beginPath();
    ctx.arc(headC.x, headC.y, BONE.headR * s, 0, Math.PI * 2);
    ctx.fillStyle = style.headColor || '#fff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, lw * 0.55);
    ctx.stroke();

    ctx.restore();
  }

  function drawArm(ctx, shoulder, angles, s, lw, style) {
    var a1 = angles[0] * D2R, a2 = (angles[0] + angles[1]) * D2R;
    var ex = shoulder.x + Math.sin(a1) * BONE.upperArm * s;
    var ey = shoulder.y + Math.cos(a1) * BONE.upperArm * s;
    var wx = ex + Math.sin(a2) * BONE.foreArm * s;
    var wy = ey + Math.cos(a2) * BONE.foreArm * s;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(ex, ey);
    ctx.lineTo(wx, wy);
    ctx.stroke();
    // 拳头
    ctx.beginPath();
    ctx.arc(wx, wy, BONE.handR * s * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
  }

  function drawLeg(ctx, hip, angles, s, lw) {
    var a1 = angles[0] * D2R, a2 = (angles[0] - angles[1]) * D2R; // 膝向后弯 → 减
    var kx = hip.x + Math.sin(a1) * BONE.thigh * s;
    var ky = hip.y + Math.cos(a1) * BONE.thigh * s;
    var fx = kx + Math.sin(a2) * BONE.shin * s;
    var fy = ky + Math.cos(a2) * BONE.shin * s;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    // 脚：方向 = 小腿方向旋转 -90°（站立时朝面朝方向，随踢腿绷直）
    var tx = Math.cos(a2), ty = -Math.sin(a2);
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(fx - tx * 4 * s, fy - ty * 4 * s);   // 微留脚跟
    ctx.lineTo(fx + tx * BONE.footL * s, fy + ty * BONE.footL * s);
    ctx.stroke();
    ctx.lineWidth = lw;
  }

  /** 简单颜色混合（hex → 混白），解析失败回退第一色（防 NaN 崩溃） */
  function mixColor(hex, hex2, t) {
    function parse(h) {
      if (typeof h !== 'string' || h.charAt(0) !== '#') return null;
      var s = h.slice(1);
      if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      if (s.length < 6 || !/^[0-9a-fA-F]+$/.test(s)) return null;
      return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)];
    }
    var a = parse(hex), b = parse(hex2);
    if (!a) return hex;
    if (!b) b = [255, 255, 255];
    var r = Math.round(a[0] + (b[0] - a[0]) * t);
    var g = Math.round(a[1] + (b[1] - a[1]) * t);
    var bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  SF.skeleton = {
    BONE: BONE,
    BASE: BASE,
    P: P,
    GUARD: GUARD,
    CLIPS: CLIPS,
    lerpPose: lerpPose,
    sampleClip: sampleClip,
    walkPose: walkPose,
    airPose: airPose,
    drawStickman: drawStickman,
    mixColor: mixColor
  };
})();
