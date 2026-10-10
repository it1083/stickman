/**
 * effects.js — 战斗特效系统
 * 粒子（命中/格挡/尘土）、伤害数字、震屏、全屏闪光、KO 慢动作、冲击波圆环。
 * 全部绘制在世界（设计）坐标系下。
 */
var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis);
var SF = G.SF = G.SF || {};

(function () {
  'use strict';

  var particles = [];   // {x,y,vx,vy,life,maxLife,size,color,grav,fade}
  var numbers = [];     // {x,y,vy,life,maxLife,text,size,color,crit}
  var rings = [];       // {x,y,r,vr,life,maxLife,color,lw}
  var flashes = [];     // {color,alpha,life,maxLife}
  var slashes = [];     // 拳风/踢风月牙弧线 {x,y,dir,big,tilt,life,maxLife}

  var shakePower = 0;
  var shakeX = 0, shakeY = 0;

  var timeScale = 1;
  var slowmoLeft = 0;
  var slowmoScale = 1;

  function rand(a, b) { return a + Math.random() * (b - a); }

  // ------------------------------------------------ 粒子
  function spawnParticle(x, y, vx, vy, life, size, color, grav) {
    if (particles.length > 320) particles.shift();
    particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color, grav: grav || 0 });
  }

  function hitSparks(x, y, dir, color) {
    var n = 14;
    for (var i = 0; i < n; i++) {
      var ang = rand(-Math.PI, Math.PI);
      var sp = rand(120, 460);
      spawnParticle(x, y, Math.cos(ang) * sp + dir * 160, Math.sin(ang) * sp - 60,
        rand(0.2, 0.45), rand(2, 5), i % 3 === 0 ? '#ffffff' : (color || '#ffd24d'), 900);
    }
    ring(x, y, '#ffd24d');
  }

  function hitHeavySparks(x, y, dir, color) {
    for (var i = 0; i < 26; i++) {
      var ang = rand(-Math.PI, Math.PI);
      var sp = rand(180, 640);
      spawnParticle(x, y, Math.cos(ang) * sp + dir * 220, Math.sin(ang) * sp - 100,
        rand(0.25, 0.6), rand(2.5, 7), i % 2 === 0 ? '#ff9a3d' : (color || '#ffd24d'), 1000);
    }
    ring(x, y, '#ff9a3d', 1.6);
  }

  function blockSparks(x, y, dir) {
    for (var i = 0; i < 10; i++) {
      var ang = rand(-1.2, 1.2);
      spawnParticle(x, y, -dir * rand(120, 380), Math.sin(ang) * rand(60, 260),
        rand(0.15, 0.35), rand(1.5, 4), i % 2 ? '#bfe8ff' : '#ffffff', 400);
    }
    ring(x, y, '#7ecbff');
  }

  function dust(x, y, n, spread) {
    for (var i = 0; i < (n || 6); i++) {
      spawnParticle(x + rand(-8, 8), y, rand(-(spread || 60), spread || 60), rand(-90, -20),
        rand(0.3, 0.7), rand(2.5, 6), 'rgba(200,190,170,0.8)', -60);
    }
  }

  function specialAura(x, y, color) {
    for (var i = 0; i < 30; i++) {
      var ang = rand(-Math.PI, Math.PI);
      var r = rand(20, 70);
      spawnParticle(x + Math.cos(ang) * r, y - rand(10, 110),
        Math.cos(ang) * -rand(60, 200), -rand(60, 240),
        rand(0.3, 0.8), rand(2, 6), i % 2 ? (color || '#ffd24d') : '#ffffff', -120);
    }
    ring(x, y - 60, color || '#ffd24d', 2.4);
    ring(x, y - 60, '#ffffff', 1.2);
  }

  // ------------------------------------------------ 冲击环 / 伤害数字
  function ring(x, y, color, scale) {
    rings.push({ x: x, y: y, r: 6, vr: rand(520, 700) * (scale || 1) / 1.5, life: 0.3, maxLife: 0.3, color: color, lw: 4 * (scale || 1) });
  }

  // ------------------------------------------------ 挥击弧线（月牙拳风/踢风）
  /** x,y 打击点世界坐标 / dir 朝向(1=右) / big 大弧(踢技) / tilt 弧面旋转 */
  function slash(x, y, dir, big, tilt) {
    if (slashes.length > 10) slashes.shift();
    slashes.push({ x: x, y: y, dir: dir, big: !!big, tilt: tilt || 0, life: 0.16, maxLife: 0.16 });
  }

  function drawSlash(ctx, s) {
    var a = s.life / s.maxLife;
    var r = s.big ? 92 : 62;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.dir, 1);
    ctx.rotate(s.tilt);
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    // 外弧：主月牙
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = '#bfe8ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = (s.big ? 9 : 6) * (0.4 + a * 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, r, -1.2, 0.8);
    ctx.stroke();
    // 内弧：拖尾薄纱
    ctx.globalAlpha = a * 0.45;
    ctx.lineWidth = (s.big ? 4 : 2.5) * a;
    ctx.beginPath();
    ctx.arc(-12, -7, r * 0.9, -1.05, 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function damageNumber(x, y, dmg, crit) {
    if (numbers.length > 40) numbers.shift();
    numbers.push({
      x: x + rand(-10, 10), y: y, vy: -150 - (crit ? 60 : 0),
      life: 0.8, maxLife: 0.8,
      text: String(dmg), size: crit ? 44 : 30,
      color: crit ? '#ff5d3d' : '#ffffff'
    });
  }

  // ------------------------------------------------ 震屏 / 闪光 / 慢动作
  function shake(power) { shakePower = Math.max(shakePower, power); }
  function flash(color, alpha, dur) { flashes.push({ color: color, alpha: alpha, life: dur, maxLife: dur }); }
  function slowmo(dur, scale) { slowmoLeft = Math.max(slowmoLeft, dur); slowmoScale = scale; }

  // ------------------------------------------------ 更新
  function update(dtReal) {
    // 慢动作计时用真实时间
    if (slowmoLeft > 0) {
      slowmoLeft -= dtReal;
      timeScale = slowmoScale;
      if (slowmoLeft <= 0) timeScale = 1;
    }

    var dt = dtReal * timeScale;

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (var j = numbers.length - 1; j >= 0; j--) {
      var n = numbers[j];
      n.life -= dt;
      if (n.life <= 0) { numbers.splice(j, 1); continue; }
      n.y += n.vy * dt;
      n.vy += 220 * dt;
    }
    for (var k = rings.length - 1; k >= 0; k--) {
      var r = rings[k];
      r.life -= dt;
      if (r.life <= 0) { rings.splice(k, 1); continue; }
      r.r += r.vr * dt;
    }
    for (var f = flashes.length - 1; f >= 0; f--) {
      flashes[f].life -= dtReal;
      if (flashes[f].life <= 0) flashes.splice(f, 1);
    }
    for (var sl = slashes.length - 1; sl >= 0; sl--) {
      slashes[sl].life -= dt;
      if (slashes[sl].life <= 0) slashes.splice(sl, 1);
    }

    // 震屏衰减（真实时间）
    shakePower *= Math.pow(0.001, dtReal);
    if (shakePower < 0.3) shakePower = 0;
    shakeX = rand(-shakePower, shakePower);
    shakeY = rand(-shakePower, shakePower);
  }

  // ------------------------------------------------ 绘制（世界坐标）
  function draw(ctx) {
    var i;
    for (i = 0; i < slashes.length; i++) drawSlash(ctx, slashes[i]);
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      var a = r.life / r.maxLife;
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lw * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = Math.min(1, p.life / p.maxLife * 1.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (i = 0; i < numbers.length; i++) {
      var n = numbers[i];
      var na = Math.min(1, n.life / n.maxLife * 2);
      ctx.globalAlpha = na;
      ctx.font = 'bold ' + n.size + 'px sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }

  /** 全屏闪光（屏幕坐标层调用，画满设计区域） */
  function drawFlash(ctx) {
    for (var i = 0; i < flashes.length; i++) {
      var f = flashes[i];
      var a = (f.life / f.maxLife) * f.alpha;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, SF.config.DESIGN_W, SF.config.DESIGN_H);
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    particles.length = 0; numbers.length = 0; rings.length = 0; flashes.length = 0; slashes.length = 0;
    shakePower = 0; timeScale = 1; slowmoLeft = 0;
  }

  SF.fx = {
    hitSparks: hitSparks,
    hitHeavySparks: hitHeavySparks,
    blockSparks: blockSparks,
    dust: dust,
    specialAura: specialAura,
    ring: ring,
    slash: slash,
    damageNumber: damageNumber,
    shake: shake,
    flash: flash,
    slowmo: slowmo,
    update: update,
    draw: draw,
    drawFlash: drawFlash,
    clear: clear,
    getShake: function () { return { x: shakeX, y: shakeY }; },
    getTimeScale: function () { return timeScale; }
  };
})();
