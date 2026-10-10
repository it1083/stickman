/**
 * background.js — 程序化主题背景（九套场景，随闯关关卡切换）
 * dojo 道场 / street 黄昏街头 / night 夜幕 / factory 工厂 / desert 荒漠 / volcano 火山
 * rain 雨夜都市 / bamboo 竹林月夜 / sunset 暮色码头
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var stars = null; // 夜空星星缓存

  function lerp(a, b, t) { return a + (b - a) * t; }

  function vGrad(ctx, x, y, h, stops) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  /** 楼宇剪影（street/night 通用） */
  function skyline(ctx, groundY, color, seed, windowColor, time) {
    var x = -20;
    var i = 0;
    while (x < 1360) {
      var w = 90 + ((seed * 37 + i * 53) % 110);
      var h = 150 + ((seed * 91 + i * 137) % 260);
      ctx.fillStyle = color;
      ctx.fillRect(x, groundY - h, w, h);
      // 楼顶细节
      if ((seed + i) % 3 === 0) ctx.fillRect(x + w / 2 - 3, groundY - h - 26, 6, 26);
      // 窗户
      if (windowColor) {
        for (var wy = groundY - h + 16; wy < groundY - 24; wy += 26) {
          for (var wx = x + 10; wx < x + w - 14; wx += 22) {
            var lit = ((seed * 13 + wx * 7 + wy * 3) % 10) < 3.5;
            if (lit) {
              var flick = ((seed + wx + Math.floor(time * 0.7)) % 17) < 16 ? 1 : 0.4;
              ctx.fillStyle = 'rgba(' + windowColor + ',' + (0.75 * flick) + ')';
              ctx.fillRect(wx, wy, 10, 13);
            }
          }
        }
      }
      x += w + 26 + ((seed + i * 29) % 34);
      i++;
    }
  }

  /** 水墨远山（连绵层叠，seed 控制形态） */
  function inkMountain(ctx, baseY, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, baseY);
    var x = -40, i = 0;
    while (x < 1380) {
      var peak = 90 + ((seed * 41 + i * 97) % 130);
      var w = 220 + ((seed * 29 + i * 71) % 160);
      ctx.quadraticCurveTo(x + w * 0.5, baseY - peak, x + w, baseY);
      x += w * 0.62; // 山脚重叠形成连绵感
      i++;
    }
    ctx.lineTo(1380, baseY + 220); ctx.lineTo(-40, baseY + 220);
    ctx.closePath(); ctx.fill();
  }

  function drawBackground(ctx, theme, time) {
    var W = 1334, H = 750, gY = 640;
    theme = theme || 'dojo';

    if (!stars) {
      stars = [];
      for (var s = 0; s < 60; s++) stars.push({ x: Math.random() * W, y: Math.random() * 380, r: Math.random() * 1.6 + 0.5, p: Math.random() * 6.28 });
    }

    switch (theme) {
      case 'ink': {
        // 水墨山水：宣纸底 + 三层淡墨远山 + 朱砂红日 + 飞白笔意
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#efe8d8'], [0.7, '#e6dcc6'], [1, '#dcd1b6']]);
        ctx.fillRect(0, 0, W, gY);
        // 朱砂红日
        ctx.fillStyle = 'rgba(178,44,34,0.82)';
        ctx.beginPath(); ctx.arc(1024, 196, 62, 0, 6.29); ctx.fill();
        // 三层远山（越近越浓）
        inkMountain(ctx, gY - 170, 'rgba(70,72,80,0.16)', 3);
        inkMountain(ctx, gY - 104, 'rgba(52,54,62,0.28)', 7);
        inkMountain(ctx, gY - 34, 'rgba(34,36,44,0.42)', 11);
        // 飞白笔触（宣纸上的枯笔横扫）
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 26;
        for (var fw = 0; fw < 3; fw++) {
          ctx.beginPath();
          ctx.moveTo(80 + fw * 420, 120 + fw * 46);
          ctx.lineTo(360 + fw * 420, 108 + fw * 46);
          ctx.stroke();
        }
        // 两侧墨竹
        drawBamboo(ctx, 96, gY + 4, 330, 9, 'rgba(30,32,38,0.72)', Math.sin(time * 0.8) * 0.02);
        drawBamboo(ctx, 1256, gY + 4, 380, 10, 'rgba(30,32,38,0.78)', Math.sin(time * 0.7 + 2) * 0.02);
        ground(ctx, gY, '#c7ba9c', '#b0a382');
        // 地面淡墨苔点
        ctx.fillStyle = 'rgba(40,42,50,0.2)';
        for (var m = 0; m < 14; m++) {
          ctx.beginPath();
          ctx.ellipse(((m * 173 + 60) % 1300) + 20, gY + 18 + (m % 3) * 14, 8 + (m % 4) * 5, 3, 0, 0, 6.29);
          ctx.fill();
        }
        break;
      }
      case 'dojo': {
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#f2e3c8'], [1, '#e0c9a0']]);
        ctx.fillRect(0, 0, W, gY);
        // 远景木墙格栅
        ctx.strokeStyle = 'rgba(120,80,50,0.25)';
        ctx.lineWidth = 3;
        for (var wx2 = 60; wx2 < W; wx2 += 130) {
          ctx.beginPath(); ctx.moveTo(wx2, 90); ctx.lineTo(wx2, gY - 70); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(120,80,50,0.18)';
        ctx.fillRect(0, 70, W, 14); ctx.fillRect(0, gY - 80, W, 12);
        // 灯笼×2
        drawLantern(ctx, 210, 150, time);
        drawLantern(ctx, 1130, 165, time + 2);
        // 卷轴匾额
        ctx.fillStyle = '#6b4a2f';
        SF.ui.roundRect(ctx, W / 2 - 150, 95, 300, 70, 10);
        ctx.fill();
        SF.ui.drawText(ctx, '武 道 场', W / 2, 130, 34, '#f2e3c8');
        ground(ctx, gY, '#a97c50', '#8a6238');
        break;
      }
      case 'street': {
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#5a3b6e'], [0.5, '#c96a3e'], [1, '#f0a35e']]);
        ctx.fillRect(0, 0, W, gY);
        // 太阳
        ctx.fillStyle = 'rgba(255,220,140,0.9)';
        ctx.beginPath(); ctx.arc(1030, 300, 60, 0, 6.29); ctx.fill();
        skyline(ctx, gY, 'rgba(52,36,60,0.9)', 7, '255,210,130', time);
        ground(ctx, gY, '#4a4048', '#38313a');
        // 地面标线
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(120, gY + 60); ctx.lineTo(560, gY + 34); ctx.stroke();
        break;
      }
      case 'night': {
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#0c1230'], [1, '#28325c']]);
        ctx.fillRect(0, 0, W, gY);
        // 星星
        for (var i = 0; i < stars.length; i++) {
          var st = stars[i];
          var tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + st.p));
          ctx.fillStyle = 'rgba(255,255,255,' + tw * 0.8 + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.29); ctx.fill();
        }
        // 月亮
        ctx.fillStyle = '#e8ecf4';
        ctx.beginPath(); ctx.arc(240, 160, 46, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(12,18,48,0.35)';
        ctx.beginPath(); ctx.arc(258, 148, 38, 0, 6.29); ctx.fill();
        skyline(ctx, gY, 'rgba(10,14,30,0.95)', 13, '160,200,255', time);
        ground(ctx, gY, '#232a3e', '#1a2032');
        break;
      }
      case 'factory': {
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#2b3038'], [1, '#4a5260']]);
        ctx.fillRect(0, 0, W, gY);
        // 齿轮
        drawGear(ctx, 200, 200, 85, 12, 'rgba(70,80,95,0.6)', time * 0.3);
        drawGear(ctx, 350, 290, 55, 10, 'rgba(70,80,95,0.5)', -time * 0.5);
        drawGear(ctx, 1160, 180, 70, 10, 'rgba(70,80,95,0.6)', -time * 0.4);
        // 管道
        ctx.strokeStyle = 'rgba(60,68,82,0.9)';
        ctx.lineWidth = 18;
        ctx.beginPath(); ctx.moveTo(-10, 120); ctx.lineTo(700, 120); ctx.lineTo(700, 210); ctx.stroke();
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(1330, 320); ctx.lineTo(900, 320); ctx.lineTo(900, 400); ctx.stroke();
        // 警示灯
        var pulse = 0.5 + 0.5 * Math.sin(time * 3);
        ctx.fillStyle = 'rgba(120,255,140,' + (0.25 + pulse * 0.3) + ')';
        ctx.beginPath(); ctx.arc(666, 62, 26 + pulse * 6, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#9fe8a8';
        ctx.beginPath(); ctx.arc(666, 62, 12, 0, 6.29); ctx.fill();
        ground(ctx, gY, '#3a4148', '#2c3238');
        break;
      }
      case 'desert': {
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#7fb2d9'], [0.6, '#e8c98f'], [1, '#f5deb0']]);
        ctx.fillRect(0, 0, W, gY);
        ctx.fillStyle = 'rgba(255,250,220,0.95)';
        ctx.beginPath(); ctx.arc(670, 170, 52, 0, 6.29); ctx.fill();
        // 远山
        ctx.fillStyle = 'rgba(190,150,110,0.55)';
        ctx.beginPath();
        ctx.moveTo(0, gY); ctx.lineTo(180, 400); ctx.lineTo(420, gY);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(900, gY); ctx.lineTo(1160, 430); ctx.lineTo(1340, gY);
        ctx.closePath(); ctx.fill();
        // 仙人掌
        drawCactus(ctx, 1210, gY, 1.1);
        drawCactus(ctx, 130, gY, 0.85);
        // 沙丘层次
        ctx.fillStyle = 'rgba(230,200,150,0.7)';
        ctx.beginPath();
        ctx.moveTo(0, gY);
        ctx.quadraticCurveTo(400, gY - 70, 900, gY);
        ctx.lineTo(0, gY); ctx.closePath(); ctx.fill();
        ground(ctx, gY, '#e3c489', '#d4b072');
        break;
      }
      case 'volcano': {
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#1c0e12'], [0.6, '#4a1a16'], [1, '#7a2a1a']]);
        ctx.fillRect(0, 0, W, gY);
        // 火山剪影
        ctx.fillStyle = '#2a1418';
        ctx.beginPath();
        ctx.moveTo(0, gY); ctx.lineTo(260, 250); ctx.lineTo(420, 340); ctx.lineTo(560, 210); ctx.lineTo(800, gY);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(880, gY); ctx.lineTo(1090, 230); ctx.lineTo(1340, gY);
        ctx.closePath(); ctx.fill();
        // 岩浆喷发口发光
        var vp = 0.5 + 0.5 * Math.sin(time * 2.2);
        ctx.fillStyle = 'rgba(255,110,40,' + (0.5 + vp * 0.4) + ')';
        ctx.beginPath(); ctx.arc(560, 212, 22 + vp * 8, 0, 6.29); ctx.fill();
        // 飘散火星
        for (var e = 0; e < 14; e++) {
          var et = (time * 0.35 + e * 0.71) % 1;
          var ex = 560 + Math.sin(e * 3.1 + time) * 60;
          ctx.fillStyle = 'rgba(255,' + (140 + e * 6 % 60) + ',60,' + (1 - et) + ')';
          ctx.beginPath(); ctx.arc(ex, 200 - et * 190, 2.5, 0, 6.29); ctx.fill();
        }
        // 地面熔岩裂缝
        var gp = 0.5 + 0.5 * Math.sin(time * 1.8);
        ctx.strokeStyle = 'rgba(255,90,30,' + (0.4 + gp * 0.5) + ')';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ff5a1e';
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(200, gY + 46); ctx.lineTo(360, gY + 60); ctx.lineTo(430, gY + 52); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(880, gY + 55); ctx.lineTo(1010, gY + 42); ctx.stroke();
        ctx.shadowBlur = 0;
        ground(ctx, gY, '#3a1a14', '#2a120e');
        break;
      }
      case 'rain': {
        // 深蓝雨夜
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#090e1c'], [1, '#1c2740']]);
        ctx.fillRect(0, 0, W, gY);
        // 星星（被雨云压暗）
        for (var rs = 0; rs < stars.length; rs++) {
          var rst = stars[rs];
          var rtw = 0.3 + 0.4 * Math.abs(Math.sin(time * 1.2 + rst.p));
          ctx.fillStyle = 'rgba(200,215,255,' + rtw * 0.4 + ')';
          ctx.beginPath(); ctx.arc(rst.x, rst.y, rst.r, 0, 6.29); ctx.fill();
        }
        // 月亮（薄云遮月）
        ctx.fillStyle = 'rgba(214,224,240,0.7)';
        ctx.beginPath(); ctx.arc(1060, 150, 42, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(20,28,52,0.5)';
        ctx.beginPath(); ctx.arc(1076, 140, 36, 0, 6.29); ctx.fill();
        skyline(ctx, gY, 'rgba(7,11,22,0.96)', 21, '150,190,255', time);
        // 湿地面 + 楼宇冷光倒影
        ground(ctx, gY, '#1b2336', '#131926');
        ctx.save();
        for (var rw = 46; rw < W; rw += 92) {
          var rg = ctx.createLinearGradient(0, gY, 0, gY + 84);
          rg.addColorStop(0, 'rgba(150,190,255,0.14)');
          rg.addColorStop(1, 'rgba(150,190,255,0)');
          ctx.fillStyle = rg;
          var rwob = Math.sin(time * 1.1 + rw) * 5;
          ctx.fillRect(rw + rwob, gY, 24, 84);
        }
        ctx.restore();
        // 雨丝（斜落 + 循环）
        ctx.strokeStyle = 'rgba(178,200,240,0.26)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var rd = 0; rd < 74; rd++) {
          var rsp = 640 + (rd * 53) % 420;
          var rx0 = ((rd * 197) % 1500) - 80;
          var ry0 = ((time * rsp + rd * 613) % 940) - 90;
          ctx.moveTo(rx0, ry0);
          ctx.lineTo(rx0 - 13, ry0 + 30);
        }
        ctx.stroke();
        // 闪电（约每 8 秒一次）
        var lt = time % 8;
        if (lt < 0.42) {
          var fl = Math.max(0, 1 - lt / 0.42);
          ctx.fillStyle = 'rgba(190,210,255,' + fl * 0.22 + ')';
          ctx.fillRect(0, 0, W, 750);
          var bx = 220 + ((Math.floor(time / 8) * 137) % 860);
          ctx.strokeStyle = 'rgba(230,240,255,' + fl + ')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(bx, 26);
          ctx.lineTo(bx + 42, 148); ctx.lineTo(bx + 8, 186); ctx.lineTo(bx + 52, 318);
          ctx.stroke();
        }
        break;
      }
      case 'bamboo': {
        // 竹林月夜
        ctx.fillStyle = vGrad(ctx, 0, 0, gY, [[0, '#08181a'], [1, '#14302c']]);
        ctx.fillRect(0, 0, W, gY);
        // 星星
        for (var bs = 0; bs < stars.length; bs++) {
          var bst = stars[bs];
          var btw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.4 + bst.p));
          ctx.fillStyle = 'rgba(235,255,240,' + btw * 0.7 + ')';
          ctx.beginPath(); ctx.arc(bst.x, bst.y, bst.r, 0, 6.29); ctx.fill();
        }
        // 大明月 + 月晕
        var mg = ctx.createRadialGradient(1050, 185, 30, 1050, 185, 170);
        mg.addColorStop(0, 'rgba(250,244,210,0.5)');
        mg.addColorStop(1, 'rgba(250,244,210,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(1050, 185, 170, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#f7f0cc';
        ctx.beginPath(); ctx.arc(1050, 185, 54, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(200,195,160,0.5)';
        ctx.beginPath(); ctx.arc(1034, 172, 9, 0, 6.29); ctx.fill();
        ctx.beginPath(); ctx.arc(1066, 200, 6, 0, 6.29); ctx.fill();
        // 远竹层（深剪影）
        var farCols = [90, 260, 470, 660, 880, 1250];
        for (var fb = 0; fb < farCols.length; fb++) {
          drawBamboo(ctx, farCols[fb], gY, 330 + (fb * 47) % 90, 9, 'rgba(14,36,30,0.85)', Math.sin(time * 0.8 + fb * 2.1) * 10);
        }
        // 近竹层（左右框住舞台）
        var nearCols = [-10, 60, 1300, 1370, 1230];
        for (var nb = 0; nb < nearCols.length; nb++) {
          drawBamboo(ctx, nearCols[nb], gY, 470 + (nb * 83) % 110, 15, 'rgba(22,54,42,0.95)', Math.sin(time * 0.6 + nb * 1.7) * 16);
        }
        ground(ctx, gY, '#1a3326', '#101f18');
        // 萤火虫
        for (var ff = 0; ff < 10; ff++) {
          var fx = 110 + ff * 128 + Math.sin(time * 0.7 + ff * 2.1) * 42;
          var fy = 400 + Math.sin(time * 0.9 + ff * 1.3) * 58 + Math.cos(time * 0.5 + ff) * 26;
          var br = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.7 + ff * 2.7));
          var fg2 = ctx.createRadialGradient(fx, fy, 1, fx, fy, 15);
          fg2.addColorStop(0, 'rgba(222,255,150,' + br * 0.9 + ')');
          fg2.addColorStop(1, 'rgba(222,255,150,0)');
          ctx.fillStyle = fg2;
          ctx.beginPath(); ctx.arc(fx, fy, 15, 0, 6.29); ctx.fill();
          ctx.fillStyle = 'rgba(245,255,210,' + br + ')';
          ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, 6.29); ctx.fill();
        }
        break;
      }
      case 'sunset': {
        // 暮色码头：晚霞 + 海面 + 倒影 + 海鸥
        var horizon = 545;
        ctx.fillStyle = vGrad(ctx, 0, 0, horizon, [[0, '#3b2a5e'], [0.35, '#8a4a6e'], [0.68, '#e0784a'], [1, '#ffc46e']]);
        ctx.fillRect(0, 0, W, horizon);
        // 晚霞云带
        for (var cl = 0; cl < 5; cl++) {
          var cy = 90 + cl * 62;
          ctx.fillStyle = 'rgba(255,170,120,' + (0.16 - cl * 0.02) + ')';
          ctx.beginPath();
          ctx.ellipse((cl * 331 + time * 6) % (W + 300) - 150, cy, 180 + cl * 36, 13 + cl * 3, 0, 0, 6.29);
          ctx.fill();
        }
        // 海鸥
        for (var gl = 0; gl < 3; gl++) {
          var gx = ((time * 22 + gl * 430) % (W + 260)) - 130;
          var gy2 = 150 + gl * 74 + Math.sin(time * 1.3 + gl * 2) * 14;
          drawGull(ctx, gx, gy2, 1 - gl * 0.18, time * 5 + gl * 1.8);
        }
        // 太阳半沉海平线
        ctx.fillStyle = 'rgba(255,224,150,0.95)';
        ctx.beginPath(); ctx.arc(667, horizon - 8, 64, 0, 6.29); ctx.fill();
        // 海面
        ctx.fillStyle = vGrad(ctx, 0, horizon, gY - horizon, [[0, '#b06a52'], [0.25, '#6a4062'], [1, '#33284a']]);
        ctx.fillRect(0, horizon, W, gY - horizon);
        // 太阳倒影（碎波光）
        for (var sw = 0; sw < 13; sw++) {
          var swY = horizon + 7 + sw * 7;
          var sww = Math.max(8, (66 - sw * 4) * (0.72 + 0.28 * Math.sin(time * 2.1 + sw * 1.7)));
          ctx.fillStyle = 'rgba(255,196,120,' + Math.max(0, 0.55 - sw * 0.038) + ')';
          ctx.fillRect(667 - sww / 2 + Math.sin(time * 1.5 + sw * 2) * 9, swY, sww, 3.5);
        }
        // 微波浪线
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1.5;
        for (var wl = 0; wl < 5; wl++) {
          var wy2 = horizon + 14 + wl * 18;
          ctx.beginPath();
          for (var wx3 = 0; wx3 <= W; wx3 += 60) {
            ctx.lineTo(wx3, wy2 + Math.sin(wx3 * 0.02 + time * 1.6 + wl) * 2.4);
          }
          ctx.stroke();
        }
        // 远处码头剪影 + 起重机
        ctx.fillStyle = 'rgba(46,32,58,0.92)';
        ctx.fillRect(-10, horizon - 34, 250, 34);
        ctx.fillRect(1116, horizon - 28, 228, 28);
        ctx.fillRect(176, horizon - 128, 11, 96);
        ctx.fillRect(130, horizon - 128, 128, 9);
        ctx.fillRect(1180, horizon - 108, 10, 82);
        ctx.fillRect(1146, horizon - 108, 108, 8);
        // 码头木甲板
        ground(ctx, gY, '#4a3850', '#31243e');
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 2;
        for (var pk = gY + 16; pk < 750; pk += 21) {
          ctx.beginPath(); ctx.moveTo(0, pk); ctx.lineTo(W, pk); ctx.stroke();
        }
        for (var pv = 90; pv < W; pv += 170) {
          ctx.beginPath(); ctx.moveTo(pv, gY + 4); ctx.lineTo(pv, 748); ctx.stroke();
        }
        // 系船柱
        ctx.fillStyle = '#241a30';
        SF.ui.roundRect(ctx, 70, gY - 26, 22, 30, 5); ctx.fill();
        SF.ui.roundRect(ctx, 1248, gY - 26, 22, 30, 5); ctx.fill();
        break;
      }
    }

    // 地面接触阴影线
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, gY, W, 4);
  }

  function ground(ctx, gY, c1, c2) {
    var g = ctx.createLinearGradient(0, gY, 0, 750);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, gY, 1334, 750 - gY);
  }

  function drawLantern(ctx, x, y, time) {
    var sway = Math.sin(time * 1.6) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, -22); ctx.stroke();
    var grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
    grad.addColorStop(0, 'rgba(255,190,90,0.9)');
    grad.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#d94f3d';
    SF.ui.roundRect(ctx, -15, -22, 30, 44, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,140,0.95)';
    ctx.fillRect(-9, -14, 18, 28);
    ctx.fillStyle = '#8a6238';
    ctx.fillRect(-17, -26, 34, 6);
    ctx.fillRect(-17, 20, 34, 6);
    ctx.restore();
  }

  function drawGear(ctx, x, y, r, teeth, color, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    var outer = r + 14;
    for (var i = 0; i < teeth; i++) {
      var a0 = (i / teeth) * Math.PI * 2;
      var a1 = ((i + 0.5) / teeth) * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a1 + 0.12) * r, Math.sin(a1 + 0.12) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, 6.29);
    ctx.fillStyle = 'rgba(30,34,40,0.8)';
    ctx.fill();
    ctx.restore();
  }

  function drawCactus(ctx, x, gY, s) {
    ctx.fillStyle = '#4f7a3f';
    ctx.save();
    ctx.translate(x, gY);
    ctx.scale(s, s);
    SF.ui.roundRect(ctx, -12, -110, 24, 112, 12);
    ctx.fill();
    SF.ui.roundRect(ctx, -40, -80, 20, 50, 10);
    ctx.fill();
    SF.ui.roundRect(ctx, -40, -84, 44, 18, 9);
    ctx.fill();
    ctx.restore();
  }

  /** 竹子：弯竹竿 + 竹节 + 顶部垂叶，sway 为顶端横向摆幅 */
  function drawBamboo(ctx, x, baseY, h, w, color, sway) {
    var cx = x + sway * 0.4, cy = baseY - h * 0.55, tx = x + sway, ty = baseY - h;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    // 竹节：沿二次曲线取点画垂直短杠
    ctx.lineWidth = w * 0.42;
    var qy = function (t) { return (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * cy + t * t * ty; };
    var qx = function (t) { return (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tx; };
    for (var t = 0.28; t < 0.95; t += 0.24) {
      var nx = x - cx + 2 * t * (cx - tx);   // 曲线切线法向近似
      var ny = -(baseY - 2 * cy + ty);
      var nl = Math.sqrt(nx * nx + ny * ny) || 1;
      ctx.beginPath();
      ctx.moveTo(qx(t) - nx / nl * w * 0.55, qy(t) - ny / nl * w * 0.55);
      ctx.lineTo(qx(t) + nx / nl * w * 0.55, qy(t) + ny / nl * w * 0.55);
      ctx.stroke();
    }
    // 顶部垂叶：三簇细笔画
    ctx.lineWidth = Math.max(2, w * 0.3);
    for (var lv = 0; lv < 3; lv++) {
      var lx = qx(0.68 + lv * 0.16), ly = qy(0.68 + lv * 0.16);
      for (var ln = -1; ln <= 1; ln++) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + ln * 14, ly + 16, lx + ln * 26, ly + 30);
        ctx.stroke();
      }
    }
  }

  /** 海鸥：两条二次曲线组成的 V 形，扑翅由 flap 驱动 */
  function drawGull(ctx, x, y, s, flap) {
    var wing = 15 * s * (0.55 + 0.45 * Math.abs(Math.sin(flap)));
    ctx.strokeStyle = 'rgba(40,30,52,0.85)';
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - wing, y - 6 * s);
    ctx.quadraticCurveTo(x - wing * 0.3, y + 3 * s, x, y);
    ctx.quadraticCurveTo(x + wing * 0.3, y + 3 * s, x + wing, y - 6 * s);
    ctx.stroke();
  }

  SF.bg = { draw: drawBackground };
})();
