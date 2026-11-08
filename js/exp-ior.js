/* =========================================================
   实验 3 · 返回抑制（Inhibition of Return）
   改编自 Posner & Cohen (1984)
   ---------------------------------------------------------
   中央 +，左右各一个方框。某框短暂亮起（50ms），随后圆点
   出现在左框或右框。按键：空格。
   自变量一：同侧(cued)/异侧(uncued)
   自变量二：短间隔(100ms)/长间隔(700ms)
   正式：80 有圆点题（4条件各20题）+ 16 无圆点题（左右闪框各半）
   ========================================================= */
window.ExpIor = (function () {
  const U = window.Utils;

  const SHORT = 100, LONG = 700;   // 线索-目标间隔
  const CUE_DUR = 50;              // 闪框持续
  const TARGET_RT_LIMIT = 1000;    // 圆点作答时限

  function start(stage, ctx) {
    ctx.trials = [];
    renderIntro(stage, ctx);
  }

  function renderIntro(stage, ctx) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">实验 3 · 返回抑制</div>
      <div class="panel-body" style="text-align:left">
        <p>请一直看着屏幕中央的「+」。左右两个方框中的一个会短暂亮一下。</p>
        <p>框亮时先等着，看到<strong>任意一个框里出现小圆点</strong>，就尽快按一下<kbd>空格键</kbd>。圆点在哪边都按同一个键。</p>
        <p>有些题<strong>不会出现圆点</strong>，请保持看着中央，等下一题开始。尽量又快又准。</p>
        <p>先做几题练习，熟悉后再进入正式任务。</p>
      </div>
      <div class="btn-row"><button class="btn" id="i-start">开始练习</button></div>`;
    stage.appendChild(panel);
    panel.querySelector('#i-start').addEventListener('click', () => {
      stage.removeChild(panel);
      runPractice(stage, ctx);
    });
  }

  // 生成正式试次序列
  function buildFormalTrials() {
    const list = [];
    // 80 有圆点题：4条件各20，圆点左右各10
    const conditions = [
      { soi: SHORT, side: 'same' }, { soi: SHORT, side: 'diff' },
      { soi: LONG, side: 'same' }, { soi: LONG, side: 'diff' }
    ];
    for (const c of conditions) {
      for (let i = 0; i < 10; i++) list.push({ ...c, targetSide: 'left', hasTarget: true });
      for (let i = 0; i < 10; i++) list.push({ ...c, targetSide: 'right', hasTarget: true });
    }
    // 16 无圆点题：左右闪框各半，间隔短/长各半（catch 试次，检测抢按）
    for (let i = 0; i < 8; i++) list.push({ soi: SHORT, side: 'catch', cueSide: 'left', hasTarget: false });
    for (let i = 0; i < 8; i++) list.push({ soi: LONG, side: 'catch', cueSide: 'right', hasTarget: false });
    return U.shuffle(list);
  }

  async function runPractice(stage, ctx) {
    const practice = [
      { soi: SHORT, side: 'same', targetSide: 'left', hasTarget: true },
      { soi: LONG, side: 'diff', targetSide: 'right', hasTarget: true },
      { soi: SHORT, side: 'catch', cueSide: 'left', hasTarget: false },
      { soi: LONG, side: 'same', targetSide: 'left', hasTarget: true },
      { soi: SHORT, side: 'diff', targetSide: 'left', hasTarget: true },
    ];
    for (const t of practice) {
      await showTrial(stage, t, true, ctx);
    }
    renderPracticeDone(stage, ctx);
  }

  // 单题：中央+左右框 → 闪框(50ms) → 间隔 → 圆点/无圆点 → 作答
  async function showTrial(stage, t, isPractice, ctx) {
    return new Promise(resolve => {
      const wrap = U.el('div', { class: 'stim-stage', style: 'background:#fff;' });
      const w = innerWidth, h = innerHeight;
      const cx = w / 2, cy = h / 2;
      const boxW = 70, boxH = 70, gap = 120;
      const leftX = cx - gap, rightX = cx + gap;

      const NS = 'http://www.w3.org/2000/svg';
      function mk(tag, attrs) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
      }
      // 用 SVG 命名空间创建根元素（关键：不能用 createElement 创建 svg）
      const svg = mk('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
      svg.style.position = 'absolute';
      svg.style.inset = '0';
      // 中央 +
      const plus = mk('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', 'font-size': 48, fill: '#1f2937', 'font-weight': 600 });
      plus.textContent = '+';
      svg.appendChild(plus);
      // 左右框
      const boxLeft = mk('rect', { x: leftX - boxW/2, y: cy - boxH/2, width: boxW, height: boxH, fill: 'none', stroke: '#b8b3aa', 'stroke-width': 3, rx: 6 });
      const boxRight = mk('rect', { x: rightX - boxW/2, y: cy - boxH/2, width: boxW, height: boxH, fill: 'none', stroke: '#b8b3aa', 'stroke-width': 3, rx: 6 });
      svg.appendChild(boxLeft); svg.appendChild(boxRight);
      // 圆点（默认隐藏）
      const dot = mk('circle', { cx: 0, cy: cy, r: 11, fill: '#1f2937', opacity: 0 });
      svg.appendChild(dot);

      wrap.appendChild(svg);
      stage.appendChild(wrap);

      // 决定线索侧（有圆点时 side 决定 target 与 cue 关系；无圆点用 cueSide）
      let cueSide;
      if (t.hasTarget) {
        cueSide = (t.side === 'same') ? t.targetSide : (t.targetSide === 'left' ? 'right' : 'left');
      } else {
        cueSide = t.cueSide;
      }
      const cueBox = cueSide === 'left' ? boxLeft : boxRight;

      const preDelay = U.randInt(500, 800);
      const condTag = t.soi === SHORT ? 'short' : 'long';
      let finished = false;
      let targetOnset = 0;      // 圆点出现时间戳
      let targetVisible = false;

      function cleanup() {
        document.removeEventListener('keydown', onKey);
      }

      function done(trial) {
        if (finished) return;
        finished = true;
        cleanup();
        ctx.trials.push(trial);
        stage.removeChild(wrap);
        resolve();
      }

      // 全局键盘监听：从闪框前就挂上，用于捕获抢按
      function onKey(e) {
        if (e.code !== 'Space' || finished) return;
        const now = U.now();
        if (!t.hasTarget) {
          // 无圆点题：任何按键都是误报
          done({ cond: condTag, side: t.side, soi: t.soi, has_target: 0, target_side: '', correct: 1, rt: null, premature: 1, false_alarm: 1 });
        } else if (!targetVisible) {
          // 圆点尚未出现就按键 → 抢按
          done({ cond: condTag, side: t.side, soi: t.soi, has_target: 1, target_side: t.targetSide, correct: 0, rt: null, premature: 1, false_alarm: 0 });
        } else {
          // 圆点出现后有效按键
          const rt = now - targetOnset;
          done({ cond: condTag, side: t.side, soi: t.soi, has_target: 1, target_side: t.targetSide, correct: 1, rt: rt, premature: 0, false_alarm: 0 });
        }
      }

      // 执行时序
      (async () => {
        document.addEventListener('keydown', onKey);   // 提前挂监听，捕获抢按
        await U.sleep(preDelay);                        // 中央注视
        cueBox.setAttribute('stroke', '#e8892e');       // 闪框
        cueBox.setAttribute('stroke-width', 5);
        await U.sleep(CUE_DUR);
        cueBox.setAttribute('stroke-width', 3);
        cueBox.setAttribute('stroke', '#b8b3aa');
        await U.sleep(t.soi - CUE_DUR);                 // 间隔

        if (t.hasTarget) {
          // 显示圆点
          const dotX = t.targetSide === 'left' ? leftX : rightX;
          dot.setAttribute('cx', dotX);
          dot.setAttribute('opacity', 1);
          targetOnset = U.now();
          targetVisible = true;
          // 作答时限
          setTimeout(() => {
            if (!finished) {
              done({ cond: condTag, side: t.side, soi: t.soi, has_target: 1, target_side: t.targetSide, correct: 0, rt: null, premature: 0, false_alarm: 0 });
            }
          }, TARGET_RT_LIMIT);
        } else {
          // 无圆点：等待对应间隔+缓冲，不按键才算通过
          setTimeout(() => {
            if (!finished) {
              done({ cond: condTag, side: t.side, soi: t.soi, has_target: 0, target_side: '', correct: 1, rt: null, premature: 0, false_alarm: 0 });
            }
          }, t.soi + 700);
        }
      })();
    });
  }

  function renderPracticeDone(stage, ctx) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">练习结束</div>
      <div class="panel-body">接下来是正式任务，共 96 题（部分题目不会出现圆点）。准备好了就开始。</div>
      <div class="btn-row"><button class="btn" id="i-formal">开始正式任务</button></div>`;
    stage.appendChild(panel);
    panel.querySelector('#i-formal').addEventListener('click', async () => {
      stage.removeChild(panel);
      const trials = buildFormalTrials();
      for (const t of trials) {
        await showTrial(stage, t, false, ctx);
      }
      finish(stage, ctx);
    });
  }

  function finish(stage, ctx) {
    const formal = ctx.trials.slice(5);  // 去掉5题练习
    const html = window.App.finalizeResult('ior', buildResult(formal), formal);

    window.App.submitExperiment('ior', formal, '');

    const panel = U.el('div', { class: 'panel wide' });
    panel.innerHTML = `
      <div class="panel-title">实验结果 · 返回抑制</div>
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
  // trials: [{ cond, side, soi, has_target, target_side, correct, rt, premature, false_alarm }]
  function buildResult(formal) {
    const target = formal.filter(t => t.has_target === 1 && t.correct === 1);
    const M = window.Results.median;
    const cells = {
      shortSame: M(target.filter(t => t.soi === SHORT && t.side === 'same').map(t => t.rt)),
      shortDiff: M(target.filter(t => t.soi === SHORT && t.side === 'diff').map(t => t.rt)),
      longSame: M(target.filter(t => t.soi === LONG && t.side === 'same').map(t => t.rt)),
      longDiff: M(target.filter(t => t.soi === LONG && t.side === 'diff').map(t => t.rt))
    };
    return window.Results.ior({ cells, trials: formal });
  }

  // 供云端重画：传入 raw trials，返回结果 HTML
  function renderFromTrials(trials) {
    return buildResult(trials || []);
  }

  return { start, renderFromTrials };
})();
