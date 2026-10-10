/**
 * adManager.js — 广告位封装（banner + 激励视频）
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  广告位接入说明（上线前必读）：                                    ║
 * ║  1. 在 mp.weixin.qq.com → 流量主 → 广告位管理 中创建广告位        ║
 * ║  2. 将下方两个 adUnitId 占位符替换为你自己的广告位 ID             ║
 * ║  3. 小游戏需要先开通流量主权限（累计独立访客 UV 达标后可开通）     ║
 * ║  4. 浏览器预览环境下会模拟广告行为，方便开发调试                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * 已预留的广告触发点：
 *  - Banner：主菜单 / 选关 / 商店 / 结算页 展示；战斗中隐藏
 *  - 激励视频：
 *      · 生存模式死亡复活（满血+清屏）
 *      · 结算页奖励翻倍
 *      · 商店「暗影」皮肤看广告解锁
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  // ★★★ TODO: 替换为你的真实广告位 ID ★★★
  var BANNER_AD_UNIT_ID = 'adunit-0000000000000000';
  var REWARDED_AD_UNIT_ID = 'adunit-0000000000000000';

  var IS_WX = typeof wx !== 'undefined' && !!wx.createBannerAd;

  var bannerAd = null;
  var rewardedAd = null;
  var rewardedCallback = null;   // {onSuccess, onFail}
  var bannerVisible = false;

  function log() {
    if (!IS_WX) console.log.apply(console, ['[AdSim]'].concat([].slice.call(arguments)));
  }

  // ---------------------------------------------------------------- Banner
  function showBanner() {
    if (!IS_WX) { log('showBanner（浏览器模拟）'); return; }
    if (bannerVisible) return;
    try {
      if (!bannerAd) {
        var info = wx.getSystemInfoSync();
        var w = Math.min(info.windowWidth, 468);
        bannerAd = wx.createBannerAd({
          adUnitId: BANNER_AD_UNIT_ID,
          style: {
            left: (info.windowWidth - w) / 2,
            top: info.windowHeight - (info.windowHeight * 96 / 386 + 6),
            width: w
          }
        });
        bannerAd.onError(function (err) { console.warn('banner error', err); });
      }
      bannerAd.show();
      bannerVisible = true;
    } catch (e) { console.warn('showBanner fail', e); }
  }

  function hideBanner() {
    if (!IS_WX) { log('hideBanner'); return; }
    if (bannerAd && bannerVisible) {
      try { bannerAd.hide(); } catch (e) {}
      bannerVisible = false;
    }
  }

  // ---------------------------------------------------------------- 激励视频
  function ensureRewarded() {
    if (!IS_WX || rewardedAd) return rewardedAd;
    try {
      rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
      rewardedAd.onError(function (err) {
        console.warn('rewarded error', err);
        if (rewardedCallback) {
          var cb = rewardedCallback; rewardedCallback = null;
          cb.onFail && cb.onFail('广告加载失败');
        }
      });
      rewardedAd.onClose(function (res) {
        var cb = rewardedCallback; rewardedCallback = null;
        if (cb) {
          // res.isEnded: true = 完整观看
          if (res && res.isEnded) cb.onSuccess && cb.onSuccess();
          else cb.onFail && cb.onFail('未完整观看');
        }
      });
    } catch (e) { rewardedAd = null; }
    return rewardedAd;
  }

  /**
   * 播放激励视频
   * @param {Function} onSuccess 完整观看后回调（发放奖励）
   * @param {Function} onFail 未完成/失败回调
   */
  function showRewarded(onSuccess, onFail) {
    if (!IS_WX) {
      // 浏览器模拟：直接发奖，便于开发调试
      log('showRewarded（浏览器模拟，直接发放奖励）');
      setTimeout(function () { onSuccess && onSuccess(); }, 300);
      return;
    }
    var ad = ensureRewarded();
    if (!ad) { onFail && onFail('广告组件不可用'); return; }
    rewardedCallback = { onSuccess: onSuccess, onFail: onFail };
    ad.show().catch(function () {
      // 首次 show 失败 → 重新加载后再试
      ad.load().then(function () { return ad.show(); }).catch(function () {
        rewardedCallback = null;
        onFail && onFail('广告拉取失败，请稍后再试');
      });
    });
  }

  SF.Ad = {
    showBanner: showBanner,
    hideBanner: hideBanner,
    showRewarded: showRewarded,
    init: function () { if (IS_WX) ensureRewarded(); }
  };
})();
