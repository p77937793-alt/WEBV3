/* ═══════════════════════════════════════════════════════════════
   app.js｜前台：讀資料 → 產生整個頁面
   每個 render 函式只負責一個區塊；資料改了就整頁重畫一次。
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const { esc, safeUrl, img } = Store;
  const $ = (sel, root = document) => root.querySelector(sel);
  let DATA = null;
  let activeTag = '';   // 桌遊標籤篩選

  /* ── 區塊：公告 ── */
  function renderAnnounce(site) {
    const a = site.announcement || {};
    const el = $('#announce');
    if (!a.enabled || !a.text) { el.innerHTML = ''; return; }
    const url = safeUrl(a.link);
    el.innerHTML = `<div class="announce">${url ? `<a href="${esc(url)}">${esc(a.text)} →</a>` : esc(a.text)}</div>`;
  }

  /* ── 區塊：導覽列 ── */
  function renderNav(site) {
    const links = (site.nav || []).filter((n) => n.label)
      .map((n) => `<a href="${esc(safeUrl(n.target) || '#')}">${esc(n.label)}</a>`).join('');
    $('#nav').innerHTML = `
      <nav class="nav glass" aria-label="主要導覽">
        <a class="logo" href="#home">${esc(site.logoText || site.title || '')}</a>
        <div class="nav-links">${links}</div>
      </nav>`;
  }

  /* ── 區塊：首頁主視覺 ── */
  function renderHero(site) {
    const h = site.hero || {};
    const bg = img(h.image);
    return `
      <section id="home" class="hero${bg ? ' has-image' : ''}" ${bg ? `style="--hero-image:url('${esc(bg)}')"` : ''}>
        <div class="hero-water" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="hero-inner reveal">
          ${h.eyebrow ? `<p class="eyebrow">${esc(h.eyebrow)}</p>` : ''}
          <h1>${esc(h.title || site.title || '')}</h1>
          ${h.subtitle ? `<p class="lead">${esc(h.subtitle)}</p>` : ''}
          ${h.ctaLabel ? `<a class="btn primary" href="${esc(safeUrl(h.ctaTarget) || '#')}">${esc(h.ctaLabel)}</a>` : ''}
        </div>
      </section>`;
  }

  /* ── 區塊：Bento 格狀卡片 ── */
  function renderBento(home) {
    const items = (home?.bento || []).map((b) => {
      const url = safeUrl(b.target);
      const bg = img(b.image);
      const tag = url ? 'a' : 'div';
      return `
        <${tag} class="bento-item glass size-${esc(b.size || 'sm')} reveal${bg ? ' has-image' : ''}" ${url ? `href="${esc(url)}"` : ''} ${bg ? `style="--card-image:url('${esc(bg)}')"` : ''}>
          ${b.kicker ? `<p class="kicker">${esc(b.kicker)}</p>` : ''}
          ${b.stat ? `<p class="stat">${esc(b.stat)}<small>${esc(b.statLabel || '')}</small></p>` : ''}
          ${b.title ? `<h3>${esc(b.title)}</h3>` : ''}
          ${b.text ? `<p class="text">${esc(b.text)}</p>` : ''}
        </${tag}>`;
    }).join('');
    return items ? `<section class="section" aria-label="大圳重點"><div class="bento">${items}</div></section>` : '';
  }

  /* ── 區塊：大事記時間軸 ── */
  function renderTimeline(home) {
    const rows = (home?.timeline || []).filter((t) => t.year || t.text)
      .map((t) => `<li class="reveal"><strong>${esc(t.year)}</strong><span>${esc(t.text)}</span></li>`).join('');
    if (!rows) return '';
    return `
      <section id="timeline" class="section">
        <header class="section-head reveal"><h2>${esc(home.timelineTitle || '大事記')}</h2></header>
        <ol class="timeline">${rows}</ol>
      </section>`;
  }

  /* ── 區塊：小遊戲 ── */
  function renderGames(games) {
    if (!games) return '';
    const list = [['quiz', '問答'], ['pond', '經營']].filter(([k]) => games[k]?.enabled);
    if (!list.length) return '';
    const cards = list.map(([key, kind]) => {
      const g = games[key];
      return `
        <article class="game-card glass reveal">
          <p class="kicker">${kind}</p>
          <h3>${esc(g.title)}</h3>
          <p class="text">${esc(g.description || '')}</p>
          <button class="btn primary" type="button" data-game="${key}">開始玩</button>
        </article>`;
    }).join('');
    return `
      <section id="games" class="section">
        <header class="section-head reveal"><h2>${esc(games.title || '互動小遊戲')}</h2>${games.intro ? `<p>${esc(games.intro)}</p>` : ''}</header>
        <div class="game-grid">${cards}</div>
      </section>`;
  }

  /* ── 區塊：桌遊介紹 ── */
  function renderBoardgames(bg) {
    const all = bg?.items || [];
    if (!all.length) return '';
    const tags = [...new Set(all.flatMap((it) => it.tags || []))];
    if (activeTag && !tags.includes(activeTag)) activeTag = '';
    const items = activeTag ? all.filter((it) => (it.tags || []).includes(activeTag)) : all;
    const chips = tags.length > 1
      ? `<div class="chips" role="group" aria-label="用機制篩選">
           <button type="button" class="chip${activeTag ? '' : ' on'}" data-tag="" aria-pressed="${!activeTag}">全部</button>
           ${tags.map((t) => `<button type="button" class="chip${t === activeTag ? ' on' : ''}" data-tag="${esc(t)}" aria-pressed="${t === activeTag}">${esc(t)}</button>`).join('')}
         </div>` : '';
    const cards = items.map((it) => {
      const pic = img(it.image);
      return `
        <button type="button" class="bg-card glass${it.featured ? ' featured' : ''}" data-bg="${esc(it.id)}">
          <span class="bg-cover" ${pic ? `style="background-image:url('${esc(pic)}')"` : ''} aria-hidden="true">${pic ? '' : esc((it.name || '?').slice(0, 1))}</span>
          <span class="bg-body">
            <strong>${esc(it.name)}</strong>
            ${it.subtitle ? `<span class="text">${esc(it.subtitle)}</span>` : ''}
            <span class="meta">${playersText(it)}・${timeText(it)}${it.age ? '・' + esc(it.age) : ''}</span>
            <span class="tags">${(it.tags || []).map((t) => `<i>${esc(t)}</i>`).join('')}</span>
          </span>
        </button>`;
    }).join('');
    return `
      <section id="boardgames" class="section">
        <header class="section-head reveal"><h2>${esc(bg.title || '桌遊介紹')}</h2>${bg.intro ? `<p>${esc(bg.intro)}</p>` : ''}</header>
        ${chips}
        <div class="bg-grid">${cards}</div>
      </section>`;
  }
  const playersText = (it) => (it.playersMin === it.playersMax ? `${it.playersMin} 人` : `${it.playersMin}～${it.playersMax} 人`);
  const timeText = (it) => (it.timeMin === it.timeMax ? `${it.timeMin} 分鐘` : `${it.timeMin}～${it.timeMax} 分鐘`);

  /** 桌遊詳細內容（彈出視窗） */
  function openBoardgame(id) {
    const bg = DATA.boardgames;
    const it = (bg.items || []).find((x) => x.id === id);
    if (!it) return;
    const pic = img(it.image);
    const list = (arr) => (arr || []).filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join('');
    Modal.open(`
      <div class="modal-head"><h2 id="modal-title">${esc(it.name)}</h2><button class="icon-btn" type="button" data-close aria-label="關閉">×</button></div>
      <div class="bg-detail">
        ${pic ? `<img class="bg-photo" src="${esc(pic)}" alt="${esc(it.name)}">` : ''}
        <p class="meta">${playersText(it)}・${timeText(it)}${it.age ? '・' + esc(it.age) : ''}</p>
        <p class="tags">${(it.tags || []).map((t) => `<i>${esc(t)}</i>`).join('')}</p>
        ${it.summary ? `<p>${esc(it.summary)}</p>` : ''}
        ${list(it.contents) ? `<h3>一盒裡有什麼</h3><ul class="plain">${list(it.contents)}</ul>` : ''}
        <div class="bg-cols">
          <div>${Store.radarSVG(bg.radarLabels || [], it.radar || [])}</div>
          <div>
            ${list(it.traps) ? `<h3 class="warn">新手陷阱</h3><ul>${list(it.traps)}</ul>` : ''}
            ${list(it.tips) ? `<h3 class="good">進階心法</h3><ul>${list(it.tips)}</ul>` : ''}
          </div>
        </div>
      </div>`);
  }

  /* ── 區塊：聯絡與頁尾 ── */
  function renderContact(site) {
    const c = site.contact || {};
    const link = (label, url, text) => (url ? `<a class="btn ghost" href="${esc(safeUrl(url))}" ${/^https?:/i.test(url) ? 'target="_blank" rel="noopener"' : ''}>${label}${text ? '：' + esc(text) : ''}</a>` : '');
    return `
      <section id="contact" class="section">
        <div class="contact glass reveal">
          <h2>聯絡我們</h2>
          ${c.team ? `<p>${esc(c.team)}</p>` : ''}
          ${c.note ? `<p class="text">${esc(c.note)}</p>` : ''}
          <div class="contact-links">
            ${link('Email', c.email ? 'mailto:' + c.email : '', c.email)}
            ${link('Instagram', c.instagram)}
            ${link('Facebook', c.facebook)}
          </div>
        </div>
      </section>`;
  }

  /* ── 彈出視窗（小遊戲與桌遊共用） ── */
  const Modal = {
    el: null,
    open(html) {
      this.el = $('#modal');
      this.el.innerHTML = `<div class="modal-inner">${html}</div>`;
      if (!this.el.open) this.el.showModal();
    },
    close() { if (this.el?.open) this.el.close(); },
  };
  window.Modal = Modal;

  /* ── 整頁重畫 ── */
  function render() {
    const site = DATA.site || {};
    document.title = site.title || '';
    document.querySelector('meta[name=description]')?.setAttribute('content', site.description || '');
    renderAnnounce(site);
    renderNav(site);
    $('#app').innerHTML = renderHero(site) + renderBento(DATA.home) + renderTimeline(DATA.home) + renderGames(DATA.games) + renderBoardgames(DATA.boardgames) + renderContact(site);
    $('#footer').innerHTML = site.footer ? `<p>${esc(site.footer)}</p>` : '';
    observeReveal();
  }

  /** 捲動到畫面內才淡入（系統開「減少動態效果」時直接顯示） */
  function observeReveal() {
    const items = document.querySelectorAll('.reveal');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  }

  /* ── 事件（用事件委派，重畫後不用重新綁定） ── */
  document.addEventListener('click', (e) => {
    const game = e.target.closest('[data-game]');
    if (game) { Games.open(game.dataset.game, DATA.games[game.dataset.game]); return; }
    const bg = e.target.closest('[data-bg]');
    if (bg) { openBoardgame(bg.dataset.bg); return; }
    const tag = e.target.closest('[data-tag]');
    if (tag) {
      activeTag = tag.dataset.tag;
      const sec = $('#boardgames');
      sec.outerHTML = renderBoardgames(DATA.boardgames);
      document.querySelectorAll('#boardgames .reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    if (e.target.closest('[data-close]')) Modal.close();
  });
  // 點視窗外面的暗色區域也能關閉
  $('#modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) Modal.close(); });
  $('#modal').addEventListener('close', () => Games.stop());

  /* ── 啟動 ── */
  async function start() {
    try {
      DATA = await Store.load();
      render();
    } catch (err) {
      console.error(err);
      $('#app').innerHTML = `
        <div class="load-error glass">
          <h1>內容載入失敗</h1>
          <p>讀不到 <code>data.json</code>。如果你是直接點兩下打開這個檔案，請改用 VS Code 的 Live Server，或上傳到 GitHub Pages 後用網址開啟。</p>
          <button class="btn primary" type="button" onclick="location.reload()">重新整理</button>
        </div>`;
    }
    if (Store.isPreview()) {
      $('#preview-bar').hidden = false;
      // 後台一存草稿，這個分頁就自動重畫（即時預覽）
      addEventListener('storage', (e) => {
        if (e.key !== Store.KEYS.draft && e.key !== Store.KEYS.pending) return;
        const draft = Store.ls.get(Store.KEYS.draft);
        if (draft) { DATA = draft; render(); }
      });
    }
  }
  start();
})();
