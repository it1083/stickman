/**
 * storage.js — 本地进度存储（金币 / 通关 / 皮肤 / 音效开关）
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';
  var KEY = 'sf_save_v1';
  var IS_WX = typeof wx !== 'undefined' && !!wx.setStorageSync;

  var DEFAULT = {
    coins: 0,              // 金币
    unlockedLevel: 1,      // 已解锁关卡
    stars: {},             // {levelId: 1~3}
    ownedSkins: ['blue'],  // 已拥有皮肤
    usedSkin: 'blue',      // 当前佩戴
    soundOn: true,         // 音效开关
    bestWave: 0            // 生存模式最高波次
  };

  var data = null;

  function load() {
    if (data) return data;
    var raw = null;
    try {
      raw = IS_WX ? wx.getStorageSync(KEY) : localStorage.getItem(KEY);
    } catch (e) { raw = null; }
    data = JSON.parse(JSON.stringify(DEFAULT));
    if (raw) {
      try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (var k in DEFAULT) {
          if (parsed[k] !== undefined) data[k] = parsed[k];
        }
      } catch (e) { /* 存档损坏则重置 */ }
    }
    return data;
  }

  function save() {
    try {
      var str = JSON.stringify(data);
      if (IS_WX) wx.setStorageSync(KEY, str);
      else localStorage.setItem(KEY, str);
    } catch (e) { /* 存储失败静默 */ }
  }

  SF.storage = {
    get: function (key) { return load()[key]; },
    set: function (key, value) { load()[key] = value; save(); },
    addCoins: function (n) { load().coins += n; save(); },
    spendCoins: function (n) {
      var d = load();
      if (d.coins >= n) { d.coins -= n; save(); return true; }
      return false;
    },
    ownSkin: function (id) { return load().ownedSkins.indexOf(id) >= 0; },
    addSkin: function (id) {
      var d = load();
      if (d.ownedSkins.indexOf(id) < 0) { d.ownedSkins.push(id); save(); }
    },
    clearAll: function () {
      data = JSON.parse(JSON.stringify(DEFAULT));
      save();
    }
  };
})();
