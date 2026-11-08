/* =========================================================
   实验 1 · 视觉搜索（visual search）+ 心理旋转
   改编自 Treisman & Gelade (1980) 特征整合理论、
   Wolfe (1998) 搜索效率连续体、Shepard & Metzler (1971) 心理旋转

   关键设计：
   - 屏幕呈现一组字母（目标 T + 干扰），尽快按键判断「目标是否出现」
   - 自变量：
       1. set size（项目数）：4 / 8 / 12 / 16
       2. 目标是否出现：有 / 无
       3. 搜索类型：特征搜索 vs 联合搜索
       4. ★ 目标字母旋转角度：0° / 45° / 90° / ... / 315°（8 档，覆盖 0–360°）
   - 因变量：反应时 RT、正确率、搜索斜率（RT×set size）、旋转角度→RT 函数
   - 预测：特征搜索斜率≈0 且旋转影响小；联合搜索斜率陡，
     且旋转角度越大搜索越慢（每次辨认一个字母都要做一次心理旋转，180° 最慢）
   ========================================================= */
window.ExpSearch = (function () {
  const U = window.Utils;

  // 项目数（set size）四档
  const SET_SIZES = [4, 8, 12, 16];
  // 目标字母旋转角度八档（0–315°，覆盖整圈）
  const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
  // 搜索类型
  const TYPES = ['feature', 'conjunction'];

  // 按键：F = 有目标，J = 无目标
  const KEY_PRESENT = 'f';
  const KEY_ABSENT = 'j';

  // 颜色
  const C_RED = '#e03131';       // 目标红（特征搜索里唯一红）
  const C_GREEN = '#0ca678';     // 干扰绿
  const C_GRAY = '#4b5563';      // 深灰（联合搜索里的第二种干扰色）

  function start(stage, ctx) {
    const state = {
      // 试次序列：练习 12 + 正式 96
      practice: [],
      formal: [],
      results: [],       // 正式试次结果 [{ type, setSize, present, angle, rt, correct, key }]
      current: 0,
      total: 0,
      phase: 'practice'
    };

    // 生成练习试次（12 个，覆盖两种搜索类型、有无、若干角度/set size）
    state.practice = buildTrials(12, true);
    // 生成正式试次（96 个，充分采样角度 × set size × 类型 × 有无）
    state.formal = buildTrials(96, false);
    state.total = state.formal.length;

    ctx.search = state;
    ctx.trials = [];
    renderIntro(stage, state);
  }

  // 构建试次列表
  // n: 试次数；isPractice: 是否练习（练习不追求完全平衡，正式追求平衡采样）
  function buildTrials(n, isPractice) {
    const trials = [];
    if (isPractice) {
      // 练习：12 次，覆盖两种类型各 6 次，含特征/联合、有/无、几个角度
      const spec = [
        { type: 'feature', present: true, angle: 0, setSize: 8 },
        { type: 'feature', present: true, angle: 90, setSize: 12 },
        { type: 'feature', present: false, angle: 0, setSize: 8 },
        { type: 'feature', present: true, angle: 180, setSize: 4 },
        { type: 'feature', present: false, angle: 0, setSize: 12 },
        { type: 'feature', present: true, angle: 45, setSize: 8 },
        { type: 'conjunction', present: true, angle: 0, setSize: 8 },
        { type: 'conjunction', present: true, angle: 90, setSize: 12 },
        { type: 'conjunction', present: false, angle: 0, setSize: 8 },
        { type: 'conjunction', present: true, angle: 180, setSize: 4 },
        { type: 'conjunction', present: false, angle: 0, setSize: 12 },
        { type: 'conjunction', present: true, angle: 45, setSize: 8 }
      ];
      return spec.map(s => ({ ...s }));
    }

    // 正式：96 次 = 2 类型 × 8 角度 × 2 有无 × 3 set size（抽样）
    // 采用分层平衡：每个 (类型, 角度) 组合出现 6 次，其中 3 次有目标、3 次无目标
    // set size 在 6 次里均匀分配 [4,8,12,16]（尽量平衡）
    for (const type of TYPES) {
      for (const angle of ANGLES) {
        // 有目标 3 次 + 无目标 3 次
        const sizes = U.shuffle([4, 8, 12, 16, 4, 12]);
        for (let k = 0; k < 3; k++) {
          trials.push({ type, present: true, angle, setSize: sizes[k] });
        }
        for (let k = 0; k < 3; k++) {
          trials.push({ type, present: false, angle, setSize: sizes[k + 3] });
        }
      }
    }
    return U.shuffle(trials);
  }

  function renderIntro(stage, s) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">实验 1 · 视觉搜索</div>
      <div class="panel-body" style="text-align:left">
        <p>屏幕上会同时出现<strong>一组字母</strong>。你的任务是尽快判断：<strong>目标字母「T」有没有出现</strong>。</p>
        <p>目标「T」可能<strong>旋转了任意角度</strong>（倒着、斜着、横着……），它仍然是一个「T」，只是朝向不同。干扰字母都是「朝上的 T 或 L」。</p>
        <p style="margin:12px 0;padding:12px 16px;background:#f6f8fa;border-radius:8px">
          <strong>按键规则</strong>（请把左手食指、右手食指分别放在 F、J 键上）：<br>
          · 看到目标「T」出现 → 按 <strong style="color:#e03131">F</strong><br>
          · 没有目标 → 按 <strong style="color:#1971c2">J</strong>
        </p>
        <p>请<strong>又快又准</strong>地作答。先做 12 次练习，之后进入正式实验（约 96 次，中间可短暂休息）。</p>
      </div>
      <div class="btn-row"><button class="btn" id="s-start">开始练习</button></div>`;
    stage.appendChild(panel);
    panel.querySelector('#s-start').addEventListener('click', () => {
      stage.removeChild(panel);
      s.phase = 'practice';
      s.current = 0;
      runBlock(stage, s, s.practice, '练习');
    });
  }

  // 跑一个 block（练习或正式）
  function runBlock(stage, s, trials, label) {
    if (s.current >= trials.length) {
      // block 结束
      if (s.phase === 'practice') {
        showPracticeDone(stage, s);
      } else {
        finish(stage, s);
      }
      return;
    }
    const trial = trials[s.current];
    showTrial(stage, s, trial).then((result) => {
      if (s.phase === 'formal') {
        s.results.push(result);
      }
      s.current++;
      // 每 24 个正式试次提示一次休息
      if (s.phase === 'formal' && s.current > 0 && s.current % 24 === 0 && s.current < trials.length) {
        showBreak(stage, s, trials, label).then(() => {});
      } else {
        runBlock(stage, s, trials, label);
      }
    });
  }

  function showPracticeDone(stage, s) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">练习结束</div>
      <div class="panel-body">练习完成。下面进入<strong>正式实验</strong>，共 ${s.total} 次，规则不变。正式实验会随机穿插不同项目数、不同旋转角度的目标。</div>
      <div class="btn-row"><button class="btn" id="s-go">开始正式实验</button></div>`;
    stage.appendChild(panel);
    panel.querySelector('#s-go').addEventListener('click', () => {
      stage.removeChild(panel);
      s.phase = 'formal';
      s.current = 0;
      runBlock(stage, s, s.formal, '正式');
    });
  }

  function showBreak(stage, s, trials, label) {
    return new Promise(resolve => {
      const panel = U.el('div', { class: 'panel center' });
      panel.innerHTML = `
        <div class="panel-title">休息一下</div>
        <div class="panel-body">已完成 ${s.current} / ${trials.length} 次。休息好了就继续。</div>
        <div class="btn-row"><button class="btn" id="s-cont">继续</button></div>`;
      stage.appendChild(panel);
      panel.querySelector('#s-cont').addEventListener('click', () => {
        stage.removeChild(panel);
        resolve();
        runBlock(stage, s, trials, label);
      });
    });
  }

  // 呈现单个试次，返回 Promise<result>
  function showTrial(stage, s, trial) {
    return new Promise(resolve => {
      const wrap = U.el('div', { class: 'stim-stage search-stage' });
      const canvas = U.el('canvas');
      const w = innerWidth;
      const h = innerHeight;
      canvas.width = w; canvas.height = h;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      wrap.appendChild(canvas);
      stage.appendChild(wrap);

      // 生成刺激布局
      const layout = makeLayout(trial);
      const ctx2d = canvas.getContext('2d');

      // 画背景
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(0, 0, w, h);

      // 提示条（顶部）
      ctx2d.fillStyle = '#4b5563';
      ctx2d.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx2d.textAlign = 'center';
      ctx2d.fillText('有目标按 F · 无目标按 J', w / 2, 34);

      // 绘制所有字母
      layout.items.forEach(it => drawLetter(ctx2d, it));

      const t0 = U.now();
      let done = false;

      const onKey = (e) => {
        const k = (e.key || '').toLowerCase();
        if (k !== KEY_PRESENT && k !== KEY_ABSENT) return;
        if (done) return;
        done = true;
        const rt = Math.round(U.now() - t0);
        document.removeEventListener('keydown', onKey);
        // 判定
        const answeredPresent = (k === KEY_PRESENT);
        const correct = (answeredPresent === trial.present);
        const result = {
          type: trial.type,
          setSize: trial.setSize,
          present: trial.present ? 1 : 0,
          angle: trial.angle,
          rt: rt,
          correct: correct ? 1 : 0,
          key: k
        };
        // 练习阶段给即时反馈
        if (s.phase === 'practice') {
          showFeedback(stage, wrap, result).then(() => resolve(result));
        } else {
          stage.removeChild(wrap);
          resolve(result);
        }
      };
      document.addEventListener('keydown', onKey);

      // 超时（3 秒）自动按错误处理
      setTimeout(() => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        const result = {
          type: trial.type, setSize: trial.setSize,
          present: trial.present ? 1 : 0, angle: trial.angle,
          rt: 3000, correct: 0, key: 'timeout'
        };
        if (s.phase === 'practice') {
          showFeedback(stage, wrap, result).then(() => resolve(result));
        } else {
          stage.removeChild(wrap);
          resolve(result);
        }
      }, 3000);
    });
  }

  // 练习反馈
  function showFeedback(stage, wrap, result) {
    return new Promise(resolve => {
      const fb = U.el('div', {
        class: 'panel center',
        style: 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
      });
      const ok = result.correct === 1;
      fb.innerHTML = `
        <div class="panel-body" style="font-size:28px;font-weight:700;color:${ok ? '#0ca678' : '#e03131'}">${ok ? '✓ 正确' : '✗ 错误'}</div>
        <div class="panel-body" style="margin-top:6px">反应时 ${result.rt} ms</div>`;
      stage.removeChild(wrap);
      stage.appendChild(fb);
      setTimeout(() => { stage.removeChild(fb); resolve(); }, 700);
    });
  }

  // 生成刺激布局：位置（环形散开）、每个字母的颜色、朝向、是否为目标
  function makeLayout(trial) {
    const items = [];
    const n = trial.setSize;
    const w = innerWidth;
    const h = innerHeight;
    const cx = w / 2, cy = h / 2 + 10;
    const R = Math.min(w, h) * 0.36;

    // 目标位置（若有目标）
    let targetIdx = -1;
    if (trial.present) targetIdx = Math.floor(Math.random() * n);

    // 干扰字母（全部朝上）：特征搜索用绿色 T；联合搜索用「红横T + 绿竖T」混合
    for (let i = 0; i < n; i++) {
      const anglePos = (i / n) * Math.PI * 2 - Math.PI / 2; // 从顶部顺时针分布
      const r = R * (0.85 + (i % 3) * 0.18); // 轻微径向抖动，避免太整齐
      const x = cx + Math.cos(anglePos) * r;
      const y = cy + Math.sin(anglePos) * r;

      if (i === targetIdx) {
        // 目标：字母 T，旋转 trial.angle 度，颜色为红（特征搜索里唯一红）
        items.push({ x, y, letter: 'T', angle: trial.angle, color: C_RED, isTarget: true });
      } else {
        // 干扰
        if (trial.type === 'feature') {
          // 特征搜索：干扰全是绿色 T（朝上），目标是唯一红色 T → 颜色 pop-out
          items.push({ x, y, letter: 'T', angle: 0, color: C_GREEN, isTarget: false });
        } else {
          // 联合搜索：干扰是「红色横向 T（或 L）+ 绿色纵向」，目标 = 红色 + 特定朝向组合
          // 简化：干扰一半红、一半绿，红的都横着（angle 90），绿的都竖着（angle 0）
          // 目标「红色朝上 T」需要同时满足「红」+「朝上」两个特征 → 联合搜索
          const isRed = (i % 2 === 0);
          if (isRed) {
            items.push({ x, y, letter: 'T', angle: 90, color: C_RED, isTarget: false });
          } else {
            items.push({ x, y, letter: 'T', angle: 0, color: C_GREEN, isTarget: false });
          }
        }
      }
    }
    return { items };
  }

  // 绘制一个字母（T），可旋转
  function drawLetter(ctx2d, it) {
    const size = 34; // 字母边长
    ctx2d.save();
    ctx2d.translate(it.x, it.y);
    ctx2d.rotate((it.angle || 0) * Math.PI / 180);
    ctx2d.fillStyle = it.color;
    ctx2d.strokeStyle = it.color;
    ctx2d.lineWidth = 3;
    ctx2d.lineCap = 'round';

    // 画字母 T：横杠 + 竖杠
    const half = size / 2;
    ctx2d.beginPath();
    ctx2d.moveTo(-half, -half * 0.7);   // 横杠左
    ctx2d.lineTo(half, -half * 0.7);    // 横杠右
    ctx2d.moveTo(0, -half * 0.7);       // 竖杠上（连接横杠中点）
    ctx2d.lineTo(0, half * 0.7);        // 竖杠下
    ctx2d.stroke();
    ctx2d.restore();
  }

  // 计算搜索斜率等统计并渲染结果
  function finish(stage, s) {
    const results = s.results;
    const html = window.App.finalizeResult('search', buildResult(results), results);

    // 上传数据
    const trials = results.map(r => ({
      type: r.type,
      set_size: r.setSize,
      present: r.present,
      angle: r.angle,
      rt: r.rt,
      correct: r.correct
    }));
    window.App.submitExperiment('search', trials, 'search');

    const panel = U.el('div', { class: 'panel wide' });
    panel.innerHTML = `
      <div class="panel-title">实验结果 · 视觉搜索</div>
      ${html}
      <div class="panel-body center" style="margin-top:8px">
        <p>不同试次的目标旋转角度和项目数不同。无论表现如何，都请暂时不要向还没参加的同学透露实验细节。</p>
      </div>
      <div id="upload-status"></div>
      <div class="btn-row">
        <button class="btn" id="done-home">✓ 完成本实验，返回首页</button>
      </div>`;
    U.clear(stage);
    stage.appendChild(panel);
    panel.querySelector('#done-home').addEventListener('click', () => window.App.goHome());
  }

  // ---- 从原始试次聚合统计并渲染结果（finish 与云端重画共用） ----
  // trials: [{ type, set_size, present, angle, rt, correct }]
  function buildResult(results) {
    // 1. 正确反应时（按条件聚合）
    const correct = results.filter(r => r.correct === 1);

    // 按 set size 分组求特征/联合的 RT（用于斜率）
    function rtBySetSize(list, type) {
      const rtBySize = {};
      SET_SIZES.forEach(sz => {
        const arr = list.filter(r => r.type === type && r.setSize === sz && r.correct === 1).map(r => r.rt);
        rtBySize[sz] = arr.length ? window.Results.median(arr) : null;
      });
      return rtBySize;
    }
    const featBySize = rtBySetSize(correct, 'feature');
    const conjBySize = rtBySetSize(correct, 'conjunction');

    // 2. 按角度分组（联合搜索下，有目标试次）→ 心理旋转曲线
    const conjPresent = correct.filter(r => r.type === 'conjunction' && r.present === 1);
    const angleRT = {};
    ANGLES.forEach(a => {
      const arr = conjPresent.filter(r => r.angle === a).map(r => r.rt);
      angleRT[a] = arr.length ? window.Results.median(arr) : null;
    });

    // 3. 正确率
    const accFeature = accOf(results, 'feature');
    const accConj = accOf(results, 'conjunction');

    // 4. 搜索斜率（线性回归：RT = a + b * setSize）
    const slopeFeature = slopeOf(featBySize);
    const slopeConj = slopeOf(conjBySize);

    return window.Results.search({
      featBySize, conjBySize,
      angleRT,
      accFeature, accConj,
      slopeFeature, slopeConj,
      trials: results
    });
  }

  // 供云端重画：传入 raw trials，返回结果 HTML
  function renderFromTrials(trials) {
    // 云端字段名是 set_size，统一映射回内部 setSize
    const normalized = (trials || []).map(r => ({
      type: r.type,
      setSize: (r.set_size != null ? r.set_size : r.setSize),
      present: (r.present != null ? r.present : r.present),
      angle: r.angle,
      rt: r.rt,
      correct: r.correct
    }));
    return buildResult(normalized);
  }

  function accOf(list, type) {
    const arr = list.filter(r => r.type === type);
    if (!arr.length) return 0;
    return arr.filter(r => r.correct === 1).length / arr.length;
  }

  function slopeOf(rtBySize) {
    // 简单线性回归 y = a + b*x
    const pts = SET_SIZES.filter(sz => rtBySize[sz] != null).map(sz => ({ x: sz, y: rtBySize[sz] }));
    if (pts.length < 2) return 0;
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.x, 0) / n;
    const my = pts.reduce((a, p) => a + p.y, 0) / n;
    let num = 0, den = 0;
    for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); }
    return den ? num / den : 0;
  }

  return { start, renderFromTrials };
})();
