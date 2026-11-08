/* =========================================================
   全局配置 —— 改这里即可切换项目
   ========================================================= */
window.CONFIG = {
  LAB: 'https://attention-lab-production.up.railway.app',

  // 三个实验的项目码（每个实验提交到各自的项目）
  experiments: {
    search:  { name: '视觉搜索', experiment: 'search',  project: '8XKAVD', desc: '视觉搜索' },
    stroop:  { name: 'Stroop 效应', experiment: 'stroop',   project: 'NQRU6M', desc: '选择性注意' },
    ior:     { name: '返回抑制', experiment: 'ior',       project: 'W2U4GB', desc: '空间注意' }
  }
};
