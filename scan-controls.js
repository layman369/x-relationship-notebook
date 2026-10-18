import { isExtension } from './storage.js';
import { launchScan, openProgressPanel } from './scan-launch.js';
export async function mountScanControls(getOwner = () => '', onJob = () => {}) {
  const container = document.querySelector('#scan-controls');
  if (!container) return;
  container.innerHTML = '<div class="scan-top"><div><strong>一键扫描</strong><p>自动收集关注者和正在关注名单，结果保存在本机。</p></div></div><div class="scan-actions"><input id="scan-owner" aria-label="扫描目标用户名" placeholder="输入 @用户名" maxlength="16"><button class="primary" data-scan="both">扫描两份名单</button><button data-scan="followers">仅扫描关注者</button><button data-scan="following">仅扫描正在关注</button></div><label class="scan-option">扫描时页面缩放 <select id="scan-zoom" aria-label="扫描时页面缩放"><option value="0.25">25%（默认）</option><option value="0.5">50%</option><option value="0.67">67%</option><option value="0.8">80%</option><option value="0">保持原比例</option></select><span>结束后恢复原比例</span></label><button id="open-progress-panel" type="button">打开右侧进度 ↗</button><div id="scan-progress" role="status">尚未开始扫描</div><button id="scan-stop" hidden>停止扫描</button><p class="scan-hint">新结果替换对应旧名单（建议先备份）。到达底部不代表名单完整，请到管理台核对。每份上限 10000 人 / 10 分钟。</p>';
  const input = container.querySelector('input'); input.value = getOwner();
  const status = container.querySelector('#scan-progress');
  const stop = container.querySelector('#scan-stop');
  let busy = false, windowId, panelWarning = '';
  const inPanel = document.body.dataset.surface === 'sidepanel';
  if (isExtension) { try { windowId = (await chrome.windows.getCurrent()).id; } catch { /* Launch can still proceed with a panel warning. */ } }
  const panelButton = container.querySelector('#open-progress-panel');
  panelButton.hidden = inPanel; panelButton.disabled = !isExtension;
  panelButton.onclick = async () => { try { await openProgressPanel(windowId); panelWarning = ''; } catch (error) { status.textContent = error.message; } };
  const render = job => {
    busy = job && ['loading', 'running'].includes(job.phase);
    container.querySelectorAll('[data-scan]').forEach(button => button.disabled = !isExtension || busy);
    input.disabled = !!busy;
    container.querySelector('#scan-zoom').disabled = !!busy;
    if (busy) input.value = job.owner;
    if (busy) container.querySelector('#scan-zoom').value = String(job.zoomFactor ?? 0);
    onJob(job);
    stop.hidden = !busy; stop.disabled = job?.stopRequested || false;
    document.dispatchEvent(new CustomEvent('xrb-scan-status', { detail: { busy: !!busy } }));
    if (!job) return;
    const counts = job.kinds.map(kind => `${kind === 'followers' ? '关注者' : '正在关注'} ${job.counts[kind] || 0} 人`).join(' · ');
    status.textContent = `@${job.owner} · ${counts}${job.zoomFactor ? ` · 扫描缩放 ${Math.round(job.zoomFactor * 100)}%` : ''}。${busy ? (job.stopRequested ? '正在停止…' : job.phase === 'loading' ? '正在加载名单…' : '自动滚动采集中…') : job.reason || '已结束'}${Object.values(job.counts).some(n => n > 0) ? '；结果待核对完整性。' : ''}${job.zoomWarning ? ` ${job.zoomWarning}` : ''}${panelWarning ? ` ${panelWarning}` : ''}`;
  };
  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || '扫描服务未就绪，请在扩展管理页重新加载');
    return response.job;
  }
  for (const button of container.querySelectorAll('[data-scan]')) button.onclick = async () => {
    if (busy) return;
    try {
      // Calling launchScan now opens the panel synchronously in this click gesture.
      const pending = launchScan({ owner: input.value || getOwner(), kind: button.dataset.scan, zoomFactor: Number(container.querySelector('#scan-zoom').value), windowId, inPanel });
      busy = true; container.querySelectorAll('[data-scan]').forEach(b => b.disabled = true);
      const result = await pending; panelWarning = result.panelWarning; render(result.job);
    } catch (error) { render(null); status.textContent = error.message; }
  };
  stop.onclick = async () => {
    try { render(await request({ type: 'XRB_SCAN_STOP' })); } catch (error) { status.textContent = error.message; }
  };
  render(null);
  if (!isExtension) { status.textContent = '请在已安装的浏览器扩展中使用扫描功能；网页预览仅展示界面。'; return; }
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes['xrb-scan-job']) render(changes['xrb-scan-job'].newValue); });
  try { render(await request({ type: 'XRB_SCAN_STATUS' })); } catch (error) { status.textContent = error.message; }
}
