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
  var CAMPUSES = ['종로', '강남'];   // 시작 값. 실제 목록은 campuses 표에서 받아 온다.
  sb.from('campuses').select('name').order('sort').then(function (r) {
    if (r.data && r.data.length) CAMPUSES = r.data.map(function (c) { return c.name; });
  });
  function campusTxt(cs) { return cs && cs.length ? cs.join(' · ') : '캠퍼스 미지정'; }

  // ---------------------------------------------------------------- 약관·개인정보 (가입 화면 동의 + #/terms, #/privacy 공개 쪽)
  // 문구를 바꾸면 VER을 올린다. 가입할 때 동의한 판(VER)과 시각이 회원 정보(user metadata)에 남는다.
  var DOC_VER = '2026-10-30';
  var DOCS = {
    terms: ['이용약관', [
      ['제1조 (목적)', '이 약관은 SPEEDY CIP 웹 교재(이하 ‘서비스’)의 이용 조건과 절차를 정합니다.'],
      ['제2조 (회원가입)', '가입을 신청한 뒤 담당 선생님의 승인을 받아야 교재를 볼 수 있습니다. 수강생이 아니거나 신청 내용이 사실과 다르면 승인하지 않을 수 있습니다.'],
      ['제3조 (이용 범위)', '회원은 승인된 권의 교재를 본인의 학습 목적으로만 이용할 수 있습니다.'],
      ['제4조 (금지 행위)', '교재의 글·그림·음원을 복제, 녹음, 캡처하여 다른 사람에게 배포하거나, 계정을 다른 사람과 함께 쓰는 행위를 금지합니다. 위반하면 열람 권한이 제한될 수 있습니다.'],
      ['제5조 (저작권)', '교재와 음원의 저작권은 저작권자에게 있습니다.'],
      ['제6조 (서비스 변경·중단)', '수강 종료, 시스템 점검 등의 사유로 열람 권한이나 서비스가 변경되거나 중단될 수 있습니다.'],
      ['제7조 (탈퇴)', '회원은 ‘내 정보’에서 언제든지 탈퇴할 수 있으며, 탈퇴하면 계정 정보가 바로 삭제됩니다.'],
      ['부칙', '이 약관은 2026년 10월 30일부터 적용합니다.']]],
    privacy: ['개인정보 수집·이용 안내', [
      ['수집 항목', '(필수) 이름, 이메일, 비밀번호, 캠퍼스 · (선택) 소속·메모 · (자동) 로그인 일시 등 접속 기록'],
      ['이용 목적', '회원 확인과 로그인, 교재 열람 권한 관리(가입 승인, 캠퍼스별 관리), 비밀번호 재설정 등 안내 메일 발송'],
      ['보유 기간', '회원 탈퇴 시까지. 탈퇴하면 바로 삭제합니다. 단, 법령에 따라 보관해야 하는 정보는 그 기간 동안 보관합니다.'],
      ['열람 범위', '회원의 이름·이메일·캠퍼스·메모는 담당 캠퍼스 선생님과 전체 관리자만 볼 수 있습니다. 비밀번호는 암호화되어 누구도 볼 수 없습니다.'],
      ['처리 위탁', 'Supabase Inc. — 회원 정보 저장과 로그인 처리 (저장 위치: 대한민국 서울)'],
      ['동의 거부', '동의하지 않을 수 있습니다. 다만 동의하지 않으면 회원가입과 교재 이용이 불가능합니다.'],
      ['문의', '개인정보 열람·정정·삭제 요청은 다니는 캠퍼스의 담당 선생님께 해 주세요. 탈퇴는 ‘내 정보’에서 직접 할 수 있습니다.']]]
  };
  function docHtml(k) {
    return DOCS[k][1].map(function (s) { return '<dt>' + s[0] + '</dt><dd>' + s[1] + '</dd>'; }).join('');
  }
  function agreeBlock() {
    var item = function (k, label) {
      return '<div class="agree-item"><label class="chk"><input type="checkbox" name="agree_' + k + '" required>'
        + '<span><b>[필수]</b> ' + label + '</span></label>'
        + '<details><summary>보기</summary><dl class="doc">' + docHtml(k) + '</dl></details></div>';
    };
    return '<div class="agree"><label class="chk all"><input type="checkbox" data-agree-all><span>전체 동의</span></label>'
      + item('terms', '이용약관에 동의합니다') + item('privacy', '개인정보 수집·이용에 동의합니다') + '</div>';
  }
  function docView(k) {
    window.cipPlayer.reset();
    view.dataset.path = k;
    view.innerHTML = bar(DOCS[k][0]) + '<div class="gate"><div class="card"><h2>' + DOCS[k][0] + '</h2>'
      + '<dl class="doc full">' + docHtml(k) + '</dl>'
      + '<p class="row back"><a class="lnk" href="#/">← 처음으로</a></p></div></div>';
    if (me) addUserMenu();
    document.title = DOCS[k][0] + ' · SPEEDY CIP';
  }

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
    if (h === 'admin' || h === 'me' || h === 'terms' || h === 'privacy') return h;
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
      if (!me.teacher) view.querySelectorAll('.stages a.stage').forEach(function (a) {
        var st = +(a.className.match(/\bs(\d)\b/) || [])[1];
        if (me.stages.indexOf(st) < 0) { a.classList.add('locked'); a.insertAdjacentHTML('beforeend', '<span class="lock">권한 없음</span>'); }
      });
      window.cipPlayer.scan();
      return signed(imgs.concat(Object.keys(auds))).then(function () {
        view.querySelectorAll('img[data-img]').forEach(function (i) {
          if (urlCache[i.dataset.img]) i.src = urlCache[i.dataset.img].url;
        });
        Object.keys(auds).forEach(function (p) {
          if (urlCache[p]) window.AUDIO_URLS[p.slice(6, -4)] = urlCache[p].url;
        });
        // 휴대폰 그림 배치(figs.js): 그림이 다 들어온 뒤 크기를 재고 다시 놓는다
        if (window.cipFigs) Promise.all([].map.call(view.querySelectorAll('img'), function (i) {
          return i.complete ? 0 : new Promise(function (r) { i.onload = i.onerror = r; setTimeout(r, 5000); });
        })).then(function () { window.cipFigs(view); });
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
    who.innerHTML = '<a class="nm" href="#/me" title="내 정보 · 캠퍼스 변경">' + esc(me.profile && me.profile.name || me.user.email) + '</a>'
      + (me.teacher ? '<a href="#/admin">회원 관리</a>' : '')
      + '<button type="button" data-act="logout">로그아웃</button>';
    top.appendChild(who);
  }

  // ---------------------------------------------------------------- 로그인·가입
  var flash = '';
  function authView(mode, note) {
    mode = mode || 'login';
    var ok = !note && !!flash;
    note = note || flash; flash = '';
    view.dataset.path = '';
    var f = {
      login: '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>'
        + '<button class="btn" type="submit">로그인</button>'
        + '<p class="alt"><button type="button" class="lnk" data-mode="reset">비밀번호를 잊었어요</button></p>',
      signup: '<label>이름<input name="name" required maxlength="40" autocomplete="name"></label>'
        + '<label>이메일<input name="email" type="email" autocomplete="email" required></label>'
        + '<label>비밀번호 <small>8자 이상</small><input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>'
        + '<fieldset class="pick"><legend>캠퍼스</legend>' + CAMPUSES.map(function (c, i) {
          return '<label><input type="radio" name="campus" value="' + esc(c) + '" required' + (i ? '' : '') + '><span>' + esc(c) + '</span></label>';
        }).join('') + '</fieldset>'
        + '<label>소속·메모 <small>선택 · 승인에 참고합니다</small><input name="note" maxlength="100" placeholder="예: 화목 저녁반"></label>'
        + agreeBlock()
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
      + '<div class="card">' + tabs + '<form data-form="' + mode + '">' + f + '<p class="note' + (ok ? ' ok' : '') + '" role="status">' + (note || '') + '</p></form></div>'
      + '<p class="legal"><a href="#/terms">이용약관</a> · <a href="#/privacy">개인정보 수집·이용 안내</a></p></div>';
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
        options: { emailRedirectTo: here, data: { name: v('name'), note: v('note'), campus: (form.querySelector('input[name=campus]:checked') || {}).value,
          agreed: { terms: DOC_VER, privacy: DOC_VER, at: new Date().toISOString() } } }
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

  function lockedView(st) {
    window.cipPlayer.reset();
    view.dataset.path = '';
    view.innerHTML = bar(st + '단계') + '<div class="gate"><div class="card"><h2>' + st + '단계 열람 권한이 없습니다</h2>'
      + '<p class="msg">지금 열람할 수 있는 과정: <b>' + me.stages.map(function (n) { return n + '단계'; }).join(', ') + '</b><br>'
      + st + '단계가 필요하면 담당 선생님께 요청해 주세요.</p>'
      + '<p class="row"><a class="btn" href="#/">처음으로</a><button class="btn ghost" type="button" data-act="recheck">권한 다시 확인</button></p></div></div>';
    addUserMenu();
  }

  function pendingView() {
    view.dataset.path = '';
    view.innerHTML = bar() + '<div class="gate"><div class="card"><h2>승인 대기 중입니다</h2>'
      + '<p class="msg"><b>' + esc(me.user.email) + '</b> 계정으로 <b>' + esc(campusTxt(me.campuses)) + '</b> 캠퍼스에 가입 신청이 접수되었습니다.<br>'
      + '담당 선생님이 볼 수 있는 단계를 열어 주면 교재가 열립니다. 연락을 받으면 ‘승인 확인’을 눌러 주세요.</p>'
      + '<p class="row"><button class="btn" type="button" data-act="recheck">승인 확인</button>'
      + '<a class="btn ghost" href="#/me">캠퍼스 변경</a>'
      + '<button class="btn ghost" type="button" data-act="logout">로그아웃</button></p></div></div>';
  }

  // ---------------------------------------------------------------- 내 정보 (본인 캠퍼스 변경)
  function meView() {
    window.cipPlayer.reset();
    view.dataset.path = 'me';
    var role = me.admin ? '전체 관리자' : me.teacher ? '선생님' : '학생';
    var multi = me.profile.role === 'teacher';
    var pick = me.admin ? '<p class="msg">전체 관리자는 모든 캠퍼스를 관리하므로 캠퍼스를 따로 고르지 않습니다.</p>'
      : '<form data-form="campus"><fieldset class="pick"><legend>' + (multi ? '담당 캠퍼스 <small>여러 곳 고를 수 있습니다</small>' : '소속 캠퍼스') + '</legend>'
        + CAMPUSES.map(function (c) {
          return '<label><input type="' + (multi ? 'checkbox' : 'radio') + '" name="campus" value="' + esc(c) + '"'
            + (me.campuses.indexOf(c) >= 0 ? ' checked' : '') + '><span>' + esc(c) + '</span></label>';
        }).join('') + '</fieldset>'
        + '<p class="msg sm">' + (multi ? '담당 캠퍼스의 학생만 보이고 관리할 수 있습니다.'
          : '캠퍼스를 옮기면 새 캠퍼스 선생님이 관리합니다. 열람 중인 단계는 그대로 유지됩니다.') + '</p>'
        + '<button class="btn" type="submit">저장</button><p class="note" role="status"></p></form>';
    view.innerHTML = bar('내 정보') + '<div class="gate"><div class="card"><h2>내 정보</h2>'
      + '<dl class="kv"><dt>이름</dt><dd>' + esc(me.profile.name || '-') + '</dd><dt>이메일</dt><dd>' + esc(me.user.email) + '</dd>'
      + '<dt>등급</dt><dd>' + role + '</dd>'
      + (me.teacher ? '' : '<dt>열람 단계</dt><dd>' + (me.stages.length ? me.stages.map(function (n) { return n + '단계'; }).join(', ') : '승인 대기') + '</dd>')
      + '<dt>캠퍼스</dt><dd class="cur">' + esc(me.admin ? '전체' : campusTxt(me.campuses)) + '</dd></dl>'
      + pick + '<p class="row back"><a class="lnk" href="#/">← 처음으로</a></p></div>'
      + (me.admin ? '' : '<details class="card leave"><summary>회원 탈퇴</summary>'
        + '<form data-form="leave"><p class="msg sm">탈퇴하면 계정과 열람 권한이 바로 삭제되며 되돌릴 수 없습니다. '
        + '같은 이메일로 다시 가입하면 새 회원으로 처음부터 승인을 받아야 합니다.</p>'
        + '<label>비밀번호 확인<input name="pw" type="password" autocomplete="current-password" required></label>'
        + '<button class="btn danger" type="submit">탈퇴하기</button><p class="note" role="status"></p></form></details>')
      + '</div>';
    addUserMenu();
    document.title = '내 정보 · SPEEDY CIP';
  }

  // 탈퇴: 비밀번호를 한 번 더 확인한 뒤 delete_my_account (전체 관리자는 서버에서 거절)
  function leave(form) {
    var out = form.querySelector('.note'), btn = form.querySelector('button[type=submit]');
    var say = function (t) { out.textContent = t; out.className = 'note err'; };
    if (!confirm('정말 탈퇴할까요? 계정과 열람 권한이 모두 삭제됩니다.')) return;
    btn.disabled = true;
    sb.auth.signInWithPassword({ email: me.user.email, password: form.elements.pw.value }).then(function (r) {
      if (r.error) { btn.disabled = false; return say('비밀번호가 맞지 않습니다.'); }
      return sb.rpc('delete_my_account').then(function (d) {
        if (d.error) { btn.disabled = false; return say('탈퇴하지 못했습니다: ' + d.error.message); }
        flash = '탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.';   // 로그아웃 뒤 로그인 화면에 표시
        location.hash = '#/';
        return sb.auth.signOut({ scope: 'local' });
      });
    });
  }

  function saveCampus(form) {
    var picked = [].map.call(form.querySelectorAll('input[name=campus]:checked'), function (i) { return i.value; });
    var out = form.querySelector('.note'), btn = form.querySelector('button[type=submit]');
    if (!picked.length) { out.textContent = '캠퍼스를 한 곳 이상 골라 주세요.'; out.className = 'note err'; return; }
    btn.disabled = true;
    sb.rpc('set_my_campuses', { campuses: picked }).then(function (r) {
      btn.disabled = false;
      if (r.error) { out.textContent = '바꾸지 못했습니다: ' + r.error.message; out.className = 'note err'; return; }
      me.campuses = r.data; me.profile.campuses = r.data;
      view.querySelector('.kv .cur').textContent = campusTxt(r.data);
      out.textContent = campusTxt(r.data) + ' 캠퍼스로 저장했습니다.'; out.className = 'note ok';
    });
  }

  // ---------------------------------------------------------------- 회원 관리 (선생님·전체 관리자)
  // 선생님: 학생마다 1·2·3단계 권한을 켜고 끈다. 전체 관리자: 여기에 더해 선생님 지정·해제.
  var adminFilter = 'wait', campusFilter = '', STAGES = [1, 2, 3];
  function adminView() {
    window.cipPlayer.reset();
    var tabs = [['wait', '승인 대기'], ['ok', '수강생'], ['teacher', '선생님'], ['all', '전체']];
    var mine = me.admin ? CAMPUSES : me.campuses;
    if (mine.indexOf(campusFilter) < 0) campusFilter = '';
    view.innerHTML = bar('회원 관리') + '<main class="index admin"><div class="card wide"><h2>회원 관리</h2>'
      + '<p class="msg">' + (me.admin ? '<b>전체 관리자</b> 계정입니다. 모든 캠퍼스의 회원을 관리합니다. 선생님은 먼저 회원가입을 한 뒤, 여기서 ‘선생님 지정’을 누르고 담당 캠퍼스를 고르면 됩니다.'
        : mine.length ? '<b>' + esc(mine.join(' · ')) + '</b> 캠퍼스 담당 선생님입니다. 담당 캠퍼스의 학생만 보이고 관리할 수 있습니다.'
        : '<b>담당 캠퍼스가 아직 지정되지 않았습니다.</b> 전체 관리자에게 캠퍼스 지정을 요청해 주세요.')
      + ' 학생 줄의 단계 단추를 누르면 그 단계가 열리거나 닫힙니다.</p>'
      + (mine.length > 1 ? '<div class="cfilter"><span>캠퍼스</span>' + [''].concat(mine).map(function (c) {
          return '<button type="button" data-cfilter="' + esc(c) + '"' + (c === campusFilter ? ' class="on"' : '') + '>' + (c ? esc(c) : '전체') + '</button>';
        }).join('') + '</div>' : '')
      + '<div class="tabs">' + tabs.map(function (t) { return '<button type="button" data-filter="' + t[0] + '">' + t[1] + '</button>'; }).join('')
      + '</div><div class="list"><p class="msg">불러오는 중…</p></div></div></main>';
    view.dataset.path = 'admin';
    addUserMenu();
    document.title = '회원 관리 · SPEEDY CIP';
    view.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.toggle('on', b.dataset.filter === adminFilter); });
    var q = sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (adminFilter === 'wait') q = q.eq('role', 'student').eq('stages', '{}');
    if (adminFilter === 'ok') q = q.eq('role', 'student').neq('stages', '{}');
    if (adminFilter === 'teacher') q = q.eq('role', 'teacher');
    if (campusFilter) q = q.contains('campuses', [campusFilter]);
    q.then(function (r) {
      var box = view.querySelector('.list');
      if (r.error) { box.innerHTML = '<p class="note err">' + esc(r.error.message) + '</p>'; return; }
      var rows = r.data.filter(function (p) { return p.id !== me.user.id; });
      if (!rows.length) { box.innerHTML = '<p class="msg">해당하는 회원이 없습니다.</p>'; return; }
      box.innerHTML = rows.map(memberRow).join('');
    });
  }

  function memberRow(p) {
    var d = new Date(p.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    var ctl;
    if (p.role === 'admin') {
      ctl = '<span class="badge">전체 관리자</span>';
    } else if (p.role === 'teacher') {
      ctl = '<span class="badge">선생님 · 전 단계</span>'
        + (me.admin ? '<div class="stg camp">' + CAMPUSES.map(function (c) {      // 담당 캠퍼스: 여러 곳
            var on = p.campuses.indexOf(c) >= 0;
            return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" data-tcampus="' + esc(c) + '" data-id="' + p.id
              + '" data-cur="' + esc(p.campuses.join(',')) + '">' + esc(c) + '</button>';
          }).join('') + '</div>'
          + '<button class="lnk" type="button" data-role="student" data-id="' + p.id + '" data-cur="' + esc(p.campuses.join(',')) + '">선생님 해제</button>'
          : '');
    } else {
      ctl = '<div class="stg">' + STAGES.map(function (n) {
        var on = p.stages.indexOf(n) >= 0;
        return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" data-stage="' + n + '" data-id="' + p.id
          + '" data-cur="' + p.stages.join(',') + '">' + n + '단계</button>';
      }).join('') + '</div>'
        + '<div class="mrow"><label class="cmp">캠퍼스 <select data-scampus data-id="' + p.id + '" data-cur="' + esc(p.campuses[0] || '') + '">'
        + (p.campuses.length ? '' : '<option value="" selected>미지정</option>')
        + CAMPUSES.map(function (c) { return '<option' + (p.campuses[0] === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('')
        + '</select></label>'
        + (me.admin ? '<button class="lnk" type="button" data-role="teacher" data-id="' + p.id + '">선생님 지정</button>' : '') + '</div>';
    }
    return '<div class="mem"><div class="info"><b>' + esc(p.name || '(이름 없음)') + '</b>'
      + (p.role !== 'admin' ? '<span class="cbadge' + (p.campuses.length ? '' : ' none') + '">' + esc(campusTxt(p.campuses)) + '</span>' : '')
      + '<span>' + esc(p.email) + '</span>' + (p.note ? '<span class="memo">' + esc(p.note) + '</span>' : '')
      + '<small>가입 ' + d + '</small></div><div class="ctl">' + ctl + '</div></div>';
  }

  // 저장 후 그 줄만 다시 그린다. 지금 탭 조건에서 벗어나면(예: 대기 → 수강생) 흐리게 한 뒤 뺀다.
  function saveMember(btn, patch, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    btn.disabled = true;
    // 저장과 다시 읽기를 나눈다: 담당 밖 캠퍼스로 옮기면 저장 결과를 돌려받을 권한이 없어(RETURNING에도 조회 규칙 적용) 한 번에 하면 거절된다.
    var id = btn.dataset.id, row = btn.closest('.mem');
    var write = btn.matches('[data-scampus]')        // 학생 캠퍼스 이동은 서버 함수로
      ? sb.rpc('move_student_campus', { target: id, campus: patch.campuses[0] })
      : sb.from('profiles').update(patch).eq('id', id);
    write.then(function (u) {
      if (u.error) return u;
      return sb.from('profiles').select('*').eq('id', id);
    }).then(function (r) {
      if (r.error) { alert('바꾸지 못했습니다: ' + r.error.message); btn.disabled = false; if (btn.dataset.cur != null && btn.tagName === 'SELECT') btn.value = btn.dataset.cur; return; }
      if (!r.data.length) {   // 담당 밖 캠퍼스로 옮겨져 이제 볼 수 없음
        row.classList.add('moved');
        row.querySelector('.ctl').innerHTML = '<span class="badge out">' + esc(patch.campuses && patch.campuses[0] || '') + ' 캠퍼스로 이동됨</span>';
        return;
      }
      var p = r.data[0];
      if (campusFilter && p.campuses.indexOf(campusFilter) < 0) { row.outerHTML = memberRow(p).replace('class="mem"', 'class="mem moved"'); return; }
      var keep = adminFilter === 'all'
        || (adminFilter === 'teacher' && p.role === 'teacher')
        || (adminFilter === 'wait' && p.role === 'student' && !p.stages.length)
        || (adminFilter === 'ok' && p.role === 'student' && p.stages.length > 0);
      if (keep) row.outerHTML = memberRow(p);
      else { row.outerHTML = memberRow(p).replace('class="mem"', 'class="mem moved"'); }
    });
  }

  function changeCampus(sel) {
    var to = sel.value, from = sel.dataset.cur;
    if (!to || to === from) return;
    var away = !me.admin && me.campuses.indexOf(to) < 0;
    var msg = (from ? from + ' → ' : '') + to + ' 캠퍼스로 옮길까요?' + (away ? '\n옮기면 담당 캠퍼스가 아니어서 더 이상 이 학생을 관리할 수 없습니다.' : '');
    if (!confirm(msg)) { sel.value = from; return; }
    saveMember(sel, { campuses: [to] });
  }

  function toggleTeacherCampus(btn) {
    var cur = btn.dataset.cur ? btn.dataset.cur.split(',') : [], c = btn.dataset.tcampus;
    saveMember(btn, { campuses: cur.indexOf(c) >= 0 ? cur.filter(function (x) { return x !== c; }) : cur.concat(c) });
  }

  function toggleStage(btn) {
    var cur = btn.dataset.cur ? btn.dataset.cur.split(',').map(Number) : [], n = +btn.dataset.stage;
    var next = cur.indexOf(n) >= 0 ? cur.filter(function (x) { return x !== n; }) : cur.concat(n);
    saveMember(btn, { stages: next });
  }

  // ---------------------------------------------------------------- 흐름
  function loadMe(user) {
    return Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.rpc('is_admin')
    ]).then(function (r) {
      var p = r[0].data || {}, admin = r[1].data === true;
      me = { user: user, profile: p, admin: admin, teacher: admin || p.role === 'teacher', stages: p.stages || [], campuses: p.campuses || [] };
    });
  }

  function route() {
    var path = routePath();
    if (DOCS[path]) return docView(path);           // 약관은 로그인 없이도 볼 수 있다
    if (!me) return authView();
    if (path === 'me') return meView();
    if (!me.teacher && !me.stages.length) return pendingView();
    if (path === 'admin') return me.teacher ? adminView() : (location.hash = '#/');
    var st = +(path.match(/^s(\d)\//) || [])[1];
    if (st && !me.teacher && me.stages.indexOf(st) < 0) return lockedView(st);
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

  view.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (ev.target.dataset.form === 'campus') return saveCampus(ev.target);
    if (ev.target.dataset.form === 'leave') return leave(ev.target);
    submit(ev.target);
  });
  view.addEventListener('change', function (ev) {
    if (ev.target.matches('[data-scampus]')) return changeCampus(ev.target);
    var box = ev.target.closest('.agree');                 // 전체 동의 ↔ 항목 동의 맞추기
    if (!box) return;
    var items = box.querySelectorAll('.agree-item input'), all = box.querySelector('[data-agree-all]');
    if (ev.target === all) items.forEach(function (i) { i.checked = all.checked; });
    else all.checked = [].every.call(items, function (i) { return i.checked; });
  });
  view.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-mode],[data-act],[data-filter],[data-cfilter],[data-stage],[data-tcampus],[data-role],a[href]');
    if (!t) return;
    if (t.dataset.mode) return authView(t.dataset.mode);
    if (t.dataset.filter) { adminFilter = t.dataset.filter; return adminView(); }
    if (t.dataset.cfilter != null) { campusFilter = t.dataset.cfilter; return adminView(); }
    if (t.dataset.stage) return toggleStage(t);
    if (t.dataset.tcampus) return toggleTeacherCampus(t);
    if (t.dataset.role === 'teacher') return saveMember(t, { role: 'teacher' },
      '이 회원을 선생님으로 지정할까요? 모든 단계를 볼 수 있고, 담당 캠퍼스 학생에게 단계 권한을 줄 수 있게 됩니다.\n(지금 캠퍼스가 담당 캠퍼스로 지정되며, 나중에 바꿀 수 있습니다)');
    if (t.dataset.role === 'student') return saveMember(t, { role: 'student', campuses: (t.dataset.cur || '').split(',').filter(Boolean).slice(0, 1) },
      '선생님 권한을 해제할까요? 학생 계정으로 돌아가며(캠퍼스는 한 곳만 남습니다), 볼 수 있는 단계는 따로 열어 주어야 합니다.');
    if (t.dataset.act === 'logout') return sb.auth.signOut();
    if (t.dataset.act === 'recheck') { view.dataset.path = ''; return loadMe(me.user).then(route); }
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
