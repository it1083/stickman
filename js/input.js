/**
 * input.js — 输入系统（触屏 + 键盘）
 * 触屏：左半屏浮动摇杆（走/跑/跳/蹲），右半屏 拳/踢/防/必杀 四按钮，id→控件映射跟踪多点触控
 * 键盘（浏览器预览）：←→/AD 移动 · ↑/W/空格 跳 · ↓/S 蹲 · J 拳 · K 踢 · L/Shift 按住防 · U 必杀
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  // 按钮定义（设计坐标）
  var BUTTONS = [
    { id: 'punch',   label: '拳', cx: 1200, cy: 606, r: 62, key: 'punch' },
    { id: 'kick',    label: '踢', cx: 1066, cy: 668, r: 52, key: 'kick' },
    { id: 'block',   label: '防', cx: 1250, cy: 452, r: 46, key: 'block' },
    { id: 'special', label: '杀', cx: 1114, cy: 452, r: 42, key: 'special' }
  ];
  var STICK_MAX = 72;  // 摇杆最大行程（设计像素）

  function Input() {
    this.enabled = false;          // 仅战斗场景启用
    this.specialReady = false;     // 必杀按钮是否可用（能量满）
    this.stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
    this.pressed = {};             // 按钮 id → 是否按住
    this.touchMap = {};            // 触摸 id → {type:'stick'|'btn', btn}
    this.oneShot = {};             // 本帧边沿触发动作
    this.lastNY = 0;
    this.keys = { left: false, right: false, up: false, down: false, block: false }; // 键盘状态
    this.kbJump = false;           // 键盘跳跃边沿
    this.cmd = { moveX: 0, jump: false, crouch: false, punch: false, kick: false, special: false, block: false };

    var self = this;
    SF.adapter.onTouch(function (type, touches) {
      if (!self.enabled) return;
      if (type === 'start') self.onStart(touches);
      else if (type === 'move') self.onMove(touches);
      else self.onEnd(touches, type);
    });
    this.bindKeyboard();
  }

  /** 浏览器键盘操作（微信小游戏环境无键盘，自动跳过）：
   *  ←→/AD 移动  ↑/W/空格 跳  ↓/S 蹲  J 拳  K 踢  L/Shift(按住) 防  U 必杀 */
  Input.prototype.bindKeyboard = function () {
    if (SF.IS_WX || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    var self = this;
    var HOLD = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowDown: 'down', KeyS: 'down',
      KeyL: 'block', ShiftLeft: 'block', ShiftRight: 'block'
    };
    var TAP = { KeyJ: 'punch', KeyK: 'kick', KeyU: 'special', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump' };
    function normKey(e) {
      if (e.code) return e.code;
      var k = e.key || '';
      return k.length === 1 ? 'Key' + k.toUpperCase() : k;
    }
    window.addEventListener('keydown', function (e) {
      var k = normKey(e);
      if (HOLD[k]) { self.keys[HOLD[k]] = true; e.preventDefault(); return; }
      if (TAP[k] && !e.repeat) {
        if (TAP[k] === 'jump') self.kbJump = true;
        else self.oneShot[TAP[k]] = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = normKey(e);
      if (HOLD[k]) self.keys[HOLD[k]] = false;
    });
  };

  Input.prototype.hitButton = function (sx, sy) {
    var p = SF.view.toDesign(sx, sy);
    for (var i = 0; i < BUTTONS.length; i++) {
      var b = BUTTONS[i];
      var dx = p.x - b.cx, dy = p.y - b.cy;
      if (dx * dx + dy * dy < (b.r * 1.35) * (b.r * 1.35)) return b;
    }
    return null;
  };

  Input.prototype.onStart = function (touches) {
    for (var i = 0; i < touches.length; i++) {
      var t = touches[i];
      if (this.touchMap[t.id]) continue; // 已跟踪
      var btn = this.hitButton(t.x, t.y);
      if (btn) {
        this.touchMap[t.id] = { type: 'btn', btn: btn };
        this.pressed[btn.id] = true;
        this.oneShot[btn.key] = true;
      } else if (t.x < SF.view.w * 0.52 && !this.stick.active) {
        this.stick.active = true;
        this.stick.id = t.id;
        this.stick.ox = t.x; this.stick.oy = t.y;
        this.stick.dx = 0; this.stick.dy = 0;
        this.touchMap[t.id] = { type: 'stick' };
      }
    }
  };

  Input.prototype.onMove = function (touches) {
    for (var i = 0; i < touches.length; i++) {
      var t = touches[i];
      if (this.stick.active && t.id === this.stick.id) {
        var ddx = t.x - this.stick.ox, ddy = t.y - this.stick.oy;
        var len = Math.sqrt(ddx * ddx + ddy * ddy);
        var maxScreen = STICK_MAX * SF.view.scale;
        var k = len > maxScreen ? maxScreen / len : 1;
        this.stick.dx = ddx * k;
        this.stick.dy = ddy * k;
      }
    }
  };

  Input.prototype.onEnd = function (touches, type) {
    for (var i = 0; i < touches.length; i++) {
      var t = touches[i];
      var rec = this.touchMap[t.id];
      if (!rec) continue;
      delete this.touchMap[t.id];
      if (rec.type === 'stick') {
        this.stick.active = false;
        this.stick.id = null;
        this.stick.dx = 0; this.stick.dy = 0;
      } else {
        this.pressed[rec.btn.id] = false;
      }
    }
  };

  /** 每帧生成指令；一次性动作取走即清 */
  Input.prototype.getCmd = function () {
    var c = this.cmd;
    c.jump = false;   // 每帧重置（修复：置 true 后不清零导致落地即再跳的无限连跳）
    var scaleComp = STICK_MAX * SF.view.scale || 1;
    var nx = this.stick.dx / scaleComp;
    var ny = this.stick.dy / scaleComp;
    c.moveX = Math.max(-1, Math.min(1, nx));

    // 上推跳跃（边沿触发）
    if (ny < -0.5 && this.lastNY >= -0.5) c.jump = true;
    this.lastNY = ny;
    c.crouch = ny > 0.55;

    // 键盘输入合并（键盘有输入时覆盖摇杆）
    var kx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (kx !== 0) c.moveX = kx;
    if (this.keys.down) c.crouch = true;
    if (this.kbJump) { c.jump = true; this.kbJump = false; }

    c.punch = !!this.oneShot.punch;
    c.kick = !!this.oneShot.kick;
    c.special = !!this.oneShot.special;
    c.block = !!this.pressed.block || !!this.keys.block;

    this.oneShot = {};
    return c;
  };

  Input.prototype.draw = function (ctx) {
    ctx.save();
    ctx.globalAlpha = 0.6;

    // 摇杆
    var p;
    if (this.stick.active) p = SF.view.toDesign(this.stick.ox, this.stick.oy);
    else p = { x: 165, y: 588 };
    ctx.beginPath();
    ctx.arc(p.x, p.y, STICK_MAX, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,44,52,0.5)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    var hx = p.x, hy = p.y;
    if (this.stick.active) { hx = p.x + this.stick.dx / SF.view.scale; hy = p.y + this.stick.dy / SF.view.scale; }
    ctx.beginPath();
    ctx.arc(hx, hy, 32, 0, Math.PI * 2);
    ctx.fillStyle = this.stick.active ? 'rgba(230,236,244,0.9)' : 'rgba(150,158,170,0.55)';
    ctx.fill();

    // 按钮
    for (var i = 0; i < BUTTONS.length; i++) {
      var b = BUTTONS[i];
      var down = !!this.pressed[b.id];
      var isSp = b.id === 'special';
      var ready = isSp && this.specialReady;
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, b.r * (down ? 0.9 : 1), 0, Math.PI * 2);
      ctx.fillStyle = down ? 'rgba(255,210,77,0.8)' :
        isSp ? (ready ? 'rgba(255,110,50,0.85)' : 'rgba(90,96,110,0.55)') : 'rgba(56,62,74,0.6)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = (isSp && ready) ? '#ffd24d' : 'rgba(255,255,255,0.4)';
      if (isSp && ready) {
        ctx.save();
        ctx.shadowColor = '#ffd24d';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(b.r * 0.6) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.cx, b.cy + 1);
    }
    ctx.restore();
  };

  SF.input = new Input();
  SF.input.BUTTONS = BUTTONS;
})();
