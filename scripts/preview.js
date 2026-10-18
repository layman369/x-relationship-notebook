import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const allowed = new Set(['icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png', 'app.html', 'app.js', 'profile-ui.js', 'profile.css', 'list-view.js', 'list.css', 'core.js', 'storage.js', 'style.css', 'scan.css', 'scan-controls.js', 'scan-launch.js', 'progress-model.js','ui-refresh.js', 'sidepanel.html', 'sidepanel.js', 'sidepanel.css']);
const mime = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'app.html';
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  try { const body = await readFile(path.join(root, name)); res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store' }); res.end(body); }
  catch { res.writeHead(500).end(); }
}).listen(4173, '127.0.0.1', () => console.log('X 关系簿预览：http://127.0.0.1:4173'));
