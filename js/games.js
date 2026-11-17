/* ═══════════════════════════════════════════════════════════════
   games.js｜兩個小遊戲。規則文字、題庫、關卡參數、難度、計分全部來自 data.json
   （games.quiz、games.pond），在後台「互動小遊戲控制台」修改。
   ═══════════════════════════════════════════════════════════════ */
const Games = (() => {
  const { esc } = Store;
  let timer = null;                       // 問答倒數用
  const box = () => document.querySelector('#modal .modal-inner');
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const head = (title) => `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="關閉">×</button></div>`;
  /** 依百分比找稱號：取 min 不超過 pct 的最高一級 */
  const rankOf = (ranks, pct) => [...(ranks || [])].sort((a, b) => a.min - b.min).filter((r) => pct >= r.min).pop()?.label || '';

  /** 開場畫面：規則＋選難度（兩個遊戲共用） */
  function intro(cfg, onStart) {
    const levels = cfg.difficulties || [];
    let chosen = levels.find((l) => l.id === cfg.defaultDifficulty) || levels[0];
    Modal.open(`
      ${head(cfg.title)}
      <p>${esc(cfg.rules || cfg.description || '')}</p>
      <div class="chips" role="group" aria-label="難度">
        ${levels.map((l) => `<button type="button" class="chip${l === chosen ? ' on' : ''}" data-level="${esc(l.id)}" aria-pressed="${l === chosen}">${esc(l.label)}</button>`).join('')}
      </div>
      <button class="btn primary" type="button" data-start>開始</button>`);
    box().onclick = (e) => {
      const lv = e.target.closest('[data-level]');
      if (lv) {
        chosen = levels.find((l) => l.id === lv.dataset.level) || chosen;
        box().querySelectorAll('[data-level]').forEach((b) => { const on = b === lv; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      }
      if (e.target.closest('[data-start]')) onStart(chosen);
    };
  }

  /* ─────────────── 遊戲一：快問快答 ─────────────── */
  function quiz(cfg) {
    intro(cfg, (level) => {
      const pool = (cfg.questions || []).filter((q) => (q.level || 1) <= (level.maxLevel || 1));
      const questions = shuffle(pool).slice(0, Math.max(1, cfg.questionsPerRound || 5));
      const seconds = Math.max(3, Math.round((cfg.secondsPerQuestion || 15) * (level.timeFactor || 1)));
      let index = 0, score = 0, correct = 0;

      const ask = () => {
        const q = questions[index];
        // 選項打亂顯示，但記住原本的編號才能對答案
        const opts = shuffle((q.options || []).map((text, i) => ({ text, i })).filter((o) => String(o.text ?? '').trim()));
        let left = seconds, answered = false;
        Modal.open(`
          ${head(cfg.title)}
          <p class="game-status"><span>第 ${index + 1}／${questions.length} 題</span><span>分數 ${score}</span></p>
          <div class="timer" role="timer" aria-label="剩餘時間"><i style="width:100%"></i></div>
          <h3 class="question">${esc(q.q)}</h3>
          <div class="options">${opts.map((o) => `<button type="button" class="option" data-i="${o.i}">${esc(o.text)}</button>`).join('')}</div>
          <p class="feedback" aria-live="polite"></p>`);
        const bar = box().querySelector('.timer i');

        const finish = (picked) => {
          if (answered) return;
          answered = true;
          clearInterval(timer);
          const ok = picked === q.answer;
          if (ok) { correct++; score += Math.round((cfg.pointsCorrect || 100) * (level.scoreFactor || 1) + Math.ceil(left) * (cfg.timeBonus || 0)); }
          box().querySelectorAll('.option').forEach((b) => {
            b.disabled = true;
            if (Number(b.dataset.i) === q.answer) b.classList.add('right');
            else if (Number(b.dataset.i) === picked) b.classList.add('wrong');
          });
          const fb = box().querySelector('.feedback');
          fb.innerHTML = `<strong>${ok ? '答對了！' : picked === -1 ? '時間到。' : '答錯了。'}</strong> ${esc(q.explain || '')}
            <button class="btn primary" type="button" data-next>${index + 1 < questions.length ? '下一題' : '看結果'}</button>`;
          box().querySelector('.game-status span:last-child').textContent = '分數 ' + score;
          fb.querySelector('[data-next]').focus();
        };

        clearInterval(timer);
        timer = setInterval(() => {
          left -= 0.1;
          bar.style.width = Math.max(0, (left / seconds) * 100) + '%';
          if (left <= 0) finish(-1);
        }, 100);

        box().onclick = (e) => {
          const opt = e.target.closest('.option');
          if (opt) finish(Number(opt.dataset.i));
          if (e.target.closest('[data-next]')) { index++; index < questions.length ? ask() : result(); }
        };
      };

      const result = () => {
        const pct = Math.round((correct / questions.length) * 100);
        Modal.open(`
          ${head(cfg.title)}
          <div class="result">
            <p class="kicker">${esc(level.label)}難度</p>
            <p class="big">${score}<small> 分</small></p>
            <p>答對 ${correct}／${questions.length} 題</p>
            <p class="rank">${esc(rankOf(cfg.ranks, pct))}</p>
            <button class="btn primary" type="button" data-again>再玩一次</button>
          </div>`);
        box().onclick = (e) => { if (e.target.closest('[data-again]')) quiz(cfg); };
      };

      ask();
    });
  }

  /* ─────────────── 遊戲二：埤塘管理員 ─────────────── */
  function pond(cfg) {
    intro(cfg, (lv) => {
      const rounds = Math.max(2, cfg.rounds || 8);
      let round = 0, water = lv.startWater, score = 0, harvests = 0, log = '';

      const next = () => {
        round++;
        const rainy = round % 2 === 1;                        // 單數季是雨季，雙數季是乾季
        const inflow = rainy ? rnd(lv.rainMin, lv.rainMax) : rnd(lv.dryMin, lv.dryMax);
        const overflow = Math.max(0, water + inflow - lv.capacity);
        water = Math.min(lv.capacity, water + inflow);
        score -= overflow * (cfg.pointsOverflow || 0);
        const suggested = 0;   // 預設不放水，讓玩家自己決定
        Modal.open(`
          ${head(cfg.title)}
          <p class="game-status"><span>第 ${round}／${rounds} 季・${rainy ? '雨季' : '乾季'}</span><span>分數 ${score}</span></p>
          ${log ? `<p class="feedback">${log}</p>` : ''}
          <div class="pond-row">
            <div class="pond" aria-hidden="true"><i style="height:${(water / lv.capacity) * 100}%"></i><b style="bottom:${(lv.demand / lv.capacity) * 100}%"></b></div>
            <div class="pond-info">
              <p>這一季進水 <strong>${inflow}</strong>${overflow ? `，埤塘滿了，流掉 <strong class="warn">${overflow}</strong>` : ''}</p>
              <p>埤塘存水 <strong>${water}</strong>／${lv.capacity}</p>
              <p>田需要 <strong>${lv.demand}</strong></p>
              <label class="slider">要放多少水？ <output>${suggested}</output>
                <input type="range" min="0" max="${water}" step="1" value="${suggested}">
              </label>
              <button class="btn primary" type="button" data-release>放水</button>
            </div>
          </div>`);
        const range = box().querySelector('input[type=range]');
        const out = box().querySelector('output');
        range.oninput = () => { out.textContent = range.value; };
        box().onclick = (e) => {
          if (!e.target.closest('[data-release]')) return;
          const release = Number(range.value);
          water -= release;
          if (release >= lv.demand) {
            const waste = release - lv.demand;
            harvests++;
            score += (cfg.pointsHarvest || 100) - waste * (cfg.pointsWaste || 0);
            log = `上一季：豐收！${waste ? `多放了 ${waste} 的水。` : '水放得剛剛好。'}`;
          } else {
            log = release ? `上一季：放了 ${release} 還是不夠（田需要 ${lv.demand}），水白流了，歉收。` : '上一季：沒有放水，歉收，但水留下來了。';
          }
          round < rounds ? next() : result();
        };
      };

      const result = () => {
        const pct = Math.round((harvests / rounds) * 100);
        Modal.open(`
          ${head(cfg.title)}
          <div class="result">
            <p class="kicker">${esc(lv.label)}難度</p>
            <p class="big">${score}<small> 分</small></p>
            <p>${rounds} 季裡豐收 ${harvests} 季</p>
            <p class="rank">${esc(rankOf(cfg.ranks, pct))}</p>
            <p class="text">${esc(log)}</p>
            <button class="btn primary" type="button" data-again>再玩一次</button>
          </div>`);
        box().onclick = (e) => { if (e.target.closest('[data-again]')) pond(cfg); };
      };

      next();
    });
  }

  return {
    open(key, cfg) { if (!cfg) return; key === 'quiz' ? quiz(cfg) : pond(cfg); },
    stop() { clearInterval(timer); },
  };
})();
