/* =========================================================
   结果呈现 —— 结合文献解释被试能看懂的效应
   每个实验返回 { summary: html, stats: {...}, effect: {...} }
   ---------------------------------------------------------
   可视化（全部零依赖，原生 SVG）：
   1. 反应时条形图（对比条件中位数）
   2. 反应时分布直方图（逐试次分布）
   3. 逐试次序列图（练习效应 / 疲劳效应）
   4. 与原始文献数据的对比图（被试 vs 文献）
   ========================================================= */
window.Results = (function () {
  const U = window.Utils;

  /* ================= 通用图表构建器（原生 SVG） ================= */

  function statBox(val, label, cls) {
    return `<div class="stat-box ${cls || ''}"><div class="stat-val">${val}</div><div class="stat-label">${label}</div></div>`;
  }

  function barRow(label, pct, color) {
    return `<div class="bar-row">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></div></div>
      <span style="font-variant-numeric:tabular-nums">${pct.toFixed(1)}%</span>
    </div>`;
  }

  // 反应时分布直方图：输入数值数组，输出 SVG
  function rtHistogram(values, color, binCount) {
    if (!values || values.length < 2) return '<div class="chart-empty">该条件有效试次不足，无法绘制分布图。</div>';
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    if (max === min) {
      return `<svg class="rt-hist" viewBox="0 0 560 160" role="img"><text x="280" y="80" text-anchor="middle" font-size="13" fill="#9aa3af">反应时高度集中（${Math.round(max)} ms）</text></svg>`;
    }
    binCount = binCount || 12;
    const binW = (max - min) / binCount;
    const counts = new Array(binCount).fill(0);
    for (const v of values) {
      let i = Math.floor((v - min) / binW);
      if (i >= binCount) i = binCount - 1;
      counts[i]++;
    }
    const W = 560, H = 160, padL = 34, padB = 24, padT = 10, padR = 10;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxC = Math.max.apply(null, counts);
    const bw = plotW / binCount;
    let bars = '';
    for (let i = 0; i < binCount; i++) {
      const h = counts[i] / maxC * plotH;
      const x = padL + i * bw;
      const y = padT + plotH - h;
      bars += `<rect x="${x + 1}" y="${y}" width="${Math.max(1, bw - 2)}" height="${Math.max(0, h)}" rx="2" fill="${color}" opacity="0.82"></rect>`;
    }
    // 中位数线
    const med = median(values);
    const mx = padL + (med - min) / (max - min) * plotW;
    const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#d3cfc7" stroke-width="1"></line>`;
    const medLine = `<line x1="${mx}" y1="${padT}" x2="${mx}" y2="${padT + plotH}" stroke="#1f2937" stroke-width="1.5" stroke-dasharray="4 3"></line>
      <text x="${mx}" y="${padT - 2}" text-anchor="middle" font-size="10.5" fill="#4b5563">中位 ${Math.round(med)} ms</text>`;
    const minLbl = `<text x="${padL}" y="${H - 6}" font-size="10" fill="#9aa3af">${Math.round(min)}</text>`;
    const maxLbl = `<text x="${W - padR}" y="${H - 6}" font-size="10" fill="#9aa3af" text-anchor="end">${Math.round(max)} ms</text>`;
    return `<svg class="rt-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="反应时分布直方图">${bars}${axis}${medLine}${minLbl}${maxLbl}</svg>`;
  }

  // 逐试次序列图：输入数值数组，输出 SVG（折线 + 趋势）
  function rtSeries(values, color) {
    if (!values || values.length < 2) return '<div class="chart-empty">有效试次不足，无法绘制序列图。</div>';
    const W = 560, H = 150, padL = 34, padB = 24, padT = 12, padR = 12;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    const range = max - min || 1;
    const n = values.length;
    const px = i => padL + (n <= 1 ? plotW / 2 : i / (n - 1) * plotW);
    const py = v => padT + plotH - (v - min) / range * plotH;
    let pts = '';
    for (let i = 0; i < n; i++) pts += `${px(i).toFixed(1)},${py(values[i]).toFixed(1)} `;
    // 线性趋势线
    const meanX = (n - 1) / 2, meanY = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - meanX) * (values[i] - meanY); den += (i - meanX) * (i - meanX); }
    const slope = den ? num / den : 0;
    const y0 = meanY - slope * meanX, y1 = meanY + slope * meanX;
    const trend = `<line x1="${padL}" y1="${py(y0)}" x2="${W - padR}" y2="${py(y1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"></line>`;
    const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#d3cfc7"></line>`;
    return `<svg class="rt-series" viewBox="0 0 ${W} ${H}" role="img" aria-label="反应时序列图"><polyline points="${pts.trim()}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"></polyline>${trend}${axis}<text x="${padL}" y="${H - 6}" font-size="10" fill="#9aa3af">第 1 题</text><text x="${W - padR}" y="${H - 6}" font-size="10" fill="#9aa3af" text-anchor="end">第 ${n} 题</text></svg>`;
  }

  // 与被试对照的对比条形图（双组：你 vs 文献均值）
  function compareBar(items, myColor, refColor) {
    // items: [{ label, mine, ref }]
    const W = 560, H = 40 + items.length * 46;
    let rows = '';
    const maxV = Math.max.apply(null, items.map(i => Math.max(i.mine, i.ref, 1)));
    items.forEach((it, idx) => {
      const y = 30 + idx * 46;
      const myW = it.mine / maxV * 400;
      const refW = it.ref / maxV * 400;
      rows += `<text x="0" y="${y + 6}" font-size="12" fill="#4b5563">${it.label}</text>`;
      rows += `<rect x="120" y="${y - 10}" width="${Math.max(2, myW)}" height="16" rx="3" fill="${myColor}"></rect>`;
      rows += `<text x="${126 + myW}" y="${y + 4}" font-size="10.5" fill="#1f2937">${fmt(it.mine)}</text>`;
      rows += `<rect x="120" y="${y + 12}" width="${Math.max(2, refW)}" height="16" rx="3" fill="${refColor}" opacity="0.6"></rect>`;
      rows += `<text x="${126 + refW}" y="${y + 26}" font-size="10.5" fill="#9aa3af">${fmt(it.ref)}</text>`;
    });
    const legendY = H - 6;
    return `<svg class="compare-bar" viewBox="0 0 ${W} ${H}" role="img" aria-label="与文献对比图">
      ${rows}
      <rect x="120" y="${legendY - 12}" width="10" height="10" rx="2" fill="${myColor}"></rect><text x="134" y="${legendY - 3}" font-size="10.5" fill="#4b5563">你的数据</text>
      <rect x="204" y="${legendY - 12}" width="10" height="10" rx="2" fill="${refColor}" opacity="0.6"></rect><text x="218" y="${legendY - 3}" font-size="10.5" fill="#9aa3af">文献报告值</text>
    </svg>`;
  }

  function fmt(v) {
    if (!Number.isFinite(v)) return '—';
    return v >= 100 ? Math.round(v).toString() : v.toFixed(0);
  }

  // 「本实验室的改进」醒目板块
  // items: [{ tag: '标签', text: '改进内容<strong>...</strong>' }]
  function labImprove(items) {
    const body = items.map(it =>
      `<div class="lab-improve-item">${it.tag ? `<span class="tag">${it.tag}</span>` : ''}${it.text}</div>`
    ).join('');
    return `<div class="lab-improve">
      <div class="lab-improve-title"><span class="badge">本实验室的改进</span>相对经典范式，我们改了什么</div>
      ${body}
    </div>`;
  }

  /* ============ 实验 1 · 视觉搜索 ============ */
  // params: { featBySize, conjBySize, angleRT, accFeature, accConj, slopeFeature, slopeConj, trials }
  //   featBySize / conjBySize: { 4: rt, 8: rt, 12: rt, 16: rt } 各 set size 的正确 RT 中位数
  //   angleRT: { 0: rt, 45: rt, ... } 联合搜索下「有目标」试次按旋转角度的 RT 中位数
  // 设计：特征搜索（颜色 pop-out）vs 联合搜索（颜色+朝向组合）+ 目标旋转角度（心理旋转）
  function search(params) {
    const { featBySize, conjBySize, angleRT, accFeature, accConj, slopeFeature, slopeConj, trials } = params;

    // 正确率显示
    const accF = (accFeature * 100).toFixed(1);
    const accC = (accConj * 100).toFixed(1);

    // 搜索斜率 → 判断搜索效率
    const slopeFeatLabel = slopeFeature < 10 ? '高效（平行/pop-out）' : slopeFeature < 25 ? '中等效率' : '低效（串行）';
    const slopeConjLabel = slopeConj < 10 ? '高效（平行/pop-out）' : slopeConj < 25 ? '中等效率' : '低效（串行）';

    // 旋转角度 → RT（心理旋转曲线）SVG
    let rotationChart = '';
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    const validAngles = angles.filter(a => angleRT[a] != null);
    if (validAngles.length >= 3) {
      const W = 560, H = 220, padL = 44, padB = 30, padT = 16, padR = 16;
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const vals = validAngles.map(a => angleRT[a]);
      const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      const range = (max - min) || 1;
      const px = a => padL + (a / 315) * plotW;
      const py = rt => padT + plotH - (rt - min) / range * plotH;
      let pts = '';
      angles.forEach(a => { if (angleRT[a] != null) pts += `${px(a).toFixed(1)},${py(angleRT[a]).toFixed(1)} `; });
      // 轴
      let grid = '';
      [0, 45, 90, 135, 180, 225, 270, 315].forEach(a => {
        grid += `<text x="${px(a)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9aa3af">${a}°</text>`;
      });
      const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#d3cfc7"></line>`;
      rotationChart = `<svg class="rt-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="心理旋转曲线">
        ${grid}${axis}
        <polyline points="${pts.trim()}" fill="none" stroke="#e8590c" stroke-width="2.5" stroke-linejoin="round"></polyline>
        ${angles.filter(a => angleRT[a] != null).map(a => `<circle cx="${px(a)}" cy="${py(angleRT[a])}" r="4" fill="#e8590c"></circle>`).join('')}
        <text x="${padL}" y="${padT - 2}" font-size="11" fill="#4b5563">反应时 (ms) 随旋转角度变化 · 联合搜索</text>
      </svg>`;
    } else {
      rotationChart = '<div class="chart-empty">联合搜索的有效试次不足，无法绘制旋转角度曲线。</div>';
    }

    // 搜索斜率对比（特征 vs 联合，随 set size 的 RT 折线）
    let slopeChart = '';
    const sizes = [4, 8, 12, 16];
    const hasFeat = sizes.some(sz => featBySize[sz] != null);
    const hasConj = sizes.some(sz => conjBySize[sz] != null);
    if (hasFeat || hasConj) {
      const allVals = [];
      sizes.forEach(sz => { if (featBySize[sz] != null) allVals.push(featBySize[sz]); if (conjBySize[sz] != null) allVals.push(conjBySize[sz]); });
      const W = 560, H = 220, padL = 50, padB = 30, padT = 16, padR = 16;
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const min = Math.min.apply(null, allVals) * 0.9, max = Math.max.apply(null, allVals) * 1.05;
      const range = (max - min) || 1;
      const px = sz => padL + (sz - 4) / (16 - 4) * plotW;
      const py = rt => padT + plotH - (rt - min) / range * plotH;
      const line = (map, color, label) => {
        let pts = '';
        sizes.forEach(sz => { if (map[sz] != null) pts += `${px(sz).toFixed(1)},${py(map[sz]).toFixed(1)} `; });
        return `<polyline points="${pts.trim()}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"></polyline>` +
          sizes.filter(sz => map[sz] != null).map(sz => `<circle cx="${px(sz)}" cy="${py(map[sz])}" r="4" fill="${color}"></circle>`).join('');
      };
      let grid = '';
      sizes.forEach(sz => { grid += `<text x="${px(sz)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9aa3af">${sz}</text>`; });
      const axis = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#d3cfc7"></line>`;
      const legend = `<rect x="${W - 150}" y="${padT}" width="10" height="10" rx="2" fill="#1971c2"></rect><text x="${W - 136}" y="${padT + 9}" font-size="10.5" fill="#4b5563">特征搜索</text>` +
        `<rect x="${W - 80}" y="${padT}" width="10" height="10" rx="2" fill="#e03131"></rect><text x="${W - 66}" y="${padT + 9}" font-size="10.5" fill="#4b5563">联合搜索</text>`;
      slopeChart = `<svg class="rt-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="搜索斜率图">
        ${grid}${axis}${legend}
        ${line(featBySize, '#1971c2', '特征')}
        ${line(conjBySize, '#e03131', '联合')}
        <text x="${padL}" y="${padT - 2}" font-size="11" fill="#4b5563">反应时 (ms) 随项目数(set size)变化 · 斜率=搜索效率</text>
      </svg>`;
    }

    return `
      <div class="result-section">
        <h3>你的表现</h3>
        <div class="stat-grid">
          ${statBox(accF + '%', '特征搜索正确率', accFeature > 0.9 ? 'good' : '')}
          ${statBox(accC + '%', '联合搜索正确率', accConj > 0.9 ? 'good' : '')}
          ${statBox((slopeFeature >= 0 ? '+' : '') + slopeFeature.toFixed(1) + ' ms/项', '特征搜索斜率', slopeFeature < 10 ? 'good' : '')}
          ${statBox((slopeConj >= 0 ? '+' : '') + slopeConj.toFixed(1) + ' ms/项', '联合搜索斜率', slopeConj >= 25 ? 'bad' : '')}
        </div>
        <p class="panel-body">搜索斜率（反应时随项目数增加的速率）是视觉搜索的<strong>核心指标</strong>：斜率≈0 意味着目标「一眼跳出」（平行搜索），斜率越陡说明越需要<strong>逐个检查</strong>（串行搜索）。</p>
      </div>

      <div class="result-section">
        <h3>搜索斜率：特征 vs 联合</h3>
        <p class="panel-body">下图并排画出<strong>特征搜索</strong>与<strong>联合搜索</strong>的反应时如何随项目数变化。经典发现是：特征搜索的斜率接近 0（目标「跳出来」），联合搜索的斜率明显更陡（需要逐个检查）：</p>
        ${slopeChart || '<div class="chart-empty">有效试次不足。</div>'}
        <p class="panel-body" style="margin-top:10px">你的<strong>特征搜索斜率 ${slopeFeature.toFixed(1)} ms/项</strong>（${slopeFeatLabel}），<strong>联合搜索斜率 ${slopeConj.toFixed(1)} ms/项</strong>（${slopeConjLabel}）。${slopeConj > slopeFeature + 5
          ? '联合搜索斜率明显更陡，符合特征整合理论的预测：组合两个特征（颜色+朝向）需要把注意逐个投向每个项目。'
          : '两者斜率接近，可能与试次较少或目标/干扰相似度设定有关，跨被试聚合后才能稳定判断。'}</p>
      </div>

      <div class="result-section">
        <h3>★ 旋转角度如何影响搜索（心理旋转）</h3>
        <p class="panel-body">这是我们实验室的<strong>改进变量</strong>：目标字母「T」在部分试次中<strong>旋转了任意角度</strong>（0°–360°）。下图是联合搜索下，反应时随目标旋转角度的变化。经典的心理旋转（Shepard &amp; Metzler, 1971）发现：旋转角度越大，辨认越慢，<strong>180° 最慢</strong>——因为你需要把字母在心里「转回」正立才能确认它是 T：</p>
        ${rotationChart}
        <p class="panel-body" style="margin-top:10px">${(angleRT[0] != null && angleRT[180] != null && angleRT[180] > angleRT[0])
          ? '你的数据显示出典型的<strong>心理旋转效应</strong>：180° 的辨认明显慢于 0°，说明你确实在心里旋转字母来识别它。'
          : '你的数据暂时未显示出明显的角度效应（可能是有效试次不足或个体差异），跨被试聚合后趋势会更清晰。'}</p>
      </div>

      <div class="result-section">
        <h3>与经典研究对比</h3>
        <p class="panel-body">Treisman &amp; Gelade（1980）报告：<strong>特征搜索</strong>斜率接近 0（约 0–10 ms/项），而<strong>联合搜索</strong>斜率约 <strong>20–40 ms/项</strong>。你的数据与之对比：</p>
        ${compareBar([
          { label: '特征搜索斜率', mine: Math.max(0, slopeFeature), ref: 5 },
          { label: '联合搜索斜率', mine: Math.max(0, slopeConj), ref: 30 }
        ], '#1971c2', '#868e96')}
      </div>

      <div class="result-section">
        <h3>这个实验在问什么</h3>
        <div class="callout">
          当你在一堆东西里找目标时，有时一眼就能「跳出来」（比如在一堆绿球里找唯一的红球），有时却要<strong>逐个看过去</strong>（比如在红绿混合、横竖混合的字母里找一个特定组合）。前者叫<strong>特征搜索</strong>，后者叫<strong>联合搜索</strong>。这一区别是 Treisman 与 Gelade（1980）<strong>特征整合理论</strong>的核心：单一特征（颜色、朝向）能被平行、前注意地加工，而把多个特征「绑」成一个物体则需要注意力逐个串行处理。
        </div>
        <p class="panel-body">本实验进一步加入<strong>旋转角度</strong>：目标字母被旋转到不同朝向时，你需要在心里把它「转回正立」才能确认（<strong>心理旋转</strong>，Shepard &amp; Metzler, 1971）。因此我们检验：旋转角度是否进一步拉大了联合搜索的难度——即「搜索」与「旋转」两个认知过程叠加时的代价。</p>
        <div class="ref-list">
          参考文献：Treisman &amp; Gelade (1980) <a href="https://doi.org/10.1016/0010-0285(80)90005-5" target="_blank">doi:10.1016/0010-0285(80)90005-5</a> · Wolfe (1998) <a href="https://search.bwh.harvard.edu/new/pubs/StevensHndbk_VisualSearch_Wolfe_2018.pdf" target="_blank">Visual Search</a> · Shepard &amp; Metzler (1971) <a href="https://doi.org/10.1126/science.171.3972.701" target="_blank">doi:10.1126/science.171.3972.701</a>
        </div>
      </div>

      <div class="result-section">
        <h3>我们的改进</h3>
        ${labImprove([
          { tag: '旋转角度变量', text: '经典视觉搜索多用「正立字母」。我们给目标字母加入<strong>0°–360° 的旋转角度</strong>（8 档），把<strong>心理旋转</strong>（Shepard &amp; Metzler, 1971）与<strong>视觉搜索</strong>（Treisman, 1980）两个经典范式结合，检验旋转如何调节搜索效率。' },
          { tag: '特征+联合对照', text: '同时做<strong>特征搜索</strong>（颜色 pop-out）与<strong>联合搜索</strong>（颜色+朝向组合），能画出「搜索斜率」并与 Treisman 的经典结果直接对比，让改进点（旋转角度）的效应更有说服力。' },
          { tag: '多档项目数', text: '项目数取<strong>4 / 8 / 12 / 16 四档</strong>，足以拟合「反应时 × 项目数」的斜率，而非只用两个点。' },
          { tag: '连续角度采样', text: '旋转角度覆盖<strong>整圈 0–315°</strong>（8 档），能画出完整的心理旋转函数（RT 随角度单调上升，180° 最慢），而非只测「正立 vs 倒立」。' }
        ])}
      </div>

      <div class="result-section">
        <h3>本实验的局限与改进</h3>
        <ul class="improve-list">
          <li><strong>样本量</strong>：单个被试的每个 (类型 × 角度 × 项目数) 组合试次较少（正式 96 次），跨被试聚合后才能稳定估计斜率与旋转曲线。</li>
          <li><strong>目标/干扰相似度</strong>：目前联合搜索用「红横 T vs 绿竖 T」，目标与干扰的相似度未做正式标定，可能影响搜索效率；可参考 Duncan &amp; Humphreys (1989) 系统地操纵相似度。</li>
          <li><strong>旋转角度的混淆</strong>：目标旋转角度改变了字母的「特征朝向」，可能同时改变了它与干扰的相似度，不纯粹是心理旋转成本。可在分析中把「角度」与「相似度」分开建模。</li>
          <li><strong>反应上限</strong>：3 秒超时可能偏紧，联合搜索 + 大角度时可能误判；可放宽到 4–5 秒或按 set size 动态调整。</li>
          <li><strong>特征搜索的选取</strong>：颜色 pop-out 是最强的特征搜索，斜率几乎必为 0；可加入「朝向 pop-out」等较弱特征，使特征/联合的对比更具区分度。</li>
          <li><strong>眼动与注视</strong>：未约束注视位置，被试可能用眼动而非内隐注意来搜索；高精度版可加眼动监测，区分「注意串行」与「眼动串行」。</li>
        </ul>
      </div>`;
  }

  /* ============ 实验 2 · Stroop ============ */
  // params: { condRT:{congruent,neutral,incongruent}, condErr:{...}, trials:[...] }
  function stroop(params) {
    const { condRT, condErr, trials } = params;
    const f = v => Number.isFinite(v) ? v : 0;
    const c = f(condRT.congruent), n = f(condRT.neutral), ic = f(condRT.incongruent);
    const interference = ic - n;   // 冲突 - 中性 = 干扰
    const facilitation = n - c;    // 中性 - 一致 = 促进
    const maxRT = Math.max(c, n, ic, 1);

    // 逐条件反应时数组（供直方图/序列图）
    const rtByCond = { congruent: [], neutral: [], incongruent: [] };
    if (trials && trials.length) {
      for (const t of trials) {
        if (t.correct) rtByCond[t.cond].push(t.rt);
      }
    }

    // 文献基准：Stroop (1935) 及 MacLeod (1991) 综述中典型干扰量约 100ms
    const litInterference = 100;

    return `
      <div class="result-section">
        <h3>你的正确反应时（中位数）</h3>
        <div class="stat-grid">
          ${statBox(c.toFixed(0) + ' ms', '一致条件', 'good')}
          ${statBox(n.toFixed(0) + ' ms', '中性条件', '')}
          ${statBox(ic.toFixed(0) + ' ms', '冲突条件', 'bad')}
        </div>
        <div class="bar-chart">
          ${barRow('一致', c / maxRT * 100, '#0ca678')}
          ${barRow('中性', n / maxRT * 100, '#868e96')}
          ${barRow('冲突', ic / maxRT * 100, '#e03131')}
        </div>
        <div class="stat-grid">
          ${statBox((interference > 0 ? '+' : '') + interference.toFixed(0) + ' ms', '干扰（冲突−中性）', interference > 0 ? 'bad' : 'good')}
          ${statBox((facilitation > 0 ? '+' : '') + facilitation.toFixed(0) + ' ms', '促进（中性−一致）', 'accent')}
        </div>
        <div class="stat-grid mt-8">
          ${statBox((condErr.incongruent * 100).toFixed(1) + '%', '冲突错误率', condErr.incongruent > 0 ? 'bad' : 'good')}
          ${statBox((condErr.congruent * 100).toFixed(1) + '%', '一致错误率', '')}
          ${statBox((condErr.neutral * 100).toFixed(1) + '%', '中性错误率', '')}
        </div>
      </div>

      <div class="result-section">
        <h3>反应时分布（冲突条件）</h3>
        <p class="panel-body">下面是你在<strong>冲突条件</strong>下每一次正确反应的反应时分布，中位数用虚线标出：</p>
        ${rtHistogram(rtByCond.incongruent, '#e03131', 12)}
      </div>

      <div class="result-section">
        <h3>逐题反应时（冲突条件）</h3>
        <p class="panel-body">横轴是题号、纵轴是反应时。虚线趋势若逐渐下降，说明存在<strong>练习效应</strong>；若上升，可能是疲劳：</p>
        ${rtSeries(rtByCond.incongruent, '#e03131')}
      </div>

      <div class="result-section">
        <h3>与经典研究对比</h3>
        <p class="panel-body">Stroop（1935）及后续综述（MacLeod, 1991）报告的典型<strong>干扰效应</strong>约为 100 ms（冲突 − 中性）。你的干扰量与之对比：</p>
        ${compareBar([
          { label: '干扰效应(ms)', mine: Math.abs(interference), ref: litInterference }
        ], '#e03131', '#868e96')}
        <p class="panel-body" style="margin-top:10px">${interference > 20
          ? '你表现出明显的<strong>Stroop 干扰</strong>：字义被自动激活并与颜色判断竞争，拖慢了反应——这与经典发现一致。'
          : interference > 0
            ? '你表现出轻微的 Stroop 干扰，方向与经典发现一致，但幅度较小（可能与练习充分或个体抑制能力强有关）。'
            : '你的干扰量为负或接近零，比较少见——可能是随机波动、练习效应，或你采用了某种策略抑制了字义的自动激活。'}</p>
      </div>

      <div class="result-section">
        <h3>这个实验在问什么</h3>
        <div class="callout">
          1935 年，Stroop 发现：当<strong>字的颜色</strong>与<strong>字的意义</strong>冲突时（如用蓝色写「红」），报告颜色会明显变慢。因为阅读文字是高度自动化的过程，字义会不由自主地被激活，并与颜色所指的答案互相竞争，拖慢你的反应。
        </div>
        <p class="panel-body">本实验加入<strong>中性字</strong>（如「书」）作基准，就能把两种效应分开：用<strong>「冲突 − 中性」</strong>衡量字义冲突带来的<strong>干扰</strong>，用<strong>「中性 − 一致」</strong>衡量字义一致带来的<strong>促进</strong>。通常干扰远大于促进。</p>
        <div class="ref-list">
          参考文献：Stroop (1935) <a href="https://doi.org/10.1037/h0054651" target="_blank">doi:10.1037/h0054651</a> · MacLeod (1991) <a href="https://doi.org/10.1037/0033-2909.109.2.163" target="_blank">doi:10.1037/0033-2909.109.2.163</a>
        </div>
      </div>

      <div class="result-section">
        <h3>我们的改进</h3>
        ${labImprove([
          { tag: '中性条件', text: '经典 Stroop 实验只比较「冲突 − 一致」，会把<strong>干扰</strong>和<strong>促进</strong>两种效应混在一起。我们加入<strong>中性字</strong>（书/笔/纸）作共同基准，可分别估计「冲突带来的减慢」与「一致带来的加快」。' },
          { tag: '中性汉字基准', text: '依据 Brown (2011) 与 Augustinova 等 (2019)，基准材料选<strong>可读的中性汉字</strong>而非符号，使三个条件都含可读文字，差值更具可比性。' },
          { tag: '按键作答', text: '采用<strong>按键</strong>（F/G/H）而非口头报告，反应时从字出现精确计时（performance.now），并单独记录超时与错误率，数据更干净。' }
        ])}
      </div>

      <div class="result-section">
        <h3>本实验的局限与改进</h3>
        <ul class="improve-list">
          <li><strong>异常值处理</strong>：目前直接取中位数，未剔除超长/超短的反应时。可增加「排除 &lt;200ms 或 &gt;均值±3SD」的清洗步骤，减少误触与走神的影响。</li>
          <li><strong>按键与颜色的对应</strong>：红=食指 F、绿=中指 G、蓝=无名指 H，不同手指的固有反应速度不同，可能混淆条件效应。可对颜色做「被试间按键平衡」（拉丁方），或在分析中把按键因素纳入协变量。</li>
          <li><strong>刺激呈现时间</strong>：目前色字呈现无固定上限（靠 2 秒超时），可考虑固定呈现时间（如 1500 ms）以控制注视时长。</li>
          <li><strong>顺序效应</strong>：三种条件完全随机混合，可能产生「冲突→一致」的序列适应效应（conflict adaptation）。可记录前一题条件，分析 Gratton 效应。</li>
          <li><strong>字体与字义干扰的标准化</strong>：色名汉字（红/绿/蓝）笔画数不同，视觉复杂度略有差异，可用等笔画或英文字词（RED/GREEN/BLUE）做跨语言对照。</li>
        </ul>
      </div>`;
  }

  /* ============ 实验 3 · 返回抑制 ============ */
  // params: { cells:{shortSame,shortDiff,longSame,longDiff}, trials:[...] }
  function ior(params) {
    const { cells, trials } = params;
    const f = v => Number.isFinite(v) ? v : 0;
    const ss = f(cells.shortSame), sd = f(cells.shortDiff);
    const ls = f(cells.longSame), ld = f(cells.longDiff);
    const cueingShort = ss - sd;  // 短间隔：同侧-异侧
    const iorEffect = ls - ld;    // 长间隔：同侧-异侧（预期为正 = IOR）
    const maxRT = Math.max(ss, sd, ls, ld, 1);

    // 逐条件反应时数组
    const rtByCell = { shortSame: [], shortDiff: [], longSame: [], longDiff: [] };
    if (trials && trials.length) {
      for (const t of trials) {
        if (t.has_target === 1 && t.correct === 1) {
          const key = (t.soi === 100 ? 'short' : 'long') + (t.side === 'same' ? 'Same' : 'Diff');
          if (rtByCell[key]) rtByCell[key].push(t.rt);
        }
      }
    }

    // 文献基准：Posner & Cohen (1984) IOR 效应约 30-50ms（长间隔同侧更慢）
    const litIOR = 40;

    return `
      <div class="result-section">
        <h3>你的正确反应时（中位数）</h3>
        <div class="bar-chart">
          ${barRow('短间隔·同侧', ss / maxRT * 100, '#3b5bdb')}
          ${barRow('短间隔·异侧', sd / maxRT * 100, '#74c0fc')}
          ${barRow('长间隔·同侧', ls / maxRT * 100, '#e8590c')}
          ${barRow('长间隔·异侧', ld / maxRT * 100, '#ffa94d')}
        </div>
        <div class="stat-grid">
          ${statBox((cueingShort > 0 ? '+' : '') + cueingShort.toFixed(0) + ' ms', '短间隔线索效应（同侧−异侧）', 'accent')}
          ${statBox((iorEffect > 0 ? '+' : '') + iorEffect.toFixed(0) + ' ms', '长间隔 IOR（同侧−异侧）', iorEffect > 0 ? 'good' : 'bad')}
        </div>
      </div>

      <div class="result-section">
        <h3>关键对比：短间隔 vs 长间隔</h3>
        <p class="panel-body">下图并排比较<strong>同侧（线索指向的位置）</strong>与<strong>异侧</strong>在两种间隔下的反应时。注意观察「同侧 − 异侧」的符号如何随间隔变化：</p>
        ${compareBar([
          { label: '短间隔·同侧', mine: ss, ref: sd },
          { label: '短间隔·异侧', mine: sd, ref: sd }
        ], '#3b5bdb', '#74c0fc')}
        <div class="bar-chart" style="margin-top:14px">
          ${barRow('短间隔 线索效应', ((cueingShort + 100) / 200) * 100, '#3b5bdb')}
          ${barRow('长间隔 IOR 效应', ((iorEffect + 100) / 200) * 100, '#e8590c')}
        </div>
        <p class="panel-body" style="margin-top:10px">${iorEffect > 0
          ? '你表现出典型的<strong>返回抑制</strong>：长间隔下同侧反而比异侧慢，注意被引导去探索新位置。'
          : '你的长间隔 IOR 效应为负或接近零，未观察到典型的返回抑制——可能是试次较少、随机波动，或你的注意返回较快。'}</p>
      </div>

      <div class="result-section">
        <h3>反应时分布（长间隔·同侧）</h3>
        <p class="panel-body">长间隔同侧是 IOR 最关键的细胞，下面是它的反应时分布：</p>
        ${rtHistogram(rtByCell.longSame, '#e8590c', 10)}
      </div>

      <div class="result-section">
        <h3>与经典研究对比</h3>
        <p class="panel-body">Posner &amp; Cohen（1984）报告的长间隔 IOR 效应约为 <strong>30–50 ms</strong>。你的 IOR 效应与之对比：</p>
        ${compareBar([
          { label: 'IOR 效应(ms)', mine: Math.max(0, iorEffect), ref: litIOR }
        ], '#e8590c', '#868e96')}
      </div>

      <div class="result-section">
        <h3>这个实验在问什么</h3>
        <div class="callout">
          Posner 与 Cohen（1984）发现：一个位置刚被「闪亮」提示后，注意会被短暂吸引过去——如果目标很快出现，<strong>同侧</strong>反而更快被察觉；但等待更久（约 300 毫秒以上）后，<strong>同侧反而变慢</strong>。这个「迟到反而变慢」的现象叫<strong>返回抑制</strong>（inhibition of return, IOR），它帮助我们把注意转向新位置、避免死盯一个点。
        </div>
        <p class="panel-body">本实验用<strong>短等待（100 ms）</strong>和<strong>长等待（700 ms）</strong>两档比较：预期短间隔下同侧更快（线索效应），长间隔下同侧更慢（IOR 出现），即「同侧 − 异侧」的差值在长间隔由负转正。</p>
        <div class="ref-list">
          参考文献：Posner &amp; Cohen (1984) <a href="https://www.researchgate.net/publication/313727338_Components_of_visual_orienting" target="_blank">Components of visual orienting</a> · Posner et al. (1985) <a href="https://doi.org/10.1080/02643298508252866" target="_blank">doi:10.1080/02643298508252866</a> · Klein (2000) <a href="https://doi.org/10.1016/S1364-6613(00)01452-2" target="_blank">doi:10.1016/S1364-6613(00)01452-2</a>
        </div>
      </div>

      <div class="result-section">
        <h3>我们的改进</h3>
        ${labImprove([
          { tag: '双时间间隔', text: '经典研究常在单一时间点观察线索效应；我们同时设置<strong>短（100 ms）与长（700 ms）两档</strong>，用同一任务直接比较「刚闪过更快」如何随等待转为「反而更慢」，捕捉 IOR 的完整转折。' },
          { tag: '线索不可预测', text: '有圆点的题中<strong>同侧与异侧各占一半</strong>，闪框无法预测圆点位置，排除了「主动把注意移向/移离线索」的策略污染。' },
          { tag: 'catch 抢按检测', text: '额外混入 <strong>16 个无圆点题</strong>，用于识别「一见闪框就按键」的投机行为，把误报率过高的数据标记为无效。' },
          { tag: '统一按键', text: '圆点在哪边都按<strong>同一个空格键</strong>，避免左右手反应速度差异混入位置效应。' }
        ])}
      </div>

      <div class="result-section">
        <h3>本实验的局限与改进</h3>
        <ul class="improve-list">
          <li><strong>间隔档位覆盖</strong>：目前只有 100ms 与 700ms 两档，无法画出「线索效应→IOR」随间隔连续变化的曲线。可增加 200 / 300 / 500 ms 等中间档，绘制 SOA 函数。</li>
          <li><strong>catch 试次的抢按判定</strong>：无圆点题用于检测「见框就按」的投机行为，目前只记录了误报，可在分析中把误报率过高的被试标记为无效数据。</li>
          <li><strong>返回视线与手眼</strong>：IOR 涉及眼动（saccade）与手动反应的双重通道，本实验要求注视中央、用单手按键，可在高精度版中加入眼动监测，区分「眼动 IOR」与「手动 IOR」。</li>
          <li><strong>圆点可见度与反应上限</strong>：1 秒反应上限可能偏紧，可适当放宽到 1.5 秒，减少超时误判；同时圆点尺寸可标准化到视角度数。</li>
          <li><strong>线索的注意捕获</strong>：闪框（50ms）是否真正捕获了注意，可用「无效线索 vs 有效线索」的比例（如 1:3）进一步标定。</li>
        </ul>
      </div>`;
  }

  function median(arr) {
    if (!arr.length) return NaN;
    const a = arr.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* ============ 群体对比：当前被试 vs 全体均值 ============
     在结果页末尾追加「你 vs 全体被试」板块。
     myTrials：当前被试本次实验 raw trials（用于计算我的指标）。
     异步拉取全体数据 → 用统一统计层算群体均值 → 与我的指标对比。 */
  function groupComparison(exp, myTrials) {
    const id = 'group-compare-' + Math.random().toString(36).slice(2, 8);
    // 占位容器（结果 HTML 里先占位，异步填充）
    const holder = `<div class="result-section" id="${id}">
      <h3>你 vs 全体被试</h3>
      <p class="panel-body hint">正在拉取全体被试数据计算均值…</p>
    </div>`;

    // 异步拉取 + 填充
    setTimeout(async () => {
      const el = document.getElementById(id);
      if (!el) return;

      // 我的指标（用统一统计层，与管理员面板口径一致）
      const my = computeMyStats(exp, myTrials);
      let records;
      try {
        records = await window.Utils.loadAll(exp);
      } catch (e) {
        el.innerHTML = `<h3>你 vs 全体被试</h3><p class="panel-body">暂时无法拉取全体数据（${e.message || e}）。</p>`;
        return;
      }
      // 过滤掉自己的记录（避免自己计入群体均值）
      const others = (records || []).filter(r => {
        const p = r.participant || r.participant_id || '';
        const code = window.App.getSubjectCode();
        return String(p).trim() !== code;
      });
      // 计算每个其他被试的指标
      const groupValues = {};
      for (const r of others) {
        const trials = Array.isArray(r.trials) ? r.trials : [];
        if (!trials.length) continue;
        const s = computeMyStats(exp, trials);
        for (const k in s) {
          if (s[k] == null || !isFinite(s[k])) continue;
          (groupValues[k] = groupValues[k] || []).push(s[k]);
        }
      }
      el.innerHTML = renderGroupCompare(exp, my, groupValues, others.length);
    }, 50);

    return holder;
  }

  // 用统一统计层提取某实验的「核心指标」键值对（供个体/群体复用）
  function computeMyStats(exp, trials) {
    const S = window.Stats;
    if (exp === 'search') {
      const s = S.search(trials);
      return {
        '特征搜索斜率': s.slopeFeature,
        '联合搜索斜率': s.slopeConj,
        '特征正确率(%)': s.accFeature != null ? s.accFeature * 100 : null,
        '联合正确率(%)': s.accConj != null ? s.accConj * 100 : null
      };
    }
    if (exp === 'stroop') {
      const s = S.stroop(trials);
      return {
        '干扰效应(ms)': s.interference,
        '促进效应(ms)': s.facilitation,
        '一致RT(ms)': s.condRT && s.condRT.congruent,
        '冲突RT(ms)': s.condRT && s.condRT.incongruent
      };
    }
    if (exp === 'ior') {
      const s = S.ior(trials);
      return {
        '短间隔线索效应(ms)': s.cueingShort,
        '长间隔IOR效应(ms)': s.iorEffect,
        '短·同侧RT(ms)': s.cells && s.cells.shortSame,
        '长·同侧RT(ms)': s.cells && s.cells.longSame
      };
    }
    return {};
  }

  // 渲染「你 vs 全体」对比（原生 SVG 对比条形图 + 文字说明）
  function renderGroupCompare(exp, my, groupValues, groupN) {
    if (!groupN) {
      return `<h3>你 vs 全体被试</h3><p class="panel-body">还没有其他被试的数据，暂无群体均值可对比。</p>`;
    }
    const keys = Object.keys(my);
    const rows = keys.filter(k => {
      const arr = groupValues[k];
      return arr && arr.length;
    }).map(k => {
      const arr = groupValues[k];
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return { label: k, mine: my[k], group: mean, n: arr.length };
    });

    if (!rows.length) {
      return `<h3>你 vs 全体被试</h3><p class="panel-body">群体指标数据不足，暂无对比。</p>`;
    }

    // 对比条形图（你 vs 群体均值）
    const W = 560;
    const H = 30 + rows.length * 52;
    const maxAbs = Math.max.apply(null, rows.map(r => Math.max(Math.abs(r.mine || 0), Math.abs(r.group || 0), 1)));
    let svg = '';
    rows.forEach((r, idx) => {
      const y = 26 + idx * 52;
      // 以 0 为原点，左右延伸（处理负值，如 IOR 效应可能为负）
      const cx = 180; // 中心线 x
      const scale = 130 / maxAbs;
      const myLen = (r.mine || 0) * scale;
      const grLen = (r.group || 0) * scale;
      const myX = myLen >= 0 ? cx : cx + myLen;
      const grX = grLen >= 0 ? cx : cx + grLen;
      svg += `<text x="0" y="${y + 4}" font-size="11" fill="#4b5563">${r.label}</text>`;
      svg += `<line x1="${cx}" y1="${y - 12}" x2="${cx}" y2="${y + 14}" stroke="#cbd2da" stroke-width="1"></line>`;
      // 群体均值（灰）
      svg += `<rect x="${Math.min(grX, cx)}" y="${y - 2}" width="${Math.abs(grLen) || 2}" height="12" rx="2" fill="#868e96" opacity="0.7"></rect>`;
      // 我的（蓝/橙）
      svg += `<rect x="${Math.min(myX, cx)}" y="${y + 12}" width="${Math.abs(myLen) || 2}" height="12" rx="2" fill="#3b5bdb"></rect>`;
      svg += `<text x="${W - 140}" y="${y + 4}" font-size="10" fill="#4b5563">你 ${fmtV(r.mine)}</text>`;
      svg += `<text x="${W - 140}" y="${y + 18}" font-size="10" fill="#868e96">全体均值 ${fmtV(r.group)}（n=${r.n}）</text>`;
    });

    const svgFull = `<svg class="compare-bar" viewBox="0 0 ${W} ${H}" role="img" aria-label="你 vs 全体均值对比">
      ${svg}
      <rect x="${W - 140}" y="${H - 12}" width="10" height="10" rx="2" fill="#3b5bdb"></rect>
      <text x="${W - 126}" y="${H - 3}" font-size="10" fill="#4b5563">你</text>
      <rect x="${W - 100}" y="${H - 12}" width="10" height="10" rx="2" fill="#868e96" opacity="0.7"></rect>
      <text x="${W - 86}" y="${H - 3}" font-size="10" fill="#868e96">全体均值</text>
    </svg>`;

    // 生成一句总结
    const summary = rows.map(r => {
      const diff = (r.mine != null && r.group != null) ? (r.mine - r.group) : null;
      if (diff == null) return '';
      const dir = diff > 0 ? '高于' : diff < 0 ? '低于' : '接近';
      return `你的「${r.label}」${dir}全体均值 ${Math.abs(diff).toFixed(0)}（你 ${fmtV(r.mine)} vs 全体 ${fmtV(r.group)}）`;
    }).filter(Boolean).join('；');

    return `<h3>你 vs 全体被试</h3>
      <p class="panel-body">以下将你的核心指标与 <strong>${groupN} 名</strong>其他被试的均值对比（灰色=全体均值，蓝色=你的数据）：</p>
      ${svgFull}
      ${summary ? `<p class="panel-body" style="margin-top:10px">${summary}。</p>` : ''}
      <p class="panel-body hint" style="font-size:12px">注：群体均值来自收数平台已提交的全部其他被试，实时计算。</p>`;
  }

  function fmtV(v) {
    if (v == null || !isFinite(v)) return '—';
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  }

  /* ============ 眼动分析（常见参考标注算法） ============
     gaze: [{ t, x, y }] 采样点，x/y 为视口像素坐标
     实现三类业界常用的注视标注/分析算法：
     1. I-VT（velocity threshold）注视分类 —— 速度阈值法分离注视/扫视
     2. AOI 兴趣区命中率 + 网格热区（heatmap）
     3. 注视中心偏移（质心 vs 屏幕中心）
  */
  function gazeAnalysis(gaze, meta) {
    if (!gaze || gaze.length < 5) {
      return `<div class="result-section">
        <h3>眼动分析（眼动追踪）</h3>
        <p class="panel-body">本次实验未采集到足够的眼动数据（可能未勾选眼动，或摄像头未正常启动）。</p>
      </div>`;
    }

    const pts = gaze.filter(g => isFinite(g.x) && isFinite(g.y));
    if (pts.length < 5) {
      return `<div class="result-section"><h3>眼动分析</h3><p class="panel-body">眼动采样点过少（${pts.length} 个），无法进行稳定分析。</p></div>`;
    }

    const W = innerWidth || 1280, H = innerHeight || 720;

    // ---- 1. I-VT 注视分类（速度阈值法） ----
    // 依据时间戳和像素位移估算注视速度；速度 > 阈值(30°/s 折算为像素)判为扫视
    // 简化：直接用相邻采样点位移除以时间差，取像素/秒，阈值取 ~500px/s（约对应 30°/s 在常见距离）
    const vtThreshold = 500; // px/s
    let fixCount = 0, saccCount = 0, totalDist = 0, totalTime = 0;
    let lastT = null, lastX = null, lastY = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (lastT != null && lastT !== p.t) {
        const dt = Math.max(0.001, (p.t - lastT) / 1000); // 秒
        const d = Math.hypot(p.x - lastX, p.y - lastY);
        totalDist += d; totalTime += dt;
        const vel = d / dt; // px/s
        if (vel > vtThreshold) saccCount++; else fixCount++;
      }
      lastT = p.t; lastX = p.x; lastY = p.y;
    }
    const fixRatio = (fixCount + saccCount) ? (fixCount / (fixCount + saccCount) * 100) : 0;

    // ---- 2. 注视中心（质心）与偏移 ----
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const offX = cx - W / 2, offY = cy - H / 2;
    const offDist = Math.hypot(offX, offY);

    // ---- 3. AOI 网格热区（3×3 网格） ----
    const GRID = 3;
    const cellW = W / GRID, cellH = H / GRID;
    const counts = new Array(GRID * GRID).fill(0);
    for (const p of pts) {
      const gx = Math.min(GRID - 1, Math.max(0, Math.floor(p.x / cellW)));
      const gy = Math.min(GRID - 1, Math.max(0, Math.floor(p.y / cellH)));
      counts[gy * GRID + gx]++;
    }
    const maxC = Math.max.apply(null, counts) || 1;
    // 主要兴趣区（命中最多的格子）
    let maxIdx = 0;
    counts.forEach((c, i) => { if (c > counts[maxIdx]) maxIdx = i; });
    const aoiGx = maxIdx % GRID, aoiGy = Math.floor(maxIdx / GRID);
    const aoiNames = ['左上', '中上', '右上', '左中', '中央', '右中', '左下', '中下', '右下'];
    const aoiHit = counts[maxIdx] / pts.length * 100;

    // 注视散点图 SVG
    let scatter = '';
    {
      const sW = 560, sH = 320;
      const scaleX = sW / W, scaleY = sH / H;
      const dots = pts.map(p => {
        const x = p.x * scaleX, y = p.y * scaleY;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="#3b5bdb" opacity="0.35"></circle>`;
      }).join('');
      // 质心
      const ccx = cx * scaleX, ccy = cy * scaleY;
      scatter = `<svg class="gaze-scatter" viewBox="0 0 ${sW} ${sH}" role="img" aria-label="注视点散布图">
        <rect x="0" y="0" width="${sW}" height="${sH}" fill="#fbfaf7"></rect>
        ${dots}
        <circle cx="${ccx.toFixed(1)}" cy="${ccy.toFixed(1)}" r="6" fill="none" stroke="#e8590c" stroke-width="2"></circle>
        <line x1="${sW / 2}" y1="0" x2="${sW / 2}" y2="${sH}" stroke="#e9e5dc" stroke-width="1"></line>
        <line x1="0" y1="${sH / 2}" x2="${sW}" y2="${sH / 2}" stroke="#e9e5dc" stroke-width="1"></line>
      </svg>`;
    }

    // 热区 SVG（3×3）
    let heat = '';
    {
      const sW = 560, sH = 320, cellW2 = sW / GRID, cellH2 = sH / GRID;
      let cells = '';
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const v = counts[r * GRID + c] / maxC;
          const alpha = 0.05 + v * 0.85;
          cells += `<rect x="${c * cellW2}" y="${r * cellH2}" width="${cellW2}" height="${cellH2}" fill="#e8590c" opacity="${alpha.toFixed(2)}" stroke="#fff" stroke-width="1"></rect>`;
        }
      }
      heat = `<svg class="gaze-heat" viewBox="0 0 ${sW} ${sH}" role="img" aria-label="注视热区图">
        <rect x="0" y="0" width="${sW}" height="${sH}" fill="#fbfaf7"></rect>
        ${cells}
      </svg>`;
    }

    // AOI 命中率表格
    const aoiRows = aoiNames.map((name, i) => {
      const pct = (counts[i] / pts.length * 100);
      return `<tr><td>${name}</td><td>${counts[i]}</td><td>${pct.toFixed(1)}%</td>${i === maxIdx ? '<td>★</td>' : '<td></td>'}</tr>`;
    }).join('');

    const calibNote = (meta && meta.calib_error_px) ? `（校准平均误差 ${meta.calib_error_px} px）` : '';

    return `
      <div class="result-section">
        <h3>眼动分析（眼动追踪）</h3>
        <p class="panel-body">共采集 <strong>${pts.length}</strong> 个注视采样点${calibNote}。以下采用眼动研究中的<strong>常见参考标注算法</strong>进行分析：</p>

        <div class="stat-grid">
          ${statBox(fixRatio.toFixed(0) + '%', '注视占比（I-VT 分类）', 'accent')}
          ${statBox(saccCount, '扫视次数', '')}
          ${statBox(fixCount, '注视片段', '')}
          ${statBox(Math.round(offDist) + ' px', '注视中心偏移', offDist > W * 0.15 ? 'bad' : 'good')}
        </div>

        <h4 style="font-size:14px;margin:16px 0 4px">① 注视点散布与注视中心</h4>
        <p class="panel-body">蓝点为逐帧注视位置，<span style="color:#e8590c">橙色圆圈</span>为全体注视的质心（加权中心），十字线为屏幕中心。若质心明显偏离中心，说明你更多注视了屏幕某一侧：</p>
        ${scatter}

        <h4 style="font-size:14px;margin:16px 0 4px">② 兴趣区（AOI）热区图</h4>
        <p class="panel-body">将屏幕划分为 3×3 兴趣区，颜色越深代表注视停留越多。主要注视区域是「<strong>${aoiNames[maxIdx]}</strong>」，占总注视的 <strong>${aoiHit.toFixed(1)}%</strong>：</p>
        ${heat}
        <div class="gaze-legend">
          <span><span class="sw" style="background:#fff;border:1px solid #ddd"></span>少</span>
          <span><span class="sw" style="background:#e8590c"></span>多</span>
        </div>

        <h4 style="font-size:14px;margin:16px 0 4px">③ 各兴趣区命中率</h4>
        <table class="gaze-aoi-table">
          <thead><tr><th>兴趣区</th><th>采样点</th><th>占比</th><th>主要区</th></tr></thead>
          <tbody>${aoiRows}</tbody>
        </table>

        <p class="panel-body" style="margin-top:10px"><strong>参考标注算法说明</strong>：注视/扫视分类采用 <strong>I-VT（velocity threshold）速度阈值法</strong>（阈值约 30°/s，Salvucci &amp; Goldberg, 2000）；兴趣区采用<strong>网格 AOI 命中率</strong>统计；注视中心用<strong>质心法</strong>度量整体注视偏向。这些是眼动数据分析中最通用的标注口径。</p>
        <div class="ref-list">
          参考文献：Salvucci &amp; Goldberg (2000) <a href="https://doi.org/10.1145/355017.355028" target="_blank">Identifying fixations and saccades in eye-tracking protocols</a> · Holmqvist et al. (2011) <em>Eye Tracking: A comprehensive guide</em>
        </div>
      </div>`;
  }

  return { search, stroop, ior, median, labImprove, gazeAnalysis, groupComparison };
})();
