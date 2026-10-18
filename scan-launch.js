import { handle } from './core.js';
export function openProgressPanel(windowId, api = chrome) {
  if (!Number.isInteger(windowId) || windowId < 0 || !api.sidePanel?.open) throw new Error('无法打开侧边栏，请重新加载扩展并确认浏览器支持侧边栏');
  return api.sidePanel.open({ windowId });
}
// Called directly by the UI click handler: open the panel before any awaited work.
export async function launchScan(options, api = chrome) {
  const owner = handle(options.owner);
  const panelResult = (async () => {
    try { if (!options.inPanel) await openProgressPanel(options.windowId, api); return ''; }
    catch (error) { return `侧边栏未打开，可点击“打开右侧进度”重试：${error.message}`; }
  })();
  const granted = await api.permissions.request({ origins: ['https://x.com/*'] });
  const panelWarning = await panelResult;
  if (!granted) throw new Error('没有允许访问 X 页面，扫描尚未启动。请授权 x.com 后重试');
  const response = await api.runtime.sendMessage({ type: 'XRB_SCAN_START', owner, kind: options.kind, zoomFactor: options.zoomFactor, ...(options.windowId === undefined ? {} : { windowId: options.windowId }) });
  if (!response?.ok) throw new Error(response?.error || '扫描服务未就绪，请在扩展管理页重新加载');
  return { job: response.job, panelWarning };
}
