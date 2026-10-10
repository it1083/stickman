/**
 * main.js — 游戏主循环与视图变换
 * 设计分辨率 1334x750，等比缩放居中（letterbox 黑边）。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  // 视图变换：屏幕逻辑像素 ↔ 设计像素
  SF.view = {
    w: 0, h: 0,        // 屏幕逻辑尺寸
    scale: 1, ox: 0, oy: 0,
    toDesign: function (sx, sy) {
      return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
    }
  };

  var lastTime = 0;

  function computeView() {
    var size = SF.adapter.getWinSize();
    var view = SF.view;
    view.w = size.w; view.h = size.h;
    var s = Math.min(size.w / SF.config.DESIGN_W, size.h / SF.config.DESIGN_H);
    view.scale = s;
    view.ox = (size.w - SF.config.DESIGN_W * s) / 2;
    view.oy = (size.h - SF.config.DESIGN_H * s) / 2;
  }

  function frame(t) {
    var canvas = SF.adapter.getCanvas();
    var ctx = SF.adapter.getCtx();
    var dpr = SF.adapter.getWinSize().dpr;

    if (SF.adapter.resizeIfNeeded()) computeView();

    // 真实 dt：非正/超限（首帧时间戳基准不同、切后台跳帧）一律回退固定步长
    var dtReal = (t - lastTime) / 1000;
    if (!(dtReal > 0) || dtReal > 0.05) dtReal = 0.016;
    lastTime = t;

    // 特效/慢动作（内部自行处理 timeScale）
    SF.fx.update(dtReal);
    var dt = dtReal * SF.fx.getTimeScale();

    // 更新场景
    SF.SceneManager.update(dt);

    // ---- 绘制 ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SF.view.w, SF.view.h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(SF.view.ox, SF.view.oy);
    ctx.scale(SF.view.scale, SF.view.scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SF.config.DESIGN_W, SF.config.DESIGN_H);
    ctx.clip();
    SF.SceneManager.draw(ctx);
    SF.fx.drawFlash(ctx);
    ctx.restore();

    requestAnimationFrame(frame);
  }

  function boot() {
    SF.adapter.initCanvas();
    computeView();
    SF.adapter.bindTouch();

    // 菜单点击（start 事件）
    SF.adapter.onTouch(function (type, touches) {
      if (type !== 'start' || !touches.length) return;
      var p = SF.view.toDesign(touches[0].x, touches[0].y);
      SF.SceneManager.onTap(p.x, p.y);
    });

    SF.audio.init();
    SF.Ad.init();

    // 首次触摸恢复音频上下文（移动端自动播放限制）
    SF.adapter.onTouch(function (type) {
      if (type === 'start' && SF.audio.resume) SF.audio.resume();
    });

    // 开场进入主菜单
    SF.SceneManager.replace(new SF.MenuScene());

    lastTime = 0; // 首帧 dt 会走回退分支，使用固定步长
    requestAnimationFrame(frame);
  }

  SF.boot = boot;
})();
