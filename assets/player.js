// SPEEDY CIP 듣기 플레이어: [data-a]가 붙은 요소를 누르면 그 구간(data-s~data-e)만 재생한다.
(function () {
  var audio = new Audio();
  audio.preload = 'auto';
  var cur = null, seg = null, loop = false, raf = 0;
  var rates = [1, 0.75, 0.5, 1.25], ri = 0;
  var bar = document.getElementById('player');
  var $ = function (id) { return document.getElementById(id); };

  function label(el) {
    if (el.classList.contains('sn')) return '교체 연습 · 문장 ' + el.textContent;
    if (el.classList.contains('pa')) {
      var h = el.closest('h2,h3,.dlg-no,p,div');
      var t = (h && h !== el ? h.textContent.replace(el.textContent, '') : '').trim();
      return (t ? t + ' · ' : '') + el.textContent;
    }
    var z = el.querySelector('.hz,.zh,.py');
    return (z || el).textContent.trim().slice(0, 40);
  }

  function tick() {
    if (!seg) return;
    var t = audio.currentTime, d = seg.e - seg.s;
    $('pl-prog').style.width = Math.min(100, Math.max(0, (t - seg.s) / d * 100)) + '%';
    if (t >= seg.e) {
      if (loop) { audio.currentTime = seg.s; }
      else { audio.pause(); done(); return; }
    }
    raf = requestAnimationFrame(tick);
  }

  function done() {
    cancelAnimationFrame(raf);
    if (cur) cur.classList.remove('playing');
    $('pl-toggle').textContent = '▶';
    $('pl-prog').style.width = '100%';
  }

  // 음원 주소: 회원판은 window.AUDIO_URLS(서명 URL)를, 정적판은 AUDIO_BASE를 쓴다.
  function srcOf(name) {
    return (window.AUDIO_URLS && window.AUDIO_URLS[name]) || (window.AUDIO_BASE || '') + name + '.mp3';
  }

  function play(el) {
    var src = srcOf(el.dataset.a);
    var s = parseFloat(el.dataset.s), e = parseFloat(el.dataset.e);
    if (cur === el && !audio.paused) { audio.pause(); done(); return; }
    if (cur) cur.classList.remove('playing');
    cur = el; seg = { s: s, e: e };
    el.classList.add('playing');
    bar.hidden = false;
    $('pl-label').textContent = label(el);
    var go = function () {
      audio.currentTime = s;
      audio.playbackRate = rates[ri];
      audio.play().then(function () {
        $('pl-toggle').textContent = '❚❚';
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      }).catch(function () {});
    };
    if (audio.dataset.name !== el.dataset.a) {
      audio.dataset.name = el.dataset.a;
      audio.src = src;
      audio.addEventListener('loadedmetadata', go, { once: true });
      audio.load();
    } else go();
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]');
    if (!el || el.closest('#player')) return;
    ev.preventDefault();
    play(el);
  });
  document.addEventListener('keydown', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-a]');
    if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); play(el); }
  });
  function scan() {
    document.querySelectorAll('[data-a]:not(button)').forEach(function (el) {
      el.tabIndex = 0; el.setAttribute('role', 'button');
    });
  }
  scan();
  // 회원판: 쪽을 바꿀 때 다시 훑고, 재생을 멈춘다.
  window.cipPlayer = {
    scan: scan,
    reset: function () { audio.pause(); done(); cur = null; seg = null; bar.hidden = true; }
  };

  $('pl-toggle').onclick = function () {
    if (!seg) return;
    if (audio.paused) {
      if (audio.currentTime >= seg.e - 0.02) audio.currentTime = seg.s;
      if (cur) cur.classList.add('playing');
      audio.play(); this.textContent = '❚❚'; raf = requestAnimationFrame(tick);
    } else { audio.pause(); done(); }
  };
  $('pl-rate').onclick = function () {
    ri = (ri + 1) % rates.length; audio.playbackRate = rates[ri];
    this.textContent = rates[ri].toFixed(rates[ri] % 0.5 ? 2 : 1) + '×';
  };
  $('pl-loop').onclick = function () { loop = !loop; this.classList.toggle('on', loop); };
  $('pl-close').onclick = function () { audio.pause(); done(); bar.hidden = true; };
})();
