// SPEEDY CIP 휴대폰 그림 배치: 교재 원고는 A4 기준(mm)이라 좁은 화면에서 그림이 너무 작아진다.
// 휴대폰 폭(640px 이하)에서만 쪽을 읽은 뒤 다음을 자동으로 한다. 원고·정답은 건드리지 않는다.
//   1) 그림 보기(.qz-figs): 번호 단추+그림을 카드로 묶어 한 줄에 2개 (넓은 그림·지도는 1개)
//   2) 그림+문장(.pic-q 등 그림 칸이 좁은 격자): 그림을 위, 문장을 아래로
//   3) mm 좌표로 배치한 상자(가족 관계도·지도 등)가 화면보다 넓으면 통째로 축소
//   4) 그림을 누르면 크게 보기 (그림 보기 단추로 쓰이는 그림은 제외)
(function () {
  var NARROW = 640;

  // ---------------------------------------------------------------- 1) 그림 보기 카드
  function cards(root) {
    root.querySelectorAll('.qz-figs:not(.mfig)').forEach(function (box) {
      var btns = [].slice.call(box.querySelectorAll('button.qz-opt.pic'));
      if (!btns.length) return;
      var made = [];
      btns.forEach(function (b) {
        var pic = box.querySelector('.qz-pic[data-q="' + b.dataset.q + '"][data-i="' + b.dataset.i + '"]');
        if (!pic) return;
        var card = document.createElement('div');
        card.className = 'mfig-card';
        made.push([card, pic]);
      });
      if (made.length !== btns.length) return;          // 짝이 안 맞으면 손대지 않음
      var wide = made.some(function (m) { return m[1].tagName !== 'IMG'; });   // 여러 그림을 겹친 지도형 보기
      // 지도형 보기는 카드로 옮기기 전에 원래 크기를 재서 % 위치로 바꾼다 (옮긴 뒤에는 카드 CSS 때문에 높이가 0으로 읽힘)
      made.forEach(function (m) { if (m[1].tagName !== 'IMG') fluid(m[1]); });
      made.forEach(function (m, k) {
        var card = m[0], pic = m[1], b = btns[k];
        // 그림을 감싸던 칸(span·div)이 그림만 담고 있었다면 그 칸째 옮긴다 (그림 아래 글자 포함)
        var holder = pic.parentElement !== box && pic.parentElement.children.length <= 3 && !pic.parentElement.contains(btns[(k + 1) % btns.length]) ? pic.parentElement : pic;
        if (holder.contains(b)) holder = pic;
        box.appendChild(card);
        card.appendChild(b);
        card.appendChild(holder === pic ? pic : holder);
      });
      [].slice.call(box.children).forEach(function (c) {    // 비게 된 옛 칸 정리
        if (!c.classList.contains('mfig-card') && !c.textContent.trim() && !c.querySelector('img,svg,canvas')) c.remove();
      });
      box.classList.add('mfig');
      if (wide) box.classList.add('mfig-wide');
    });
  }

  // 지도형 보기: 안쪽 그림 위치(mm)를 % 로 바꿔 카드 폭에 맞춘다
  function fluid(el) {
    // 원고에 적힌 mm 값으로 비율을 잡는다 (휴대폰 CSS가 이미 높이를 바꿔 놓아 화면 크기는 믿을 수 없음)
    var mm = function (v) {
      v = (v || '').trim();
      if (/^0(px|mm)?$/.test(v)) return 0;                  // 단위 없는 0 (left:0 등)
      var m = /^(-?[\d.]+)mm$/.exec(v); return m ? parseFloat(m[1]) : null;
    };
    var W = mm(el.style.width), H = mm(el.style.height);
    if (!W || !H) return;
    [].forEach.call(el.children, function (c) {
      var l = mm(c.style.left), t = mm(c.style.top), w = mm(c.style.width), h = mm(c.style.height);
      if (l === null || t === null) return;
      c.style.left = l / W * 100 + '%'; c.style.top = t / H * 100 + '%';
      if (w !== null) c.style.width = w / W * 100 + '%';
      if (h !== null) c.style.height = h / H * 100 + '%';
    });
    el.style.width = '100%'; el.style.height = 'auto'; el.style.aspectRatio = W + ' / ' + H;
  }

  // ---------------------------------------------------------------- 2) 그림+문장 → 위아래
  function stack(root) {
    root.querySelectorAll('main.book .pic-q, main.book [style*="grid-template-columns"]').forEach(function (g) {
      if (g.classList.contains('qz-figs') || g.classList.contains('mstack')) return;
      if (getComputedStyle(g).display !== 'grid') return;
      var imgs = g.querySelectorAll(':scope > img.fig, :scope > * > img.fig');
      if (!imgs.length || imgs.length > 2) return;
      var text = g.textContent.replace(/\s/g, '').length;
      if (text < 6) return;                                   // 글 없는 그림 줄은 3)·카드에 맡김
      var small = [].some.call(imgs, function (i) { return i.getBoundingClientRect().width < 150; });
      if (!small) return;
      g.classList.add('mstack');
      // 그림 여러 장을 mm 좌표로 겹친 칸(시계+방 그림 등)은 통째로 % 배치로 바꿔 함께 키운다
      [].forEach.call(g.children, function (c) {
        if (/position:\s*relative/.test(c.getAttribute('style') || '') && c.querySelector(':scope > img.fig')) { fluid(c); c.classList.add('mfluid'); }
      });
    });
  }

  // ---------------------------------------------------------------- 3) 넓은 좌표 상자 축소
  function shrink(root) {
    root.querySelectorAll('main.book [style*="position:relative"], main.book [style*="position: relative"]').forEach(function (el) {
      if (el.closest('.qz-figs') || el.dataset.mscale) return;
      var parent = el.parentElement, avail = parent.clientWidth;
      var w = el.scrollWidth, h = el.offsetHeight;
      if (!avail || w <= avail + 2) return;
      var s = avail / w;
      el.dataset.mscale = s.toFixed(3);
      el.style.zoom = s;                                      // transform과 달리 레이아웃 크기도 줄어 옆으로 밀리지 않는다
      el.classList.add('mzoom');                              // 누르면 크게 보기
    });
  }

  // ---------------------------------------------------------------- 4) 크게 보기
  function viewer(node) {
    var ov = document.createElement('div');
    ov.className = 'mview';
    var inner = document.createElement('div');
    inner.className = 'mview-in';
    var c = node.cloneNode(true);
    c.style.zoom = ''; c.style.margin = '0'; c.removeAttribute('data-mscale'); c.classList.remove('mzoom');
    if (c.tagName === 'IMG') { c.style.width = '100%'; c.style.height = 'auto'; c.style.maxWidth = 'none'; }
    inner.appendChild(c);
    ov.appendChild(inner);
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'mview-x'; x.textContent = '✕'; x.setAttribute('aria-label', '닫기');
    ov.appendChild(x);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target === x || e.target.closest('.mview-x')) ov.remove(); });
    document.body.appendChild(ov);
  }

  document.addEventListener('click', function (e) {
    if (window.innerWidth > NARROW) return;
    if (e.target.closest('.mview, button, a, .qz-pic, .qz-figs, [data-a]')) return;
    var z = e.target.closest('.mzoom');
    if (z) { e.preventDefault(); return viewer(z); }
    var img = e.target.closest('main.book img.fig');
    if (img) { e.preventDefault(); viewer(img); }
  });

  function setup(root) {
    if (window.innerWidth > NARROW) return;
    root = root || document;
    cards(root);
    stack(root);
    shrink(root);
  }
  var done = false;
  function once() { if (!done) { done = true; setup(document); } }
  window.cipFigs = function (root) { setup(root || document); };
  if (document.readyState === 'complete') once(); else window.addEventListener('load', once);
})();
