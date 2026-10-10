/**
 * ui.js — UI 绘制组件库
 * 按钮（含触摸命中）、圆角面板、文本、金币条、血条/能量条绘制工具。
 * 全部工作在设计坐标系(1334x750)。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  function Button(opts) {
    this.x = opts.x; this.y = opts.y;          // 中心
    this.w = opts.w || 260; this.h = opts.h || 84;
    this.label = opts.label || '';
    this.sub = opts.sub || '';                 // 副标题
    this.color = opts.color || '#3fa9f5';
    this.disabled = !!opts.disabled;
    this.glow = !!opts.glow;
    this.onTap = opts.onTap || function () {};
    this.pressedT = 0;                         // 按下动画
  }

  Button.prototype.contains = function (px, py) {
    return px > this.x - this.w / 2 && px < this.x + this.w / 2 &&
           py > this.y - this.h / 2 && py < this.y + this.h / 2;
  };

  Button.prototype.tap = function () {
    if (this.disabled) { SF.audio.play('uiBack'); return; }
    this.pressedT = 0.15;
    SF.audio.play('ui');
    this.onTap();
  };

  Button.prototype.update = function (dt) {
    if (this.pressedT > 0) this.pressedT -= dt;
  };

  Button.prototype.draw = function (ctx) {
    var press = this.pressedT > 0 ? 0.92 : 1;
    var w = this.w * press, h = this.h * press;
    var x = this.x - w / 2, y = this.y - h / 2;
    var r = Math.min(h / 2, 22);

    ctx.save();
    if (this.glow && !this.disabled) {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 20;
    }
    roundRect(ctx, x, y, w, h, r);
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    if (this.disabled) {
      grad.addColorStop(0, 'rgba(80,86,98,0.75)');
      grad.addColorStop(1, 'rgba(56,62,74,0.75)');
    } else {
      grad.addColorStop(0, this.color);
      grad.addColorStop(1, shade(this.color, -30));
    }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.disabled ? 'rgba(255,255,255,0.45)' : '#fff';
    var fs = this.sub ? Math.round(h * 0.38) : Math.round(h * 0.44);
    ctx.font = 'bold ' + fs + 'px sans-serif';
    ctx.fillText(this.label, this.x, this.sub ? this.y - h * 0.12 : this.y);
    if (this.sub) {
      ctx.font = Math.round(h * 0.22) + 'px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(this.sub, this.x, this.y + h * 0.24);
    }
    ctx.restore();
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 颜色明暗调整：支持 #rgb/#rrggbb/rgb()/rgba()，解析失败原样返回（防 NaN 崩溃） */
  function shade(hex, pct) {
    var c = null, m;
    if (typeof hex === 'string' && hex.charAt(0) === '#') {
      var h = hex.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length >= 6 && /^[0-9a-fA-F]+$/.test(h)) {
        c = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
      }
    } else if ((m = /rgba?\(([^)]+)\)/.exec(hex || ''))) {
      c = m[1].split(',').map(function (s) { return parseFloat(s); });
    }
    if (!c || c.length < 3 || isNaN(c[0]) || isNaN(c[1]) || isNaN(c[2])) return hex;
    var f = 1 + pct / 100;
    var out = c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v * f))); });
    return 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')';
  }

  function drawPanel(ctx, x, y, w, h, alpha) {
    ctx.save();
    roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = 'rgba(18,22,30,' + (alpha !== undefined ? alpha : 0.88) + ')';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
    ctx.restore();
  }

  function drawText(ctx, text, x, y, size, color, align, bold) {
    ctx.save();
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px sans-serif';
    ctx.fillStyle = color || '#fff';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 带描边的大字（标题/ROUND/FIGHT/KO） */
  function drawBigText(ctx, text, x, y, size, color, strokeW) {
    ctx.save();
    ctx.font = 'bold ' + size + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = strokeW || 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 金币显示（右上角） */
  function drawCoins(ctx, coins, x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd24d';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#b8860b';
    ctx.stroke();
    drawText(ctx, '¥', x, y + 1, 15, '#8a6508', 'center');
    drawText(ctx, String(coins), x + 14 + String(coins).length * 8, y, 22, '#ffd24d', 'left');
    ctx.restore();
  }

  /** 战斗血条：name 名字 / ratio 当前血量(0~1) / delayed 延迟显示血量 / 镜像 */
  function drawHealthBar(ctx, x, y, w, h, name, ratio, delayed, energy, mirror) {
    ctx.save();
    // 底板
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    // 延迟黄条（受击缓降）
    var dw = Math.max(0, delayed) * (w - 6);
    ctx.fillStyle = 'rgba(255,220,100,0.75)';
    if (mirror) ctx.fillRect(x + w - 3 - dw, y + 3, dw, h - 6);
    else ctx.fillRect(x + 3, y + 3, dw, h - 6);
    // 即时红条
    var rw = Math.max(0, ratio) * (w - 6);
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#ff6b5d');
    grad.addColorStop(1, '#d92b1f');
    ctx.fillStyle = grad;
    if (mirror) ctx.fillRect(x + w - 3 - rw, y + 3, rw, h - 6);
    else ctx.fillRect(x + 3, y + 3, rw, h - 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
    // 名字
    drawText(ctx, name, mirror ? x + w - 12 : x + 12, y - 16, 22, '#fff', mirror ? 'right' : 'left');
    // 能量条
    var eh = 10, ey = y + h + 6;
    roundRect(ctx, x, ey, w, eh, eh / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    var ew = Math.max(0, energy) * (w - 4);
    var eg = ctx.createLinearGradient(x, ey, x, ey + eh);
    eg.addColorStop(0, '#7ee0ff');
    eg.addColorStop(1, '#2f9fd9');
    ctx.fillStyle = energy >= 1 ? '#ffd24d' : eg;
    if (mirror) ctx.fillRect(x + w - 2 - ew, ey + 2, ew, eh - 4);
    else ctx.fillRect(x + 2, ey + 2, ew, eh - 4);
    if (energy >= 1) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffd24d';
      roundRect(ctx, x, ey, w, eh, eh / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  SF.ui = {
    Button: Button,
    roundRect: roundRect,
    drawPanel: drawPanel,
    drawText: drawText,
    drawBigText: drawBigText,
    drawCoins: drawCoins,
    drawHealthBar: drawHealthBar,
    shade: shade
  };
})();
