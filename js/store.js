/* ═══════════════════════════════════════════════════════════════
   store.js｜前台與後台共用的資料層
   - 讀取 data.json（線上版本）或瀏覽器裡的草稿（預覽用）
   - 路徑讀寫工具、文字跳脫、連結檢查、資料驗證、雷達圖
   資料流：
     後台修改 → 草稿存在 localStorage → 前台加 ?preview 讀草稿（即時預覽）
     後台發布 → 寫入 GitHub 的 data.json → 所有訪客讀到新內容
   ═══════════════════════════════════════════════════════════════ */
const Store = (() => {
  const KEYS = {
    draft: 'yq-cms-draft-v1',      // 尚未發布的草稿（整份資料）
    pending: 'yq-cms-pending-v1',  // 尚未上傳的圖片 { 路徑: dataURL }
    dirty: 'yq-cms-dirty-v1',      // 草稿是否有未發布的修改
    base: 'yq-cms-base-v1',        // 草稿是從哪個線上版本（updatedAt）開始改的
  };

  /* ── 本機儲存（包 try/catch：隱私模式或容量滿時不讓整頁壞掉） ── */
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 忽略 */ } },
  };

  /** 讀線上的 data.json（加時間參數避免讀到快取的舊檔） */
  async function fetchLive() {
    const res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('讀不到 data.json（HTTP ' + res.status + '）');
    return res.json();
  }

  const isPreview = () => new URLSearchParams(location.search).has('preview');

  /** 前台用：預覽模式讀草稿，否則讀線上版本 */
  async function load() {
    if (isPreview()) {
      const draft = ls.get(KEYS.draft);
      if (draft) return draft;
    }
    return fetchLive();
  }

  /* ── 用「a.b.0.c」這種路徑讀寫物件 ── */
  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function set(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let o = obj;
    for (const k of keys) {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    }
    o[last] = value;
  }

  /** 把文字放進 HTML 前先跳脫，避免內容裡的符號被當成標籤 */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** 連結只允許站內錨點、相對路徑、http(s)、mailto；其他（例如 javascript:）一律變成 # */
  function safeUrl(u) {
    const s = String(u ?? '').trim();
    if (!s) return '';
    if (/^(#|\.{0,2}\/|https?:\/\/|mailto:)/i.test(s)) return s;
    if (/^[\w\-./%]+(\?[^#]*)?(#.*)?$/.test(s) && !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    return '#';
  }

  /** 圖片路徑：預覽或後台時，尚未上傳的圖片用暫存的 dataURL 顯示 */
  let usePending = isPreview();
  function img(path) {
    if (!path) return '';
    if (usePending) {
      const pending = ls.get(KEYS.pending) || {};
      if (pending[path]) return pending[path];
    }
    return safeUrl(path);
  }

  const uid = (prefix = 'id') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** 雷達圖（SVG）。labels：各軸名稱；values：0～5 */
  function radarSVG(labels, values, size = 220) {
    const n = labels.length, c = size / 2, R = size * 0.32;
    const pt = (i, r) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [c + Math.cos(a) * r, c + Math.sin(a) * r];
    };
    const ring = (r) => labels.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
    const grid = [1, 2, 3, 4, 5].map((k) => `<polygon points="${ring((R * k) / 5)}" class="radar-grid"/>`).join('');
    const axes = labels.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-grid"/>`; }).join('');
    const shape = labels.map((_, i) => pt(i, (R * Math.max(0, Math.min(5, Number(values?.[i]) || 0))) / 5).map((v) => v.toFixed(1)).join(',')).join(' ');
    const texts = labels.map((l, i) => {
      const [x, y] = pt(i, R + 22);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="radar-label" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`;
    }).join('');
    const desc = labels.map((l, i) => `${l} ${Number(values?.[i]) || 0}`).join('、');
    return `<svg viewBox="0 0 ${size} ${size}" class="radar" role="img" aria-label="策略評分：${esc(desc)}">${grid}${axes}<polygon points="${shape}" class="radar-shape"/>${texts}</svg>`;
  }

  /**
   * 發布前的資料檢查。回傳 [{ path, msg }]；空陣列＝沒有問題。
   * 前台對缺漏的欄位有容錯，這裡擋的是會讓遊戲或頁面出錯的內容。
   */
  function validate(d) {
    const errs = [];
    const need = (cond, path, msg) => { if (!cond) errs.push({ path, msg }); };
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

    need(d?.site?.title?.trim(), 'site.title', '網站名稱不能空白');
    (d?.site?.nav || []).forEach((n, i) => need(n.label?.trim(), `site.nav.${i}.label`, `導覽列第 ${i + 1} 項沒有文字`));

    const qz = d?.games?.quiz;
    if (qz) {
      const qs = qz.questions || [];
      qs.forEach((q, i) => {
        const opts = (q.options || []).map((o) => String(o ?? '').trim());
        need(q.q?.trim(), `games.quiz.questions.${i}.q`, `題庫第 ${i + 1} 題沒有題目`);
        need(opts.filter(Boolean).length >= 2, `games.quiz.questions.${i}.options.0`, `題庫第 ${i + 1} 題至少要有 2 個選項`);
        need(isNum(q.answer) && opts[q.answer], `games.quiz.questions.${i}.answer`, `題庫第 ${i + 1} 題的正確答案指到空白選項`);
      });
      need(isNum(qz.questionsPerRound) && qz.questionsPerRound >= 1, 'games.quiz.questionsPerRound', '每回合題數至少 1 題');
      need(isNum(qz.secondsPerQuestion) && qz.secondsPerQuestion >= 5 && qz.secondsPerQuestion <= 120, 'games.quiz.secondsPerQuestion', '每題秒數要在 5～120 之間');
      need((qz.difficulties || []).length >= 1, 'games.quiz.difficulties', '問答至少要有一種難度');
      (qz.difficulties || []).forEach((lv, i) => {
        need(lv.label?.trim(), `games.quiz.difficulties.${i}.label`, `問答難度第 ${i + 1} 項沒有名稱`);
        const pool = qs.filter((q) => (q.level || 1) <= (lv.maxLevel || 1)).length;
        if (qz.enabled) need(pool >= 1, `games.quiz.difficulties.${i}.maxLevel`, `問答難度「${lv.label || i + 1}」沒有可出的題目`);
      });
    }

    const pd = d?.games?.pond;
    if (pd) {
      need(isNum(pd.rounds) && pd.rounds >= 2 && pd.rounds <= 20, 'games.pond.rounds', '埤塘遊戲的季數要在 2～20 之間');
      need((pd.difficulties || []).length >= 1, 'games.pond.difficulties', '埤塘遊戲至少要有一種難度');
      (pd.difficulties || []).forEach((lv, i) => {
        const p = `games.pond.difficulties.${i}`;
        need(lv.label?.trim(), `${p}.label`, `埤塘難度第 ${i + 1} 項沒有名稱`);
        need(isNum(lv.capacity) && lv.capacity > 0, `${p}.capacity`, `埤塘難度「${lv.label}」的容量要大於 0`);
        need(isNum(lv.demand) && lv.demand > 0 && lv.demand <= lv.capacity, `${p}.demand`, `埤塘難度「${lv.label}」的需水量要大於 0，且不能超過容量`);
        need(isNum(lv.startWater) && lv.startWater >= 0 && lv.startWater <= lv.capacity, `${p}.startWater`, `埤塘難度「${lv.label}」的起始水量要在 0 和容量之間`);
        need(isNum(lv.rainMin) && isNum(lv.rainMax) && lv.rainMin >= 0 && lv.rainMin <= lv.rainMax, `${p}.rainMin`, `埤塘難度「${lv.label}」的雨季進水：最小值不能大於最大值`);
        need(isNum(lv.dryMin) && isNum(lv.dryMax) && lv.dryMin >= 0 && lv.dryMin <= lv.dryMax, `${p}.dryMin`, `埤塘難度「${lv.label}」的乾季進水：最小值不能大於最大值`);
      });
    }

    const bg = d?.boardgames;
    if (bg) {
      (bg.radarLabels || []).forEach((l, i) => need(String(l ?? '').trim(), `boardgames.radarLabels.${i}`, `雷達圖第 ${i + 1} 個項目沒有名稱`));
      (bg.items || []).forEach((it, i) => {
        const p = `boardgames.items.${i}`;
        need(it.name?.trim(), `${p}.name`, `桌遊第 ${i + 1} 筆沒有名稱`);
        need(isNum(it.playersMin) && isNum(it.playersMax) && it.playersMin >= 1 && it.playersMin <= it.playersMax, `${p}.playersMin`, `「${it.name || i + 1}」的人數：最少不能大於最多`);
        need(isNum(it.timeMin) && isNum(it.timeMax) && it.timeMin >= 1 && it.timeMin <= it.timeMax, `${p}.timeMin`, `「${it.name || i + 1}」的時間：最短不能大於最長`);
        (it.radar || []).forEach((v, k) => need(isNum(v) && v >= 0 && v <= 5, `${p}.radar.${k}`, `「${it.name || i + 1}」的評分要在 0～5 之間`));
      });
    }
    return errs;
  }

  return {
    KEYS, ls, fetchLive, load, isPreview, get, set, esc, safeUrl, img, uid, radarSVG, validate,
    set usePending(v) { usePending = v; },
  };
})();
