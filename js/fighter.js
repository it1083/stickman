/**
 * fighter.js — 战斗实体
 * 状态机：idle / walk / run / crouch / jump / attack / block / hitStun /
 *          launched(击飞) / down(倒地) / getup / special / ko / victory
 * 含：物理、连招队列、格挡判定、多段必杀、hit stop、残影、姿势混合。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var CFG = null; // 延迟取 SF.config（加载顺序安全）

  var S = {
    IDLE: 'idle', WALK: 'walk', RUN: 'run', CROUCH: 'crouch', JUMP: 'jump',
    ATTACK: 'attack', BLOCK: 'block', HITSTUN: 'hitStun', LAUNCHED: 'launched',
    DOWN: 'down', GETUP: 'getup', SPECIAL: 'special', KO: 'ko', VICTORY: 'victory'
  };

  // 每个招式对应的挥击弧线：limb 跟随的肢体 / big 大弧(踢技) / tilt 弧面旋转
  var SLASH = {
    jab:       { limb: 'arm', big: false, tilt: -0.12 },
    hook:      { limb: 'arm', big: false, tilt: 0.5 },
    rising:    { limb: 'arm', big: false, tilt: -1.25 },
    dashPunch: { limb: 'arm', big: false, tilt: -0.2 },
    dashKick:  { limb: 'leg', big: true,  tilt: -0.15 },
    spin:      { limb: 'leg', big: true,  tilt: 0.25 },
    kick:      { limb: 'leg', big: true,  tilt: -0.08 },
    sweep:     { limb: 'leg', big: true,  tilt: 1.45 },
    uppercut:  { limb: 'arm', big: false, tilt: -1.05 },
    airkick:   { limb: 'leg', big: true,  tilt: -0.4 },
    backKick:  { limb: 'leg', big: true,  tilt: 0.3 },
    stomp:     { limb: 'leg', big: true,  tilt: 1.5 },
    kneeDash:  { limb: 'leg', big: false, tilt: 0.1 }
  };

  function Fighter(opts) {
    if (!CFG) CFG = SF.config;
    opts = opts || {};
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || (this.isPlayer ? '你' : '对手');
    this.x = opts.x || 400;
    this.y = CFG.GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = opts.facing || 1;

    this.maxHp = opts.hp || CFG.MAX_HP;
    this.hp = this.maxHp;
    this.atk = opts.atk !== undefined ? opts.atk : 1;
    this.spd = opts.spd !== undefined ? opts.spd : 1;
    this.scale = opts.scale || 1;
    this.color = opts.color || '#3fa9f5';
    this.headColor = opts.headColor || '#e8f4ff';

    this.energy = opts.energy !== undefined ? opts.energy : 0;

    this.state = S.IDLE;
    this.stateT = 0;          // 当前状态经过时间
    this.onGround = true;

    this.move = null;         // 当前攻击 MOVES key
    this.attackT = 0;
    this.hitDone = false;     // 本段攻击是否已命中
    this.queuedNext = null;   // 连招缓存
    this.comboStep = 0;       // 连招链索引

    this.specialHits = 0;     // 必杀多段命中计数
    this.specialHitTime = [];

    this.hitStun = 0;
    this.hitStop = 0;         // 冻结帧
    this.flashT = 0;          // 受击闪白
    this.bodyRot = 0;         // 击飞旋转
    this.invuln = false;

    this.hitCombo = 0;        // 我的连击数
    this.comboTimer = 0;
    this.dealtTotal = 0;      // 总输出（结算统计）

    this.phase = 0;           // 步态相位
    this.idleT = 0;
    this.pose = SF.skeleton.P();           // 当前渲染姿势（平滑混合）
    this.ghosts = [];                       // 残影快照
    this.ghostTimer = 0;

    this.cmd = {};            // 本帧输入 {moveX, jump, crouch, punch, kick, special, block}
    this.ai = opts.ai || null;
    this.koBounced = false;
  }

  Fighter.prototype.isBusy = function () {
    return this.state === S.ATTACK || this.state === S.SPECIAL || this.state === S.HITSTUN ||
           this.state === S.LAUNCHED || this.state === S.DOWN || this.state === S.GETUP || this.state === S.KO;
  };

  Fighter.prototype.canAct = function () {
    return this.state === S.IDLE || this.state === S.WALK || this.state === S.RUN ||
           this.state === S.CROUCH || this.state === S.JUMP || this.state === S.BLOCK;
  };

  Fighter.prototype.alive = function () { return this.hp > 0; };

  // ================================================================ 主更新
  Fighter.prototype.update = function (dt, opp) {
    this.stateT += dt;

    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.flashT > 0) this.flashT -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.hitCombo = 0;
    }

    // AI 产生指令；玩家从输入系统读取
    if (this.ai) {
      this.ai.think(dt, this, opp);
      this.cmd = this.ai.cmd;
    } else if (SF.input && SF.input.enabled) {
      this.cmd = SF.input.getCmd();
    } else {
      this.cmd = { moveX: 0, jump: false, crouch: false, punch: false, kick: false, special: false, block: false };
    }

    this.updateState(dt, opp);
    this.updatePhysics(dt);
    this.updatePose(dt);
  };

  Fighter.prototype.updateState = function (dt, opp) {
    var c = this.cmd, M = CFG.MOVES;

    switch (this.state) {
      case S.IDLE: case S.WALK: case S.RUN: case S.CROUCH: case S.BLOCK: {
        // 自动面向对手
        if (opp && Math.abs(opp.x - this.x) > 10) this.facing = opp.x > this.x ? 1 : -1;

        var blockHeld = c.block && this.onGround;
        if (blockHeld && this.state !== S.BLOCK) this.setState(S.BLOCK);
        if (!blockHeld && this.state === S.BLOCK) this.setState(S.IDLE);

        if (this.state === S.BLOCK) { this.vx *= 0.8; return; }

        // 必杀
        if (c.special && this.energy >= CFG.MAX_ENERGY && this.onGround) { this.startSpecial(); return; }

        // 攻击输入
        if (c.punch || c.kick) {
          if (!this.onGround) {
            if (c.crouch && c.kick) { this.startAttack('stomp'); return; } // 空中+下+踢：速降践踏
            this.startAttack('airkick'); return;
          }
          if (c.crouch) { this.startAttack('uppercut'); return; }
          // 前推摇杆/方向键 + 攻击 → 派生突进招式（跑动拳=冲膝 / 冲拳 / 踏踢）
          if (c.moveX * this.facing > 0.55) {
            if (c.punch && this.state === S.RUN) { this.startAttack('kneeDash'); return; }
            this.startAttack(c.punch ? 'dashPunch' : 'dashKick');
            return;
          }
          // 后拉 + 踢 → 转身后蹬（专打背后包抄的敌人）
          if (c.kick && c.moveX * this.facing < -0.55) { this.startAttack('backKick'); return; }
          if (c.punch) {
            var chain = ['jab', 'hook', 'rising'];
            var next = (this.comboStep < chain.length) ? chain[this.comboStep] : chain[0];
            this.startAttack(next);
          } else {
            this.startAttack(this.comboStep > 0 && this.lastWasKick ? 'sweep' : 'kick');
          }
          return;
        }
        this.lastWasKick = !!c.kick;

        // 跳跃
        if (c.jump && this.onGround) {
          this.vy = CFG.JUMP_VY;
          this.onGround = false;
          this.setState(S.JUMP);
          SF.audio.play('jump');
          SF.fx.dust(this.x, CFG.GROUND_Y, 6, 80);
          return;
        }

        // 移动
        var mv = c.moveX || 0;
        var speed = (Math.abs(mv) > 0.72 ? CFG.RUN_SPEED : CFG.WALK_SPEED) * this.spd;
        if (Math.abs(mv) < 0.12) {
          this.vx *= Math.max(0, 1 - dt * 8);
          this.setState(this.onGround ? S.IDLE : S.JUMP);
        } else {
          this.vx = mv * speed;
          if (this.onGround) {
            this.setState(Math.abs(mv) > 0.72 ? S.RUN : S.WALK);
            if (this.stateT > 0.1 && Math.random() < dt * 6) SF.fx.dust(this.x, CFG.GROUND_Y, 1, 40);
          } else this.setState(S.JUMP);
        }
        if (c.crouch && this.onGround) this.setState(S.CROUCH);
        break;
      }

      case S.JUMP: {
        if (c.crouch && c.kick) { this.startAttack('stomp'); return; } // 空中+下+踢：速降践踏
        if (c.punch || c.kick) { this.startAttack('airkick'); return; }
        if (!this.onGround && c.special && this.energy >= CFG.MAX_ENERGY) { /* 空中不放必杀 */ }
        if (this.onGround) this.setState(S.IDLE);
        break;
      }

      case S.ATTACK: {
        this.attackT += dt;
        var move = M[this.move];
        // 进入命中窗口瞬间放出挥击弧线
        if (!this.slashDone && this.attackT >= move.hitT[0]) {
          this.slashDone = true;
          this.spawnSlash(SLASH[this.move]);
        }
        // 攻击后段缓存连招
        if ((c.punch || c.kick) && this.attackT > move.dur * 0.5 && this.attackT < move.dur * 0.92) {
          if (move.next || this.move === 'kick') this.queuedNext = this.pickChainNext(c);
        }
        if (this.attackT >= move.dur) {
          if (this.queuedNext) {
            var q = this.queuedNext; this.queuedNext = null;
            this.startAttack(q);
          } else {
            this.comboStep = 0;
            this.setState(this.onGround ? S.IDLE : S.JUMP);
          }
        }
        break;
      }

      case S.SPECIAL: {
        this.attackT += dt;
        var sp = M.special;
        // 突进阶段：朝对手猛冲
        if (opp && this.attackT > 0.18 && this.attackT < 0.75) {
          var dir = opp.x > this.x ? 1 : -1;
          this.facing = dir;
          if (Math.abs(opp.x - this.x) > 70) this.vx = dir * 900;
          else this.vx *= 0.85;
        } else this.vx *= 0.86;
        // 多段命中时间点
        while (this.specialHits < this.specialHitTime.length && this.attackT >= this.specialHitTime[this.specialHits]) {
          this.specialHits++;
          this.hitDone = false; // 允许下一段判定
          // 必杀乱舞每段都带弧线，终结升龙用大弧
          var lastSeg = this.specialHits >= this.specialHitTime.length;
          this.spawnSlash(lastSeg ? SLASH.uppercut : SLASH.jab);
          this.tryHit(opp, lastSeg);
        }
        if (this.attackT >= sp.dur) { this.energy = 0; this.setState(this.onGround ? S.IDLE : S.JUMP); }
        break;
      }

      case S.HITSTUN: {
        this.hitStun -= dt;
        if (this.hitStun <= 0) this.setState(this.onGround ? S.IDLE : S.JUMP);
        break;
      }

      case S.LAUNCHED: {
        this.bodyRot += this.facing * -dt * 9;
        if (this.onGround) {
          if (!this.koBounced && Math.abs(this.vyLand) > 300) {
            this.koBounced = true;
            this.vy = -Math.abs(this.vyLand) * 0.3;
            this.onGround = false;
            SF.fx.dust(this.x, CFG.GROUND_Y, 10, 140);
            SF.audio.play('land');
          } else {
            this.setState(S.DOWN);
          }
        }
        break;
      }

      case S.DOWN: {
        this.bodyRot *= 0.9;
        if (this.stateT > (this.hp <= 0 ? 99 : 0.85)) {
          if (this.hp <= 0) { this.setState(S.KO); }
          else { this.invuln = true; this.setState(S.GETUP); }
        }
        break;
      }

      case S.GETUP: {
        this.invuln = true;
        if (this.stateT > 0.5) { this.invuln = false; this.setState(S.IDLE); }
        break;
      }

      case S.KO: case S.VICTORY: break;
    }
  };

  Fighter.prototype.pickChainNext = function (c) {
    if (c.punch) {
      var chain = ['jab', 'hook', 'rising'];
      var idx = chain.indexOf(this.move);
      if (idx >= 0 && idx < chain.length - 1) return chain[idx + 1];
      return 'jab';
    }
    if (this.move === 'kick') return 'sweep';
    return 'kick';
  };

  Fighter.prototype.setState = function (s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  };

  // ================================================================ 攻击
  Fighter.prototype.startAttack = function (moveName) {
    var move = CFG.MOVES[moveName];
    if (!move) return;
    if (move.airOnly && this.onGround) return;
    if (!move.airOk && !this.onGround) moveName = 'airkick', move = CFG.MOVES.airkick;
    this.move = moveName;
    this.state = S.ATTACK;
    this.attackT = 0;
    this.hitDone = false;
    this.slashDone = false;
    this.queuedNext = null;
    this.stateT = 0;
    if (this.onGround) this.vx *= 0.3;
    // 转身招式（后蹬踢）：起手翻转面向，打向身后
    if (move.turn) this.facing *= -1;
    // 突进招式：起手瞬间给前冲速度
    if (move.dash && this.onGround) this.vx = this.facing * move.dash;
    // 下压招式（践踏）：猛然加速坠落
    if (move.dive && !this.onGround) this.vy = move.dive;
    SF.audio.play(move.sfx || 'swing1');
    // 连招链推进：同链攻击递增 comboStep
    if (moveName === 'jab') this.comboStep = 1;
    else if (moveName === 'hook') this.comboStep = 2;
    else if (moveName === 'rising') this.comboStep = 3;
    else this.comboStep = 0;
  };

  Fighter.prototype.startSpecial = function () {
    this.state = S.SPECIAL;
    this.attackT = 0;
    this.hitDone = false;
    this.slashDone = false;
    this.specialHits = 0;
    this.stateT = 0;
    this.queuedNext = null;
    this.comboStep = 0;
    this.specialHitTime = [0.30, 0.38, 0.46, 0.54, 0.62, 0.84];
    SF.audio.play('special');
    SF.fx.specialAura(this.x, this.y, '#ffd24d');
    SF.fx.flash('#ffd24d', 0.35, 0.25);
    SF.fx.shake(6);
  };

  /** 前肢末端（拳/前脚）世界坐标，与 drawStickman 的骨骼计算保持一致 */
  Fighter.prototype.limbEndWorld = function (useLeg) {
    var B = SF.skeleton.BONE, D2R = Math.PI / 180;
    var p = this.pose, s = this.scale;
    var hip = { x: p.rootX * s, y: -p.hipH * s };
    var leanR = p.lean * D2R;
    var upX = Math.sin(leanR), upY = -Math.cos(leanR);
    var px, py;
    if (useLeg) {
      var a1 = p.lF[0] * D2R, a2 = (p.lF[0] - p.lF[1]) * D2R;
      var kx = hip.x + Math.sin(a1) * B.thigh * s;
      var ky = hip.y + Math.cos(a1) * B.thigh * s;
      px = kx + Math.sin(a2) * B.shin * s;
      py = ky + Math.cos(a2) * B.shin * s;
    } else {
      var sx = hip.x + upX * (B.torso - 6) * s;
      var sy = hip.y + upY * (B.torso - 6) * s;
      var b1 = p.aF[0] * D2R, b2 = (p.aF[0] + p.aF[1]) * D2R;
      var ex = sx + Math.sin(b1) * B.upperArm * s;
      var ey = sy + Math.cos(b1) * B.upperArm * s;
      px = ex + Math.sin(b2) * B.foreArm * s;
      py = ey + Math.cos(b2) * B.foreArm * s;
    }
    return { x: this.x + px * this.facing, y: this.y + py };
  };

  /** 在攻击肢体末端放出月牙挥击弧线 */
  Fighter.prototype.spawnSlash = function (cfg) {
    if (!cfg || !SF.fx.slash) return;
    var end = this.limbEndWorld(cfg.limb === 'leg');
    SF.fx.slash(end.x, end.y, this.facing, cfg.big, cfg.tilt);
  };

  /** 当前攻击矩形（世界坐标），未在命中窗口或已命中则返回 null */
  Fighter.prototype.getHitbox = function () {
    var move = CFG.MOVES[this.move];
    if (!move) return null;
    var t = this.attackT;
    var inWindow = this.state === S.SPECIAL ? true : (t >= move.hitT[0] && t <= move.hitT[1]);
    if (!inWindow || this.hitDone) return null;
    var b = move.box;
    var x = this.facing > 0 ? this.x + b.x : this.x - b.x - b.w;
    return { x: x, y: this.y + b.y, w: b.w, h: b.h };
  };

  Fighter.prototype.tryHit = function (opp, isFinisher) {
    if (!opp || !opp.alive() || opp.invuln) return;
    var box = this.getHitbox();
    if (!box) return;
    var tb = opp.getBodyBox();
    if (rectOverlap(box, tb)) {
      this.hitDone = true;
      opp.takeHit(CFG.MOVES[this.move], this, isFinisher);
    }
  };

  // ================================================================ 受击
  Fighter.prototype.getBodyBox = function () {
    var h = 120 * this.scale;
    var w = 44 * this.scale;
    if (this.state === S.DOWN || this.state === S.KO) h = 44 * this.scale;
    return { x: this.x - w / 2, y: this.y - h, w: w, h: h };
  };

  Fighter.prototype.takeHit = function (move, attacker, isFinisher) {
    // 防御判定：面向攻击者 + 格挡状态 + 非破防 + 非下段
    var blocking = this.state === S.BLOCK &&
                   (attacker.x - this.x) * this.facing > 0 &&
                   !move.guardBreak && !move.low;
    var dmg = Math.round(move.dmg * attacker.atk * (attacker.state === S.SPECIAL ? (isFinisher ? 1.6 : 0.4) : 1));
    var hx = (this.x + attacker.x) / 2;
    var hy = this.y - 70 * this.scale;
    var dir = this.x >= attacker.x ? 1 : -1;

    if (blocking) {
      var chip = Math.max(1, Math.round(dmg * 0.12));
      this.hp = Math.max(0, this.hp - chip);
      this.energy = Math.min(CFG.MAX_ENERGY, this.energy + CFG.ENERGY_PER_TAKEN);
      attacker.energy = Math.min(CFG.MAX_ENERGY, attacker.energy + 3);
      SF.fx.blockSparks(this.x - this.facing * 26, hy, dir);
      SF.audio.play('block');
      SF.fx.shake(3);
      this.hitStop = 0.05; attacker.hitStop = 0.05;
      SF.fx.damageNumber(this.x, hy - 40, chip, false);
      this.vx = dir * move.kb * 0.35;
      if (this.hp <= 0) this.enterKO(move, attacker, dir);
      return;
    }

    // 浮空连击递减
    if (this.state === S.LAUNCHED) dmg = Math.max(2, Math.round(dmg * 0.6));

    this.hp = Math.max(0, this.hp - dmg);
    this.flashT = 0.14;
    this.energy = Math.min(CFG.MAX_ENERGY, this.energy + CFG.ENERGY_PER_TAKEN);
    attacker.energy = Math.min(CFG.MAX_ENERGY, attacker.energy + CFG.ENERGY_PER_HIT);
    attacker.dealtTotal += dmg;
    attacker.hitCombo++;
    attacker.comboTimer = CFG.COMBO_WINDOW;

    var heavy = dmg >= 10 || move.knockdown || move.launcher;
    SF.fx.damageNumber(this.x, hy - 46, dmg, dmg >= 12);
    SF.adapter.vibrateShort();

    if (this.hp <= 0) { this.enterKO(move, attacker, dir); return; }

    if (move.launcher || move.up < -300 || (isFinisher && attacker.state === S.SPECIAL)) {
      // 击飞
      this.setState(S.LAUNCHED);
      this.onGround = false;
      this.koBounced = false;
      this.vy = (move.up < -300 ? move.up : -620) * 0.9;
      this.vx = dir * move.kb * 1.1;
      this.hitStun = 0.5;
      SF.fx.hitHeavySparks(hx, hy, dir, '#ffd24d');
      SF.audio.play('hitHeavy');
      SF.fx.shake(11);
      this.hitStop = 0.11; attacker.hitStop = 0.11;
      SF.fx.slowmo(0.25, 0.35);
    } else if (move.knockdown) {
      // 击倒
      this.setState(S.LAUNCHED);
      this.onGround = false;
      this.koBounced = false;
      this.vy = -320;
      this.vx = dir * move.kb;
      this.hitStun = 0.4;
      SF.fx.hitHeavySparks(hx, hy, dir, '#ffd24d');
      SF.audio.play('hitHeavy');
      SF.fx.shake(9);
      this.hitStop = 0.1; attacker.hitStop = 0.1;
    } else {
      // 普通硬直
      this.setState(S.HITSTUN);
      this.hitStun = heavy ? 0.42 : 0.26;
      this.vx = dir * move.kb;
      if (this.onGround && heavy) this.vy = -160;
      SF.fx[heavy ? 'hitHeavySparks' : 'hitSparks'](hx, hy, dir, '#ffd24d');
      SF.audio.play(heavy ? 'hitHeavy' : 'hit');
      SF.fx.shake(heavy ? 8 : 4.5);
      this.hitStop = heavy ? 0.09 : 0.06; attacker.hitStop = this.hitStop;
    }
  };

  Fighter.prototype.enterKO = function (move, attacker, dir) {
    this.setState(S.LAUNCHED);
    this.onGround = false;
    this.koBounced = false;
    this.vy = -520;
    this.vx = dir * 480;
    this.bodyRot = 0;
    SF.fx.hitHeavySparks(this.x, this.y - 70, dir, '#ff5d3d');
    SF.fx.flash('#ffffff', 0.5, 0.3);
    SF.fx.shake(14);
    SF.fx.slowmo(1.1, 0.25);
    SF.audio.play('ko');
  };

  // ================================================================ 物理
  Fighter.prototype.updatePhysics = function (dt) {
    // 攻击中地面减速
    if ((this.state === S.ATTACK || this.state === S.SPECIAL) && this.onGround && this.state !== S.SPECIAL) {
      this.vx *= Math.max(0, 1 - dt * 6);
    }
    if (this.state === S.DOWN || this.state === S.KO) {
      this.vx *= Math.max(0, 1 - dt * 5);
    }

    this.x += this.vx * dt;
    if (!this.onGround || this.vy < 0) {
      this.vy += CFG.GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= CFG.GROUND_Y) {
        this.vyLand = this.vy;
        this.y = CFG.GROUND_Y;
        this.vy = 0;
        this.onGround = true;
        if (this.state === S.JUMP || this.state === S.ATTACK) {
          SF.fx.dust(this.x, CFG.GROUND_Y, 5, 70);
          if (this.state === S.ATTACK && CFG.MOVES[this.move] && CFG.MOVES[this.move].airOnly) {
            this.attackT = Math.max(this.attackT, CFG.MOVES[this.move].dur);
          }
        } else if (this.state !== S.LAUNCHED) {
          SF.fx.dust(this.x, CFG.GROUND_Y, 3, 50);
        }
      }
    }

    // 舞台边界
    var margin = 26;
    if (this.x < CFG.STAGE_L + margin) { this.x = CFG.STAGE_L + margin; this.vx = Math.max(0, this.vx); }
    if (this.x > CFG.STAGE_R - margin) { this.x = CFG.STAGE_R - margin; this.vx = Math.min(0, this.vx); }
  };

  /** 双方推挤（场景每帧调用） */
  Fighter.prototype.pushApart = function (other, dt) {
    if (this.state === S.KO || other.state === S.KO) return;
    var minDist = 40 * (this.scale + other.scale) / 2;
    var d = other.x - this.x;
    var overlap = minDist - Math.abs(d);
    if (overlap > 0 && Math.abs(d) > 0.01) {
      var dir = d > 0 ? 1 : -1;
      var push = Math.min(overlap, CFG.BODY_PUSH * dt + overlap * 6 * dt);
      // 被逼到墙边时让对方绕不过去
      var aCanMove = this.x - dir * push > CFG.STAGE_L + 20;
      var bCanMove = other.x + dir * push < CFG.STAGE_R - 20;
      if (aCanMove) this.x -= dir * push * (bCanMove ? 0.5 : 1);
      if (bCanMove) other.x += dir * push * (aCanMove ? 0.5 : 1);
    }
  };

  // ================================================================ 姿势
  Fighter.prototype.updatePose = function (dt) {
    var target = this.computeTargetPose();
    var rate = (this.state === S.ATTACK || this.state === S.SPECIAL) ? 26 :
               (this.state === S.DOWN || this.state === S.GETUP) ? 10 : 14;
    var blend = 1 - Math.exp(-dt * rate);
    this.pose = SF.skeleton.lerpPose(this.pose, target, blend);

    // 残影
    this.ghostTimer -= dt;
    var fast = Math.abs(this.vx) > 380 || this.state === S.SPECIAL;
    if (fast && this.ghostTimer <= 0) {
      this.ghostTimer = 0.04;
      this.ghosts.push({ pose: this.pose, x: this.x, y: this.y, facing: this.facing, life: 0.22, rot: this.bodyRot });
      if (this.ghosts.length > 6) this.ghosts.shift();
    }
    for (var i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
  };

  Fighter.prototype.computeTargetPose = function () {
    var sk = SF.skeleton;
    switch (this.state) {
      case S.IDLE: {
        this.idleT += 0.016;
        var b = Math.sin(this.idleT * 2.4);
        var p = sk.P();
        p.hipH += b * 1.4;
        p.aF[1] += b * 5; p.aB[1] += b * 4;
        p.lean += b * 1.2;
        return p;
      }
      case S.WALK: case S.RUN: {
        var run = this.state === S.RUN;
        var freq = run ? 10.5 : 7.5;
        this.phase += Math.abs(this.vx) * freq / (run ? 430 : 250) * 0.016 * 2.2;
        return sk.walkPose(this.phase, run, false);
      }
      case S.CROUCH: return sk.P(sk.CLIPS.crouch);
      case S.JUMP: return sk.airPose(Math.max(-1, Math.min(1, this.vy / 900)));
      case S.BLOCK: {
        var pb = sk.P(sk.CLIPS.block);
        var bs = Math.sin(this.idleT * 3) * 2;
        pb.hipH += bs * 0.5;
        return pb;
      }
      case S.ATTACK: {
        var move = CFG.MOVES[this.move];
        var clip = sk.CLIPS[this.move];
        if (!clip) return sk.P();
        var prog = Math.min(1, this.attackT / move.dur);
        return clip.procedural ? clip.procedural(prog) : sk.sampleClip(clip, prog);
      }
      case S.SPECIAL: return sk.sampleClip(sk.CLIPS.special, Math.min(1, this.attackT / CFG.MOVES.special.dur));
      case S.HITSTUN: {
        var heavy = this.hitStun > 0.35;
        var clipH = sk.CLIPS[heavy ? 'hitHeavy' : 'hit'];
        var t0 = heavy ? 0.42 : 0.26;
        var pr = 1 - Math.max(0, this.hitStun) / t0;
        return sk.sampleClip(clipH, Math.min(1, Math.max(0, pr)));
      }
      case S.LAUNCHED: return sk.P({ lean: -60, head: 20, aF: [-40, 20], aB: [-46, 26], lF: [60, -20], lB: [44, 10], hipH: 40 });
      case S.DOWN: {
        var pd = Math.min(1, this.stateT / 0.3);
        return sk.sampleClip(sk.CLIPS.down, pd);
      }
      case S.GETUP: return sk.sampleClip(sk.CLIPS.getup, Math.min(1, this.stateT / 0.5));
      case S.KO: return sk.sampleClip(sk.CLIPS.down, 1);
      case S.VICTORY: return sk.CLIPS.victory.procedural(this.stateT);
      default: return sk.P();
    }
  };

  // ================================================================ 绘制
  Fighter.prototype.draw = function (ctx) {
    var self = this;
    // 残影
    for (var i = 0; i < this.ghosts.length; i++) {
      var g = this.ghosts[i];
      drawBody(ctx, g.x, g.y, g.facing, g.pose, g.rot, {
        color: this.color, lineWidth: 8, alpha: g.life / 0.22 * 0.3, scale: this.scale
      });
    }
    var style = {
      color: this.color,
      headColor: this.headColor,
      lineWidth: 9,
      scale: this.scale,
      flash: this.flashT > 0 ? Math.min(1, this.flashT / 0.14) * 0.85 : 0,
      glow: this.state === S.SPECIAL ? '#ffd24d' : (this.energy >= SF.config.MAX_ENERGY ? this.color : null),
      alpha: this.invuln ? (Math.sin(this.stateT * 30) > 0 ? 0.45 : 0.9) : 1
    };
    drawBody(ctx, this.x, this.y, this.facing, this.pose, this.bodyRot, style);

    // 地面阴影
    ctx.save();
    var airH = (SF.config.GROUND_Y - this.y) / 300;
    ctx.globalAlpha = 0.3 * (1 - Math.min(0.7, airH));
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.x, SF.config.GROUND_Y + 6, 34 * this.scale * (1 - airH * 0.3), 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  function drawBody(ctx, x, y, facing, pose, rot, style) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(facing, 1);
    SF.skeleton.drawStickman(ctx, pose, style);
    ctx.restore();
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  Fighter.prototype.getEnergyRatio = function () { return this.energy / SF.config.MAX_ENERGY; };
  Fighter.prototype.getHpRatio = function () { return this.hp / this.maxHp; };

  SF.Fighter = Fighter;
  SF.States = S;
})();
