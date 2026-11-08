/* =========================================================
   主控制器 —— 页面路由、知情同意、收数、眼动
   ========================================================= */
window.App = (function () {
  const U = window.Utils;

  let subject = '';        // 匿名编号（被试自填昵称）
  let subjectCode = '';    // 稳定被试码（昵称哈希，随数据上传、用于云端关联）
  let eyeEnabled = false;
  let gazeData = [];       // 眼动采样
  let gazeTimer = null;
  let resultCache = {};    // 每个实验最近一次的结果页 HTML（供「查看结果」复用）

  const $ = U.$;

  // ---- 初始化 ----
  function init() {
    bindHome();
    bindBack();
    detectEyeEnv();
    loadProgress();
    // 挂载管理员入口（首页角落隐蔽小图标）
    if (window.Admin && window.Admin.mountEntry) window.Admin.mountEntry();
  }

  // ---- 任务进度：查询云端，标记当前编号已完成的实验（打勾） ----
  // 通过 GET /api/hw2/data 读取每个项目的数据，按 participant 字段判断是否已完成
  // 同时用 localStorage 记录「本机已完成」的实验，作为离线/上传失败时的兜底
  let refreshProgress = async () => {};   // 可复用的刷新函数（供返回首页等场景调用）

  // 读取本机已完成的实验记录：{ participant: { search:true, stroop:true, ... } }
  function getLocalDone() {
    try {
      return JSON.parse(localStorage.getItem('edu_admin_done') || '{}');
    } catch (e) { return {}; }
  }
  function markLocalDone(participant, experiment) {
    const all = getLocalDone();
    all[participant] = all[participant] || {};
    all[participant][experiment] = true;
    try { localStorage.setItem('edu_admin_done', JSON.stringify(all)); } catch (e) {}
  }

  function loadProgress() {
    const nick = $('#nickname');
    const experiments = Object.keys(window.CONFIG.experiments);
    const refresh = async () => {
      const name = (nick && nick.value ? nick.value.trim() : '');
      if (!name) { clearChecks(); return; }
      const code = U.subjectCode();   // 本机唯一被试码
      // 先读本地兜底
      const localDone = getLocalDone()[code] || {};
      // 并行查询三个实验的数据
      const results = await Promise.allSettled(
        experiments.map(exp => window.Utils.loadAll(exp))
      );
      results.forEach((res, i) => {
        const exp = experiments[i];
        const check = document.querySelector(`.exp-check[data-check="${exp}"]`);
        if (!check) return;
        let done = !!localDone[exp];
        if (!done && res.status === 'fulfilled') {
          const records = res.value || [];
          done = records.some(r => {
            const p = r.participant || r.participant_id || '';
            return String(p).trim() === code;
          });
        }
        check.hidden = !done;
        // 已完成 → 卡片变绿
        const card = document.querySelector(`.exp-card[data-exp="${exp}"]`);
        if (card) card.classList.toggle('done', done);
      });
    };
    refreshProgress = refresh;
    // 输入编号时防抖刷新
    let timer = null;
    nick.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 600);
    });
    // 页面加载时若已有编号，主动查询一次
    if (nick && nick.value && nick.value.trim()) {
      setTimeout(refresh, 300);
    }
  }

  function clearChecks() {
    document.querySelectorAll('.exp-check').forEach(c => { c.hidden = true; });
    document.querySelectorAll('.exp-card').forEach(c => { c.classList.remove('done'); });
  }

  // 检测眼动所需的安全上下文环境，给用户明确提示
  function detectEyeEnv() {
    const eyeHint = $('#eye-hint');
    if (!eyeHint) return;
    // 关键：摄像头 getUserMedia 需要 navigator.mediaDevices 可用（https 或 localhost）
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isFile = location.protocol === 'file:';
    const secure = window.isSecureContext;

    if (isFile) {
      eyeHint.innerHTML = '⚠️ 当前用 file:// 双击打开，<strong>摄像头无法调用</strong>。如需眼动追踪，请运行 <code>node server-https.js</code>，再访问 <code>https://localhost:8443</code>。';
      eyeHint.style.color = '#e8590c';
    } else if (!hasMediaDevices || !secure) {
      eyeHint.innerHTML = '⚠️ 当前环境无法调用摄像头（需 HTTPS 或 localhost）。请用 <code>node server-https.js</code> 启动后访问 <code>https://localhost:8443</code>。';
      eyeHint.style.color = '#e8590c';
    } else {
      eyeHint.innerHTML = '✓ 当前为安全上下文，摄像头眼动追踪可用。';
      eyeHint.style.color = '#0ca678';
    }
  }

  // ---- 首页：知情同意 + 编号 → 解锁实验卡片 ----
  function bindHome() {
    const nick = $('#nickname');
    const consent = $('#consent');
    const eye = $('#eye-enable');
    const cards = U.$$('.exp-card');
    const topbar = $('#topbar-subject');

    function refresh() {
      const ready = nick.value.trim().length > 0 && consent.checked;
      cards.forEach(c => { c.disabled = !ready; });
      const name = nick.value.trim();
      if (name) {
        const code = U.subjectCode();
        topbar.textContent = '被试码：' + code;
        topbar.title = '你的唯一被试码（本机生成，与其他被试不重复；同名昵称也不会串号）';
      } else {
        topbar.textContent = '';
      }
    }
    nick.addEventListener('input', refresh);
    consent.addEventListener('change', refresh);
    eye.addEventListener('change', () => { eyeEnabled = eye.checked; });

    cards.forEach(card => {
      card.addEventListener('click', () => {
        if (card.disabled) return;
        subject = nick.value.trim();
        subjectCode = U.subjectCode();   // 全局唯一被试码（本机持久化，同名昵称也不会串）
        eyeEnabled = eye.checked;
        const exp = card.dataset.exp;
        // 已完成 → 进入选择页（查看结果 / 再做一次）；否则直接启动实验
        if (card.classList.contains('done')) {
          showChoice(exp);
        } else {
          launchExperiment(exp);
        }
      });
    });
  }

  // ---- 启动实验：勾选眼动 → 先校准，再进实验 ----
  function launchExperiment(exp) {
    const meta = window.CONFIG.experiments[exp];
    // 清理上一次实验残留的眼动状态（暂停主循环 + 关红点），避免重复 init 崩溃
    stopGaze();
    $('#page-home').classList.remove('active');
    $('#page-exp').classList.add('active');
    $('#exp-title').textContent = meta.name;
    $('#exp-progress').textContent = '';
    const stage = $('#exp-stage');
    U.clear(stage);

    const ctx = { trials: [] };

    const enter = () => {
      U.clear(stage);
      // 正式实验阶段：隐藏眼动红点轨迹（校准/验证阶段才显示，实验过程不干扰被试）
      if (eyeEnabled && window.webgazer) {
        try { window.webgazer.showPredictionPoints(false); } catch (e) {}
      }
      if (exp === 'search') window.ExpSearch.start(stage, ctx);
      else if (exp === 'stroop') window.ExpStroop.start(stage, ctx);
      else if (exp === 'ior') window.ExpIor.start(stage, ctx);
    };

    if (eyeEnabled) {
      // 勾选眼动：先走校准流程，完成后再进实验
      $('#exp-title').textContent = meta.name + ' · 眼动校准';
      window.Calibration.run(stage, () => {
        // 校准完成 → 启动注视监听 → 进实验
        startGazeListener();
        enter();
      }, enter);
    } else {
      enter();
    }
  }

  function bindBack() {
    $('#exp-back').addEventListener('click', () => {
      stopGaze();
      goHome();
    });
  }

  // ---- 已完成实验的选择页：查看结果 / 再做一次 ----
  function showChoice(exp) {
    const meta = window.CONFIG.experiments[exp];
    $('#page-home').classList.remove('active');
    $('#page-exp').classList.add('active');
    $('#exp-title').textContent = meta.name;
    $('#exp-progress').textContent = '';
    const stage = $('#exp-stage');
    U.clear(stage);

    const panel = U.el('div', { class: 'panel center choice-panel' });
    panel.innerHTML = `
      <div class="choice-badge">✓ 你已完成「${meta.name}」</div>
      <p class="choice-desc">你可以查看上次的实验结果，或重新再做一次。<br>（再做一次会覆盖之前的结果记录）</p>
      <div class="btn-row">
        <button class="btn" id="choice-view">查看结果</button>
        <button class="btn ghost" id="choice-redo">再做一次</button>
      </div>`;
    stage.appendChild(panel);
    panel.querySelector('#choice-view').addEventListener('click', () => showResult(exp));
    panel.querySelector('#choice-redo').addEventListener('click', () => launchExperiment(exp));
  }

  // ---- 查看结果：优先从云端按被试码拉回 trials 重画，失败则回退缓存 ----
  async function showResult(exp) {
    const meta = window.CONFIG.experiments[exp];
    $('#exp-title').textContent = meta.name + ' · 结果';
    const stage = $('#exp-stage');
    U.clear(stage);
    const code = subjectCode || U.subjectCode();

    // 加载中提示
    const loading = U.el('div', { class: 'panel center' });
    loading.innerHTML = `<div class="panel-title">正在加载结果…</div><p class="panel-body">从云端拉取你的历史数据并重新绘制图表。</p>`;
    stage.appendChild(loading);

    let html = null;
    // 1. 尝试从云端按被试码拉回最近一次试次并重画
    try {
      const records = await window.Utils.loadRecords(exp);
      const mine = records.filter(r => String(r.participant || '').trim() === code);
      // 取最新一条（created_at 最新 / record_id 最大）
      mine.sort((a, b) => (b.record_id || 0) - (a.record_id || 0));
      const latest = mine[0];
      if (latest && Array.isArray(latest.trials) && latest.trials.length) {
        html = renderFromTrials(exp, latest.trials);
        // 云端仅保存行为数据（trials），眼动采样点不落库，
        // 因此云端重画时补一句说明，避免用户误以为眼动数据丢失
        html += `<div class="result-section"><p class="panel-body" style="color:var(--ink-faint);font-size:12.5px">注：眼动追踪采样数据仅在<strong>本机当次会话</strong>中实时呈现，云端仅保存行为试次数据；如需查看眼动分析，请在完成实验后于本页直接查看。</p></div>`;
        // 云端重画同样追加「你 vs 全体」对比（用自己的 trials 对比其他被试）
        if (window.Results && window.Results.groupComparison) {
          html += window.Results.groupComparison(exp, latest.trials);
        }
      }
    } catch (e) {
      console.warn('[viewResult] 云端拉取失败，回退缓存', e);
    }

    // 2. 回退：本地内存缓存
    if (!html && resultCache[exp]) {
      html = resultCache[exp];
    }

    U.clear(stage);
    if (!html) {
      const panel = U.el('div', { class: 'panel center' });
      panel.innerHTML = `
        <div class="panel-title">暂无结果</div>
        <p class="panel-body">云端和本地都没有找到你的结果记录。<br>你可以「再做一次」重新完成实验。</p>
        <div class="btn-row">
          <button class="btn ghost" id="noresult-back">返回</button>
          <button class="btn" id="noresult-redo">再做一次</button>
        </div>`;
      stage.appendChild(panel);
      panel.querySelector('#noresult-back').addEventListener('click', () => showChoice(exp));
      panel.querySelector('#noresult-redo').addEventListener('click', () => launchExperiment(exp));
      return;
    }

    const panel = U.el('div', { class: 'panel wide' });
    panel.innerHTML = `
      <div class="panel-title">实验结果 · ${meta.name}</div>
      <div class="panel-body" style="margin-bottom:12px;font-size:12.5px;color:var(--ink-faint)">
        被试码：<strong>${code}</strong> · 数据来自云端，已重新绘制
      </div>
      ${html}
      <div class="btn-row">
        <button class="btn ghost" id="result-redo">再做一次</button>
        <button class="btn" id="result-home">返回首页</button>
      </div>`;
    stage.appendChild(panel);
    panel.querySelector('#result-home').addEventListener('click', () => goHome());
    panel.querySelector('#result-redo').addEventListener('click', () => launchExperiment(exp));
  }

  // ---- 根据 exp 调用对应实验模块的「从 trials 重画」函数 ----
  function renderFromTrials(exp, trials) {
    if (exp === 'search' && window.ExpSearch && window.ExpSearch.renderFromTrials) return window.ExpSearch.renderFromTrials(trials);
    if (exp === 'stroop' && window.ExpStroop && window.ExpStroop.renderFromTrials) return window.ExpStroop.renderFromTrials(trials);
    if (exp === 'ior' && window.ExpIor && window.ExpIor.renderFromTrials) return window.ExpIor.renderFromTrials(trials);
    return null;
  }

  // ---- 缓存某实验的结果页 HTML（供「查看结果」复用） ----
  function setResult(exp, html) {
    resultCache[exp] = html;
  }

  // ---- 把「眼动分析」+「群体对比」板块追加到结果 HTML 末尾 ----
  // myTrials：当前被试本次实验的 raw trials（用于计算「我的指标」并对比全体均值）
  function finalizeResult(exp, html, myTrials) {
    const meta = { calib_error_px: window.__calibAccuracy || null };
    const gazeHTML = (eyeEnabled && window.Results && window.Results.gazeAnalysis)
      ? window.Results.gazeAnalysis(gazeData, meta)
      : '';
    // 群体对比：先放占位容器，异步拉取全体数据后填充
    const groupHTML = (window.Results && window.Results.groupComparison)
      ? window.Results.groupComparison(exp, myTrials)
      : '';
    const full = html + gazeHTML + groupHTML;
    setResult(exp, full);
    return full;
  }

  function goHome() {
    $('#page-exp').classList.remove('active');
    $('#page-home').classList.add('active');
    // 返回首页后刷新任务打勾（刚完成的实验立即显示 ✓）
    setTimeout(() => { refreshProgress(); }, 200);
  }

  // ---- 收数 ----
  async function submitExperiment(experiment, trials, condition) {
    const expName = window.CONFIG.experiments[experiment].experiment;
    const meta = { ua: navigator.userAgent.slice(0, 80), w: innerWidth, h: innerHeight };
    if (eyeEnabled) {
      meta.eye_tracked = 1;
      if (window.__calibAccuracy) meta.calib_error_px = window.__calibAccuracy;
      if (gazeData.length) meta.gaze = gazeData.slice(0, 500);   // 眼动采样（≤500 项）
    } else {
      meta.eye_tracked = 0;
    }
    try {
      const r = await U.submit(subjectCode || U.subjectCode(), expName, trials, condition, meta);
      window.__lastUpload = { ok: true, warnings: r.warnings || null };
      console.log('[submit] ok', r);
      renderUploadStatus();
    } catch (e) {
      window.__lastUpload = { ok: false, error: e.message };
      console.warn('[submit] failed', e);
      U.exportCSV(experiment, trials, subject);
      renderUploadStatus();
    }
    // 无论上传成功与否，都在本机记录「已完成」，确保返回首页能打勾
    markLocalDone(subjectCode || U.subjectCode(), experiment);
  }

  // 在上传状态栏显示结果（若存在）
  function renderUploadStatus() {
    const box = $('#upload-status');
    if (!box) return;
    const u = window.__lastUpload;
    if (u.ok) {
      let html = '✓ 数据已成功上传至注意实验室';
      if (u.warnings && u.warnings.length) {
        box.className = 'upload-status warn';
        html += '（含警告：' + u.warnings.map(w => String(w)).join('；') + '）';
      } else {
        box.className = 'upload-status ok';
      }
      box.innerHTML = html;
    } else {
      box.className = 'upload-status err';
      box.innerHTML = '✗ 数据未上传（' + (u.error || '网络错误') + '），已为你下载 CSV 备份，请手动提交';
    }
  }

  // ---- 眼动（WebGazer，可选加分项） ----
  // 校准完成后调用，开始持续采集注视坐标
  function startGazeListener() {
    if (!window.webgazer) return;
    try {
      // 确保校准后配置生效（回归模型 ridge + 卡尔曼滤波平滑轨迹，减少抖动）
      try { window.webgazer.applyKalmanFilter(true); } catch (e) {}
      try { window.webgazer.setRegression('ridge'); } catch (e) {}

      window.webgazer.setGazeListener((data, ts) => {
        if (data && isFinite(data.x) && isFinite(data.y)) {
          gazeData.push({ t: Math.round(ts || 0), x: Math.round(data.x), y: Math.round(data.y) });
        }
      });
      console.log('[gaze] 注视监听已启动（校准后）');
    } catch (e) { console.warn('[gaze]', e); }
    gazeTimer = setInterval(() => {
      if (gazeData.length > 1000) gazeData = gazeData.slice(-600); // 限制内存
    }, 15000);
  }

  // 停止采集：暂停主循环 + 关闭红点，但【保留视频流和 wasm 实例】，
  // 这样下一次实验可以 resume() 复用，避免重复 init wasm 导致 abort(undefined) 崩溃。
  // 注意：不要调用 end()（会 remove DOM 但留下半初始化状态），也不要在中途 stopVideo()。
  function stopGaze() {
    if (gazeTimer) { clearInterval(gazeTimer); gazeTimer = null; }
    gazeData = [];
    if (window.webgazer) {
      // 仅当 WebGazer 已真正初始化（视频流存在）时才操作，避免在未 begin 前 pause 污染 HW 标志
      let started = false;
      try { started = !!(window.webgazer.isReady && window.webgazer.isReady()); } catch (e) {}
      // 关闭红点反馈（正式实验结束，返回时不留红点）
      try { window.webgazer.showPredictionPoints(false); } catch (e) {}
      // 隐藏视频预览 overlay
      try { window.webgazer.showVideoPreview(false); } catch (e) {}
      if (started) {
        // 暂停主循环（保留视频流 + wasm，供下次 resume 复用）
        try { window.webgazer.pause(); } catch (e) {}
      }
    }
  }

  return {
    init, goHome, submitExperiment, getSubject: () => subject,
    getGaze: () => gazeData, setResult, finalizeResult, getSubjectCode: () => subjectCode
  };
})();

document.addEventListener('DOMContentLoaded', () => window.App.init());
