/* =========================================================
   管理员面板 —— 数据查看与可视化分析（仅实验者本人使用）
   ---------------------------------------------------------
   功能：
   1. 密钥门禁（前端校验，仅作防误入用；非强安全）
   2. 拉取收数平台全部被试数据
   3. 逐被试核心指标 + 群体均值 + 分布图
   ========================================================= */
window.Admin = (function () {
  const U = window.Utils;
  const S = window.Stats;

  // ---- 密钥（前端校验，仅防普通被试误入；非强安全）----
  // 默认密钥：attnlab2026
  // 修改方法：控制台运行 Admin._genHash('你的新密钥') 得到哈希，替换下方 ADMIN_HASH
  const ADMIN_HASH = '69eecc6486943c36';  // = _hash('attnlab2026')
  const SESSION_KEY = 'edu_admin_unlocked';

  // 简单哈希（djb2 变体 + 加盐），非加密安全，仅用于避免源码明文密钥
  function _hash(str) {
    let h1 = 5381, h2 = 52711;
    const s = String(str) + '::attnlab-salt';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = (Math.imul(h1, 33) ^ c) >>> 0;
      h2 = (Math.imul(h2, 31) ^ c) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  function _genHash(plain) { return _hash(plain); }

  function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  /* ============ 入口：首页角落小图标 + 密钥弹窗 ============ */
  function mountEntry() {
    let btn = document.getElementById('admin-entry');
    if (btn) return;
    btn = U.el('button', {
      id: 'admin-entry',
      class: 'admin-entry',
      title: '',
      'aria-label': '数据管理'
    });
    btn.textContent = '⚙';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => {
      if (isUnlocked()) openPanel();
      else promptKey();
    });
  }

  function promptKey() {
    // 复用结果页风格的面板容器
    const host = document.body;
    let overlay = document.getElementById('admin-key-overlay');
    if (overlay) return;
    overlay = U.el('div', { id: 'admin-key-overlay', class: 'admin-overlay' });
    overlay.innerHTML = `
      <div class="panel center admin-key-panel">
        <div class="panel-title">实验者验证</div>
        <div class="panel-body">
          <p>请输入实验者密钥以查看全体被试数据。</p>
          <input type="password" id="admin-key-input" class="admin-key-input" placeholder="密钥" autocomplete="off">
          <p class="hint" id="admin-key-err" style="color:#e8590c;display:none"></p>
        </div>
        <div class="btn-row">
          <button class="btn ghost" id="admin-key-cancel">取消</button>
          <button class="btn" id="admin-key-ok">验证</button>
        </div>
      </div>`;
    host.appendChild(overlay);

    const input = overlay.querySelector('#admin-key-input');
    const err = overlay.querySelector('#admin-key-err');
    const doVerify = () => {
      const v = input.value.trim();
      if (_hash(v) === ADMIN_HASH) {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
        overlay.remove();
        openPanel();
      } else {
        err.textContent = '密钥错误，请重试';
        err.style.display = 'block';
        input.value = '';
        input.focus();
      }
    };
    overlay.querySelector('#admin-key-ok').addEventListener('click', doVerify);
    overlay.querySelector('#admin-key-cancel').addEventListener('click', () => overlay.remove());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify(); });
    setTimeout(() => input.focus(), 50);
  }

  /* ============ 管理员主面板 ============ */
  function openPanel() {
    const host = document.body;
    let panel = document.getElementById('admin-panel');
    if (panel) { panel.remove(); }
    panel = U.el('div', { id: 'admin-panel', class: 'admin-panel' });
    panel.innerHTML = `
      <div class="admin-panel-head">
        <div class="admin-panel-title">实验者数据面板</div>
        <button class="btn ghost" id="admin-close">关闭</button>
      </div>
      <div class="admin-tabs" id="admin-tabs"></div>
      <div class="admin-body" id="admin-body">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>`;
    host.appendChild(panel);
    panel.querySelector('#admin-close').addEventListener('click', () => panel.remove());

    // 三个实验 tab
    const exps = Object.keys(window.CONFIG.experiments);
    const tabs = panel.querySelector('#admin-tabs');
    exps.forEach((exp, i) => {
      const meta = window.CONFIG.experiments[exp];
      const t = U.el('button', { class: 'admin-tab' + (i === 0 ? ' active' : ''), 'data-exp': exp });
      t.textContent = meta.name;
      tabs.appendChild(t);
      t.addEventListener('click', () => {
        tabs.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        loadExperiment(exp);
      });
    });

    loadExperiment(exps[0]);
  }

  async function loadExperiment(exp) {
    const body = document.getElementById('admin-body');
    const meta = window.CONFIG.experiments[exp];
    body.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>
      <p class="hint" style="text-align:center">正在从收数平台拉取「${meta.name}」数据…</p>`;

    let records;
    try {
      records = await U.loadAll(exp);
    } catch (e) {
      body.innerHTML = `<div class="panel-body" style="color:#e8590c">拉取失败：${e.message || e}</div>`;
      return;
    }

    if (!records || !records.length) {
      body.innerHTML = `<div class="panel-body">「${meta.name}」暂无数据。等有被试完成实验后会自动出现在这里。</div>`;
      return;
    }

    // 逐被试计算指标
    const rows = [];
    for (const r of records) {
      const trials = Array.isArray(r.trials) ? r.trials : [];
      if (!trials.length) continue;
      const stats = computeStats(exp, trials);
      rows.push({
        participant: r.participant || r.participant_id || ('#' + r.record_id),
        record_id: r.record_id,
        created_at: r.created_at,
        trials: trials.length,
        raw: trials,          // 保留原始试次，供「导出原始试次 CSV」使用
        stats
      });
    }

    if (!rows.length) {
      body.innerHTML = `<div class="panel-body">该实验暂无有效试次数据。</div>`;
      return;
    }

    body.innerHTML = renderExperiment(exp, rows);
  }

  // 用统一统计层提取某实验的核心指标（与结果页口径一致）
  function computeStats(exp, trials) {
    if (exp === 'search') return S.search(trials);
    if (exp === 'stroop') return S.stroop(trials);
    if (exp === 'ior') return S.ior(trials);
    return {};
  }

  // 各实验要展示的核心指标定义（label + 取值函数 + 单位）
  function metricDefs(exp) {
    if (exp === 'search') return [
      { key: 'slopeFeature', label: '特征搜索斜率', unit: 'ms/项', get: s => s.slopeFeature, digits: 1 },
      { key: 'slopeConj', label: '联合搜索斜率', unit: 'ms/项', get: s => s.slopeConj, digits: 1 },
      { key: 'accFeature', label: '特征正确率', unit: '%', get: s => (s.accFeature != null ? s.accFeature * 100 : null), digits: 1 },
      { key: 'accConj', label: '联合正确率', unit: '%', get: s => (s.accConj != null ? s.accConj * 100 : null), digits: 1 }
    ];
    if (exp === 'stroop') return [
      { key: 'interference', label: '干扰效应(冲突−中性)', unit: 'ms', get: s => s.interference, digits: 0 },
      { key: 'facilitation', label: '促进效应(中性−一致)', unit: 'ms', get: s => s.facilitation, digits: 0 },
      { key: 'rtCongruent', label: '一致 RT', unit: 'ms', get: s => (s.condRT && s.condRT.congruent), digits: 0 },
      { key: 'rtIncongruent', label: '冲突 RT', unit: 'ms', get: s => (s.condRT && s.condRT.incongruent), digits: 0 }
    ];
    if (exp === 'ior') return [
      { key: 'cueingShort', label: '短间隔线索效应', unit: 'ms', get: s => s.cueingShort, digits: 0 },
      { key: 'iorEffect', label: '长间隔 IOR 效应', unit: 'ms', get: s => s.iorEffect, digits: 0 },
      { key: 'rtShortSame', label: '短·同侧 RT', unit: 'ms', get: s => (s.cells && s.cells.shortSame), digits: 0 },
      { key: 'rtLongSame', label: '长·同侧 RT', unit: 'ms', get: s => (s.cells && s.cells.longSame), digits: 0 }
    ];
    return [];
  }

  function fmt(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return v.toFixed(digits);
  }

  /* ============ 渲染：群体汇总 + 逐被试表格 + 分布图 ============ */
  function renderExperiment(exp, rows) {
    const defs = metricDefs(exp);
    const meta = window.CONFIG.experiments[exp];

    // 群体均值（每个指标收集所有被试的值）
    const agg = {};
    for (const d of defs) {
      agg[d.key] = S.aggregate(rows.map(r => d.get(r.stats)));
    }

    // 汇总卡片
    const summaryCards = defs.map(d => {
      const a = agg[d.key];
      return `<div class="stat-box">
        <div class="stat-val">${a.mean != null ? fmt(a.mean, d.digits) : '—'} ${d.unit}</div>
        <div class="stat-label">群体均值 · ${d.label}（n=${a.n}）</div>
        ${a.sd != null ? `<div class="admin-sd">SD = ${fmt(a.sd, d.digits)}</div>` : ''}
      </div>`;
    }).join('');

    // 分布图（每个指标一个直方图，展示各被试的取值分布 + 均值线）
    const charts = defs.map(d => {
      const vals = rows.map(r => d.get(r.stats)).filter(v => v != null && isFinite(v));
      return `<div class="admin-chart-block">
        <div class="admin-chart-title">${d.label} 分布（各被试）</div>
        ${vals.length >= 2 ? histogram(vals, agg[d.key].mean, d.digits) : '<div class="chart-empty">数据不足（需 ≥2 个被试）</div>'}
      </div>`;
    }).join('');

    // 逐被试表格
    const tableHead = `<tr><th>被试</th><th>完成时间</th><th>试次数</th>${defs.map(d => `<th>${d.label}</th>`).join('')}</tr>`;
    const tableRows = rows.map(r => {
      const cells = defs.map(d => `<td>${fmt(d.get(r.stats), d.digits)}</td>`).join('');
      return `<tr>
        <td><strong>${esc(r.participant)}</strong></td>
        <td>${esc((r.created_at || '').slice(0, 16))}</td>
        <td>${r.trials}</td>
        ${cells}
      </tr>`;
    }).join('');

    const html = `
      <div class="admin-summary">
        <h3>群体汇总 · ${meta.name}</h3>
        <p class="hint">共 <strong>${rows.length}</strong> 名被试。均值/标准差由所有被试的核心指标聚合而来。</p>
        <div class="stat-grid">${summaryCards}</div>
      </div>
      <div class="admin-charts">${charts}</div>
      <div class="admin-table-wrap">
        <h3>逐被试明细</h3>
        <table class="admin-table">
          <thead>${tableHead}</thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p class="hint" style="margin-top:8px">「—」表示该被试该指标无有效数据。</p>
      </div>
      <div class="admin-actions">
        <button class="btn" id="admin-export">导出汇总 CSV</button>
        <button class="btn" id="admin-export-raw">导出原始试次 CSV</button>
        <button class="btn ghost" id="admin-refresh">刷新数据</button>
      </div>
      <p class="hint" style="margin-top:8px">汇总表每名被试一行（核心指标）；原始试次表一行一试次，含全部字段，可直接导入 SPSS / R / Python。文件名形如 <code>admin_${exp}_summary_时间戳.csv</code> 或 <code>admin_${exp}_trials_时间戳.csv</code>。</p>`;

    // 事件绑定必须写在 return 之前 —— 原先放在 return 之后，那段是永远不会执行的死代码，
    // 导致「导出 / 刷新」按钮点了没反应。setTimeout(0) 等 innerHTML 落地后再查节点。
    setTimeout(() => {
      const expBtn = document.getElementById('admin-export');
      if (expBtn) expBtn.addEventListener('click', () => exportAdminCSV(exp, rows, defs));
      const rawBtn = document.getElementById('admin-export-raw');
      if (rawBtn) rawBtn.addEventListener('click', () => exportRawTrialsCSV(exp, rows));
      const refreshBtn = document.getElementById('admin-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', () => loadExperiment(exp));
    }, 0);

    return html;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // 简单直方图（原生 SVG，展示各被试某指标取值分布 + 均值线）
  function histogram(vals, mean, digits) {
    const W = 560, H = 180, padL = 40, padB = 26, padT = 12, padR = 12;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const range = (max - min) || 1;
    const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(vals.length))));
    const binW = range / binCount;
    const counts = new Array(binCount).fill(0);
    for (const v of vals) {
      let i = Math.floor((v - min) / binW);
      if (i >= binCount) i = binCount - 1;
      counts[i]++;
    }
    const maxC = Math.max.apply(null, counts) || 1;
    const bw = plotW / binCount;
    let bars = '';
    for (let i = 0; i < binCount; i++) {
      const h = counts[i] / maxC * plotH;
      const x = padL + i * bw;
      bars += `<rect x="${x + 1}" y="${padT + plotH - h}" width="${Math.max(1, bw - 2)}" height="${Math.max(0, h)}" rx="2" fill="#3b5bdb" opacity="0.8"></rect>`;
    }
    // 均值线
    const mx = padL + (mean - min) / range * plotW;
    const meanLine = (mean != null && isFinite(mean) && mean >= min && mean <= max)
      ? `<line x1="${mx}" y1="${padT}" x2="${mx}" y2="${padT + plotH}" stroke="#e8590c" stroke-width="2" stroke-dasharray="5 3"></line>
         <text x="${mx}" y="${padT - 2}" text-anchor="middle" font-size="10.5" fill="#e8590c">均值 ${fmt(mean, digits)}</text>`
      : '';
    const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#d3cfc7"></line>`;
    const minL = `<text x="${padL}" y="${H - 8}" font-size="10" fill="#9aa3af">${fmt(min, digits)}</text>`;
    const maxL = `<text x="${W - padR}" y="${H - 8}" font-size="10" fill="#9aa3af" text-anchor="end">${fmt(max, digits)}</text>`;
    return `<svg class="admin-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="指标分布直方图">${bars}${axis}${meanLine}${minL}${maxL}</svg>`;
  }

  /* ============ 导出 ============ */
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  // 兼容浏览器强缓存：若线上还是旧版 utils.js，退到本地等价实现
  function saveCSV(filename, lines) {
    if (U && typeof U.downloadCSV === 'function') return U.downloadCSV(filename, lines);
    try {
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (e) {} }, 2000);
      return true;
    } catch (e) { return false; }
  }

  function cell(v) {
    return (U && typeof U.csvCell === 'function') ? U.csvCell(v) : (v == null ? '' : String(v));
  }

  // 给按钮一个即时的成功/失败反馈，避免「点了但不知道有没有下载」
  function flash(btn, text) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
  }

  // 汇总 CSV：每名被试一行，列为核心指标（表头带单位，数值按展示精度四舍五入）
  function exportAdminCSV(exp, rows, defs) {
    const cols = ['被试', 'record_id', '完成时间', '试次数']
      .concat(defs.map(d => `${d.label}(${d.unit})`));
    const lines = [cols.map(cell).join(',')];
    for (const r of rows) {
      const vals = [r.participant, r.record_id, r.created_at, r.trials]
        .concat(defs.map(d => {
          const v = d.get(r.stats);
          return (v == null || !isFinite(v)) ? '' : Number(v.toFixed(d.digits));
        }));
      lines.push(vals.map(cell).join(','));
    }
    const ok = saveCSV(`admin_${exp}_summary_${stamp()}.csv`, lines);
    flash(document.getElementById('admin-export'), ok ? '已导出 ✓' : '导出失败');
    return ok;
  }

  // 原始试次 CSV（长格式）：一行一试次，字段取所有记录的并集，供后续统计分析
  function exportRawTrialsCSV(exp, rows) {
    const keys = [], seen = new Set();
    for (const r of rows) {
      for (const t of (r.raw || [])) {
        for (const k of Object.keys(t)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
      }
    }
    const cols = ['experiment', 'participant', 'record_id', 'created_at', 'trial_index'].concat(keys);
    const lines = [cols.map(cell).join(',')];
    for (const r of rows) {
      (r.raw || []).forEach((t, i) => {
        const vals = [exp, r.participant, r.record_id, r.created_at, i + 1]
          .concat(keys.map(k => t[k]));
        lines.push(vals.map(cell).join(','));
      });
    }
    const ok = saveCSV(`admin_${exp}_trials_${stamp()}.csv`, lines);
    flash(document.getElementById('admin-export-raw'), ok ? '已导出 ✓' : '导出失败');
    return ok;
  }

  // 末尾两个下划线方法供控制台手动导出 / 自检用（正常操作走面板按钮）
  return { mountEntry, isUnlocked, _genHash, _hash, _exportSummary: exportAdminCSV, _exportRaw: exportRawTrialsCSV };
})();
