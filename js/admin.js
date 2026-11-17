/* ═══════════════════════════════════════════════════════════════
   admin.js｜後台管理系統
   1. 狀態與草稿    修改 → 自動存成草稿（localStorage）→ 預覽分頁即時更新
   2. 表單產生器    每個欄位用 data-path 指到資料裡的位置，輸入時自動寫回
   3. 三個模組畫面  A 網站內容／B 小遊戲／C 桌遊百科，加上發布設定
   4. 清單操作      新增、刪除、上移、下移
   5. 圖片上傳      先縮圖暫存，發布時才上傳到 GitHub
   6. 發布          檢查資料 → 檢查線上是否被別人改過 → 上傳圖片 → 寫入 data.json
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const { esc, ls, KEYS, uid } = Store;
  const $ = (sel, root = document) => root.querySelector(sel);
  Store.usePending = true;                // 後台顯示圖片時，尚未上傳的用暫存圖

  /* ═════════ 1. 狀態與草稿 ═════════ */
  let state = null;                       // 正在編輯的整份資料
  let view = 'site';                      // 目前的模組
  let dirty = false;                      // 有沒有未發布的修改
  let saveTimer = null;
  const openKeys = new Set();             // 記住哪些清單項目是展開的
  const UPLOADED = 'yq-cms-uploaded-v1';  // 已經上傳過、下次進後台可以清掉的暫存圖

  const val = (path) => Store.get(state, path);

  function setStatus() {
    const el = $('#status');
    el.textContent = dirty ? '有未發布的修改（草稿已自動儲存）' : '內容與線上版本一致';
    el.classList.toggle('dirty', dirty);
  }

  /** 把目前內容存成草稿。預覽分頁會收到 storage 事件自動重畫 */
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!ls.set(KEYS.draft, state)) toast('草稿存不進瀏覽器（空間不足或隱私模式），請先匯出 JSON 備份。', 'err');
    ls.set(KEYS.dirty, dirty);
  }
  /** 任何修改都呼叫這個：標記為未發布，稍後自動存草稿 */
  function touch() {
    dirty = true;
    setStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 400);
  }

  /* ── 提示訊息 ── */
  function toast(msg, type = 'ok', title = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');
    el.innerHTML = (title ? `<b>${esc(title)}</b>` : '') + esc(msg);
    $('#toasts').append(el);
    setTimeout(() => el.remove(), type === 'ok' ? 4000 : 8000);
  }

  /** 確認視窗，回傳 Promise<boolean> */
  function ask(message, okLabel = '確定', danger = false) {
    const dlg = $('#ask');
    dlg.innerHTML = `<p>${esc(message)}</p>
      <div class="row-actions"><button class="btn" type="button" value="no">取消</button>
      <button class="btn primary" type="button" value="yes"${danger ? ' style="background:var(--bad)"' : ''}>${esc(okLabel)}</button></div>`;
    return new Promise((resolve) => {
      dlg.onclick = (e) => { const b = e.target.closest('button'); if (b) { dlg.close(); resolve(b.value === 'yes'); } };
      dlg.oncancel = () => resolve(false);
      dlg.showModal();
    });
  }

  /* ═════════ 2. 表單產生器 ═════════
     每個函式回傳一段 HTML。data-path 是資料路徑（例如 site.hero.title），
     data-type 決定輸入的字要怎麼轉換（數字、勾選、逗號清單、一行一項）。 */
  const hintHtml = (o) => (o.hint ? `<small class="hint">${esc(o.hint)}</small>` : '');
  const labelHtml = (label, o) => `<span>${esc(label)}${o.required ? '<i>*</i>' : ''}</span>`;
  const F = {
    text(path, label, o = {}) {
      return `<label class="f${o.wide ? ' wide' : ''}">${labelHtml(label, o)}
        <input type="${o.type || 'text'}" data-path="${path}" value="${esc(val(path) ?? '')}" placeholder="${esc(o.placeholder || '')}"${o.required ? ' data-required' : ''}>${hintHtml(o)}</label>`;
    },
    area(path, label, o = {}) {
      return `<label class="f wide">${labelHtml(label, o)}
        <textarea data-path="${path}" rows="${o.rows || 2}">${esc(val(path) ?? '')}</textarea>${hintHtml(o)}</label>`;
    },
    /** 一行一項的清單（新手陷阱、進階心法、盒內物品） */
    lines(path, label, o = {}) {
      return `<label class="f wide">${labelHtml(label, o)}
        <textarea data-path="${path}" data-type="lines" rows="${o.rows || 3}" placeholder="一行寫一項">${esc((val(path) || []).join('\n'))}</textarea>${hintHtml(o)}</label>`;
    },
    /** 用逗號分隔的清單（機制標籤） */
    csv(path, label, o = {}) {
      return `<label class="f${o.wide ? ' wide' : ''}">${labelHtml(label, o)}
        <input type="text" data-path="${path}" data-type="csv" value="${esc((val(path) || []).join('、'))}" placeholder="用逗號或頓號分隔">${hintHtml(o)}</label>`;
    },
    num(path, label, o = {}) {
      const attrs = ['min', 'max', 'step'].filter((k) => o[k] != null).map((k) => `${k}="${o[k]}"`).join(' ');
      return `<label class="f">${labelHtml(label, o)}
        <input type="number" inputmode="decimal" data-path="${path}" data-type="num" value="${esc(val(path) ?? '')}" ${attrs}>${hintHtml(o)}</label>`;
    },
    check(path, label) {
      return `<label class="f check"><input type="checkbox" data-path="${path}" data-type="bool"${val(path) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    },
    select(path, label, options, o = {}) {
      const cur = val(path);
      return `<label class="f">${labelHtml(label, o)}
        <select data-path="${path}"${o.num ? ' data-type="num"' : ''}>
          ${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}
        </select>${hintHtml(o)}</label>`;
    },
    image(path, label) {
      const src = Store.img(val(path));
      return `<div class="f wide"><span>${esc(label)}</span>
        <div class="image-row">
          <span class="thumb"${src ? ` style="background-image:url('${esc(src)}')"` : ''}></span>
          <input type="text" data-path="${path}" value="${esc(val(path) ?? '')}" placeholder="按「上傳圖片」，或填圖片路徑">
          <button class="btn" type="button" data-act="upload" data-target="${path}">上傳圖片</button>
          ${val(path) ? `<button class="btn ghost" type="button" data-act="clear-image" data-target="${path}">移除</button>` : ''}
        </div></div>`;
    },
  };

  const card = (title, body, hint = '') => `<section class="card glass"><h2>${esc(title)}</h2>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}${body}</section>`;
  const grid = (...fields) => `<div class="grid">${fields.join('')}</div>`;

  /**
   * 可新增／刪除／排序的清單。
   * path：陣列在資料裡的位置；titleKey：用哪個欄位當每一項的標題；
   * tpl：新增時用哪個範本（見 TEMPLATES）；body(p, item, i)：每一項裡面的欄位。
   */
  function list(path, { titleKey, tpl, addLabel, body, fallback = '（未命名）' }) {
    const arr = val(path) || [];
    const items = arr.map((item, i) => {
      const p = `${path}.${i}`;
      const key = `${path}:${item.id ?? i}`;
      return `
        <details class="item" data-key="${esc(key)}"${openKeys.has(key) ? ' open' : ''}>
          <summary>
            <span class="item-title" data-mirror="${p}.${titleKey}" data-fallback="${esc(fallback)}">${esc(item[titleKey] || fallback)}</span>
            <span class="item-actions">
              <button class="mini" type="button" data-act="up" data-list="${path}" data-i="${i}" aria-label="上移"${i === 0 ? ' disabled' : ''}>↑</button>
              <button class="mini" type="button" data-act="down" data-list="${path}" data-i="${i}" aria-label="下移"${i === arr.length - 1 ? ' disabled' : ''}>↓</button>
              <button class="mini danger" type="button" data-act="del" data-list="${path}" data-i="${i}" aria-label="刪除">✕</button>
            </span>
          </summary>
          <div class="grid">${body(p, item, i)}</div>
        </details>`;
    }).join('');
    return `<div class="list">${items}</div>
      <button class="btn add" type="button" data-act="add" data-list="${path}" data-tpl="${tpl}">＋ ${esc(addLabel)}</button>`;
  }

  /** 新增項目時的預設內容 */
  const TEMPLATES = {
    nav: () => ({ label: '新連結', target: '#home' }),
    bento: () => ({ id: uid('b'), size: 'sm', kicker: '', title: '新卡片', text: '', stat: '', statLabel: '', target: '', image: '' }),
    timeline: () => ({ id: uid('t'), year: '', text: '' }),
    rank: () => ({ min: 0, label: '新稱號' }),
    quizLevel: () => ({ id: uid('lv'), label: '新難度', maxLevel: 1, timeFactor: 1, scoreFactor: 1 }),
    question: () => ({ id: uid('q'), q: '', options: ['', '', '', ''], answer: 0, explain: '', level: 1 }),
    pondLevel: () => ({ id: uid('lv'), label: '新難度', capacity: 100, startWater: 40, demand: 35, rainMin: 40, rainMax: 70, dryMin: 0, dryMax: 15 }),
    boardgame: () => ({ id: uid('g'), name: '', subtitle: '', tags: [], playersMin: 2, playersMax: 4, timeMin: 30, timeMax: 45, age: '', summary: '', contents: [], radar: [3, 3, 3, 3, 3], traps: [], tips: [], image: '', featured: false }),
  };

  /* ═════════ 3. 模組畫面 ═════════ */
  const TARGET_HINT = '站內位置：#home、#timeline、#games、#boardgames、#contact；也可以填完整網址';

  /** 模組 A：網站全域內容 */
  function viewSite() {
    return [
      card('基本資訊', grid(
        F.text('site.title', '網站名稱', { required: true }),
        F.text('site.logoText', '左上角顯示的名稱'),
        F.area('site.description', '網站簡介（搜尋引擎與分享連結時顯示）'),
        F.area('site.footer', '頁尾文字'),
      )),
      card('公告', grid(
        F.check('site.announcement.enabled', '在網站最上方顯示公告'),
        F.text('site.announcement.text', '公告文字', { wide: true }),
        F.text('site.announcement.link', '點公告要去哪裡', { wide: true, hint: TARGET_HINT }),
      )),
      card('導覽列', list('site.nav', {
        titleKey: 'label', tpl: 'nav', addLabel: '新增連結',
        body: (p) => F.text(`${p}.label`, '文字', { required: true }) + F.text(`${p}.target`, '連到哪裡', { hint: TARGET_HINT }),
      })),
      card('首頁主視覺', grid(
        F.text('site.hero.eyebrow', '小標'),
        F.text('site.hero.title', '大標題'),
        F.area('site.hero.subtitle', '標語'),
        F.text('site.hero.ctaLabel', '按鈕文字'),
        F.text('site.hero.ctaTarget', '按鈕連到哪裡', { hint: TARGET_HINT }),
        F.image('site.hero.image', '背景圖（可不放）'),
      )),
      card('首頁重點卡片', list('home.bento', {
        titleKey: 'title', tpl: 'bento', addLabel: '新增卡片', fallback: '（數字卡）',
        body: (p) => F.select(`${p}.size`, '大小', [['sm', '小'], ['wide', '寬'], ['tall', '高'], ['lg', '大']])
          + F.text(`${p}.kicker`, '左上小標') + F.text(`${p}.title`, '標題') + F.area(`${p}.text`, '說明')
          + F.text(`${p}.stat`, '大數字（可不填）') + F.text(`${p}.statLabel`, '數字的單位或說明')
          + F.text(`${p}.target`, '點了要去哪裡（可不填）', { wide: true, hint: TARGET_HINT })
          + F.image(`${p}.image`, '背景圖（可不放）'),
      }), '卡片依這裡的順序排列；大卡佔兩欄兩列，寬卡佔兩欄。'),
      card('大事記', grid(F.text('home.timelineTitle', '區塊標題')) + list('home.timeline', {
        titleKey: 'year', tpl: 'timeline', addLabel: '新增一筆', fallback: '（未填年份）',
        body: (p) => F.text(`${p}.year`, '年份') + F.area(`${p}.text`, '說明'),
      })),
      card('聯絡資訊', grid(
        F.text('site.contact.team', '團隊名稱', { wide: true }),
        F.text('site.contact.email', 'Email', { type: 'email' }),
        F.text('site.contact.instagram', 'Instagram 網址', { type: 'url' }),
        F.text('site.contact.facebook', 'Facebook 網址', { type: 'url' }),
        F.area('site.contact.note', '補充說明'),
      )),
    ].join('');
  }

  /** 模組 B：互動小遊戲控制台 */
  function viewGames() {
    const levelOptions = (path) => (val(path) || []).map((l) => [l.id, l.label || l.id]);
    const ranks = (path) => list(path, {
      titleKey: 'label', tpl: 'rank', addLabel: '新增稱號',
      body: (p) => F.text(`${p}.label`, '稱號') + F.num(`${p}.min`, '達到幾 % 以上', { min: 0, max: 100 }),
    });
    const qCount = (val('games.quiz.questions') || []).length;
    return [
      card('區塊文字', grid(F.text('games.title', '區塊標題'), F.area('games.intro', '區塊說明'))),

      card('遊戲一：快問快答', grid(
        F.check('games.quiz.enabled', '在網站上顯示這個遊戲'),
        F.text('games.quiz.title', '遊戲名稱'),
        F.area('games.quiz.description', '卡片上的簡介'),
        F.area('games.quiz.rules', '規則說明（開始前顯示）'),
        F.num('games.quiz.questionsPerRound', '每回合題數', { min: 1, max: 50 }),
        F.num('games.quiz.secondsPerQuestion', '每題秒數', { min: 5, max: 120 }),
        F.num('games.quiz.pointsCorrect', '答對得分', { min: 0 }),
        F.num('games.quiz.timeBonus', '每剩 1 秒加幾分', { min: 0 }),
        F.select('games.quiz.defaultDifficulty', '預設難度', levelOptions('games.quiz.difficulties')),
      )),
      card('快問快答：難度', list('games.quiz.difficulties', {
        titleKey: 'label', tpl: 'quizLevel', addLabel: '新增難度',
        body: (p) => F.text(`${p}.label`, '名稱', { required: true })
          + F.select(`${p}.maxLevel`, '出題範圍', [[1, '只出簡單題'], [2, '簡單＋普通題'], [3, '全部題目']], { num: true })
          + F.num(`${p}.timeFactor`, '時間倍率', { min: 0.3, max: 3, step: 0.1, hint: '0.7＝時間變成七成' })
          + F.num(`${p}.scoreFactor`, '分數倍率', { min: 0.5, max: 5, step: 0.1 }),
      })),
      card('快問快答：稱號', ranks('games.quiz.ranks'), '依答對的比例給稱號，取符合條件的最高一級。'),
      card(`快問快答：題庫（${qCount} 題）`, list('games.quiz.questions', {
        titleKey: 'q', tpl: 'question', addLabel: '新增題目', fallback: '（還沒寫題目）',
        body: (p) => F.area(`${p}.q`, '題目', { required: true })
          + [0, 1, 2, 3].map((k) => F.text(`${p}.options.${k}`, `選項 ${k + 1}`)).join('')
          + F.select(`${p}.answer`, '正確答案', [[0, '選項 1'], [1, '選項 2'], [2, '選項 3'], [3, '選項 4']], { num: true })
          + F.select(`${p}.level`, '題目難度', [[1, '簡單'], [2, '普通'], [3, '困難']], { num: true })
          + F.area(`${p}.explain`, '作答後的說明'),
      }), '遊戲時選項會自動打亂順序。選項留空就不會出現。'),

      card('遊戲二：埤塘管理員', grid(
        F.check('games.pond.enabled', '在網站上顯示這個遊戲'),
        F.text('games.pond.title', '遊戲名稱'),
        F.area('games.pond.description', '卡片上的簡介'),
        F.area('games.pond.rules', '規則說明（開始前顯示）'),
        F.num('games.pond.rounds', '一局幾季', { min: 2, max: 20, hint: '單數季是雨季，雙數季是乾季' }),
        F.num('games.pond.pointsHarvest', '豐收一季得分', { min: 0 }),
        F.num('games.pond.pointsWaste', '多放 1 單位水扣幾分', { min: 0 }),
        F.num('games.pond.pointsOverflow', '滿出 1 單位水扣幾分', { min: 0 }),
        F.select('games.pond.defaultDifficulty', '預設難度', levelOptions('games.pond.difficulties')),
      )),
      card('埤塘管理員：難度與關卡參數', list('games.pond.difficulties', {
        titleKey: 'label', tpl: 'pondLevel', addLabel: '新增難度',
        body: (p) => F.text(`${p}.label`, '名稱', { required: true })
          + F.num(`${p}.capacity`, '埤塘容量', { min: 1 }) + F.num(`${p}.startWater`, '起始水量', { min: 0 })
          + F.num(`${p}.demand`, '田每季需水量', { min: 1 })
          + F.num(`${p}.rainMin`, '雨季進水（最少）', { min: 0 }) + F.num(`${p}.rainMax`, '雨季進水（最多）', { min: 0 })
          + F.num(`${p}.dryMin`, '乾季進水（最少）', { min: 0 }) + F.num(`${p}.dryMax`, '乾季進水（最多）', { min: 0 }),
      }), '容量越小、需水量越高、乾季進水越少，遊戲越難。'),
      card('埤塘管理員：稱號', ranks('games.pond.ranks'), '依豐收季數的比例給稱號。'),
    ].join('');
  }

  /** 模組 C：桌遊介紹百科 */
  function viewBoardgames() {
    const labels = val('boardgames.radarLabels') || [];
    return [
      card('區塊文字', grid(F.text('boardgames.title', '區塊標題'), F.area('boardgames.intro', '區塊說明'))),
      card('雷達圖的評分項目', grid(...labels.map((_, i) => F.text(`boardgames.radarLabels.${i}`, `項目 ${i + 1}`, { required: true }))), '所有桌遊共用這五個項目。'),
      card('桌遊清單', list('boardgames.items', {
        titleKey: 'name', tpl: 'boardgame', addLabel: '新增桌遊',
        body: (p, item) => F.text(`${p}.name`, '桌遊名稱', { required: true }) + F.text(`${p}.subtitle`, '一句話介紹')
          + F.csv(`${p}.tags`, '機制標籤', { wide: true, hint: '例如：半合作、資源交易。網站上可以用標籤篩選' })
          + F.num(`${p}.playersMin`, '人數（最少）', { min: 1 }) + F.num(`${p}.playersMax`, '人數（最多）', { min: 1 })
          + F.num(`${p}.timeMin`, '時間（最短，分鐘）', { min: 1 }) + F.num(`${p}.timeMax`, '時間（最長，分鐘）', { min: 1 })
          + F.text(`${p}.age`, '適合年齡', { placeholder: '10+' }) + F.check(`${p}.featured`, '主打（卡片加金色外框）')
          + F.area(`${p}.summary`, '介紹', { rows: 3 })
          + F.lines(`${p}.contents`, '一盒裡有什麼')
          + `<div class="f wide"><span>策略評分（0～5）</span>
               <div class="radar-edit">
                 <div data-radar="${p}">${Store.radarSVG(labels, item.radar || [])}</div>
                 <div class="grid">${labels.map((l, k) => F.num(`${p}.radar.${k}`, l || `項目 ${k + 1}`, { min: 0, max: 5, step: 0.5 })).join('')}</div>
               </div></div>`
          + F.lines(`${p}.traps`, '新手陷阱') + F.lines(`${p}.tips`, '進階心法')
          + F.image(`${p}.image`, '圖片'),
      })),
    ].join('');
  }

  /** 發布設定與備份 */
  function viewPublish() {
    const c = GH.cfg();
    const field = (key, label, o = {}) => `<label class="f${o.wide ? ' wide' : ''}"><span>${esc(label)}</span>
      <input type="${o.type || 'text'}" data-cfg="${key}" value="${esc(c[key] ?? '')}" placeholder="${esc(o.placeholder || '')}" autocomplete="off">${hintHtml(o)}</label>`;
    return [
      card('GitHub 發布設定', grid(
        field('owner', 'GitHub 帳號', { placeholder: '例如 p77937793-alt' }),
        field('repo', '儲存庫名稱', { placeholder: '放這個網站的儲存庫' }),
        field('branch', '分支', { placeholder: 'main' }),
        field('basePath', '網站在儲存庫裡的資料夾（放在最外層就留空）'),
        field('token', '權杖（Fine-grained token）', { type: 'password', wide: true, hint: '只需要這個儲存庫的 Contents：Read and write 權限。權杖只存在這個瀏覽器，不會寫進網站。' }),
        `<label class="f check"><input type="checkbox" data-cfg="remember"${c.remember ? ' checked' : ''}><span>在這台裝置記住權杖（公用電腦請不要勾）</span></label>`,
      ) + `<div class="row-actions"><button class="btn" type="button" data-act="test">測試連線</button></div>`,
      '填一次就好。之後改完內容按右上角「發布」，網站約 1～2 分鐘後更新。'),
      card('備份與還原', `<div class="row-actions">
          <button class="btn" type="button" data-act="export">匯出 data.json</button>
          <button class="btn" type="button" data-act="import">匯入 data.json</button>
          <button class="btn ghost" type="button" data-act="discard">捨棄草稿，回到線上版本</button>
        </div>`, '大改之前先匯出一份；匯入會取代目前的草稿，按「發布」才會影響網站。'),
      card('怎麼運作', `<ol class="steps">
          <li>在後台修改 → 自動存成這個瀏覽器裡的草稿。</li>
          <li>按「預覽」→ 新分頁顯示草稿，後台一改它就跟著變。訪客看不到草稿。</li>
          <li>按「發布」→ 先檢查內容，再把圖片和 data.json 寫進 GitHub，網站自動更新。</li>
        </ol>`),
    ].join('');
  }

  const VIEWS = {
    site: ['A｜網站內容', viewSite],
    games: ['B｜互動小遊戲控制台', viewGames],
    boardgames: ['C｜桌遊介紹百科', viewBoardgames],
    publish: ['發布設定', viewPublish],
  };

  function render(keepScroll = true) {
    const y = scrollY;
    const [title, fn] = VIEWS[view];
    $('#view-title').textContent = title;
    $('#view').innerHTML = fn();
    document.querySelectorAll('[data-view]').forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    setStatus();
    scrollTo(0, keepScroll ? y : 0);
  }
  function go(name) { view = name; render(false); }

  /* ═════════ 輸入事件：把欄位的值寫回資料 ═════════ */
  function readField(el) {
    switch (el.dataset.type) {
      case 'num': return el.value === '' ? null : Number(el.value);
      case 'bool': return el.checked;
      case 'csv': return el.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      case 'lines': return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      default: return el.value;
    }
  }
  /** 即時檢查：必填沒填、數字超出範圍就標紅 */
  function checkField(el) {
    let bad = false;
    if (el.hasAttribute('data-required')) bad = !el.value.trim();
    if (el.dataset.type === 'num' && el.tagName === 'INPUT') {
      const n = Number(el.value);
      bad = el.value === '' || Number.isNaN(n) || (el.min !== '' && n < Number(el.min)) || (el.max !== '' && n > Number(el.max));
    }
    el.classList.toggle('invalid', bad);
    el.setAttribute('aria-invalid', bad);
  }

  $('#view').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.cfg) { GH.saveCfgFromForm(); return; }
    if (!el.dataset.path) return;
    const path = el.dataset.path;
    Store.set(state, path, readField(el));
    checkField(el);
    touch();
    // 清單標題跟著輸入更新
    document.querySelectorAll(`[data-mirror="${path}"]`).forEach((m) => { m.textContent = el.value || m.dataset.fallback; });
    // 雷達圖即時預覽
    const radar = path.match(/^(boardgames\.items\.\d+)\.radar\.\d+$/);
    if (radar) $(`[data-radar="${radar[1]}"]`).innerHTML = Store.radarSVG(val('boardgames.radarLabels') || [], val(radar[1] + '.radar') || []);
  });
  // 這些欄位改了會影響其他地方的選項或縮圖，離開欄位時重畫一次
  $('#view').addEventListener('change', (e) => {
    const path = e.target.dataset.path || '';
    if (/\.difficulties\.\d+\.label$|radarLabels|\.image$/.test(path)) render();
  });
  // 記住展開的項目，重畫後維持原樣（toggle 事件不會冒泡，所以用捕獲）
  $('#view').addEventListener('toggle', (e) => {
    const key = e.target.dataset?.key;
    if (key) e.target.open ? openKeys.add(key) : openKeys.delete(key);
  }, true);

  /* ═════════ 4. 清單操作與其他按鈕 ═════════ */
  $('#view').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    e.preventDefault();                   // 按鈕在 <summary> 裡，避免順便展開／收合
    const { act, list: path, i, tpl, target } = btn.dataset;
    const arr = path ? (val(path) || (Store.set(state, path, []), val(path))) : null;
    const idx = Number(i);

    if (act === 'add') {
      const item = TEMPLATES[tpl]();
      arr.push(item);
      const key = `${path}:${item.id ?? arr.length - 1}`;
      openKeys.add(key);
      touch(); render();
      const el = $(`[data-key="${CSS.escape(key)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector('input, textarea')?.focus({ preventScroll: true });
    } else if (act === 'del') {
      const name = arr[idx]?.name || arr[idx]?.q || arr[idx]?.label || arr[idx]?.title || arr[idx]?.year || '這一項';
      if (!(await ask(`確定要刪除「${name}」嗎？`, '刪除', true))) return;
      arr.splice(idx, 1);
      touch(); render();
      toast('已刪除。還沒發布前，可以用「捨棄草稿」復原。');
    } else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? idx - 1 : idx + 1;
      if (j < 0 || j >= arr.length) return;
      // 沒有 id 的項目用位置記展開狀態，交換時一起換
      const k1 = `${path}:${arr[idx].id ?? idx}`, k2 = `${path}:${arr[j].id ?? j}`;
      if (arr[idx].id == null) { const a = openKeys.has(k1), b = openKeys.has(k2); a ? openKeys.add(k2) : openKeys.delete(k2); b ? openKeys.add(k1) : openKeys.delete(k1); }
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      touch(); render();
    } else if (act === 'upload') {
      uploadTarget = target;
      $('#file-image').click();
    } else if (act === 'clear-image') {
      Store.set(state, target, '');
      touch(); render();
    } else if (act === 'test') {
      testConnection();
    } else if (act === 'export') {
      const blob = new Blob([JSON.stringify(state, null, 2) + '\n'], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'data.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('已匯出 data.json。');
    } else if (act === 'import') {
      $('#file-json').click();
    } else if (act === 'discard') {
      if (!(await ask('捨棄所有未發布的修改，回到線上版本？這個動作無法復原。', '捨棄草稿', true))) return;
      try {
        state = await Store.fetchLive();
        dirty = false;
        ls.set(KEYS.base, state.meta?.updatedAt || '');
        ls.del(KEYS.pending);
        saveDraft(); render();
        toast('已回到線上版本。');
      } catch { toast('讀不到線上的 data.json，草稿沒有變動。', 'err'); }
    }
  });

  $('#file-json').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.site) throw new Error('格式不對');
      if (!(await ask('用這個檔案取代目前的草稿？', '匯入'))) return;
      state = data;
      touch(); render();
      toast('已匯入。確認內容後按「發布」才會更新網站。');
    } catch { toast('這個檔案不是有效的 data.json。', 'err'); }
  });

  /* ═════════ 5. 圖片上傳 ═════════
     選圖 → 縮到最長邊 1600 px → 暫存在瀏覽器（預覽看得到）→ 發布時才上傳到 images/uploads/ */
  let uploadTarget = null;
  $('#file-image').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !uploadTarget) return;
    try {
      const dataUrl = await shrinkImage(file);
      const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'image';
      const path = `images/uploads/${Date.now().toString(36)}-${base}.${ext}`;
      const pending = ls.get(KEYS.pending) || {};
      pending[path] = dataUrl;
      if (!ls.set(KEYS.pending, pending)) { toast('圖片太大，瀏覽器存不下。請換小一點的圖。', 'err'); return; }
      Store.set(state, uploadTarget, path);
      touch(); render();
      toast('圖片已加入草稿，發布時會一起上傳。');
    } catch { toast('這張圖片讀不了，請換成 JPG 或 PNG。', 'err'); }
  });

  function shrinkImage(file, maxSide = 1600) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * scale);
        cv.height = Math.round(im.height * scale);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        // PNG 保留透明背景，其他轉成 JPG 縮小檔案
        resolve(file.type === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      im.src = url;
    });
  }

  /* ═════════ 6. GitHub 發布 ═════════ */
  const GH = {
    CFG: 'yq-cms-github-v1', TOKEN: 'yq-cms-token-v1',
    /** 讀設定；第一次會從 GitHub Pages 的網址猜帳號與儲存庫 */
    cfg() {
      const saved = ls.get(this.CFG) || {};
      const guess = {};
      if (location.hostname.endsWith('.github.io')) {
        guess.owner = location.hostname.split('.')[0];
        guess.repo = location.pathname.split('/').filter(Boolean)[0]?.replace(/\.html$/, '') || location.hostname;
        if (guess.repo === 'admin' || guess.repo === 'index') guess.repo = location.hostname;
      }
      const token = sessionStorage.getItem(this.TOKEN) || (saved.remember ? localStorage.getItem(this.TOKEN) : '') || '';
      return { owner: '', repo: '', branch: 'main', basePath: '', remember: false, ...guess, ...saved, token };
    },
    saveCfgFromForm() {
      const c = {};
      document.querySelectorAll('[data-cfg]').forEach((el) => { c[el.dataset.cfg] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
      const { token, ...rest } = c;
      rest.basePath = (rest.basePath || '').replace(/^\/+|\/+$/g, '');
      ls.set(this.CFG, rest);
      try {
        sessionStorage.setItem(this.TOKEN, token || '');
        rest.remember && token ? localStorage.setItem(this.TOKEN, token) : localStorage.removeItem(this.TOKEN);
      } catch { /* 忽略 */ }
    },
    ready() { const c = this.cfg(); return !!(c.owner && c.repo && c.branch && c.token); },
    path(p) { const c = this.cfg(); return (c.basePath ? c.basePath + '/' : '') + p; },

    async api(url, options = {}) {
      const c = this.cfg();
      const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${url}`, {
        ...options,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${c.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (res.status === 404 && options.allow404) return null;
      if (!res.ok) throw new Error(this.explain(res.status));
      return res.json();
    },
    explain(status) {
      return ({
        401: '權杖無效或已過期，請到 GitHub 重新產生。',
        403: '權杖的權限不夠。請確認它有這個儲存庫的 Contents：Read and write。',
        404: '找不到儲存庫、分支或資料夾，請檢查發布設定。',
        409: '線上的檔案剛剛被別人改過，請再按一次發布。',
        422: 'GitHub 不接受這次寫入，請確認分支名稱正確。',
      })[status] || `GitHub 回應錯誤（${status}）。`;
    },
    enc: (p) => p.split('/').map(encodeURIComponent).join('/'),
    getFile(p) { return this.api(`/contents/${this.enc(this.path(p))}?ref=${encodeURIComponent(this.cfg().branch)}`, { allow404: true }); },
    putFile(p, base64, message, sha) {
      return this.api(`/contents/${this.enc(this.path(p))}`, { method: 'PUT', body: { message, content: base64, branch: this.cfg().branch, ...(sha ? { sha } : {}) } });
    },
  };

  /** 中文字轉 base64（GitHub 要求檔案內容用 base64 傳） */
  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (ch) => ch.charCodeAt(0)));

  async function testConnection() {
    GH.saveCfgFromForm();
    if (!GH.ready()) { toast('請先填帳號、儲存庫、分支和權杖。', 'warn'); return; }
    try {
      const file = await GH.getFile('data.json');
      file ? toast('連線成功，找到線上的 data.json。') : toast('連得上儲存庫，但這個位置還沒有 data.json。第一次發布時會自動建立。', 'warn');
    } catch (err) { toast(err.message === 'Failed to fetch' ? '連不上 GitHub，請檢查網路。' : err.message, 'err', '連線失敗'); }
  }

  /** 跳到第一個有問題的欄位 */
  function showError(err) {
    const root = err.path.split('.')[0];
    const target = root === 'games' ? 'games' : root === 'boardgames' ? 'boardgames' : 'site';
    if (view !== target) { view = target; render(false); }
    let el = $(`[data-path="${err.path}"]`);
    for (let p = err.path; !el && p.includes('.'); el = $(`[data-path^="${p}"]`)) p = p.slice(0, p.lastIndexOf('.'));
    if (!el) return;
    for (let d = el.closest('details'); d; d = d.parentElement.closest('details')) { d.open = true; openKeys.add(d.dataset.key); }
    el.classList.add('invalid');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }

  async function publish() {
    if (saveTimer) saveDraft();
    const errs = Store.validate(state);
    if (errs.length) {
      showError(errs[0]);
      toast(errs[0].msg + (errs.length > 1 ? `（另外還有 ${errs.length - 1} 個問題）` : ''), 'err', '還不能發布');
      return;
    }
    if (!GH.ready()) { go('publish'); toast('第一次發布前，請先填 GitHub 發布設定。', 'warn'); return; }
    if (!(await ask('把目前的內容發布到網站？\n發布後所有訪客都會看到。', '發布'))) return;

    const btn = $('#btn-publish');
    btn.classList.add('busy'); btn.textContent = '發布中…';
    try {
      // (1) 線上版本在我們開始編輯之後有沒有被別人更新過？
      const remote = await GH.getFile('data.json');
      if (remote?.content) {
        let stamp = '';
        try { stamp = JSON.parse(fromBase64(remote.content))?.meta?.updatedAt || ''; } catch { /* 線上檔案壞了就直接覆蓋 */ }
        const base = ls.get(KEYS.base);
        if (base && stamp && stamp !== base) {
          const when = new Date(stamp).toLocaleString('zh-TW');
          if (!(await ask(`線上的內容在 ${when} 被更新過（可能是其他組員）。\n繼續發布會蓋掉那次修改。`, '仍要發布', true))) return;
        }
      }
      // (2) 上傳草稿裡用到、還沒上傳過的圖片
      const pending = ls.get(KEYS.pending) || {};
      const done = new Set(ls.get(UPLOADED) || []);
      const used = JSON.stringify(state);
      for (const [path, dataUrl] of Object.entries(pending)) {
        if (done.has(path) || !used.includes(`"${path}"`)) continue;
        const existing = await GH.getFile(path);
        await GH.putFile(path, dataUrl.split(',')[1], `上傳圖片 ${path.split('/').pop()}`, existing?.sha);
        done.add(path);
        ls.set(UPLOADED, [...done]);
      }
      // (3) 寫入 data.json
      state.meta = { ...(state.meta || {}), version: 1, updatedAt: new Date().toISOString() };
      await GH.putFile('data.json', toBase64(JSON.stringify(state, null, 2) + '\n'), '後台更新網站內容', remote?.sha);
      dirty = false;
      ls.set(KEYS.base, state.meta.updatedAt);
      saveDraft(); setStatus();
      toast('網站約 1～2 分鐘後更新，重新整理就看得到。', 'ok', '發布成功');
    } catch (err) {
      console.error(err);
      toast(err.message === 'Failed to fetch' ? '連不上 GitHub，請檢查網路後再試一次。草稿還在。' : err.message + ' 草稿還在，修正後可以再發布。', 'err', '發布失敗');
    } finally {
      btn.classList.remove('busy'); btn.textContent = '發布';
    }
  }

  /* ═════════ 上方按鈕與側邊欄 ═════════ */
  document.querySelector('.side-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b && state) go(b.dataset.view);
  });
  $('#btn-preview').addEventListener('click', () => {
    if (!state) return;
    saveDraft();
    window.open('index.html?preview=1', 'yq-preview');
  });
  $('#btn-publish').addEventListener('click', () => { if (state) publish(); });

  /* ═════════ 啟動 ═════════ */
  async function init() {
    // 上次已經上傳成功的暫存圖可以清掉了
    const uploaded = ls.get(UPLOADED) || [];
    if (uploaded.length) {
      const pending = ls.get(KEYS.pending) || {};
      uploaded.forEach((p) => delete pending[p]);
      ls.set(KEYS.pending, pending);
      ls.del(UPLOADED);
    }

    let live = null;
    try { live = await Store.fetchLive(); } catch { /* 下面處理 */ }
    const draft = ls.get(KEYS.draft);
    if (draft && ls.get(KEYS.dirty)) {
      state = draft; dirty = true;
      toast('已載入上次還沒發布的草稿。');
      if (live && (live.meta?.updatedAt || '') !== ls.get(KEYS.base)) toast('線上內容在你上次編輯之後更新過，發布時會再提醒你。', 'warn');
    } else if (live && draft && ls.get(KEYS.base) && (live.meta?.updatedAt || '') < ls.get(KEYS.base)) {
      // 剛發布完，GitHub Pages 還沒更新（要 1～2 分鐘）：先顯示剛發布的內容，避免看起來像沒發布成功
      state = draft;
      toast('網站還在更新剛才發布的內容，這裡顯示的是最新版本。');
    } else if (live) {
      state = live;
      ls.set(KEYS.base, live.meta?.updatedAt || '');
      saveDraft();
    } else if (draft) {
      state = draft;
      toast('讀不到線上的 data.json，先顯示瀏覽器裡的草稿。', 'warn');
    } else {
      $('#view-title').textContent = '載入失敗';
      $('#view').innerHTML = card('讀不到 data.json', '<p class="hint">請用 VS Code 的 Live Server 開啟，或上傳到 GitHub Pages 後用網址開啟 admin.html。直接點兩下打開檔案讀不到資料。</p>');
      return;
    }
    render(false);
  }
  init();
})();
