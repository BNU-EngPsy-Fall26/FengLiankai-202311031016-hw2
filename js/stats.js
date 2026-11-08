/* =========================================================
   统一统计层 —— 从 raw trials 提取每个实验的核心数值指标
   供两处复用：
   1. 结果页「被试 vs 全体均值」对比
   2. 管理员面板（逐被试指标 + 群体分布）
   =========================================================
   每个实验返回 { key: 指标值 }，指标命名与实验设计一一对应。
   约定：所有函数只吃 raw trials（数组），返回纯数值对象，
   不涉及 DOM / HTML，保证可复用与可测试。
   ========================================================= */
window.Stats = (function () {
  const median = window.Results.median;

  /* ============ 实验 1 · 视觉搜索 ============ */
  // trials: [{ type, setSize, present, angle, rt, correct }]
  // 返回：特征/联合 搜索斜率、正确率、各 set size 的中位 RT、各角度 RT
  function search(trials) {
    const list = (trials || []).map(r => ({
      type: r.type,
      setSize: (r.set_size != null ? r.set_size : r.setSize),
      present: r.present,
      angle: r.angle,
      rt: r.rt,
      correct: r.correct
    }));
    const correct = list.filter(r => r.correct === 1);
    const SIZES = [4, 8, 12, 16];
    const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

    const rtBySetSize = (type) => {
      const out = {};
      SIZES.forEach(sz => {
        const arr = correct.filter(r => r.type === type && r.setSize === sz).map(r => r.rt);
        out[sz] = arr.length ? median(arr) : null;
      });
      return out;
    };
    const featBySize = rtBySetSize('feature');
    const conjBySize = rtBySetSize('conjunction');

    const accOf = (type) => {
      const arr = list.filter(r => r.type === type);
      if (!arr.length) return null;
      return arr.filter(r => r.correct === 1).length / arr.length;
    };

    const slopeOf = (rtBySize) => {
      const pts = SIZES.filter(sz => rtBySize[sz] != null).map(sz => ({ x: sz, y: rtBySize[sz] }));
      if (pts.length < 2) return null;
      const n = pts.length;
      const mx = pts.reduce((a, p) => a + p.x, 0) / n;
      const my = pts.reduce((a, p) => a + p.y, 0) / n;
      let num = 0, den = 0;
      for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); }
      return den ? num / den : null;
    };

    const angleRT = {};
    const conjPresent = correct.filter(r => r.type === 'conjunction' && r.present === 1);
    ANGLES.forEach(a => {
      const arr = conjPresent.filter(r => r.angle === a).map(r => r.rt);
      angleRT[a] = arr.length ? median(arr) : null;
    });

    return {
      featBySize, conjBySize, angleRT,
      accFeature: accOf('feature'),
      accConj: accOf('conjunction'),
      slopeFeature: slopeOf(featBySize),
      slopeConj: slopeOf(conjBySize)
    };
  }

  /* ============ 实验 2 · Stroop ============ */
  // trials: [{ cond: 'congruent'|'neutral'|'incongruent', correct, rt, timeout }]
  // 返回：三条件中位 RT、干扰效应、促进效应、错误率
  function stroop(trials) {
    const list = trials || [];
    const byCond = { congruent: [], neutral: [], incongruent: [] };
    const err = { congruent: 0, neutral: 0, incongruent: 0 };
    const total = { congruent: 0, neutral: 0, incongruent: 0 };
    for (const t of list) {
      if (!byCond[t.cond]) continue;
      total[t.cond]++;
      if (t.correct) byCond[t.cond].push(t.rt);
      else err[t.cond]++;
    }
    const condRT = {
      congruent: byCond.congruent.length ? median(byCond.congruent) : null,
      neutral: byCond.neutral.length ? median(byCond.neutral) : null,
      incongruent: byCond.incongruent.length ? median(byCond.incongruent) : null
    };
    const condErr = {
      congruent: total.congruent ? err.congruent / total.congruent : null,
      neutral: total.neutral ? err.neutral / total.neutral : null,
      incongruent: total.incongruent ? err.incongruent / total.incongruent : null
    };
    const interference = (condRT.incongruent != null && condRT.neutral != null)
      ? condRT.incongruent - condRT.neutral : null;   // 冲突 - 中性
    const facilitation = (condRT.neutral != null && condRT.congruent != null)
      ? condRT.neutral - condRT.congruent : null;      // 中性 - 一致
    return { condRT, condErr, interference, facilitation };
  }

  /* ============ 实验 3 · 返回抑制 ============ */
  // trials: [{ soi: 100|700, side: 'same'|'diff'|'catch', has_target, correct, rt }]
  // 返回：四细胞中位 RT、短间隔线索效应、长间隔 IOR 效应
  function ior(trials) {
    const list = trials || [];
    const target = list.filter(t => t.has_target === 1 && t.correct === 1);
    const cells = {
      shortSame: median(target.filter(t => t.soi === 100 && t.side === 'same').map(t => t.rt)),
      shortDiff: median(target.filter(t => t.soi === 100 && t.side === 'diff').map(t => t.rt)),
      longSame: median(target.filter(t => t.soi === 700 && t.side === 'same').map(t => t.rt)),
      longDiff: median(target.filter(t => t.soi === 700 && t.side === 'diff').map(t => t.rt))
    };
    const cueingShort = (isFinite(cells.shortSame) && isFinite(cells.shortDiff))
      ? cells.shortSame - cells.shortDiff : null;   // 短间隔：同侧 - 异侧
    const iorEffect = (isFinite(cells.longSame) && isFinite(cells.longDiff))
      ? cells.longSame - cells.longDiff : null;      // 长间隔：同侧 - 异侧
    return { cells, cueingShort, iorEffect };
  }

  /* ============ 聚合：从多个被试的 stats 求群体均值 ============ */
  // 传入 { key: [值1, 值2, ...] }（已收集各被试的某指标），返回 { mean, median, n, sd }
  function aggregate(values) {
    const v = (values || []).filter(x => x != null && isFinite(x));
    if (!v.length) return { mean: null, median: null, n: 0, sd: null };
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const med = median(v);
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
    return { mean, median: med, n: v.length, sd };
  }

  return { search, stroop, ior, aggregate };
})();
