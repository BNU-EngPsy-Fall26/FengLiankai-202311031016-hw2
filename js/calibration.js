/* =========================================================
   眼动校准流程（WebGazer 九点校准 + 精度验证）
   勾选「启用摄像头眼动」后，进入实验前先走此流程

   参考标注算法（常见做法，用于后续数据分析）：
   1. 注视分类（I-VT 阈值法）：速度 > 30°/s 判定为扫视(saccade)，
      否则为注视(fixation)；相邻注视点 < 1° 且时长 > 80ms 合并。
   2. 兴趣区（AOI）命中率：把屏幕划分网格，统计注视点落入各
      网格的比例，得到注视热区（heatmap）。
   3. 均方误差（RMSE）：校准验证阶段用，度量预测点与真实点的
      平均欧氏距离，< 150px（约 2.5°）视为可接受。
   以上算法已在结果页（results.js）中实现对应统计。
   ========================================================= */
window.Calibration = (function () {
  const U = window.Utils;

  // 九点校准坐标（相对视口百分比，避开边缘）
  const POINTS = [
    { x: 0.10, y: 0.15 }, { x: 0.50, y: 0.15 }, { x: 0.90, y: 0.15 },
    { x: 0.10, y: 0.50 }, { x: 0.50, y: 0.50 }, { x: 0.90, y: 0.50 },
    { x: 0.10, y: 0.85 }, { x: 0.50, y: 0.85 }, { x: 0.90, y: 0.85 }
  ];

  // 本地 vendor 版本（已内置本地化模型，无需境外 CDN）
  const WEBGAZER_SRC = 'js/vendor/webgazer.js';

  function run(stage, onDone, onCancel) {
    renderLoading(stage, onDone, onCancel);
  }

  // ---- 加载 WebGazer 脚本（幂等，本地内置，模型已本地化） ----
  function ensureWebGazer() {
    return new Promise((resolve, reject) => {
      if (window.webgazer && window.webgazer.getCurrentPrediction) {
        return resolve(window.webgazer);
      }
      const script = document.createElement('script');
      script.src = WEBGAZER_SRC;
      script.onload = () => {
        if (window.webgazer) resolve(window.webgazer);
        else reject(new Error('WebGazer 未正确加载'));
      };
      script.onerror = () => reject(new Error('眼动追踪脚本加载失败（js/vendor/webgazer.js）'));
      document.head.appendChild(script);
    });
  }

  // ---- 初始化 WebGazer（关键：回归模型 + 卡尔曼滤波 + 关闭跨会话数据） ----
  function initWebGazer() {
    const wg = window.webgazer;
    try { wg.saveDataAcrossSessions(false); } catch (e) {}
    try { wg.setRegression('ridge'); } catch (e) {}
    // TFFaceMesh 是默认 tracker，无需显式设置（显式设置可能在部分版本报错）
    try { wg.applyKalmanFilter(true); } catch (e) {}   // 卡尔曼滤波平滑轨迹，减少抖动
    // 校准阶段开启红点反馈（帮助用户看到追踪是否正常）；正式实验前再关闭
    try { wg.showPredictionPoints(true); } catch (e) {}
  }

  function renderLoading(stage, onDone, onCancel) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">眼动校准</div>
      <div class="panel-body">
        <p>正在加载眼动追踪模型并请求摄像头权限…</p>
        <p class="hint">请允许浏览器访问摄像头。眼动追踪全程在本地浏览器运行，视频不会上传。</p>
      </div>
      <div class="loading-dots mt-16"><span></span><span></span><span></span></div>`;
    stage.appendChild(panel);

    ensureWebGazer()
      .then(async () => {
        initWebGazer();
        // 幂等初始化：若 WebGazer 已在本会话初始化过（媒体流已存在），
        // 直接复用，不再重复 begin()——重复 begin 会重复初始化 MediaPipe wasm，
        // 触发 abort(undefined) 崩溃（做第二个实验时必现）。
        const wg = window.webgazer;
        const alreadyStarted = !!(wg && wg.isReady && wg.isReady());
        if (alreadyStarted) {
          console.log('[gaze] WebGazer 已初始化，复用现有实例');
          // 清空上一次的校准回归数据，重新校准
          try { await wg.clearData(); } catch (e) {}
          // 恢复主循环（上次实验结束时 pause 了）
          try { await wg.resume(); } catch (e) {}
        } else {
          // begin() 返回 Promise（内部异步初始化摄像头），显式捕获其错误
          let beginResult = null;
          try { beginResult = wg.begin(); } catch (e) {
            throw new Error('启动眼动追踪失败：' + (e && e.message ? e.message : e));
          }
          if (beginResult && typeof beginResult.catch === 'function') {
            beginResult.catch(e => console.warn('[webgazer] begin 异步错误（可忽略，继续流程）', e));
          }
        }
        // 等待摄像头 + 人脸模型异步初始化完成（模型首次加载约需数秒）
        // 轮询 getCurrentPrediction 直到能返回有效坐标，或 20s 超时
        await waitModelReady(20000);
      })
      .then(() => {
        stage.removeChild(panel);
        renderCameraPreview(stage, onDone, onCancel);
      })
      .catch(err => {
        stage.removeChild(panel);
        renderFail(stage, err, onCancel);
      });
  }

  // ---- 轮询等待模型就绪：直到官方 isReady() 返回 true 且能拿到有效预测，或超时 ----
  // 关键：face_mesh 模型首次加载需数秒；若未就绪就开始校准，recordScreenPosition
  // 会因拿不到 eye features 而无法建立回归数据，最终导致「未采集到眼动数据」。
  async function waitModelReady(timeoutMs) {
    const start = U.now();
    // 先给摄像头 getUserMedia 一段启动时间
    await U.sleep(1500);
    while (U.now() - start < timeoutMs) {
      // 官方就绪信号：视频画面已初始化（MW 非空且宽度>0）
      let ready = false;
      try { ready = !!(window.webgazer.isReady && window.webgazer.isReady()); } catch (e) {}
      // 同时尝试拿到一个有效预测（说明人脸已检测 + 回归已能输出）
      let hasPred = false;
      try {
        let pred = window.webgazer.getCurrentPrediction();
        if (pred && typeof pred.then === 'function') pred = await pred;
        hasPred = !!(pred && isFinite(pred.x) && isFinite(pred.y));
        if (hasPred) console.log('[gaze] 模型就绪，预测坐标', Math.round(pred.x), Math.round(pred.y));
      } catch (e) { /* 未就绪 */ }
      if (ready || hasPred) return;
      await U.sleep(500);
    }
    console.warn('[gaze] 模型未在超时内就绪，继续流程（校准可能采集不到数据）');
  }

  // 摄像头预览 + 开始校准
  function renderCameraPreview(stage, onDone, onCancel) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">请正对摄像头</div>
      <div class="panel-body">
        <p>请调整坐姿，让<strong>面部完整出现在画面中央</strong>，光线充足，距离屏幕约 40–60 厘米。</p>
        <p>点击「开始校准」后，屏幕上会依次出现 <strong>9 个点</strong>，请<strong>注视每个点并点击它</strong>。完成后系统会验证精度。</p>
        <p class="hint">整个过程约 1–2 分钟，请保持头部稳定。</p>
      </div>
      <div class="video-preview" id="calib-video"></div>
      <div class="btn-row">
        <button class="btn" id="calib-start">开始校准</button>
        <button class="btn gray" id="calib-cancel">跳过眼动，直接开始实验</button>
      </div>`;
    stage.appendChild(panel);

    // 显示摄像头预览（WebGazer 自带的预览，含人脸框）
    try { window.webgazer.showVideoPreview(true); } catch (e) {}
    // 把预览容器（含视频+人脸框覆盖层）移到指定容器
    setTimeout(() => {
      const container = document.getElementById('webgazerVideoContainer');
      const target = panel.querySelector('#calib-video');
      if (container && target && !target.contains(container)) {
        target.appendChild(container);
      }
    }, 900);

    panel.querySelector('#calib-start').addEventListener('click', () => {
      try { window.webgazer.showVideoPreview(false); } catch (e) {}
      stage.removeChild(panel);
      runCalibration(stage, onDone, onCancel);
    });
    panel.querySelector('#calib-cancel').addEventListener('click', () => {
      try { window.webgazer.showVideoPreview(false); } catch (e) {}
      stage.removeChild(panel);
      onCancel();
    });
  }

  // ---- 九点校准主流程 ----
  async function runCalibration(stage, onDone, onCancel) {
    const wrap = U.el('div', { class: 'stim-stage calib-stage' });
    const progress = U.el('div', {
      style: 'position:absolute;top:24px;left:50%;transform:translateX(-50%);font-size:14px;color:#4b5563;font-weight:600;'
    });
    progress.textContent = '校准：请注视每个点并点击它';
    wrap.appendChild(progress);
    stage.appendChild(wrap);

    // 清除旧校准数据（clearData 是异步的，必须 await，否则会与校准点记录竞态）
    try { await window.webgazer.clearData(); } catch (e) {}

    for (let i = 0; i < POINTS.length; i++) {
      await showCalibPoint(wrap, POINTS[i], i + 1);
    }

    stage.removeChild(wrap);
    runValidation(stage, onDone, onCancel);
  }

  function showCalibPoint(wrap, p, idx) {
    return new Promise(resolve => {
      const dot = U.el('div', {
        style: `position:absolute;left:${p.x * 100}%;top:${p.y * 100}%;transform:translate(-50%,-50%);`
      });
      const ring = U.el('div', {
        style: 'width:46px;height:46px;border-radius:50%;background:#3b5bdb;box-shadow:0 0 0 6px rgba(59,91,219,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;'
      });
      ring.textContent = idx;
      dot.appendChild(ring);
      wrap.appendChild(dot);

      const onClick = () => {
        const rect = dot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // 记录校准点：先采集多次预测取稳定中位数（过滤 NaN/乱飘的异常帧），
        // 拿到有效预测才 recordScreenPosition，避免把异常值喂进回归模型导致 NaN/漂移。
        collectStablePrediction().then(ok => {
          try { window.webgazer.recordScreenPosition(cx, cy, 'click'); } catch (e) {}
          dot.removeEventListener('click', onClick);
          wrap.removeChild(dot);
          resolve();
        });
      };
      dot.addEventListener('click', onClick);
    });
  }

  // ---- 采集稳定预测：连续采样若干帧，过滤 NaN/非法值，返回中位数是否有效 ----
  // 解决「校准误差大 / 显示 NaN px / 轨迹乱飘」：单帧预测可能因人脸检测抖动而异常，
  // 取多帧中位数可显著提升回归数据质量。
  function collectStablePrediction() {
    return new Promise(resolve => {
      const vals = [];
      let attempts = 0;
      const maxAttempts = 8;   // 最多采样 8 帧
      const tick = async () => {
        attempts++;
        try {
          let pred = window.webgazer.getCurrentPrediction();
          if (pred && typeof pred.then === 'function') pred = await pred;
          if (pred && isFinite(pred.x) && isFinite(pred.y)) {
            vals.push({ x: pred.x, y: pred.y });
          }
        } catch (e) {}
        // 采满或达到上限后，判断是否拿到有效中位数
        if (vals.length >= 3 || attempts >= maxAttempts) {
          resolve(vals.length > 0);
        } else {
          setTimeout(tick, 60);
        }
      };
      tick();
    });
  }

  // ---- 精度验证：重放 5 个点，测量预测误差（固定间隔采样，非阻塞） ----
  function runValidation(stage, onDone, onCancel) {
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">校准完成，正在验证精度</div>
      <div class="panel-body">
        <p>接下来屏幕上会出现 <strong>5 个点</strong>，请<strong>自然注视</strong>每个点（<strong>不需要点击</strong>），每个点停留约 1.5 秒。</p>
      </div>`;
    stage.appendChild(panel);

    const valPoints = [POINTS[0], POINTS[2], POINTS[4], POINTS[6], POINTS[8]];
    const samples = [];  // {expectX, expectY, predX, predY}

    setTimeout(async () => {
      stage.removeChild(panel);
      // 验证阶段关闭红点反馈，避免红点轨迹干扰注视采样（只显示橙色目标点）
      try { window.webgazer.showPredictionPoints(false); } catch (e) {}
      const wrap = U.el('div', { class: 'stim-stage calib-stage' });
      stage.appendChild(wrap);

      for (const vp of valPoints) {
        const dot = U.el('div', {
          style: `position:absolute;left:${vp.x * 100}%;top:${vp.y * 100}%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;background:#e8590c;box-shadow:0 0 0 5px rgba(232,89,12,.2);`
        });
        wrap.appendChild(dot);

        const expectX = vp.x * window.innerWidth;
        const expectY = vp.y * window.innerHeight;
        const t0 = U.now();
        // 固定间隔采样（约 80ms 一次），持续 1500ms
        while (U.now() - t0 < 1500) {
          await U.sleep(80);
          try {
            let pred = window.webgazer.getCurrentPrediction();
            // 该版本 getCurrentPrediction 返回 Promise，需 await
            if (pred && typeof pred.then === 'function') pred = await pred;
            if (pred && isFinite(pred.x) && isFinite(pred.y)) {
              samples.push({ expectX, expectY, predX: pred.x, predY: pred.y });
            }
          } catch (e) {}
        }
        wrap.removeChild(dot);
      }

      stage.removeChild(wrap);
      computeAccuracy(stage, samples, onDone, onCancel);
    }, 300);
  }

  function computeAccuracy(stage, samples, onDone, onCancel) {
    // 过滤 NaN / 非法采样（防止显示 NaN px）
    const valid = samples.filter(s => isFinite(s.predX) && isFinite(s.predY) && isFinite(s.expectX) && isFinite(s.expectY));
    if (!valid.length) {
      renderFail(stage, new Error('未采集到眼动数据，请检查摄像头是否正对、光线是否充足'), onCancel);
      return;
    }
    let sumErr = 0, n = 0;
    for (const s of valid) {
      const err = Math.hypot(s.predX - s.expectX, s.predY - s.expectY);
      sumErr += err; n++;
    }
    const avgErr = sumErr / n;   // 平均误差（像素）
    const maxErr = Math.max(...valid.map(s => Math.hypot(s.predX - s.expectX, s.predY - s.expectY)));

    const panel = U.el('div', { class: 'panel center' });
    const good = avgErr < 150;   // 150px 内视为可用（约 2.5° 视角）
    panel.innerHTML = `
      <div class="panel-title">精度验证结果</div>
      <div class="stat-grid">
        <div class="stat-box ${good ? 'good' : 'bad'}">
          <div class="stat-val">${Math.round(avgErr)} px</div>
          <div class="stat-label">平均注视误差</div>
        </div>
        <div class="stat-box accent">
          <div class="stat-val">${n}</div>
          <div class="stat-label">有效采样点</div>
        </div>
      </div>
      <div class="panel-body mt-16">
        ${good
          ? '<p>✓ 精度良好，可以开始实验。实验过程中请保持头部稳定。</p>'
          : '<p>精度略低（平均误差 ' + Math.round(avgErr) + 'px，最大 ' + Math.round(maxErr) + 'px）。建议重新校准：确保光线充足、面部在画面中央、头部稳定。也可以直接开始实验，数据仅供参考。</p>'}
      </div>
      <div class="btn-row">
        ${good ? '' : '<button class="btn ghost" id="val-retry">重新校准</button>'}
        <button class="btn" id="val-go">开始实验</button>
      </div>`;
    stage.appendChild(panel);

    if (!good) {
      panel.querySelector('#val-retry').addEventListener('click', () => {
        stage.removeChild(panel);
        runCalibration(stage, onDone, onCancel);
      });
    }
    panel.querySelector('#val-go').addEventListener('click', () => {
      window.__calibAccuracy = Math.round(avgErr);
      stage.removeChild(panel);
      onDone();
    });
  }

  function renderFail(stage, err, onCancel) {
    // 把库内部无意义的压缩报错（如 "t is not a function"）转换为可读说明
    let reason = (err && err.message) ? err.message : '无法启动摄像头';
    const raw = String(reason || '');
    if (/is not a function|is not defined|Cannot read|undefined is not/i.test(raw) ||
        !/[\u4e00-\u9fa5]/.test(raw)) {
      reason = '眼动模型加载失败（WebGazer 依赖的在线人脸模型服务已失效或不可达）';
    }
    const panel = U.el('div', { class: 'panel center' });
    panel.innerHTML = `
      <div class="panel-title">眼动追踪未就绪</div>
      <div class="panel-body">
        <p>${reason}</p>
        <p class="hint">说明：本实验的眼动追踪依赖 WebGazer 开源库，其在线人脸识别模型（FaceMesh）托管在境外服务器，目前已不稳定或失效，导致无法在浏览器中完成眼动追踪。</p>
        <p class="hint">你可以<strong>跳过眼动</strong>直接完成实验（不影响实验本身），或在保证网络通畅后重试。</p>
      </div>
      <div class="btn-row">
        <button class="btn" id="fail-skip">跳过眼动，直接开始实验</button>
      </div>`;
    stage.appendChild(panel);
    panel.querySelector('#fail-skip').addEventListener('click', () => {
      stage.removeChild(panel);
      onCancel();
    });
  }

  return { run };
})();
