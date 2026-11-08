/* =========================================================
   实验 2 · Stroop 效应
   改编自 Stroop (1935)，加入中性条件作基准
   ---------------------------------------------------------
   条件：一致(congruent) / 中性(neutral) / 冲突(incongruent)
   三色：红(红=#e03131) 绿(绿=#0ca678) 蓝(蓝=#3b5bdb)
   按键：F=红  G=绿  H=蓝
   练习有反馈；正式 54 题（各条件 18 题）混合随机
   ========================================================= */
window.ExpStroop = (function () {
  const U = window.Utils;

  const COLORS = [
    { name: '红', hex: '#e03131', key: 'f', keyLabel: 'F' },
    { name: '绿', hex: '#0ca678', key: 'g', keyLabel: 'G' },
    { name: '蓝', hex: '#3b5bdb', key: 'h', keyLabel: 'H' }
  ];
  const NEUTRAL_WORDS = ['书', '笔', '纸'];

  function start(stage, ctx) {
    ctx.trials = [];
    renderIntro(stage, ctx);
  }

  function renderIntro(stage, ctx) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">实验 2 · Stroop 效应</div>
      <div class="panel-body" style="text-align:left">
        <p>每题先出现一个「+」，接着会出现一个<strong>彩色汉字</strong>。</p>
        <p>请根据这个字在屏幕上的<strong>颜色</strong>按键：</p>
        <p style="text-align:center;font-size:16px">
          红色按 <kbd>F</kbd>　绿色按 <kbd>G</kbd>　蓝色按 <kbd>H</kbd>
        </p>
        <p>例如，如果「红」这个字显示成蓝色，请按 <kbd>H</kbd>。不管屏幕上出现什么字，都用同一套按键。请等字出现再按键，尽量<strong>又快又准</strong>。</p>
        <p>先做几题练习（有对错反馈），熟悉以后再进入正式任务。</p>
      </div>
      <div class="btn-row"><button class="btn" id="s-start">开始练习</button></div>`;
    stage.appendChild(panel);
    panel.querySelector('#s-start').addEventListener('click', () => {
      stage.removeChild(panel);
      runPractice(stage, ctx);
    });
  }

  // 生成一个试次：{ word, color(hex), colorName, key, cond }
  function makeTrial(cond) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    let word;
    if (cond === 'congruent') word = color.name;
    else if (cond === 'neutral') word = NEUTRAL_WORDS[Math.floor(Math.random() * NEUTRAL_WORDS.length)];
    else { // incongruent：字义 ≠ 显示颜色
      const others = COLORS.filter(c => c.name !== color.name);
      word = others[Math.floor(Math.random() * others.length)].name;
    }
    return { word, color: color.hex, colorName: color.name, key: color.key, keyLabel: color.keyLabel, cond };
  }

  // 生成正式试次序列：每条件18题，混合随机
  function buildFormalTrials() {
    const list = [];
    for (let i = 0; i < 18; i++) list.push(makeTrial('congruent'));
    for (let i = 0; i < 18; i++) list.push(makeTrial('neutral'));
    for (let i = 0; i < 18; i++) list.push(makeTrial('incongruent'));
    return U.shuffle(list);
  }

  async function runPractice(stage, ctx) {
    const practice = [
      makeTrial('congruent'), makeTrial('neutral'), makeTrial('incongruent'),
      makeTrial('congruent'), makeTrial('incongruent'), makeTrial('neutral')
    ];
    for (const t of practice) {
      await showTrial(stage, t, true, ctx);
    }
    renderPracticeDone(stage, ctx);
  }

  async function showTrial(stage, t, feedback, ctx) {
    const wrap = U.el('div', { class: 'stim-stage', style: 'background:#fff;' });
    const fix = U.el('div', { style: 'font-size:48px;color:#1f2937;font-weight:600;' });
    fix.textContent = '+';
    wrap.appendChild(fix);
    stage.appendChild(wrap);

    await U.sleep(500);
    U.clear(wrap);

    const word = U.el('div', {
      style: `font-size:96px;font-weight:700;color:${t.color};font-family:"Songti SC","STSong","Times New Roman",serif;`
    });
    word.textContent = t.word;
    wrap.appendChild(word);
    const t0 = U.now();

    const result = await waitForKey(t.key);
    ctx.trials.push({
      cond: t.cond, word: t.word, color: t.colorName,
      rt: result.timeout ? 2000 : result.rt,
      correct: result.timeout ? 0 : (result.correct ? 1 : 0),
      timeout: result.timeout ? 1 : 0
    });

    if (feedback) {
      const ok = !result.timeout && result.correct;
      const fb = U.el('div', { class: 'feedback ' + (ok ? 'good' : 'bad'), style: 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);' });
      fb.textContent = ok ? '✓ 正确' : '✗ 错误';
      wrap.appendChild(fb);
      await U.sleep(600);
    }
    stage.removeChild(wrap);
  }

  // 等待 F/G/H 按键或 2 秒超时
  function waitForKey(correctKey) {
    return new Promise(resolve => {
      let settled = false;
      function onKey(e) {
        if (settled) return;
        const k = (e.key || '').toLowerCase();
        if (k !== 'f' && k !== 'g' && k !== 'h') return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        resolve({ rt: U.now() - startT, correct: k === correctKey, timeout: false });
      }
      const startT = U.now();
      document.addEventListener('keydown', onKey);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          document.removeEventListener('keydown', onKey);
          resolve({ timeout: true });
        }
      }, 2000);
    });
  }

  function renderPracticeDone(stage, ctx) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">练习结束</div>
      <div class="panel-body">接下来是正式任务，共 54 题，题间不再显示对错。准备好了就开始。</div>
      <div class="btn-row"><button class="btn" id="s-formal">开始正式任务</button></div>`;
    stage.appendChild(panel);
    panel.querySelector('#s-formal').addEventListener('click', async () => {
      stage.removeChild(panel);
      const trials = buildFormalTrials();
      for (const t of trials) {
        await showTrial(stage, t, false, ctx);
      }
      finish(stage, ctx);
    });
  }

  function finish(stage, ctx) {
    // 只统计正式试次（练习的6题在ctx.trials前部）
    const formal = ctx.trials.slice(6);
    const html = window.App.finalizeResult('stroop', buildResult(formal), formal);

    // 上传正式试次
    window.App.submitExperiment('stroop', formal, '');

    const panel = U.el('div', { class: 'panel wide' });
    panel.innerHTML = `
      <div class="panel-title">实验结果 · Stroop 效应</div>
      ${html}
      <div id="upload-status"></div>
      <div class="btn-row">
        <button class="btn" id="done-home">完成，返回首页</button>
      </div>`;
    U.clear(stage);
    stage.appendChild(panel);
    panel.querySelector('#done-home').addEventListener('click', () => window.App.goHome());
  }

  // ---- 从原始试次聚合统计并渲染结果（finish 与云端重画共用） ----
  // trials: [{ cond, word, color, rt, correct }]
  function buildResult(formal) {
    const byCond = { congruent: [], neutral: [], incongruent: [] };
    const errCount = { congruent: 0, neutral: 0, incongruent: 0 };
    const totalByCond = { congruent: 0, neutral: 0, incongruent: 0 };
    for (const t of formal) {
      totalByCond[t.cond]++;
      if (t.correct) byCond[t.cond].push(t.rt);
      else errCount[t.cond]++;
    }
    const M = window.Results.median;
    const condRT = {
      congruent: M(byCond.congruent),
      neutral: M(byCond.neutral),
      incongruent: M(byCond.incongruent)
    };
    const condErr = {
      congruent: errCount.congruent / totalByCond.congruent,
      neutral: errCount.neutral / totalByCond.neutral,
      incongruent: errCount.incongruent / totalByCond.incongruent
    };
    return window.Results.stroop({ condRT, condErr, trials: formal });
  }

  // 供云端重画：传入 raw trials，返回结果 HTML
  function renderFromTrials(trials) {
    return buildResult(trials || []);
  }

  return { start, renderFromTrials };
})();
