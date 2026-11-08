#!/usr/bin/env node
/**
 * 本地 HTTPS 服务器 —— 用于眼动追踪（WebGazer 需要安全上下文才能调用摄像头）
 *
 * 用法：
 *   node server-https.js
 * 然后浏览器访问 https://localhost:8443
 * 首次访问会提示证书不受信任，点「高级 → 继续前往」即可（自签名证书仅用于本地测试）。
 *
 * 说明：
 *   - 摄像头 getUserMedia 只在「安全上下文」可用：https:// 或 http://localhost
 *   - 双击 index.html（file://）无法调用摄像头，仅能跑非眼动实验
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 8443;
const ROOT = __dirname;
const CERT_DIR = path.join(ROOT, '.certs');

// ---- 生成自签名证书（如不存在） ----
function ensureCerts() {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log('首次运行，正在生成自签名证书…');
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" ` +
    `-days 365 -subj "/CN=localhost" ` +
    `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
    { stdio: 'inherit' }
  );
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

const { key, cert } = ensureCerts();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8'
};

function handler(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);

  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = https.createServer({ key, cert }, handler);

// 端口被占用时的友好提示
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('  ❌ 端口 ' + PORT + ' 已被占用。');
    console.error('     可能已经有一个 server-https.js 在运行，');
    console.error('     请直接打开 https://localhost:' + PORT + ' 即可，无需重复启动。');
    console.error('     或先关掉占用该端口的程序后再试。');
    console.error('');
  } else {
    console.error('  ❌ 启动失败：', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = 'https://localhost:' + PORT;
  console.log('');
  console.log('  ✅ 注意实验室（本地 HTTPS）已启动');
  console.log('  🔗 请在浏览器打开：  ' + url);
  console.log('  📷 眼动追踪已可用（摄像头需在安全上下文）');
  console.log('');
  console.log('  ⚠️ 首次访问会提示「证书不受信任」，点「高级 → 继续前往」即可。');
  console.log('  （自签名证书仅用于本地测试，不会影响数据上传）');
  console.log('');
  console.log('  按 Ctrl+C 停止');
  console.log('');

  // 可选：自动打开默认浏览器（传入 --open 参数）
  if (process.argv.includes('--open')) {
    let cmd;
    if (process.platform === 'win32') cmd = 'start "" "' + url + '"';
    else if (process.platform === 'darwin') cmd = 'open "' + url + '"';
    else cmd = 'xdg-open "' + url + '"';
    try { execSync(cmd, { stdio: 'ignore' }); } catch (e) { /* 打不开也无妨 */ }
  }
});
