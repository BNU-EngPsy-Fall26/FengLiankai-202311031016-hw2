/* =========================================================
   工具函数：DOM、随机、计时、数据上传
   ========================================================= */
window.Utils = (function () {
  const LAB = () => window.CONFIG.LAB;
  // 按 experiment 取对应项目码（三个实验各自提交到不同项目）
  const PROJECT = (experiment) => {
    const exp = window.CONFIG.experiments[experiment];
    return exp ? exp.project : '';
  };

  // ---- DOM ----
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  // ---- 随机 ----
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // ---- 计时 ----
  const now = () => performance.now();
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ---- 数据上传 ----
  async function submit(participant, experiment, trials, condition, meta) {
    const res = await fetch(LAB() + '/api/hw2/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: PROJECT(experiment),
        experiment: experiment,
        participant: participant,
        condition: condition || '',
        trials: trials,
        meta: meta || { ua: navigator.userAgent.slice(0, 80), w: innerWidth, h: innerHeight }
      })
    });
    let r;
    try { r = await res.json(); } catch (e) { throw new Error('响应解析失败'); }
    if (!r.ok) throw new Error(r.msg || '上传失败');
    return r;
  }

  // ---- 读取全体数据（匿名） ----
  async function loadAll(experiment) {
    const r = await (await fetch(`${LAB()}/api/hw2/data?project=${PROJECT(experiment)}&experiment=${experiment}`)).json();
    return r.records || [];
  }

  // ---- 读取全体记录（含 trials，供结果重画） ----
  async function loadRecords(experiment) {
    const r = await (await fetch(`${LAB()}/api/hw2/data?project=${PROJECT(experiment)}&experiment=${experiment}`)).json();
    return r.records || [];
  }

  // ---- 稳定短码哈希：把任意字符串映射成固定长度的大写码（同一输入永远同一码） ----
  // 采用 FNV-1a + 简单混淆，输出 6 位 [A-Z0-9]（去掉易混淆字符 I/L/O/0/1）
  function hashCode(str) {
    const s = String(str == null ? '' : str);
    if (!s) return 'XXXXXX';
    // FNV-1a 32-bit
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // 加盐避免纯 FNV 可预测性，并保证稳定
    const seed = 2654435761;
    h = Math.imul(h, seed) ^ (h >>> 16);
    const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    let x = h >>> 0;
    for (let i = 0; i < 6; i++) {
      out += ALPHABET[x % ALPHABET.length];
      x = Math.floor(x / ALPHABET.length);
      if (x === 0) x = (h >>> 0) ^ Math.imul(i + 1, 40503);
    }
    return out;
  }

  // ---- 全局唯一被试码 ----
  // 用 crypto.getRandomValues 生成高熵随机码（8 位，字母表 32 字符 ≈ 10^12 组合），
  // 避免「同名昵称」导致数据串号。首次生成后持久化到 localStorage，同一浏览器永久复用。
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CODE_KEY = 'edu_admin_subject_code';

  function genId(len) {
    len = len || 8;
    const chars = CODE_ALPHABET;
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint32Array(len);
      crypto.getRandomValues(buf);
      let out = '';
      for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
      return out;
    }
    // 兜底：Math.random（无 crypto 环境）
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // 读取（或首次生成）本机持久化的唯一被试码
  function subjectCode() {
    try {
      let code = localStorage.getItem(CODE_KEY);
      if (code && /^[A-Z0-9]{6,12}$/.test(code)) return code;
    } catch (e) {}
    const code = genId(8);
    try { localStorage.setItem(CODE_KEY, code); } catch (e) {}
    return code;
  }

  // ---- CSV 通用工具 ----
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // 通用 CSV 下载。三个必须处理的兼容点：
  //   ① <a> 若游离在 DOM 之外，Firefox / 部分内嵌浏览器不会触发下载，必须 append 后再 click；
  //   ② 下载是异步的，立刻 revokeObjectURL 会让 blob URL 在下载开始前失效，必须延迟撤销；
  //   ③ UTF-8 BOM + CRLF，保证 Excel 打开中文不乱码、不挤成一行。
  function downloadCSV(filename, lines) {
    const content = '\ufeff' + lines.join('\r\n');
    const cleanup = (node, url, ok) => {
      setTimeout(() => {
        try { if (node && node.parentNode) node.parentNode.removeChild(node); } catch (e) {}
        try { if (url) URL.revokeObjectURL(url); } catch (e) {}
      }, 2000);
      return ok;
    };
    let url = null, a = null;
    try {
      url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
      a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      return cleanup(a, url, true);
    } catch (e) {
      console.warn('[csv] Blob 下载失败，改用 data URI', e);
      cleanup(a, url, false);
      // 兜底：不支持 createObjectURL / Blob 下载的环境
      try {
        const b = document.createElement('a');
        b.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(content);
        b.download = filename;
        b.style.display = 'none';
        document.body.appendChild(b);
        b.click();
        return cleanup(b, null, true);
      } catch (e2) {
        console.warn('[csv] 下载完全失败', e2);
        return false;
      }
    }
  }

  // ---- CSV 导出（逐试次，供离线备份 / 结果页使用）----
  function exportCSV(experiment, trials, participant) {
    if (!trials || !trials.length) return false;
    const cols = Object.keys(trials[0]);
    const lines = [cols.map(csvCell).join(',')];
    for (const t of trials) lines.push(cols.map(c => csvCell(t[c])).join(','));
    return downloadCSV(`${experiment}_${participant}_${Date.now()}.csv`, lines);
  }

  return { $, $$, el, clear, shuffle, randInt, now, sleep, submit, loadAll, loadRecords, csvCell, downloadCSV, exportCSV, hashCode, genId, subjectCode };
})();
