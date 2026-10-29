// SPEEDY CIP 연습문제 풀이: 고르기·입력·낱말 조각 배열·성조 표시, 세트(동그라미 번호)마다 채점.
// 정답은 쪽 안의 data-ans에만 있다. 쪽을 innerHTML로 갈아 끼우므로 모든 처리는 document 위임으로 한다.
(function () {
  var TONE = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
  var PUNCT = /[\s。，、？！?!,.．；;：:“”"'‘’（）()…~～·]/g;

  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function itemOf(el) { return document.querySelector('.qz-item[data-uid="' + el.dataset.q + '"]'); }
  function itemsOf(sid) { return $$('.qz-item[data-set="' + sid + '"]'); }
  function footOf(sid) { return document.querySelector('.qz-foot[data-set="' + sid + '"]'); }
  function norm(s) { return String(s).normalize('NFKC').replace(PUNCT, ''); }

  function toned(syl, t) {
    if (!t) return syl;
    var v = /a/.test(syl) ? 'a' : /e/.test(syl) ? 'e' : /ou/.test(syl) ? 'o'
      : (syl.match(/[iouü](?!.*[iouü])/) || [''])[0];
    return v ? syl.replace(new RegExp(v + '(?!.*' + v + ')'), TONE[v][t - 1]) : syl;
  }

  // ---------- 현재 답 ----------
  function value(it) {
    var k = it.dataset.kind;
    if (k === 'choice') return it.dataset.val || '';
    if (k === 'text') { var i = it.querySelector('.qz-in'); return i ? i.value.trim() : ''; }
    if (k === 'tone') {
      var s = $$('.qz-syl[data-q="' + it.dataset.uid + '"]');
      return s.every(function (b) { return b.dataset.t != null; }) ? s.map(function (b) { return b.dataset.t; }).join(',') : '';
    }
    if (k === 'order') {
      var bank = document.querySelector('.qz-bank[data-q="' + it.dataset.uid + '"]');
      if (bank && bank.querySelector('.qz-tile')) return '';
      return $$('.qz-line[data-q="' + it.dataset.uid + '"] .qz-tile').map(function (t) { return t.textContent; }).join('');
    }
    return '';
  }

  function correct(it, v) {
    var a = it.dataset.ans;
    if (it.dataset.kind === 'text' || it.dataset.kind === 'order')
      return a.split('/').some(function (x) { return norm(x) === norm(v); });
    return v === a;
  }

  function progress(sid) {
    var f = footOf(sid);
    if (!f || f.classList.contains('say') || f.classList.contains('done')) return;
    var its = itemsOf(sid), n = its.filter(function (it) { return value(it) !== ''; }).length;
    f.querySelector('.qz-prog').textContent = n + ' / ' + its.length;
    f.querySelector('.qz-check').disabled = n < its.length;
  }

  // ---------- 채점 ----------
  function grade(sid) {
    var f = footOf(sid), its = itemsOf(sid), ok = 0;
    its.forEach(function (it) {
      var v = value(it), good = correct(it, v), k = it.dataset.kind;
      it.classList.add(good ? 'qz-ok' : 'qz-no');
      if (good) ok++;
      if (k === 'choice') {
        $$('[data-q="' + it.dataset.uid + '"].qz-opt').forEach(function (b) {
          b.classList.toggle('right', b.dataset.i === it.dataset.ans);
        });
      } else if (!good) {
        var fix = document.createElement('span');
        fix.className = 'qz-fix';
        fix.textContent = k === 'tone'
          ? $$('.qz-syl[data-q="' + it.dataset.uid + '"]').map(function (b, i) {
              return toned(b.dataset.syl, +it.dataset.ans.split(',')[i]);
            }).join('')
          : it.dataset.ans.split('/').join('  /  ');
        it.appendChild(fix);
      }
    });
    f.classList.add('done');
    f.dataset.score = ok === its.length ? 'all' : ok ? 'some' : 'none';
    f.querySelector('.qz-prog').textContent = ok === its.length ? '모두 맞았어요! ' + ok + ' / ' + its.length
      : its.length + '문항 중 ' + ok + '문항 정답';
    f.querySelector('.qz-check').hidden = true;
    f.querySelector('.qz-reset').hidden = false;
  }

  function reset(sid) {
    var f = footOf(sid);
    itemsOf(sid).forEach(function (it) {
      it.classList.remove('qz-ok', 'qz-no');
      $$('.qz-fix', it).forEach(function (x) { x.remove(); });
      var q = '[data-q="' + it.dataset.uid + '"]';
      delete it.dataset.val;
      $$('.qz-opt' + q).forEach(function (b) { b.classList.remove('on', 'right'); });
      $$('.qz-syl' + q).forEach(function (b) { delete b.dataset.t; b.textContent = b.dataset.syl; });
      $$('.qz-in' + q).forEach(function (i) { i.value = ''; });
      var bank = document.querySelector('.qz-bank' + q);
      if (bank) {
        $$('.qz-line' + q + ' .qz-tile').forEach(function (t) { bank.appendChild(t); });
        $$('.qz-tile', bank).sort(function (a, b) { return a.dataset.o - b.dataset.o; })
          .forEach(function (t) { bank.appendChild(t); });
      }
    });
    f.classList.remove('done', 'shown');
    delete f.dataset.score;
    f.querySelector('.qz-check').hidden = false;
    f.querySelector('.qz-reset').hidden = true;
    progress(sid);
  }

  function locked(el) {
    var it = el.closest('.qz-item') || itemOf(el);
    var f = it && footOf(it.dataset.set);
    return !it || (f && f.classList.contains('done'));
  }

  // ---------- 고르기·성조·단추 ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var opt = t.closest('.qz-opt, .qz-pic');
    if (opt) {
      if (locked(opt)) return;
      var it = itemOf(opt);
      it.dataset.val = opt.dataset.i;
      $$('.qz-opt[data-q="' + opt.dataset.q + '"]').forEach(function (b) { b.classList.toggle('on', b.dataset.i === opt.dataset.i); });
      progress(it.dataset.set);
      return;
    }
    var syl = t.closest('.qz-syl');
    if (syl) {
      if (locked(syl)) return;
      var n = syl.dataset.t == null ? 1 : (+syl.dataset.t + 1) % 5;   // 1→2→3→4→경성(0)→1
      syl.dataset.t = n;
      syl.textContent = toned(syl.dataset.syl, n);
      progress(itemOf(syl).dataset.set);
      return;
    }
    var chk = t.closest('.qz-check');
    if (chk) {
      var f = chk.closest('.qz-foot');
      if (f.classList.contains('say')) {
        var on = f.classList.toggle('shown');
        itemsOf(f.dataset.set).forEach(function (it) { it.classList.toggle('qz-shown', on); });
        chk.textContent = on ? '모범 답안 가리기' : '모범 답안 보기';
      } else grade(f.dataset.set);
      return;
    }
    var rs = t.closest('.qz-reset');
    if (rs) reset(rs.closest('.qz-foot').dataset.set);
  });

  document.addEventListener('input', function (ev) {
    if (ev.target.classList && ev.target.classList.contains('qz-in')) progress(itemOf(ev.target).dataset.set);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !ev.target.classList || !ev.target.classList.contains('qz-in') || ev.isComposing) return;
    var f = footOf(itemOf(ev.target).dataset.set), b = f && f.querySelector('.qz-check');
    if (b && !b.disabled && !b.hidden) b.click();
  });

  // ---------- 낱말 조각: 누르면 옮기고, 끌면 원하는 자리에 놓는다 ----------
  var drag = null;

  function boxOf(tile) { return tile.parentNode; }
  function other(tile) {
    var q = boxOf(tile).dataset.q;
    return document.querySelector((boxOf(tile).classList.contains('qz-bank') ? '.qz-line' : '.qz-bank') + '[data-q="' + q + '"]');
  }
  function settle(tile) {
    var q = boxOf(tile).dataset.q;
    var it = document.querySelector('.qz-item[data-uid="' + q + '"]');
    if (it) progress(it.dataset.set);
  }

  // 놓을 자리: 같은 줄에서 손가락보다 오른쪽에 있는 첫 조각 앞
  function before(box, x, y, self) {
    var ts = $$('.qz-tile', box).filter(function (t) { return t !== self; });
    for (var i = 0; i < ts.length; i++) {
      var r = ts[i].getBoundingClientRect();
      if (y < r.top) return ts[i];
      if (y <= r.bottom && x < r.left + r.width / 2) return ts[i];
    }
    return null;
  }

  document.addEventListener('pointerdown', function (ev) {
    var tile = ev.target.closest('.qz-tile');
    if (!tile || ev.button > 0 || locked(boxOf(tile))) return;
    drag = { tile: tile, x: ev.clientX, y: ev.clientY, moving: false, ghost: null, id: ev.pointerId };
    tile.setPointerCapture && tile.setPointerCapture(ev.pointerId);
  });

  document.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moving) {
      if (dx * dx + dy * dy < 36) return;
      drag.moving = true;
      var r = drag.tile.getBoundingClientRect();
      var g = drag.tile.cloneNode(true);
      g.className = 'qz-tile qz-ghost';
      g.style.width = r.width + 'px';
      document.body.appendChild(g);
      drag.ghost = g; drag.ox = drag.x - r.left; drag.oy = drag.y - r.top;
      drag.tile.classList.add('qz-hole');
    }
    ev.preventDefault();
    drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.ox) + 'px,' + (ev.clientY - drag.oy) + 'px)';
    var q = boxOf(drag.tile).dataset.q;
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var box = under && under.closest('.qz-line, .qz-bank');
    if (box && box.dataset.q === q) {
      var b = before(box, ev.clientX, ev.clientY, drag.tile);
      if (b !== drag.tile.nextSibling || boxOf(drag.tile) !== box) box.insertBefore(drag.tile, b);
    }
  }, { passive: false });

  function end(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (d.moving) {
      d.ghost.remove();
      d.tile.classList.remove('qz-hole');
    } else if (ev.type === 'pointerup') {
      other(d.tile).appendChild(d.tile);       // 누르기: 반대편 끝으로
    }
    settle(d.tile);
  }
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();
