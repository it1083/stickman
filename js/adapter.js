/**
 * adapter.js — 双环境适配层（微信小游戏 / 浏览器预览）
 * 统一封装 canvas、触摸事件、系统信息、生命周期与存储，
 * 使游戏主体代码无需关心运行环境。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var IS_WX = typeof wx !== 'undefined' && !!wx.getSystemInfoSync;

  var canvas = null;
  var ctx = null;
  var winW = 0;   // 逻辑像素宽
  var winH = 0;
  var dpr = 1;

  function initCanvas() {
    if (IS_WX) {
      canvas = wx.createCanvas();
      var info = wx.getSystemInfoSync();
      winW = info.windowWidth;
      winH = info.windowHeight;
      dpr = Math.min(info.pixelRatio || 1, 2);
    } else {
      canvas = document.getElementById('game');
      winW = window.innerWidth;
      winH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    }
    canvas.width = Math.floor(winW * dpr);
    canvas.height = Math.floor(winH * dpr);
    ctx = canvas.getContext('2d');
  }

  function resizeIfNeeded() {
    var w = IS_WX ? wx.getSystemInfoSync().windowWidth : window.innerWidth;
    var h = IS_WX ? wx.getSystemInfoSync().windowHeight : window.innerHeight;
    if (w !== winW || h !== winH) {
      winW = w; winH = h;
      canvas.width = Math.floor(winW * dpr);
      canvas.height = Math.floor(winH * dpr);
      return true;
    }
    return false;
  }

  /** 触摸事件统一为回调列表：handler({type, x, y, id})，x/y 为逻辑像素 */
  var touchHandlers = [];
  function wrapTouch(e) {
    var list = [];
    var touches = e.touches || [];
    for (var i = 0; i < touches.length; i++) {
      list.push({ id: touches[i].identifier, x: touches[i].clientX, y: touches[i].clientY });
    }
    return list;
  }
  function onTouch(handler) { touchHandlers.push(handler); }
  function dispatch(type, e) {
    var list = wrapTouch(e);
    for (var i = 0; i < touchHandlers.length; i++) touchHandlers[i](type, list);
  }
  function bindTouch() {
    if (IS_WX) {
      wx.onTouchStart(function (e) { dispatch('start', e); });
      wx.onTouchMove(function (e) { dispatch('move', e); });
      wx.onTouchEnd(function (e) { dispatch('end', e); });
      wx.onTouchCancel(function (e) { dispatch('cancel', e); });
    } else {
      var toXY = function (e) {
        return { touches: Array.prototype.slice.call(e.touches).map(function (t) {
          return { identifier: t.identifier, clientX: t.clientX, clientY: t.clientY };
        }) };
      };
      canvas.addEventListener('touchstart', function (e) { e.preventDefault(); dispatch('start', toXY(e)); }, { passive: false });
      canvas.addEventListener('touchmove', function (e) { e.preventDefault(); dispatch('move', toXY(e)); }, { passive: false });
      canvas.addEventListener('touchend', function (e) { e.preventDefault(); dispatch('end', toXY(e)); }, { passive: false });
      canvas.addEventListener('touchcancel', function (e) { e.preventDefault(); dispatch('cancel', toXY(e)); }, { passive: false });
      // 鼠标模拟（浏览器调试用）
      var mouseId = 'mouse';
      var mouseDown = false;
      function mouseXY(e) {
        return { touches: [{ identifier: mouseId, clientX: e.clientX, clientY: e.clientY }] };
      }
      canvas.addEventListener('mousedown', function (e) { mouseDown = true; dispatch('start', mouseXY(e)); });
      window.addEventListener('mousemove', function (e) { if (mouseDown) dispatch('move', mouseXY(e)); });
      window.addEventListener('mouseup', function (e) { if (mouseDown) { mouseDown = false; dispatch('end', mouseXY(e)); } });
    }
  }

  /** WebAudio 上下文（用于程序化音效） */
  function createAudioContext() {
    if (IS_WX) {
      if (wx.createWebAudioContext) return wx.createWebAudioContext();
      return null;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    return AC ? new AC() : null;
  }

  /** 系统震动（命中反馈） */
  function vibrateShort() {
    if (IS_WX && wx.vibrateShort) { try { wx.vibrateShort({ type: 'light' }); } catch (e) {} }
  }

  /** 分享 */
  function share(title) {
    if (IS_WX && wx.shareAppMessage) {
      wx.shareAppMessage({ title: title || '火柴人英雄格斗，来和我一决高下！' });
    }
  }

  SF.IS_WX = IS_WX;
  SF.adapter = {
    initCanvas: initCanvas,
    getCanvas: function () { return canvas; },
    getCtx: function () { return ctx; },
    getWinSize: function () { return { w: winW, h: winH, dpr: dpr }; },
    resizeIfNeeded: resizeIfNeeded,
    onTouch: onTouch,
    bindTouch: bindTouch,
    createAudioContext: createAudioContext,
    vibrateShort: vibrateShort,
    share: share
  };
})();
