/* ============================================================
   Coin Collector — script.js
   Game logic, state, spawn system, combo engine & SFX
   ============================================================ */

(function () {
  "use strict";

  var CFG = {
    cols: 4,
    duration: 30,
    lifeStart: 1500,
    lifeEnd: 640,
    spawnStart: 760,
    spawnEnd: 340,
    maxActive: 4,
    comboWindow: 1500,
    maxMult: 5,
    pts: { gold: 10, gem: 35, bomb: -20 },
    gemChance: 0.14,
    bombBase: 0.06,
    bombGrow: 0.12
  };

  function $(id) { return document.getElementById(id); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  var Sfx = {
    ctx: null,
    on: localStorage.getItem('cc_sound') !== '0',
    boot: function () {
      if (!this.ctx) {
        var A = window.AudioContext || window.webkitAudioContext;
        if (A) this.ctx = new A();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    t: function (f, d, ty, v, dl) {
      if (!this.on || !this.ctx) return;
      var t = this.ctx.currentTime + (dl || 0),
        o = this.ctx.createOscillator(),
        g = this.ctx.createGain();
      o.type = ty || 'triangle';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v || .15, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + (d || .12));
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + (d || .12) + .03);
    },
    coin: function (m) {
      var b = 780 + m * 70;
      this.t(b, .09, 'square', .1);
      this.t(b * 1.5, .14, 'triangle', .13, .05);
    },
    gem: function () {
      var a = [880, 1174, 1568, 2093];
      for (var i = 0; i < 4; i++) this.t(a[i], .16, 'triangle', .11, i * .055);
    },
    bomb: function () {
      this.t(150, .3, 'sawtooth', .2);
      this.t(70, .4, 'square', .16, .03);
    },
    miss: function () {
      this.t(210, .1, 'sine', .07);
    },
    tick: function (h) {
      this.t(h ? 900 : 520, .1, 'square', .1);
    },
    over: function () {
      var a = [660, 520, 400, 300];
      for (var i = 0; i < 4; i++) this.t(a[i], .28, 'triangle', .13, i * .14);
    }
  };

  /* GAME STATE */
  var holes = [], S = null, spawnT = null, clockT = null, comboT = null;

  function blank() {
    return {
      playing: false,
      score: 0,
      combo: 0,
      maxCombo: 0,
      mult: 1,
      lastHit: 0,
      spawned: 0,
      caught: 0,
      progress: 0,
      best: +localStorage.getItem('cc_best') || 0
    };
  }

  function init() {
    S = blank();
    stars();
    drawTitle();
    buildBoard();
    bind();
    $('bestHome').textContent = S.best;
    soundIcon();
  }

  function stars() {
    var f = document.createDocumentFragment();
    for (var i = 0; i < 70; i++) {
      var s = document.createElement('i');
      s.className = 'star';
      var z = 1 + Math.random() * 2;
      s.style.left = (Math.random() * 100) + '%';
      s.style.top = (Math.random() * 100) + '%';
      s.style.width = z + 'px';
      s.style.height = z + 'px';
      s.style.setProperty('--d', (2 + Math.random() * 5) + 's');
      s.style.setProperty('--o', (0.2 + Math.random() * 0.6));
      s.style.animationDelay = (Math.random() * 6) + 's';
      f.appendChild(s);
    }
    $('bg').appendChild(f);
  }

  function drawTitle() {
    var el = $('title');
    el.innerHTML = '';
    var words = [{ text: 'COIN', cls: 'g' }, { text: 'COLLECTOR', cls: 'i' }], n = 0;
    for (var w = 0; w < words.length; w++) {
      var wordSpan = document.createElement('span');
      wordSpan.className = 'title-word';
      var word = words[w].text, c = words[w].cls;
      for (var k = 0; k < word.length; k++) {
        var sp = document.createElement('span');
        sp.className = 'ch ' + c;
        sp.textContent = word.charAt(k);
        sp.style.animationDelay = (n * 0.05) + 's';
        wordSpan.appendChild(sp);
        n++;
      }
      el.appendChild(wordSpan);
    }
  }

  function buildBoard() {
    var b = $('board');
    b.innerHTML = '';
    holes = [];
    for (var i = 0; i < CFG.cols * CFG.cols; i++) {
      var d = document.createElement('div');
      d.className = 'hole';
      d.setAttribute('data-i', i);
      b.appendChild(d);
      holes.push({ el: d, tok: null, type: null, timer: null });
    }
    b.addEventListener('pointerdown', function (e) {
      var cell = e.target.closest('.hole');
      if (!cell) return;
      e.preventDefault();
      hit(parseInt(cell.getAttribute('data-i'), 10));
    });
  }

  function bind() {
    $('btnPlay').addEventListener('click', function () { Sfx.boot(); start(); });
    $('btnAgain').addEventListener('click', function () { Sfx.boot(); start(); });
    $('btnHome').addEventListener('click', function () { drawTitle(); show('scrHome'); });
    $('btnSound').addEventListener('click', function () {
      Sfx.on = !Sfx.on;
      localStorage.setItem('cc_sound', Sfx.on ? '1' : '0');
      soundIcon();
      if (Sfx.on) { Sfx.boot(); Sfx.tick(true); }
    });
  }

  function soundIcon() {
    var b = $('btnSound');
    if (Sfx.on) {
      b.classList.remove('off');
      $('sIco').textContent = '♪';
    } else {
      b.classList.add('off');
      $('sIco').textContent = '✕';
    }
  }

  function show(id) {
    var a = ['scrHome', 'scrGame', 'scrEnd'];
    for (var i = 0; i < a.length; i++) {
      var e = $(a[i]);
      if (a[i] === id) {
        e.classList.add('on');
        e.style.animation = 'none';
        void e.offsetHeight;
        e.style.animation = '';
      } else {
        e.classList.remove('on');
      }
    }
  }

  function start() {
    clearAll();
    var best = +localStorage.getItem('cc_best') || 0;
    S = blank();
    S.best = best;
    $('score').textContent = '0';
    $('timeVal').textContent = CFG.duration;
    $('timeVal').classList.remove('warn');
    $('tfill').style.width = '100%';
    $('comboBox').classList.remove('on');
    show('scrGame');
    countdown(function () {
      S.playing = true;
      clock();
      loop(200);
    });
  }

  function countdown(done) {
    var ov = $('cdOv'), tx = $('cdTxt'), seq = ['3', '2', '1', 'GO!'], i = 0;
    ov.classList.add('on');
    (function step() {
      if (i >= seq.length) {
        ov.classList.remove('on');
        done();
        return;
      }
      tx.textContent = seq[i];
      tx.style.animation = 'none';
      void tx.offsetHeight;
      tx.style.animation = '';
      Sfx.tick(i === 3);
      i++;
      setTimeout(step, i <= 3 ? 620 : 420);
    })();
  }

  function clock() {
    var total = CFG.duration * 1000, t0 = Date.now(), last = CFG.duration;
    clockT = setInterval(function () {
      var left = Math.max(0, total - (Date.now() - t0));
      S.progress = 1 - left / total;
      var sec = Math.ceil(left / 1000);
      if (sec !== last) {
        last = sec;
        $('timeVal').textContent = sec;
        if (sec <= 5) {
          $('timeVal').classList.add('warn');
          if (sec > 0) Sfx.tick(false);
        }
      }
      $('tfill').style.width = (left / total * 100) + '%';
      if (left <= 0) end();
    }, 50);
  }

  function loop(d) {
    spawnT = setTimeout(function () {
      if (!S.playing) return;
      var need = want() - count();
      while (need-- > 0) spawn();
      loop(lerp(CFG.spawnStart, CFG.spawnEnd, S.progress));
    }, d);
  }

  function count() {
    var c = 0;
    for (var i = 0; i < holes.length; i++) if (holes[i].tok) c++;
    return c;
  }

  function want() {
    return clamp(1 + Math.floor(S.progress * 3.2), 1, CFG.maxActive);
  }

  function spawn() {
    var free = [];
    for (var i = 0; i < holes.length; i++) if (!holes[i].tok) free.push(i);
    if (!free.length) return;
    var idx = free[rnd(free.length)], slot = holes[idx];

    var bomb = CFG.bombBase + CFG.bombGrow * S.progress, r = Math.random(), type;
    if (r < bomb) type = 'bomb';
    else if (r < bomb + CFG.gemChance) type = 'gem';
    else type = 'gold';

    var life = lerp(CFG.lifeStart, CFG.lifeEnd, S.progress);
    if (type === 'gem') life *= .75;
    if (type === 'bomb') life *= .9;

    var t = document.createElement('div');
    t.className = 'tok t' + type;
    t.style.setProperty('--life', life + 'ms');
    t.innerHTML = '<em>' + (type === 'gold' ? '$' : type === 'gem' ? '◆' : '✦') + '</em>';
    slot.el.appendChild(t);
    slot.el.classList.add('live');
    slot.el.style.setProperty('--glow',
      type === 'gold' ? 'rgba(255,200,61,.4)' : type === 'gem' ? 'rgba(53,232,255,.45)' : 'rgba(255,77,109,.45)');

    slot.tok = t;
    slot.type = type;
    if (type !== 'bomb') S.spawned++;

    slot.timer = setTimeout(function () {
      if (!slot.tok) return;
      slot.tok.classList.add('gone');
      kill(idx, 200);
    }, life);
  }

  function kill(i, after) {
    var s = holes[i];
    clearTimeout(s.timer);
    var t = s.tok;
    s.tok = null;
    s.type = null;
    s.timer = null;
    s.el.classList.remove('live');
    if (t) setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, after);
  }

  function hit(i) {
    if (!S.playing) return;
    var s = holes[i];

    if (!s.tok) {
      s.el.classList.remove('miss');
      void s.el.offsetHeight;
      s.el.classList.add('miss');
      breakCombo();
      Sfx.miss();
      return;
    }

    var type = s.type, r = s.el.getBoundingClientRect();

    if (type === 'bomb') {
      addScore(CFG.pts.bomb);
      breakCombo();
      pop(s.el, CFG.pts.bomb, 'm');
      burst(r, ['#ff4d6d', '#ff90a6', '#5c001a', '#fff']);
      shake();
      Sfx.bomb();
    } else {
      var now = Date.now();
      S.combo = (now - S.lastHit < CFG.comboWindow) ? S.combo + 1 : 1;
      S.lastHit = now;
      if (S.combo > S.maxCombo) S.maxCombo = S.combo;
      S.mult = clamp(S.combo, 1, CFG.maxMult);
      var gain = CFG.pts[type] * S.mult;
      addScore(gain);
      S.caught++;
      pop(s.el, gain, type === 'gem' ? 'c' : 'p');
      burst(r, type === 'gem' ? ['#35e8ff', '#9ef4ff', '#1a63d8', '#fff'] : ['#ffc83d', '#fff0b8', '#e08a13', '#fff']);
      paintCombo();
      if (type === 'gem') Sfx.gem(); else Sfx.coin(S.mult);
    }

    s.tok.classList.add('taken');
    kill(i, 340);
    setTimeout(function () { if (S.playing && count() < want()) spawn(); }, 170);
  }

  function addScore(v) {
    S.score = Math.max(0, S.score + v);
    var e = $('score');
    e.textContent = S.score;
    e.classList.remove('bump');
    void e.offsetHeight;
    e.classList.add('bump');
  }

  function paintCombo() {
    var b = $('comboBox');
    if (S.combo < 2) { b.classList.remove('on'); return; }
    $('comboX').textContent = 'x' + S.mult;
    b.classList.add('on');
    b.classList.remove('pulse');
    void b.offsetHeight;
    b.classList.add('pulse');
    clearTimeout(comboT);
    comboT = setTimeout(breakCombo, CFG.comboWindow);
  }

  function breakCombo() {
    S.combo = 0;
    S.mult = 1;
    $('comboBox').classList.remove('on');
  }

  function pop(host, v, c) {
    var p = document.createElement('div');
    p.className = 'pop ' + c;
    p.textContent = (v > 0 ? '+' : '') + v;
    host.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 800);
  }

  function burst(r, cols) {
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (var i = 0; i < 12; i++) {
      (function (i) {
        var s = document.createElement('i');
        s.className = 'spark';
        var z = 3 + Math.random() * 4, a = (Math.PI * 2 * i) / 12 + Math.random() * .5, d = 30 + Math.random() * 45;
        s.style.left = cx + 'px';
        s.style.top = cy + 'px';
        s.style.width = z + 'px';
        s.style.height = z + 'px';
        s.style.background = cols[rnd(cols.length)];
        s.style.setProperty('--tx', (Math.cos(a) * d) + 'px');
        s.style.setProperty('--ty', (Math.sin(a) * d) + 'px');
        document.body.appendChild(s);
        setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 620);
      })(i);
    }
  }

  function shake() {
    var f = $('frame'), fl = $('flash');
    f.classList.remove('shake');
    void f.offsetHeight;
    f.classList.add('shake');
    fl.classList.add('hit');
    setTimeout(function () { fl.classList.remove('hit'); }, 90);
  }

  function clearAll() {
    clearInterval(clockT);
    clearTimeout(spawnT);
    clearTimeout(comboT);
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      clearTimeout(h.timer);
      if (h.tok && h.tok.parentNode) h.tok.parentNode.removeChild(h.tok);
      h.tok = null;
      h.type = null;
      h.timer = null;
      h.el.classList.remove('live');
    }
  }

  function end() {
    if (!S.playing) return;
    S.playing = false;
    clearAll();
    Sfx.over();

    var rec = S.score > S.best;
    if (rec) {
      S.best = S.score;
      localStorage.setItem('cc_best', S.best);
      $('bestHome').textContent = S.best;
    }
    var acc = S.spawned ? Math.round(S.caught / S.spawned * 100) : 0;

    setTimeout(function () {
      $('endScore').textContent = S.score;
      $('stCoins').textContent = S.caught;
      $('stCombo').textContent = 'x' + Math.min(S.maxCombo, CFG.maxMult);
      $('stAcc').textContent = acc + '%';
      if (rec) $('recBadge').classList.add('on'); else $('recBadge').classList.remove('on');
      $('rankBadge').textContent = rank(S.score);
      show('scrEnd');
    }, 650);
  }

  function rank(s) {
    if (s >= 900) return 'GOLD TYCOON';
    if (s >= 600) return 'TREASURE HUNTER';
    if (s >= 380) return 'COIN MASTER';
    if (s >= 200) return 'COLLECTOR';
    if (s >= 90) return 'APPRENTICE';
    return 'ROOKIE';
  }

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  init();
})();
