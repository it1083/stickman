/**
 * scenes.js — 场景框架 + 主菜单 / 选关 / 皮肤商店
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var ui = function () { return SF.ui; };
  var CFG = SF.config;

  // ================================================================ 基类
  function Scene() {
    this.buttons = [];
    this.time = 0;
  }
  Scene.prototype.update = function (dt) {
    this.time += dt;
    for (var i = 0; i < this.buttons.length; i++) this.buttons[i].update(dt);
  };
  Scene.prototype.draw = function (ctx) {};
  Scene.prototype.onTap = function (x, y) {
    for (var i = 0; i < this.buttons.length; i++) {
      if (this.buttons[i].contains(x, y)) { this.buttons[i].tap(); return true; }
    }
    return false;
  };
  Scene.prototype.onEnter = function () {};
  Scene.prototype.onExit = function () {};

  // ================================================================ 管理器
  var manager = {
    stack: [],
    replace: function (scene) {
      if (this.stack.length) this.stack[this.stack.length - 1].onExit();
      this.stack = [scene];
      scene.onEnter();
    },
    push: function (scene) {
      if (this.stack.length) this.stack[this.stack.length - 1].onExit();
      this.stack.push(scene);
      scene.onEnter();
    },
    pop: function () {
      if (this.stack.length) {
        this.stack.pop().onExit();
        if (this.stack.length) this.stack[this.stack.length - 1].onEnter();
      }
    },
    current: function () { return this.stack[this.stack.length - 1]; },
    update: function (dt) { var s = this.current(); if (s) s.update(dt); },
    draw: function (ctx) { var s = this.current(); if (s) s.draw(ctx); },
    onTap: function (x, y) { var s = this.current(); return s ? s.onTap(x, y) : false; }
  };

  // ================================================================ 主菜单（墨七：无限乱斗 + 武道场）
  function MenuScene() {
    Scene.call(this);
    var self = this;
    this.btnSurvival = new SF.ui.Button({
      x: 667, y: 356, w: 400, h: 96, label: '无限乱斗', sub: '无尽波次围攻 · 最高 ' + (SF.storage.get('bestWave') || 0) + ' 波', color: '#b22c22'
    });
    this.btnSurvival.onTap = function () { manager.replace(new SF.FightScene({ mode: 'survival' })); };
    this.btnShop = new SF.ui.Button({
      x: 667, y: 484, w: 400, h: 96, label: '武 道 场', sub: '皮肤与外观', color: '#3f7fd9'
    });
    this.btnShop.onTap = function () { manager.replace(new ShopScene()); };
    this.btnSound = new SF.ui.Button({
      x: 1240, y: 60, w: 120, h: 60, label: SF.audio.isEnabled() ? '♪ 开' : '♪ 关', color: '#7a8a99'
    });
    this.btnSound.onTap = function () {
      var on = SF.audio.toggle();
      this.label = on ? '♪ 开' : '♪ 关';
    };
    this.buttons = [this.btnSurvival, this.btnShop, this.btnSound];
  }
  MenuScene.prototype = Object.create(Scene.prototype);

  MenuScene.prototype.onEnter = function () {
    SF.Ad.showBanner();
    SF.audio.stopBGM();
    this.btnSurvival.sub = '无尽波次围攻 · 最高 ' + (SF.storage.get('bestWave') || 0) + ' 波';
  };

  MenuScene.prototype.draw = function (ctx) {
    SF.bg.draw(ctx, 'ink', this.time);

    // 对峙火柴人装饰（左：玩家墨色待机，右：朱砂循环出招）
    var sk = SF.skeleton;
    ctx.save();
    ctx.translate(240, 560);
    ctx.scale(1.35, 1.35);
    sk.drawStickman(ctx, sk.GUARD, { color: this.playerColor(), headColor: '#e8f4ff', lineWidth: 9 });
    ctx.restore();
    ctx.save();
    ctx.translate(1094, 560);
    ctx.scale(-1.35, 1.35);
    var t = (this.time % 2.4) / 2.4;
    var clip = t < 0.5 ? sk.CLIPS.jab : sk.CLIPS.hook;
    var p = t < 0.5 ? sk.sampleClip(clip, (t % 0.5) / 0.5) : sk.sampleClip(clip, (t - 0.5) / 0.5);
    sk.drawStickman(ctx, p, { color: '#b22c22', headColor: '#ffe8e8', lineWidth: 9 });
    ctx.restore();

    // 标题（墨七：墨字主标 + 朱砂点缀）
    ctx.save();
    ctx.translate(667, 118);
    ctx.rotate(-0.02);
    SF.ui.drawBigText(ctx, '墨七火柴人', 0, 0, 88, '#22242c', 10);
    SF.ui.drawBigText(ctx, '无 限 乱 斗', 0, 74, 42, '#b22c22', 6);
    SF.ui.drawText(ctx, 'M O Q I   I N K   B R A W L', 0, 124, 20, 'rgba(40,42,50,0.55)');
    ctx.restore();

    for (var i = 0; i < this.buttons.length; i++) this.buttons[i].draw(ctx);
    SF.ui.drawCoins(ctx, SF.storage.get('coins'), 60, 60);
    SF.ui.drawText(ctx, 'v1.0', 667, 722, 18, 'rgba(40,42,50,0.4)');
  };

  MenuScene.prototype.playerColor = function () {
    var id = SF.storage.get('usedSkin');
    var skins = CFG.SKINS;
    for (var i = 0; i < skins.length; i++) if (skins[i].id === id) return skins[i].color;
    return '#3fa9f5';
  };

  // ================================================================ 皮肤商店
  function ShopScene() {
    Scene.call(this);
    var self = this;
    this.btnBack = new SF.ui.Button({ x: 110, y: 60, w: 130, h: 60, label: '← 返回', color: '#7a8a99' });
    this.btnBack.onTap = function () { SF.audio.play('uiBack'); manager.replace(new MenuScene()); };
    this.buttons = [this.btnBack];
    this.toast = null;
  }
  ShopScene.prototype = Object.create(Scene.prototype);
  ShopScene.prototype.onEnter = function () { SF.Ad.showBanner(); };

  ShopScene.prototype.onTap = function (x, y) {
    if (Scene.prototype.onTap.call(this, x, y)) return true;
    var skins = CFG.SKINS;
    for (var i = 0; i < skins.length; i++) {
      var c = this.cardPos(i);
      if (x > c.x - 120 && x < c.x + 120 && y > c.y - 110 && y < c.y + 110) {
        this.tryBuy(skins[i]);
        return true;
      }
    }
    return false;
  };

  ShopScene.prototype.cardPos = function (i) {
    return { x: 280 + (i % 3) * 390, y: 240 + Math.floor(i / 3) * 260 };
  };

  ShopScene.prototype.tryBuy = function (skin) {
    var owned = SF.storage.ownSkin(skin.id);
    var used = SF.storage.get('usedSkin');
    if (owned) {
      SF.storage.set('usedSkin', skin.id);
      SF.audio.play('coin');
      return;
    }
    if (skin.price === -1) {
      // 看广告解锁
      var self = this;
      SF.Ad.showRewarded(function () {
        SF.storage.addSkin(skin.id);
        SF.storage.set('usedSkin', skin.id);
        SF.audio.play('coin');
        self.toast = '已解锁「' + skin.name + '」！';
      }, function (msg) {
        self.toast = msg || '未完成观看';
      });
      return;
    }
    if (SF.storage.spendCoins(skin.price)) {
      SF.storage.addSkin(skin.id);
      SF.storage.set('usedSkin', skin.id);
      SF.audio.play('coin');
    } else {
      this.toast = '金币不足，去乱斗赚金币吧！';
      SF.audio.play('uiBack');
    }
  };

  ShopScene.prototype.update = function (dt) {
    Scene.prototype.update.call(this, dt);
    if (this.toast) {
      this.toastT = (this.toastT || 0) + dt;
      if (this.toastT > 2) { this.toast = null; this.toastT = 0; }
    }
  };

  ShopScene.prototype.draw = function (ctx) {
    SF.bg.draw(ctx, 'dojo', this.time);
    ctx.fillStyle = 'rgba(242,227,200,0.72)';
    ctx.fillRect(0, 0, 1334, 750);
    SF.ui.drawBigText(ctx, '武 道 场', 667, 70, 50, '#5a4030');
    SF.ui.drawCoins(ctx, SF.storage.get('coins'), 1220, 60);

    var used = SF.storage.get('usedSkin');
    for (var i = 0; i < CFG.SKINS.length; i++) {
      var skin = CFG.SKINS[i];
      var c = this.cardPos(i);
      var owned = SF.storage.ownSkin(skin.id);
      var isUsed = used === skin.id;
      ctx.save();
      ui().roundRect(ctx, c.x - 120, c.y - 110, 240, 220, 18);
      ctx.fillStyle = isUsed ? 'rgba(90,160,90,0.25)' : 'rgba(255,255,255,0.75)';
      ctx.fill();
      ctx.lineWidth = isUsed ? 4 : 2;
      ctx.strokeStyle = isUsed ? '#3f9f5f' : 'rgba(120,90,60,0.4)';
      ctx.stroke();

      // 皮肤火柴人
      ctx.save();
      ctx.translate(c.x, c.y + 30);
      ctx.scale(0.85, 0.85);
      var pose = SF.skeleton.P();
      pose.aF = [95, 10]; pose.aB = [30, 100]; pose.lean = 6; // 展示姿势（前手前平举）
      SF.skeleton.drawStickman(ctx, pose, { color: skin.color, headColor: skin.headColor, lineWidth: 9 });
      ctx.restore();

      SF.ui.drawText(ctx, skin.name, c.x, c.y - 78, 24, '#3a2a1a');
      var label = isUsed ? '使用中' : owned ? '点击佩戴' :
        skin.price === -1 ? '📺 广告解锁' : '💰 ' + skin.price;
      SF.ui.drawText(ctx, label, c.x, c.y + 86, 20,
        isUsed ? '#3f9f5f' : owned ? '#2a7ab5' : (skin.price === -1 ? '#e07830' :
          (SF.storage.get('coins') >= skin.price ? '#b8860b' : '#b05a4a')));
      ctx.restore();
    }

    this.btnBack.draw(ctx);
    if (this.toast) {
      SF.ui.drawPanel(ctx, 400, 340, 534, 70, 0.85);
      SF.ui.drawText(ctx, this.toast, 667, 375, 24, '#fff');
    }
  };

  SF.Scene = Scene;
  SF.SceneManager = manager;
  SF.MenuScene = MenuScene;
  SF.ShopScene = ShopScene;
})();
