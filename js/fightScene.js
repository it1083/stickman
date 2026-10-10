/**
 * fightScene.js — 战斗场景（闯关/生存）+ 结算场景
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var CFG = SF.config;

  function playerSkin() {
    var id = SF.storage.get('usedSkin');
    for (var i = 0; i < CFG.SKINS.length; i++) if (CFG.SKINS[i].id === id) return CFG.SKINS[i];
    return CFG.SKINS[0];
  }

  // ================================================================ 战斗场景
  function FightScene(opts) {
    SF.Scene.call(this);
    this.mode = opts.mode;                       // 'level' | 'survival'
    this.levelIndex = opts.levelIndex || 0;
    this.wave = opts.startWave || 1;
    this.paused = false;
    this.reviving = false;
    this.setupFight(true);
    this.makeButtons();
  }
  FightScene.prototype = Object.create(SF.Scene.prototype);

  FightScene.prototype.makeButtons = function () {
    var self = this;
    this.pauseBtn = new SF.ui.Button({ x: 1284, y: 52, w: 70, h: 56, label: '❙❙', color: '#5a606e' });
    this.pauseBtn.onTap = function () { self.paused = true; SF.audio.stopBGM(); };

    this.btnResume = new SF.ui.Button({ x: 667, y: 300, w: 300, h: 80, label: '继 续', color: '#3f9f5f' });
    this.btnResume.onTap = function () { self.paused = false; SF.audio.startBGM(); };
    this.btnRestart = new SF.ui.Button({ x: 667, y: 400, w: 300, h: 80, label: '重新开始', color: '#3f7fd9' });
    this.btnRestart.onTap = function () {
      SF.SceneManager.replace(new FightScene({ mode: self.mode, levelIndex: self.levelIndex, startWave: 1 }));
    };
    this.btnQuit = new SF.ui.Button({ x: 667, y: 500, w: 300, h: 80, label: '退出战斗', color: '#b05a4a' });
    this.btnQuit.onTap = function () { SF.SceneManager.replace(new SF.MenuScene()); };

    this.btnRevive = new SF.ui.Button({ x: 667, y: 360, w: 420, h: 88, label: '📺 满血复活', sub: '观看广告，满血再战！', color: '#e07830' });
    this.btnRevive.onTap = function () {
      SF.Ad.showRewarded(function () {
        self.player.hp = self.player.maxHp;
        self.player.energy = 60;
        self.reviving = false;
        self.state = 'intro';
        self.introT = 0.4;
        // 全部存活敌人被震退
        for (var i = 0; i < self.enemies.length; i++) {
          var en = self.enemies[i];
          if (!en.alive()) continue;
          en.setState('hitStun');
          en.hitStun = 0.6;
          en.vx = (en.x < self.player.x ? -1 : 1) * 380;
        }
        SF.fx.flash('#7ee0ff', 0.5, 0.4);
        SF.audio.startBGM();
      }, function (msg) {
        self.toast = msg || '未完成观看，无法复活';
      });
    };
    this.btnGiveUp = new SF.ui.Button({ x: 667, y: 470, w: 420, h: 70, label: '放弃 · 结算', color: '#7a8a99' });
    this.btnGiveUp.onTap = function () { self.finishSurvival(); };
  };

  FightScene.prototype.setupFight = function (first) {
    var skin = playerSkin();
    if (first || !this.player) {
      this.player = new SF.Fighter({
        isPlayer: true, x: 400, facing: 1,
        color: skin.color, headColor: skin.headColor
      });
    }
    this.enemies = this.makeEnemies();
    this.player.x = 400;
    this.player.facing = 1;
    this.enemy = this.enemies[0];   // HUD/复活逻辑引用：最近存活敌人（每帧刷新）
    // 波次复用玩家实体时重置行动状态（防止残留 victory/attack 卡死）
    this.player.setState('idle');
    this.player.stateT = 0;
    this.player.queuedNext = null;
    this.player.comboStep = 0;
    this.player.invuln = false;
    this.player.bodyRot = 0;
    this.player.hitCombo = 0;

    this.state = 'intro';
    this.introT = 0;
    this.endT = 0;
    this.waveEndT = 0;
    this.timer = CFG.ROUND_TIME;
    this.dispHpP = 1; this.dispHpE = 1;
    this.energyFullFlag = false;
    this.toast = null;
    this.dealtOnStart = this.player.dealtTotal || 0;
  };

  FightScene.prototype.makeEnemies = function () {
    if (this.mode === 'level') {
      var e = CFG.LEVELS[this.levelIndex].enemy;
      return [new SF.Fighter({
        x: 934, facing: -1, name: CFG.LEVELS[this.levelIndex].name,
        hp: e.hp, atk: e.atk, spd: e.spd, scale: e.scale,
        color: e.skin, headColor: '#fff',
        ai: new SF.AIController({ aggr: e.aggr, react: e.react, guard: e.guard, combo: 0.3 + e.aggr * 0.4 })
      })];
    }
    // 生存波次：敌人数随波次叠加（第 n 波 min(2n, 上限) 个，Boss 波 1 精英 + 2 小兵）
    var n = this.wave - 1;
    var SUR = CFG.SURVIVAL;
    var skins = ['#d9843f', '#8f6f4f', '#3f7fd9', '#6f4f9f', '#7a8a99', '#c9c9c9', '#d43f3d', '#2ecc71'];
    var isBoss = this.wave % 5 === 0;
    var count = isBoss ? 3 : Math.min(2 * this.wave, SUR.maxEnemies);
    // 人多时单个敌人打折（连续衰减，不按人数均分），总威胁随波增长但不爆炸
    var hpFactor = 1 / (1 + (count - 1) * 0.12);
    var hpPer = Math.round((SUR.baseHp + SUR.hpGrow * n) * hpFactor);
    var atkPer = Math.max(0.5, (0.85 + SUR.atkGrow * n) * (count >= 5 ? 0.68 : count >= 3 ? 0.82 : 1));
    var spd = Math.min(1.25, 0.9 + n * 0.02);
    var aggrBase = Math.min(0.92, 0.5 + n * 0.03) * (count >= 5 ? 0.6 : count >= 3 ? 0.78 : 1);
    var spots = [934, 1100, 200, 360, 790, 1230, 520, 650];   // 右侧为主、后续两翼包抄
    var list = [];
    for (var i = 0; i < count; i++) {
      var elite = isBoss && i === 0;
      var aggr = Math.max(0.15, Math.min(0.92, aggrBase + (Math.random() - 0.5) * 0.16));
      var ex = spots[i % spots.length] + (i >= spots.length ? 40 : 0);
      list.push(new SF.Fighter({
        x: ex, facing: ex > 400 ? -1 : 1,
        name: elite ? 'BOSS · 第 ' + this.wave + ' 波' : '第 ' + this.wave + ' 波',
        hp: elite ? Math.round(hpPer * 2.4) : hpPer,
        atk: elite ? atkPer * 1.3 : atkPer,
        spd: spd, scale: elite ? 1.22 : 0.92 + Math.random() * 0.14,
        color: elite ? '#d43f3d' : skins[(this.wave - 1 + i) % skins.length], headColor: '#fff',
        ai: new SF.AIController({
          aggr: elite ? Math.min(0.92, aggrBase + 0.2) : aggr,
          react: Math.max(0.18, 0.5 - n * 0.02), guard: Math.min(0.5, 0.12 + n * 0.02),
          combo: Math.min(0.8, 0.3 + n * 0.04)
        })
      }));
    }
    return list;
  };

  /** 最近存活敌人（HUD 显示 / 玩家自动面向目标） */
  FightScene.prototype.nearestEnemy = function () {
    var best = null, bd = Infinity;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive()) continue;
      var d = Math.abs(e.x - this.player.x);
      if (d < bd) { bd = d; best = e; }
    }
    return best || this.enemies[0];
  };

  FightScene.prototype.aliveEnemyCount = function () {
    var c = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive()) c++;
    return c;
  };

  FightScene.prototype.onEnter = function () {
    SF.Ad.hideBanner();
    SF.input.enabled = true;
    SF.fx.clear();
    SF.audio.startBGM();
  };
  FightScene.prototype.onExit = function () {
    SF.input.enabled = false;
    SF.audio.stopBGM();
  };

  // ---------------------------------------------------------------- 更新
  FightScene.prototype.update = function (dt) {
    SF.Scene.prototype.update.call(this, dt);
    if (this.toast) { this.toastT = (this.toastT || 0) + dt; if (this.toastT > 2) { this.toast = null; this.toastT = 0; } }
    if (this.paused || this.reviving) return;

    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT >= 1.5) this.state = 'fight';
      return;
    }
    if (this.state === 'waveEnd') {
      this.waveEndT += dt;
      if (this.waveEndT >= 1.4) {
        // 波次结算回血 + 生成新敌
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + CFG.SURVIVAL.healPerWave);
        this.player.energy = Math.min(CFG.MAX_ENERGY, this.player.energy + 20);
        this.wave++;
        this.setupFight(false);
      }
      return;
    }
    if (this.state === 'end') {
      this.endT += dt;
      this.updateFighters(dt);
      if (this.endT >= 2.6) this.resolveEnd();
      return;
    }

    // ---- 战斗中 ----
    if (this.mode === 'level') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        var pR = this.player.getHpRatio(), eR = this.enemy.getHpRatio();
        this.winner = pR >= eR ? this.player : this.enemy;
        this.state = 'end';
        SF.audio.play(this.winner === this.player ? 'win' : 'ko');
        return;
      }
    }

    this.updateFighters(dt);

    // 能量满提示
    if (this.player.energy >= CFG.MAX_ENERGY && !this.energyFullFlag) {
      this.energyFullFlag = true;
      SF.audio.play('energyFull');
    } else if (this.player.energy < CFG.MAX_ENERGY) this.energyFullFlag = false;
    SF.input.specialReady = this.player.energy >= CFG.MAX_ENERGY;
  };

  FightScene.prototype.updateFighters = function (dt) {
    var p = this.player;
    this.enemy = this.nearestEnemy();          // HUD/面向目标刷新
    p.update(dt, this.enemy);
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      e.update(dt, p);
      if (e.state === 'attack') e.tryHit(p);
      if (p.state === 'attack') p.tryHit(e);   // 必杀由 fighter 内部按 specialHitTime 驱动（含终结段倍率）
      p.pushApart(e, dt);
    }
    // 敌人之间互相推挤（避免叠成一团）
    for (var a = 0; a < this.enemies.length; a++) {
      for (var b = a + 1; b < this.enemies.length; b++) {
        this.enemies[a].pushApart(this.enemies[b], dt);
      }
    }

    // KO 检测：闯关看单敌；生存看全灭
    if (this.state === 'fight') {
      if (!p.alive()) {
        this.winner = this.enemy;
        this.state = 'end';
        this.endT = 0;
        if (p.state !== 'launched' && p.state !== 'down') {
          p.enterKO(null, this.enemy, p.x >= this.enemy.x ? 1 : -1);
        }
      } else if (this.mode === 'level' ? !this.enemy.alive() : this.aliveEnemyCount() === 0) {
        this.winner = p;
        this.state = 'end';
        this.endT = 0;
        for (var k = 0; k < this.enemies.length; k++) {
          var loser = this.enemies[k];
          if (!loser.alive() && loser.state !== 'launched' && loser.state !== 'down') {
            loser.enterKO(null, p, loser.x >= p.x ? 1 : -1);
          }
        }
        if (this.mode === 'level') {
          this.winner.setState('victory');
          SF.audio.play('win');
        }
      }
    }
  };

  FightScene.prototype.resolveEnd = function () {
    var p = this.player, e = this.enemy;
    if (this.mode === 'level') {
      var win = this.winner === p;
      var stars = 0, reward = 0;
      if (win) {
        var hpR = p.getHpRatio();
        stars = hpR >= 0.7 ? 3 : hpR >= 0.4 ? 2 : 1;
        var lv = CFG.LEVELS[this.levelIndex];
        reward = Math.round(lv.reward * (stars === 3 ? 1.2 : 1));
        // 解锁 + 存星
        if (SF.storage.get('unlockedLevel') < this.levelIndex + 2) {
          SF.storage.set('unlockedLevel', Math.min(CFG.LEVELS.length, this.levelIndex + 2));
        }
        var starsMap = SF.storage.get('stars');
        var id = CFG.LEVELS[this.levelIndex].id;
        if ((starsMap[id] || 0) < stars) { starsMap[id] = stars; SF.storage.set('stars', starsMap); }
      } else {
        reward = Math.round(CFG.LEVELS[this.levelIndex].reward * 0.3);
      }
      SF.SceneManager.replace(new ResultScene({
        mode: 'level', win: win, levelIndex: this.levelIndex, stars: stars,
        reward: reward, dealt: p.dealtTotal - this.dealtOnStart,
        timeUsed: Math.round(CFG.ROUND_TIME - this.timer)
      }));
    } else {
      // 生存：敌人全灭 → 下一波；玩家死 → 复活面板
      if (this.aliveEnemyCount() === 0) {
        this.state = 'waveEnd';
        this.waveEndT = 0;
        SF.audio.play('coin');
      } else {
        this.reviving = true;
        SF.audio.stopBGM();
      }
    }
  };

  FightScene.prototype.finishSurvival = function () {
    var waves = this.wave - 1;
    var reward = waves * CFG.SURVIVAL.rewardPerWave;
    var best = SF.storage.get('bestWave') || 0;
    if (waves > best) SF.storage.set('bestWave', waves);
    SF.SceneManager.replace(new ResultScene({
      mode: 'survival', win: waves > 0, wave: waves,
      reward: reward, dealt: this.player.dealtTotal - this.dealtOnStart
    }));
  };

  // ---------------------------------------------------------------- 触摸
  FightScene.prototype.onTap = function (x, y) {
    if (this.reviving) {
      if (this.btnRevive.contains(x, y)) { this.btnRevive.tap(); return true; }
      if (this.btnGiveUp.contains(x, y)) { this.btnGiveUp.tap(); return true; }
      return true; // 复活面板期间吞掉其他点击
    }
    if (this.paused) {
      if (this.btnResume.contains(x, y)) { this.btnResume.tap(); return true; }
      if (this.btnRestart.contains(x, y)) { this.btnRestart.tap(); return true; }
      if (this.btnQuit.contains(x, y)) { this.btnQuit.tap(); return true; }
      return true;
    }
    if (this.pauseBtn.contains(x, y)) { this.pauseBtn.tap(); return true; }
    return false; // 战斗中其他点击交给摇杆/按钮（input 模块处理）
  };

  // ---------------------------------------------------------------- 绘制
  FightScene.prototype.draw = function (ctx) {
    var theme = this.mode === 'level' ? CFG.LEVELS[this.levelIndex].bg :
      (this.wave % 5 === 0 ? 'volcano' : CFG.SURVIVAL.themes[(this.wave - 1) % CFG.SURVIVAL.themes.length]);
    SF.bg.draw(ctx, theme, this.time);

    var shake = SF.fx.getShake();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // 角色（y 排序：玩家 + 全部敌人）
    var fighters = [this.player].concat(this.enemies);
    fighters.sort(function (a, b) { return a.y - b.y; });
    for (var fi = 0; fi < fighters.length; fi++) fighters[fi].draw(ctx);
    // 生存模式多敌人：每个敌人头顶小血条（白=缓降、红=当前，金框=当前主敌）
    if (this.mode === 'survival' && this.enemies.length > 1) this.drawEnemyTagBars(ctx);
    SF.fx.draw(ctx);
    ctx.restore();

    this.drawHUD(ctx);
    SF.input.draw(ctx);
    this.drawAnnounce(ctx);

    if (this.toast) {
      SF.ui.drawPanel(ctx, 400, 340, 534, 70, 0.85);
      SF.ui.drawText(ctx, this.toast, 667, 375, 24, '#fff');
    }

    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, 1334, 750);
      SF.ui.drawBigText(ctx, '暂 停', 667, 200, 64, '#fff');
      this.btnResume.draw(ctx);
      this.btnRestart.draw(ctx);
      this.btnQuit.draw(ctx);
    }

    if (this.reviving) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, 1334, 750);
      SF.ui.drawBigText(ctx, '你 被 击 倒 了', 667, 210, 60, '#ff5d3d');
      SF.ui.drawText(ctx, '当前坚持到第 ' + this.wave + ' 波', 667, 270, 26, 'rgba(255,255,255,0.8)');
      this.btnRevive.draw(ctx);
      this.btnGiveUp.draw(ctx);
      this.btnGiveUp.label = '放弃 · 领取 ' + (this.wave - 1) * CFG.SURVIVAL.rewardPerWave + ' 金币';
    }
  };

  FightScene.prototype.drawHUD = function (ctx) {
    var p = this.player, e = this.enemy;
    // 血条缓降
    this.dispHpP += (p.getHpRatio() - this.dispHpP) * 0.06;
    this.dispHpE += (e.getHpRatio() - this.dispHpE) * 0.06;

    SF.ui.drawHealthBar(ctx, 60, 40, 520, 30, '你', p.getHpRatio(), this.dispHpP, p.getEnergyRatio(), false);
    // 生存模式多敌人：显示最近敌人血条 + 剩余数量角标
    var eName = e.name.split(' · ')[0];
    if (this.mode === 'survival' && this.enemies.length > 1) {
      eName += ' ×' + this.aliveEnemyCount();
    }
    SF.ui.drawHealthBar(ctx, 754, 40, 520, 30, eName, e.getHpRatio(), this.dispHpE, e.getEnergyRatio(), true);

    // 计时 / 波次
    if (this.mode === 'level') {
      var t = Math.ceil(this.timer);
      var urgent = t <= 10 && this.state === 'fight';
      SF.ui.drawBigText(ctx, String(t), 667, 62, urgent ? 52 + Math.sin(this.time * 10) * 5 : 46, urgent ? '#ff5d3d' : '#fff');
      SF.ui.drawText(ctx, CFG.LEVELS[this.levelIndex].name, 667, 108, 20, 'rgba(255,255,255,0.8)');
    } else {
      SF.ui.drawBigText(ctx, 'WAVE ' + this.wave, 667, 58, 38, '#ffd24d');
      SF.ui.drawText(ctx, '最高纪录 · 第 ' + (SF.storage.get('bestWave') || 0) + ' 波', 667, 104, 18, 'rgba(255,255,255,0.7)');
    }

    // 连击
    if (p.hitCombo >= 2 && p.comboTimer > 0) {
      var pop = Math.min(1, (0.9 - p.comboTimer) * 8);
      var size = 40 + Math.min(18, p.hitCombo * 2) * pop;
      ctx.save();
      ctx.translate(180, 300);
      ctx.rotate(-0.08);
      SF.ui.drawBigText(ctx, p.hitCombo + ' 连击!', 0, 0, size, '#ffd24d', 7);
      ctx.restore();
    }

    // 浏览器环境：开场 14 秒内显示键盘操作提示
    if (!SF.IS_WX && this.time < 14) {
      ctx.save();
      ctx.globalAlpha = this.time > 12 ? (14 - this.time) / 2 : 0.75;
      SF.ui.drawText(ctx, '键盘：←→/AD 移动 · ↑/W/空格 跳 · ↓/S 蹲 · J 拳 · K 踢 · L/Shift 防御 · U 必杀',
        667, 572, 20, '#dfe8f4');
      SF.ui.drawText(ctx, '进阶：前推方向+J 冲拳 / 前推方向+K 踏踢 · 蹲+J 升龙拳 · 连按 J 三段连招',
        667, 602, 18, '#b8c6d8');
      ctx.restore();
    }

    this.pauseBtn.draw(ctx);
  };

  // 生存模式多敌人：每个存活敌人头顶的小血条（区分度用：金框 = 顶部大血条对应的最近敌人）
  FightScene.prototype.drawEnemyTagBars = function (ctx) {
    for (var i = 0; i < this.enemies.length; i++) {
      var en = this.enemies[i];
      if (!en.alive()) continue;
      if (en._tagHp === undefined) en._tagHp = en.getHpRatio();
      en._tagHp += (en.getHpRatio() - en._tagHp) * 0.18; // 掉血缓降
      var cur = Math.max(0, en.getHpRatio());
      var bw = 64 * en.scale, bh = 6;
      var bx = Math.round(en.x - bw / 2), by = Math.round(en.y - 140 * en.scale);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';          // 缓降层（刚被打掉的血）
      ctx.fillRect(bx, by, bw * en._tagHp, bh);
      ctx.fillStyle = cur > 0.35 ? '#ff5d3d' : '#ffb02e'; // 当前血量
      ctx.fillRect(bx, by, bw * cur, bh);
      if (en === this.enemy) {                            // 当前主敌金框标识
        ctx.strokeStyle = '#ffd24d';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - 2.5, by - 2.5, bw + 5, bh + 5);
      }
      ctx.restore();
    }
  };

  FightScene.prototype.drawAnnounce = function (ctx) {
    if (this.state === 'intro') {
      if (this.introT < 0.8) {
        var s1 = Math.min(1, this.introT * 5);
        ctx.save();
        ctx.translate(667, 340);
        ctx.scale(s1, s1);
        if (this.mode === 'survival') SF.ui.drawBigText(ctx, 'WAVE ' + this.wave, 0, 0, 84, '#ffd24d');
        else SF.ui.drawBigText(ctx, 'ROUND 1', 0, 0, 84, '#fff');
        ctx.restore();
      } else {
        var s2 = Math.min(1, (this.introT - 0.8) * 6);
        var a = this.introT > 1.3 ? 1 - (this.introT - 1.3) * 4 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(667, 340);
        ctx.scale(1 + (1 - s2) * 0.8, 1 + (1 - s2) * 0.8);
        SF.ui.drawBigText(ctx, 'FIGHT!', 0, 0, 110, '#ff5d3d', 12);
        ctx.restore();
      }
    }
    if (this.state === 'end' && this.endT < 2.0) {
      var a2 = this.endT < 1.6 ? 1 : 1 - (this.endT - 1.6) * 2.5;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a2);
      if (this.winner === this.player) SF.ui.drawBigText(ctx, 'K.O.', 667, 330, 130, '#ffd24d', 14);
      else SF.ui.drawBigText(ctx, 'K.O.', 667, 330, 130, '#ff5d3d', 14);
      ctx.restore();
    }
    if (this.state === 'waveEnd') {
      var s3 = Math.min(1, this.waveEndT * 4);
      ctx.save();
      ctx.translate(667, 330);
      ctx.scale(s3, s3);
      SF.ui.drawBigText(ctx, 'WAVE ' + this.wave + ' CLEAR!', 0, 0, 66, '#7ee0ff', 10);
      ctx.restore();
    }
  };

  // ================================================================ 结算场景
  function ResultScene(data) {
    SF.Scene.call(this);
    this.data = data;
    var self = this;
    this.doubled = false;
    this.coinAnim = 0;

    // 发放奖励
    SF.storage.addCoins(data.reward);
    if (data.reward > 0) this.pendingShowCoin = true;

    var isLevel = data.mode === 'level';
    this.btnAd = new SF.ui.Button({
      x: 667, y: 300, w: 420, h: 80,
      label: '📺 奖励翻倍', sub: '观看视频，再得 ' + data.reward + ' 金币',
      color: '#e07830', disabled: data.reward <= 0
    });
    this.btnAd.onTap = function () {
      if (self.doubled || data.reward <= 0) return;
      SF.Ad.showRewarded(function () {
        SF.storage.addCoins(data.reward);
        self.doubled = true;
        self.btnAd.label = '✓ 已翻倍';
        self.btnAd.disabled = true;
        SF.audio.play('coin');
      }, function (msg) { self.toast = msg || '未完成观看'; });
    };

    if (isLevel) {
      if (data.win) {
        var hasNext = data.levelIndex < CFG.LEVELS.length - 1;
        this.btnMain = new SF.ui.Button({ x: 667, y: 415, w: 420, h: 78, label: hasNext ? '下一关 ▶' : '返回选关', color: '#e7553c' });
        this.btnMain.onTap = function () {
          if (hasNext) SF.SceneManager.replace(new SF.FightScene({ mode: 'level', levelIndex: data.levelIndex + 1 }));
          else SF.SceneManager.replace(new SF.LevelSelectScene());
        };
      } else {
        this.btnMain = new SF.ui.Button({ x: 667, y: 415, w: 420, h: 78, label: '再 战', color: '#e7553c' });
        this.btnMain.onTap = function () { SF.SceneManager.replace(new SF.FightScene({ mode: 'level', levelIndex: data.levelIndex })); };
      }
    } else {
      this.btnMain = new SF.ui.Button({ x: 667, y: 415, w: 420, h: 78, label: '再 次 挑 战', color: '#e7553c' });
      this.btnMain.onTap = function () { SF.SceneManager.replace(new SF.FightScene({ mode: 'survival' })); };
    }
    this.btnMenu = new SF.ui.Button({ x: 667, y: 508, w: 420, h: 68, label: '返回主菜单', color: '#7a8a99' });
    this.btnMenu.onTap = function () { SF.SceneManager.replace(new SF.MenuScene()); };
    this.btnShare = new SF.ui.Button({ x: 667, y: 590, w: 420, h: 62, label: '炫耀一下 · 分享', color: '#3f9f5f' });
    this.btnShare.onTap = function () {
      var msg = isLevel ?
        (data.win ? '我在火柴人格斗打败了「' + CFG.LEVELS[data.levelIndex].name + '」，快来挑战！' : '火柴人格斗太刺激了，来试试你能打几关！') :
        '我在火柴人格斗生存模式坚持了 ' + data.wave + ' 波，你能超过我吗？';
      SF.adapter.share(msg);
    };
    this.buttons = [this.btnAd, this.btnMain, this.btnMenu, this.btnShare];
  }
  ResultScene.prototype = Object.create(SF.Scene.prototype);

  ResultScene.prototype.onEnter = function () { SF.Ad.showBanner(); };

  ResultScene.prototype.update = function (dt) {
    SF.Scene.prototype.update.call(this, dt);
    this.coinAnim += dt;
    if (this.toast) { this.toastT = (this.toastT || 0) + dt; if (this.toastT > 2) { this.toast = null; this.toastT = 0; } }
    if (this.pendingShowCoin && this.coinAnim > 0.5) {
      this.pendingShowCoin = false;
      SF.audio.play('coin');
    }
  };

  ResultScene.prototype.draw = function (ctx) {
    var d = this.data;
    var theme = d.mode === 'level' ? CFG.LEVELS[d.levelIndex].bg : 'night';
    SF.bg.draw(ctx, theme, this.time);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, 1334, 750);

    var pop = Math.min(1, this.time * 3);
    ctx.save();
    ctx.translate(667, 140);
    ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
    if (d.mode === 'level') {
      SF.ui.drawBigText(ctx, d.win ? '胜 利 !' : '惜 败', 0, 0, 92, d.win ? '#ffd24d' : '#8a99aa', 12);
    } else {
      SF.ui.drawBigText(ctx, '坚持 ' + d.wave + ' 波', 0, 0, 84, '#7ee0ff', 12);
    }
    ctx.restore();

    var lines = [];
    if (d.mode === 'level') {
      lines.push('对手：' + CFG.LEVELS[d.levelIndex].name);
      if (d.win) {
        var starStr = '';
        for (var i = 0; i < 3; i++) starStr += i < d.stars ? '★' : '☆';
        lines.push('评价：' + starStr);
      }
      lines.push('用时：' + d.timeUsed + ' 秒');
    } else {
      lines.push('最高纪录：第 ' + (SF.storage.get('bestWave') || 0) + ' 波');
    }
    lines.push('总输出伤害：' + d.dealt);
    lines.push('金币奖励：+' + d.reward + (this.doubled ? ' (已翻倍 +' + d.reward + ')' : ''));

    SF.ui.drawPanel(ctx, 467, 190, 400, 36 + lines.length * 34, 0.8);
    for (var li = 0; li < lines.length; li++) {
      SF.ui.drawText(ctx, lines[li], 667, 230 + li * 34, 23, li === lines.length - 1 ? '#ffd24d' : 'rgba(255,255,255,0.9)');
    }

    for (var b = 0; b < this.buttons.length; b++) this.buttons[b].draw(ctx);
    SF.ui.drawCoins(ctx, SF.storage.get('coins'), 60, 60);

    if (this.toast) {
      SF.ui.drawPanel(ctx, 400, 660, 534, 60, 0.85);
      SF.ui.drawText(ctx, this.toast, 667, 690, 22, '#fff');
    }
  };

  SF.FightScene = FightScene;
  SF.ResultScene = ResultScene;
})();
