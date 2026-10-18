/* CircuitGym: קוד משותף לכל המודולים.
 * - Core.makeRng / randomSeed: מחולל אקראי עם seed (mulberry32).
 * - Core.makeUnits: הצגת ערכים עם/בלי תחיליות, פענוח קלט ובדיקת תשובות.
 * - Core.levelChoices: בחירת רמה בסוף תרגיל.
 * - Core.mountUI: מסך התרגיל, כולל שאלות עם כמה סעיפים וסוגי תשובות:
 *   num (מספר + יחידה + תחילית), angle (מספר עם מינוס), choice (בחירה מרשימה), binary (מספר בינארי).
 * המודולים טוענים את הקובץ לפני המנוע שלהם: <script src="../common/core.js"></script>
 */
(function (global) {
  'use strict';

  // ---------------- Rng ----------------
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    const pick = arr => arr[Math.floor(next() * arr.length)];
    const shuffle = arr => { const b = arr.slice(); for (let i = b.length - 1; i > 0; i--) { const j = int(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    return { next, int, pick, shuffle };
  }
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;

  // ---------------- Units ----------------
  const P = { M: { p: 'M', f: 1e6 }, k: { p: 'k', f: 1e3 }, '': { p: '', f: 1 }, m: { p: 'm', f: 1e-3 }, 'µ': { p: 'µ', f: 1e-6 }, n: { p: 'n', f: 1e-9 } };
  // cfg: { prefixes: ['M','k','','m','µ'], tol: 0.01, angTol: 0.5 }
  function makeUnits(cfg) {
    const PREFIXES = cfg.prefixes.map(k => P[k]), TOL = cfg.tol, ANG_TOL = cfg.angTol || 0.5;
    const roundSig = (x, s) => (x === 0 ? 0 : Number(x.toPrecision(s)));
    function numStr(v) {
      let s = String(v);
      if (/e/i.test(s)) s = v.toFixed(15).replace(/\.?0+$/, '');
      return s;
    }
    function pickPrefix(x) {
      const a = Math.abs(x);
      for (const p of PREFIXES) if (a >= p.f * (1 - 1e-9)) return p;
      return PREFIXES[PREFIXES.length - 1];
    }
    const NONE = { p: '', f: 1 };
    const U = {
      PREFIXES, TOL, ANG_TOL, roundSig, numStr, pickPrefix,
      // הצגת ערך (נתון או שלב ביניים) ב-sig ספרות משמעותיות. זווית: 2 ספרות אחרי הנקודה; rad/s בלי תחילית
      format(x, unit, prefixes, sig = 4) {
        if (unit === '°') return numStr(Math.round(x * 100) / 100) + '°';
        const p = prefixes && unit !== 'rad/s' ? pickPrefix(x) : NONE;
        return numStr(roundSig(x / p.f, sig)) + ' ' + p.p + unit;
      },
      // התשובה הנכונה: 2 ספרות אחרי הנקודה ביחידה הטבעית; ערך קטן מ-1: 3 ספרות משמעותיות
      formatAnswer(x, unit, prefixes) {
        if (unit === '°') return U.format(x, unit);
        const p = prefixes && unit !== 'rad/s' ? pickPrefix(x) : NONE;
        let v = x / p.f;
        v = Math.abs(v) >= 1 ? Math.round(v * 100) / 100 : roundSig(v, 3);
        return numStr(v) + ' ' + p.p + unit;
      },
      // קלט תלמיד: נקודה או פסיק עשרוני, בלי מפרידי אלפים; מינוס רק כשמותר. NaN אם לא תקין
      parseNumber(str, allowNeg) {
        const s = String(str).trim().replace(',', '.').replace('−', '-');
        const re = allowNeg ? /^-?(\d+(\.\d*)?|\.\d+)$/ : /^(\d+(\.\d*)?|\.\d+)$/;
        return re.test(s) ? Number(s) : NaN;
      },
      check(student, correct, unit) {
        if (unit === '°') return Math.abs(student - correct) <= ANG_TOL;
        return Math.abs(student - correct) <= TOL * Math.abs(correct);
      },
      // נכון פרט לפקטור של 1000 ומעלה (טעות תחילית/יחידות)
      prefixHint(student, correct, unit) {
        return unit !== '°' && [1e3, 1e6, 1e9, 1e-3, 1e-6, 1e-9].some(k => U.check(student, correct * k, unit));
      },
      // "נקי": מדויק בעד 3 ספרות משמעותיות
      isClean(x) { const a = Math.abs(x); return a > 0 && Math.abs(roundSig(a, 3) - a) <= 1e-9 * a; },
    };
    return U;
  }

  // ---------------- Levels ----------------
  // בסוף תרגיל התלמיד בוחר רמה. primary = ההמלצה.
  // נכון: לעלות / להישאר (בניסיון האחרון ההמלצה היא להישאר). כישלון: להישאר / לרדת.
  function levelChoices(level, correct, attempt, min, maxLevel, maxAttempts) {
    const out = [];
    if (correct) {
      const up = level < maxLevel;
      if (up) out.push({ level: level + 1, primary: attempt < maxAttempts });
      out.push({ level, primary: !up || attempt >= maxAttempts });
    } else {
      out.push({ level, primary: true });
      if (level > min) out.push({ level: level - 1, primary: false });
    }
    return out;
  }

  // ---------------- UI helpers ----------------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // סמלים בכתיב X_sub ← HTML עם כתב תחתון, מבודד משמאל לימין
  const symHtml = s => s.replace(/\b([A-Za-z])_([0-9A-Za-z]+)/g, '<bdi dir="ltr">$1<sub>$2</sub></bdi>');
  const PREFIX_OPTS = { M: ['1000000', 'M'], k: ['1000', 'k'], '': ['1', '(ללא)'], m: ['0.001', 'm'], 'µ': ['0.000001', 'µ'], n: ['1e-9', 'n'] };
  const PREFIX_ORDER = ['', 'M', 'k', 'm', 'µ', 'n'];

  const PLAY_HTML = `
    <div class="bar">
      <span id="lvl" class="badge"></span>
      <span id="ctype" class="muted"></span>
      <span id="tries" class="muted"></span>
    </div>
    <p id="qtext" class="q"></p>
    <div id="circuit" class="circuit" dir="ltr"></div>
    <div id="givens" class="givens"></div>
    <ol id="doneParts" class="parts" hidden></ol>
    <p id="ptext" class="q ptext" hidden></p>
    <div id="unknown" class="givens"></div>
    <form id="ansForm" class="ans" autocomplete="off">
      <label>התשובה:</label>
      <div id="ansRows" class="ansrows"></div>
      <button type="submit" id="checkBtn" class="primary">בדיקה</button>
    </form>
    <div id="feedback" class="fb" role="status" aria-live="polite"></div>
    <button id="showSol" type="button" class="link" hidden>הצג פתרון מלא</button>
    <div id="solution" hidden><h3 id="solTitle"></h3><div id="solBody"></div></div>
    <div class="actions">
      <span id="choices" class="actions" hidden></span>
      <button id="nextPart" type="button" class="primary" hidden>לסעיף הבא</button>
      <button id="next" type="button">תרגיל חדש</button>
      <button id="back" type="button">חזרה להגדרות</button>
    </div>
    <div id="seed" class="seed" dir="ltr"></div>`;
  const PART_LETTERS = 'אבגדהוזחטי';

  /* cfg:
   *  engine: { VERSION, MAX_LEVEL, MAX_ATTEMPTS }
   *  units: מתוך makeUnits
   *  prefixes: רשימת תחיליות לתפריט (למשל ['', 'M', 'k', 'm', 'µ'])
   *  readSettings(): הגדרות מהמסך (חייב לכלול level)
   *  minLevel(settings)
   *  makeExercise(settings, level, prevKind) -> ex (חייב: kind, seed, level)
   *  ctypeHtml(ex) -> HTML לתווית סוג המעגל (אופציונלי)
   *  render(ex) -> { svg, width }
   *  givens(ex) -> [{ sym, text }]
   *  parts(ex) -> [{ text?, answers: [answer] }]  (סעיף אחד = שאלה רגילה; ex.text הוא ההקדמה)
   *     answer: { type:'num'|'angle'|'choice'|'binary', sym?, label?, value, unit?, prefix?, options?:[{value,label}] }
   *  solution: { title, html(ex, partIndex), onCorrect: true/false }
   *  failSuffix: טקסט אחרי התשובה הנכונה כשמוצג פתרון (למשל 'הנה הפתרון המלא:')
   */
  function mountUI(cfg) {
    const E = cfg.engine, U = cfg.units, $ = id => document.getElementById(id);
    $('ver').textContent = E.VERSION;
    $('ver2').textContent = E.VERSION;
    $('play').innerHTML = PLAY_HTML;
    const st = { settings: null, level: 1, ex: null, parts: null, pi: 0, failed: 0, finished: false, prevKind: null, results: [] };
    const multi = () => st.parts.length > 1;

    $('start').addEventListener('click', () => {
      st.settings = cfg.readSettings();
      st.level = st.settings.level;
      st.prevKind = null;
      $('setup').hidden = true;
      $('play').hidden = false;
      newExercise();
    });
    $('back').addEventListener('click', () => {
      $('play').hidden = true;
      $('setup').hidden = false;
      window.scrollTo(0, 0);
    });

    function newExercise() {
      st.ex = cfg.makeExercise(st.settings, st.level, st.prevKind);
      st.prevKind = st.ex.kind;
      st.parts = cfg.parts(st.ex);
      st.pi = 0; st.failed = 0; st.finished = false; st.results = [];
      renderExercise();
    }
    function renderExercise() {
      const ex = st.ex;
      $('lvl').textContent = `רמה ${ex.level}`;
      $('ctype').innerHTML = cfg.ctypeHtml ? cfg.ctypeHtml(ex) : '';
      $('qtext').innerHTML = symHtml(esc(ex.text || ''));
      const r = cfg.render(ex);
      $('circuit').innerHTML = r.svg;
      const svg = $('circuit').querySelector('svg');
      svg.style.maxWidth = Math.round(r.width * 1.15) + 'px';
      // בטלפון: לא מקטינים מתחת ל-78% (גופן של כ-11px); ציור רחב יותר נגלל הצידה
      svg.style.minWidth = Math.round(r.width * 0.78) + 'px';
      const g = cfg.givens(ex).map(x => `<span class="chip" dir="ltr">${symHtml(esc(x.sym))} = ${esc(x.text)}</span>`);
      $('givens').innerHTML = '<span class="muted">נתונים:</span> ' + g.join(' ');
      $('doneParts').innerHTML = '';
      $('doneParts').hidden = true;
      $('seed').textContent = '#' + ex.seed;
      $('next').hidden = false;
      $('choices').hidden = true;
      renderPart();
    }
    const ansLabel = a => (a.type === 'choice' ? esc(a.short || a.label || 'הבחירה') : `<bdi dir="ltr">${symHtml(esc(a.sym))}</bdi>`);
    const ansValueText = a => {
      if (a.type === 'choice') return esc(a.options.find(o => o.value === a.value).label);
      if (a.type === 'binary') return `<bdi dir="ltr">${esc(a.value)}</bdi>`;
      return `<bdi dir="ltr">${symHtml(esc(a.sym))} = ${esc(U.formatAnswer(a.value, a.unit, a.prefix))}</bdi>`;
    };
    const partAnswerText = part => part.answers.map(a => (a.type === 'choice' || a.type === 'binary'
      ? (a.type === 'binary' ? `<bdi dir="ltr">${symHtml(esc(a.sym || ''))}${a.sym ? ' = ' : ''}${esc(a.value)}</bdi>` : ansValueText(a))
      : ansValueText(a))).join(', ');
    function renderPart() {
      const part = st.parts[st.pi];
      const letter = multi() ? `${PART_LETTERS[st.pi]}. ` : '';
      $('ptext').hidden = !multi();
      $('ptext').innerHTML = multi() ? `<b>${letter}</b>${symHtml(esc(part.text || ''))}` : '';
      $('unknown').innerHTML = '<span class="muted">נעלם:</span> ' + part.answers.map(a => a.type === 'choice'
        ? `<span class="chip unk">${esc(a.label)}</span>`
        : `<span class="chip unk" dir="ltr">${symHtml(esc(a.sym))} = ?</span>`).join(' ');
      $('ansRows').innerHTML = part.answers.map((a, i) => {
        if (a.type === 'choice')
          return `<span class="ansbox dirbox">${esc(a.label)}: <select data-i="${i}" class="ch"><option value="">בחרו</option>${a.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></span>`;
        const pre = a.type === 'num' && a.prefix
          ? `<select data-i="${i}" class="pre" aria-label="תחילית">${PREFIX_ORDER.filter(p => cfg.prefixes.includes(p)).map(p => `<option value="${PREFIX_OPTS[p][0]}">${PREFIX_OPTS[p][1]}</option>`).join('')}</select>` : '';
        const mode = a.type === 'angle' ? 'text' : a.type === 'binary' ? 'numeric' : 'decimal';
        return `<span class="ansbox" dir="ltr"><span class="usym">${symHtml(esc(a.sym || ''))}</span> =
          <input data-i="${i}" class="val" type="text" inputmode="${mode}" dir="ltr" spellcheck="false">
          ${pre}<span>${esc(a.unit || '')}</span></span>`;
      }).join('');
      $('checkBtn').disabled = false;
      setFeedback('', '');
      $('solution').hidden = true;
      $('showSol').hidden = true;
      $('showSol').textContent = 'הצג פתרון מלא';
      $('solTitle').textContent = cfg.solution ? cfg.solution.title : '';
      $('solBody').innerHTML = cfg.solution ? cfg.solution.html(st.ex, st.pi) : '';
      $('nextPart').hidden = true;
      $('next').hidden = false;
      updateTries();
    }
    function updateTries() {
      $('tries').textContent = st.finished || $('ansRows').querySelector('[disabled]') ? '' : `ניסיון ${st.failed + 1} מתוך ${E.MAX_ATTEMPTS}`;
    }
    function setFeedback(cls, html) { $('feedback').className = 'fb ' + cls; $('feedback').innerHTML = html; }
    function lockPart() {
      document.querySelectorAll('#ansRows input, #ansRows select').forEach(el => (el.disabled = true));
      $('checkBtn').disabled = true;
    }
    // סעיף הסתיים (נכון או אחרי 3 ניסיונות)
    function partDone(correct, attempt) {
      st.results.push({ correct, attempt });
      lockPart();
      if (st.pi < st.parts.length - 1) {
        $('nextPart').hidden = false;
        $('next').hidden = true;
        updateTries();
        return;
      }
      finish();
    }
    function finish() {
      st.finished = true;
      const correct = st.results.every(r => r.correct), attempt = Math.max(...st.results.map(r => r.attempt));
      const opts = levelChoices(st.level, correct, attempt, cfg.minLevel(st.settings), E.MAX_LEVEL, E.MAX_ATTEMPTS);
      const label = n => (opts.length === 1 ? 'לתרגיל הבא'
        : n > st.level ? `לעלות לרמה ${n}` : n < st.level ? `לרדת לרמה ${n}` : `להישאר ברמה ${n}`);
      $('choices').innerHTML = opts.map(o =>
        `<button type="button" data-level="${o.level}"${o.primary ? ' class="primary"' : ''}>${label(o.level)}</button>`).join('');
      $('choices').hidden = false;
      $('next').hidden = true;
      $('nextPart').hidden = true;
      updateTries();
    }
    $('nextPart').addEventListener('click', () => {
      // הסעיף שהסתיים עובר לרשימת הסעיפים שנענו
      const part = st.parts[st.pi], r = st.results[st.pi];
      const li = document.createElement('li');
      li.innerHTML = `${symHtml(esc(part.text || ''))} <span class="${r.correct ? 'ok' : 'bad'}">${r.correct ? '✓' : '✗'}</span> ${partAnswerText(part)}`;
      $('doneParts').appendChild(li);
      $('doneParts').hidden = false;
      st.pi++; st.failed = 0;
      renderPart();
    });
    $('choices').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-level]');
      if (!b) return;
      st.level = +b.dataset.level;
      newExercise();
    });
    $('next').addEventListener('click', newExercise);
    $('showSol').addEventListener('click', () => {
      $('solution').hidden = !$('solution').hidden;
      $('showSol').textContent = $('solution').hidden ? 'הצג פתרון מלא' : 'הסתר פתרון';
    });

    $('ansForm').addEventListener('submit', ev => {
      ev.preventDefault();
      if (st.finished || $('checkBtn').disabled) return;
      const part = st.parts[st.pi], A = part.answers;
      const vals = A.map((a, i) => {
        if (a.type === 'choice') return document.querySelector(`#ansRows select.ch[data-i="${i}"]`).value || null;
        const raw = document.querySelector(`#ansRows input[data-i="${i}"]`).value;
        if (a.type === 'binary') { const s = raw.trim(); return /^[01]+$/.test(s) ? s : null; }
        const n = U.parseNumber(raw, a.type === 'angle');
        const pre = document.querySelector(`#ansRows select.pre[data-i="${i}"]`);
        return isNaN(n) ? null : n * (pre ? +pre.value : 1);
      });
      if (vals.some(v => v === null)) {
        const one = A.length === 1 && A[0].type === 'num';
        const notes = ['אפשר נקודה או פסיק עשרוני'];
        if (A.some(a => a.type === 'angle')) notes.push('בזווית אפשר גם מינוס');
        if (A.some(a => a.type === 'binary')) notes.push('במספר בינארי רק 0 ו-1');
        const sel = A.some(a => a.type === 'choice') ? ' ולבחור מהרשימה' : '';
        setFeedback('warn', `${one ? 'נא להקליד מספר בלבד' : 'נא למלא כל שדה' + sel} (${notes.join('; ')}). הניסיון לא נספר.`);
        return;
      }
      const ok = A.map((a, i) => (a.type === 'choice' || a.type === 'binary' ? vals[i] === a.value : U.check(vals[i], a.value, a.unit)));
      const attempt = st.failed + 1, last = st.pi === st.parts.length - 1;
      const answerText = partAnswerText(part);
      if (ok.every(Boolean)) {
        let msg = `נכון! ${answerText}. `;
        if (last) {
          // ההמלצה לפי כל הסעיפים: כולם נכונים, ובאיזה ניסיון לכל היותר
          const all = st.results.every(r => r.correct), maxAttempt = Math.max(attempt, ...st.results.map(r => r.attempt));
          if (multi()) {
            const n = st.results.filter(r => r.correct).length + 1;
            msg += `סיימתם את התרגיל: ${n} מתוך ${st.parts.length} סעיפים נכונים. `;
          }
          if (!all) msg += 'מומלץ להישאר באותה רמה ולתרגל עוד.';
          else if (st.level >= E.MAX_LEVEL) msg += 'זו הרמה הגבוהה ביותר.';
          else if (maxAttempt >= E.MAX_ATTEMPTS) msg += 'הצלחתם בניסיון השלישי. אפשר לעלות רמה, או להישאר ולתרגל עוד.';
          else msg += 'אפשר לעלות רמה או להישאר באותה רמה.';
        }
        setFeedback('ok', msg.trim());
        if (cfg.solution && cfg.solution.onCorrect) $('showSol').hidden = false;
        partDone(true, attempt);
        return;
      }
      st.failed++;
      let detail = '';
      if (A.length > 1) detail = ' ' + A.map((a, i) => `${ansLabel(a)} ${ok[i] ? 'נכון' : 'לא נכון'}`).join(', ') + '.';
      if (st.failed < E.MAX_ATTEMPTS) {
        const left = E.MAX_ATTEMPTS - st.failed;
        let msg = (left === 1 ? 'לא נכון. נשאר ניסיון אחד.' : `לא נכון. נשארו ${left} ניסיונות.`) + detail;
        if (A.some((a, i) => !ok[i] && (a.type === 'num' || a.type === 'angle') && U.prefixHint(vals[i], a.value, a.unit)))
          msg += ' שימו לב ליחידות ולתחיליות: התשובה רחוקה פי 1000 או יותר.';
        if (A.some((a, i) => !ok[i] && a.type === 'angle' && U.check(-vals[i], a.value, a.unit)))
          msg += ' שימו לב לסימן של הזווית.';
        setFeedback('bad', msg);
        updateTries();
      } else {
        const suffix = cfg.failSuffix ? ' ' + cfg.failSuffix : '';
        let msg = `לא נכון.${detail} התשובה הנכונה: ${answerText}.${suffix}`;
        if (last && multi()) {
          const n = st.results.filter(r => r.correct).length;
          msg += ` סיימתם את התרגיל: ${n} מתוך ${st.parts.length} סעיפים נכונים.`;
        }
        setFeedback('bad', msg);
        if (cfg.solution) $('solution').hidden = false;
        partDone(false, attempt);
      }
    });
    return st;
  }

  global.Core = { makeRng, randomSeed, makeUnits, levelChoices, esc, symHtml, mountUI };
})(typeof window !== 'undefined' ? window : globalThis);
