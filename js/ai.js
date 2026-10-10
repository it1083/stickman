/**
 * ai.js — AI 控制器
 * 基于决策间隔的反应式状态机：接近 / 后撤 / 出招链 / 防御 / 跳入 / 必杀。
 * 难度由关卡参数驱动：aggr 侵略性 / react 反应秒数 / guard 防御倾向 / spd 速度。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  function rand(a, b) { return a + Math.random() * (b - a); }

  function AIController(profile) {
    profile = profile || {};
    this.aggr = profile.aggr !== undefined ? profile.aggr : 0.5;
    this.react = profile.react !== undefined ? profile.react : 0.4;
    this.guard = profile.guard !== undefined ? profile.guard : 0.2;
    this.combo = profile.combo !== undefined ? profile.combo : 0.3; // 连招倾向
    this.cmd = { moveX: 0, jump: false, crouch: false, punch: false, kick: false, special: false, block: false };

    this.nextThink = 0;
    this.intent = 'idle';      // idle/approach/retreat/attackChain/block/jumpIn/waitSpecial
    this.intentT = 0;
    this.chainLeft = 0;        // 连招剩余段
    this.chainNext = 0;        // 下一段触发挥时间
  }

  AIController.prototype.think = function (dt, self, opp) {
    var c = this.cmd;
    // 每帧先清一次性动作与持续状态（防止上一帧残留导致卡姿态）
    c.punch = false; c.kick = false; c.special = false; c.jump = false; c.crouch = false;

    if (!opp || !opp.alive() || !self.alive() || self.state === 'ko' || self.state === 'victory') {
      c.moveX = 0; c.block = false; return;
    }
    if (self.hitStop > 0) return;

    var dist = Math.abs(opp.x - self.x);
    var dirToOpp = opp.x > self.x ? 1 : -1;
    this.intentT -= dt;

    // ---- 应激反应（不等待决策周期）----
    // 对手正在出招 → 概率防御/后撤
    if (opp.state === 'attack' && opp.attackT < 0.15 && dist < 170) {
      if (!this._reacted) {
        this._reacted = true;
        var roll = Math.random();
        if (roll < this.guard) { this.setIntent('block', rand(0.3, 0.6)); }
        else if (roll < this.guard + 0.25 * this.aggr) { this.setIntent('retreat', rand(0.3, 0.5)); }
      }
    } else if (opp.state !== 'attack') {
      this._reacted = false;
    }

    // ---- 周期决策 ----
    this.nextThink -= dt;
    if (this.nextThink <= 0 && this.intent !== 'attackChain') {
      this.nextThink = this.react * rand(0.7, 1.4);
      this.decide(self, opp, dist, dirToOpp);
    }

    // ---- 执行意图 ----
    switch (this.intent) {
      case 'approach':
        c.moveX = dirToOpp * (dist > 320 ? 1 : 0.62);
        c.block = false;
        break;
      case 'retreat':
        c.moveX = -dirToOpp * 0.8;
        c.block = false;
        break;
      case 'block':
        c.moveX = 0;
        c.block = true;
        if (this.intentT <= 0) c.block = false;
        break;
      case 'jumpIn':
        c.moveX = dirToOpp;
        if (!this._jumped && self.onGround) { c.jump = true; this._jumped = true; }
        if (!self.onGround && dist < 150 && !this._airAttacked) {
          // 空中攻击：近身过顶 50% 概率改用速降践踏（踩背）
          if (Math.abs(self.x - opp.x) < 60 && Math.random() < 0.5) { c.crouch = true; c.kick = true; }
          else c.kick = true;
          this._airAttacked = true;
        }
        if (self.onGround && this._jumped) { this._jumped = false; this._airAttacked = false; this.setIntent('idle', 0.1); }
        break;
      case 'attackChain':
        c.moveX = 0;
        if (self.state !== 'attack' && self.state !== 'special') {
          if (this.chainLeft > 0 && this.chainNext <= 0) {
            // 交替出拳/踢，偶发升龙与扫腿；连段起手概率前推出冲拳/踏踢
            var r = Math.random();
            if (this._chainStart && r < 0.18 * this.combo) { c.crouch = true; c.punch = true; }       // 升龙
            else if (r < 0.3 * this.combo) { c.kick = true; }                                        // 踢
            else { c.punch = true; }
            if (this._chainStart && dist > 150 && Math.random() < 0.35 * this.aggr) c.moveX = dirToOpp; // 冲拳/踏踢起手
            this._chainStart = false;
            this.chainLeft--;
            this.chainNext = rand(0.12, 0.3);
          }
          this.chainNext -= dt;
          if (this.chainLeft <= 0) {
            this.setIntent(Math.random() < 0.35 ? 'retreat' : 'idle', rand(0.2, 0.5));
          }
        }
        break;
      case 'specialNow':
        c.moveX = 0;
        c.special = true;
        this.setIntent('idle', 0.2);
        break;
      default: // idle
        c.moveX = 0;
        c.block = false;
        // 保持面向但小幅调整站位
        if (dist > 420) this.setIntent('approach', 1);
        break;
    }

    // 能量满 → 高概率必杀
    if (self.energy >= SF.config.MAX_ENERGY && self.onGround && this.intent !== 'specialNow' &&
        Math.random() < this.aggr * dt * 4) {
      this.setIntent('specialNow', 0.3);
    }
  };

  AIController.prototype.decide = function (self, opp, dist, dirToOpp) {
    // 对手倒地 → 后撤蓄势或接近压起身
    if (opp.state === 'down' || opp.state === 'getup') {
      this.setIntent(Math.random() < 0.5 ? 'retreat' : 'approach', rand(0.4, 0.8));
      return;
    }
    if (dist > 300) {
      var r = Math.random();
      if (r < 0.18 * this.aggr) this.setIntent('jumpIn', 1.2);
      else this.setIntent('approach', rand(0.5, 1.1));
      return;
    }
    if (dist > 140) {
      if (Math.random() < this.aggr) this.setIntent('approach', rand(0.3, 0.6));
      else this.setIntent(Math.random() < 0.4 ? 'retreat' : 'idle', rand(0.3, 0.6));
      return;
    }
    // 近距离
    if (Math.random() < this.aggr) {
      this.setIntent('attackChain', rand(0.8, 1.6));
      this.chainLeft = Math.random() < this.combo ? 2 + Math.floor(Math.random() * 2) : 1;
      this.chainNext = 0;
      this._chainStart = true;
    } else if (Math.random() < this.guard) {
      this.setIntent('block', rand(0.4, 0.8));
    } else {
      this.setIntent('retreat', rand(0.3, 0.6));
    }
  };

  AIController.prototype.setIntent = function (name, dur) {
    this.intent = name;
    this.intentT = dur || 0.5;
  };

  SF.AIController = AIController;
})();
