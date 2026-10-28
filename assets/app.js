// SPEEDY CIP 회원판: 로그인 → 승인 확인 → Supabase 비공개 버킷에서 쪽·그림·음원을 받아 보여 준다.
// 이 파일과 index.html에는 교재 내용이 없다. 접근 제한은 Supabase 쪽 보안 규칙(RLS)이 맡는다.
(function () {
  var SUPABASE_URL = 'https://pqlnjtlxfuyvrjiuskqt.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_enXOjInUlT6T7ycB89UMwQ_ARx3KGTL';   // 공개용 키
  var BUCKET = 'cip', TTL = 6 * 3600;

  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var view = document.getElementById('view');
  var me = null;            // { user, profile, admin }
  var pageCache = {}, urlCache = {};
  window.AUDIO_URLS = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bar(crumb) {
    return '<header class="top"><a class="brand" href="#/"><b>SPEEDY</b> CIP</a>'
      + '<nav class="crumbs">' + (crumb ? '<span class="sep">/</span>' + crumb : '') + '</nav></header>';
  }

  // ---------------------------------------------------------------- 주소 ↔ 쪽 경로
  // #/ → index.html, #/s1/ → s1/index.html, #/s1/u03 → s1/u03.html
  function routePath() {
    var h = location.hash.replace(/^#\/?/, '');
    if (h === 'admin') return 'admin';
    if (!h || /\/$/.test(h)) return h + 'index.html';
    return h + '.html';
  }
  function hashOf(path) {
    return '#/' + path.replace(/index\.html$/, '').replace(/\.html$/, '');
  }
  function resolve(base, href) {
    var parts = base.split('/'); parts.pop();
    href.split('/').forEach(function (p) {
      if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p);
    });
    return parts.join('/');
  }

  // ---------------------------------------------------------------- 서명 URL
  function signed(paths) {
    var now = Date.now(), need = paths.filter(function (p) {
      return !urlCache[p] || urlCache[p].exp < now + 30 * 60e3;
    });
    if (!need.length) return Promise.resolve();
    return sb.storage.from(BUCKET).createSignedUrls(need, TTL).then(function (r) {
      if (r.error) throw r.error;
      r.data.forEach(function (d) {
        if (d.signedUrl) urlCache[d.path] = { url: d.signedUrl, exp: now + TTL * 1000 };
      });
    });
  }

  // ---------------------------------------------------------------- 교재 쪽
  function loadPage(path) {
    if (pageCache[path]) return Promise.resolve(pageCache[path]);
    return sb.storage.from(BUCKET).download('pages/' + path).then(function (r) {
      if (r.error) throw r.error;
      return r.data.text();
    }).then(function (t) { pageCache[path] = t; return t; });
  }

  function showPage(path) {
    window.cipPlayer.reset();
    return loadPage(path).then(function (html) {
      view.innerHTML = html;
      view.dataset.path = path;
      addUserMenu();
      var imgs = [].map.call(view.querySelectorAll('img[data-img]'), function (i) { return i.dataset.img; });
      var auds = {};
      view.querySelectorAll('[data-a]').forEach(function (el) { auds['audio/' + el.dataset.a + '.mp3'] = 1; });
      var crumbs = view.querySelector('.crumbs');
      var parts = crumbs ? crumbs.textContent.split('/').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      document.title = parts.concat('SPEEDY CIP').join(' · ');
      window.scrollTo(0, 0);
      window.cipPlayer.scan();
      return signed(imgs.concat(Object.keys(auds))).then(function () {
        view.querySelectorAll('img[data-img]').forEach(function (i) {
          if (urlCache[i.dataset.img]) i.src = urlCache[i.dataset.img].url;
        });
        Object.keys(auds).forEach(function (p) {
          if (urlCache[p]) window.AUDIO_URLS[p.slice(6, -4)] = urlCache[p].url;
        });
      });
    }).catch(function (e) {
      console.error(e);
      view.innerHTML = bar() + '<div class="gate"><div class="card"><h2>쪽을 열 수 없습니다</h2>'
        + '<p class="msg">잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 문의하세요.</p>'
        + '<p><a class="btn" href="#/">처음으로</a></p></div></div>';
    });
  }

  function addUserMenu() {
    var top = view.querySelector('header.top');
    if (!top || top.querySelector('.who')) return;
    var who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = '<span class="nm">' + esc(me.profile && me.profile.name || me.user.email) + '</span>'
      + (me.admin ? '<a href="#/admin">회원 관리</a>' : '')
      + '<button type="button" data-act="logout">로그아웃</button>';
    top.appendChild(who);
  }

  // ---------------------------------------------------------------- 로그인·가입
  function authView(mode, note) {
    mode = mode || 'login';
    view.dataset.path = '';
    var f = {
      login: '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>'
        + '<button class="btn" type="submit">로그인</button>'
        + '<p class="alt"><button type="button" class="lnk" data-mode="reset">비밀번호를 잊었어요</button></p>',
      signup: '<label>이름<input name="name" required maxlength="40" autocomplete="name"></label>'
        + '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<label>비밀번호 <small>8자 이상</small><input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>'
        + '<label>소속·메모 <small>선택 · 승인에 참고합니다</small><input name="note" maxlength="100" placeholder="예: ○○반, 수강생"></label>'
        + '<button class="btn" type="submit">가입 신청</button>',
      reset: '<p class="msg">가입한 이메일로 비밀번호 재설정 링크를 보내 드립니다.</p>'
        + '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<button class="btn" type="submit">재설정 메일 받기</button>',
      newpw: '<p class="msg">새 비밀번호를 정해 주세요.</p>'
        + '<label>새 비밀번호 <small>8자 이상</small><input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>'
        + '<button class="btn" type="submit">비밀번호 바꾸기</button>'
    }[mode];
    var tabs = (mode === 'login' || mode === 'signup')
      ? '<div class="tabs"><button type="button" data-mode="login"' + (mode === 'login' ? ' class="on"' : '') + '>로그인</button>'
        + '<button type="button" data-mode="signup"' + (mode === 'signup' ? ' class="on"' : '') + '>회원가입</button></div>'
      : '<div class="tabs"><button type="button" data-mode="login">← 로그인으로</button></div>';
    view.innerHTML = bar() + '<div class="gate"><div class="hero home"><div class="k">CHINESE · 중국어</div><h1>SPEEDY CIP</h1>'
      + '<p>교재를 보면서 원어민 음성을 듣는 회원 전용 웹 교재입니다.<br>가입 후 관리자 승인을 받으면 열람할 수 있습니다.</p></div>'
      + '<div class="card">' + tabs + '<form data-form="' + mode + '">' + f + '<p class="note" role="status">' + (note || '') + '</p></form></div></div>';
  }

  function submit(form) {
    var mode = form.dataset.form, v = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ''; };
    var out = form.querySelector('.note'), btn = form.querySelector('button[type=submit]');
    var say = function (t, ok) { out.textContent = t; out.className = 'note' + (ok ? ' ok' : ' err'); };
    btn.disabled = true;
    var here = location.origin + location.pathname;
    var p;
    if (mode === 'login') {
      p = sb.auth.signInWithPassword({ email: v('email'), password: form.elements.pw.value }).then(function (r) {
        if (r.error) say(/confirm/i.test(r.error.message) ? '이메일 인증을 먼저 마쳐 주세요. 받은편지함(스팸함 포함)을 확인해 주세요.'
          : '이메일 또는 비밀번호가 맞지 않습니다.');
      });
    } else if (mode === 'signup') {
      p = sb.auth.signUp({
        email: v('email'), password: form.elements.pw.value,
        options: { emailRedirectTo: here, data: { name: v('name'), note: v('note') } }
      }).then(function (r) {
        if (r.error) return say(/registered|exists/i.test(r.error.message) ? '이미 가입된 이메일입니다. 로그인해 주세요.'
          : /password/i.test(r.error.message) ? '비밀번호가 너무 약합니다. 더 길게 정해 주세요.'
          : /rate/i.test(r.error.message) ? '잠시 뒤 다시 시도해 주세요. (메일 발송 한도)' : '가입 실패: ' + r.error.message);
        if (!r.data.session) say('가입 신청이 접수되었습니다. 받은 인증 메일의 링크를 누른 뒤, 관리자 승인을 기다려 주세요.', true);
      });
    } else if (mode === 'reset') {
      p = sb.auth.resetPasswordForEmail(v('email'), { redirectTo: here }).then(function (r) {
        say(r.error ? '보내지 못했습니다: ' + r.error.message : '재설정 메일을 보냈습니다. 메일의 링크를 눌러 주세요.', !r.error);
      });
    } else if (mode === 'newpw') {
      p = sb.auth.updateUser({ password: form.elements.pw.value }).then(function (r) {
        if (r.error) return say('바꾸지 못했습니다: ' + r.error.message);
        location.hash = '#/'; route();
      });
    }
    p.finally(function () { btn.disabled = false; });
  }

  function pendingView() {
    view.dataset.path = '';
    view.innerHTML = bar() + '<div class="gate"><div class="card"><h2>승인 대기 중입니다</h2>'
      + '<p class="msg"><b>' + esc(me.user.email) + '</b> 계정으로 가입 신청이 접수되었습니다.<br>'
      + '관리자가 승인하면 교재를 열람할 수 있습니다. 승인 연락을 받으면 ‘승인 확인’을 눌러 주세요.</p>'
      + '<p class="row"><button class="btn" type="button" data-act="recheck">승인 확인</button>'
      + '<button class="btn ghost" type="button" data-act="logout">로그아웃</button></p></div></div>';
  }

  // ---------------------------------------------------------------- 회원 관리 (관리자)
  var adminFilter = 'wait';
  function adminView() {
    window.cipPlayer.reset();
    view.innerHTML = bar('회원 관리') + '<main class="index admin"><div class="card wide"><h2>회원 관리</h2>'
      + '<div class="tabs"><button type="button" data-filter="wait">승인 대기</button><button type="button" data-filter="ok">승인됨</button>'
      + '<button type="button" data-filter="all">전체</button></div><div class="list"><p class="msg">불러오는 중…</p></div></div></main>';
    view.dataset.path = 'admin';
    addUserMenu();
    document.title = '회원 관리 · SPEEDY CIP';
    view.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.toggle('on', b.dataset.filter === adminFilter); });
    var q = sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (adminFilter === 'wait') q = q.eq('approved', false);
    if (adminFilter === 'ok') q = q.eq('approved', true);
    q.then(function (r) {
      var box = view.querySelector('.list');
      if (r.error) { box.innerHTML = '<p class="note err">' + esc(r.error.message) + '</p>'; return; }
      if (!r.data.length) { box.innerHTML = '<p class="msg">해당하는 회원이 없습니다.</p>'; return; }
      box.innerHTML = r.data.map(function (p) {
        var d = new Date(p.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
        return '<div class="mem' + (p.approved ? ' ok' : '') + '"><div class="info"><b>' + esc(p.name || '(이름 없음)') + '</b>'
          + '<span>' + esc(p.email) + '</span>' + (p.note ? '<span class="memo">' + esc(p.note) + '</span>' : '')
          + '<small>가입 ' + d + (p.approved ? ' · 승인됨' : ' · 대기') + '</small></div>'
          + (p.approved ? '<button class="btn ghost" type="button" data-approve="0" data-id="' + p.id + '">승인 취소</button>'
            : '<button class="btn" type="button" data-approve="1" data-id="' + p.id + '">승인</button>') + '</div>';
      }).join('');
    });
  }

  function setApproved(btn) {
    btn.disabled = true;
    sb.from('profiles').update({ approved: btn.dataset.approve === '1' }).eq('id', btn.dataset.id).then(function (r) {
      if (r.error) { alert('바꾸지 못했습니다: ' + r.error.message); btn.disabled = false; return; }
      adminView();
    });
  }

  // ---------------------------------------------------------------- 흐름
  function loadMe(user) {
    return Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.rpc('is_admin')
    ]).then(function (r) {
      me = { user: user, profile: r[0].data, admin: r[1].data === true };
    });
  }

  function route() {
    if (!me) return authView();
    var approved = me.admin || (me.profile && me.profile.approved);
    if (!approved) return pendingView();
    var path = routePath();
    if (path === 'admin') return me.admin ? adminView() : (location.hash = '#/');
    if (view.dataset.path === path && view.querySelector('main')) return;
    showPage(path);
  }

  var recovering = false;
  sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; return setTimeout(function () { authView('newpw'); }); }
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') {
      setTimeout(function () {   // 콜백 안에서 다른 supabase 호출을 바로 하지 않는다 (잠금 교착 방지)
        if (recovering) return;
        if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
        if (!session) { me = null; view.dataset.path = ''; pageCache = {}; return route(); }
        if (me && me.user.id === session.user.id) return;
        loadMe(session.user).then(route);
      });
    }
  });

  window.addEventListener('hashchange', function () {
    if (/^#\/?sec\d+$/.test(location.hash)) return;
    route();
  });

  view.addEventListener('submit', function (ev) { ev.preventDefault(); submit(ev.target); });
  view.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-mode],[data-act],[data-filter],[data-approve],a[href]');
    if (!t) return;
    if (t.dataset.mode) return authView(t.dataset.mode);
    if (t.dataset.filter) { adminFilter = t.dataset.filter; return adminView(); }
    if (t.dataset.approve) return setApproved(t);
    if (t.dataset.act === 'logout') return sb.auth.signOut();
    if (t.dataset.act === 'recheck') return loadMe(me.user).then(route);
    var href = t.getAttribute('href');
    if (/^#sec\d+$/.test(href)) {                     // 꼭지 바로가기
      ev.preventDefault();
      var h = document.getElementById(href.slice(1));
      if (h) h.scrollIntoView({ behavior: 'smooth' });
    } else if (/\.html$/.test(href) && !/^[a-z]+:/i.test(href)) {   // 교재 쪽 사이 이동
      ev.preventDefault();
      location.hash = hashOf(resolve(view.dataset.path || 'index.html', href));
    }
  });
})();
