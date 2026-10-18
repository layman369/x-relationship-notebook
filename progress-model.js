export function progressModel(job, state) {
  if (!job) return { owner: '', followers: 0, following: 0, recent: [], results: [] };
  const data = state?.accounts?.[job.owner];
  const currentKind = job.kinds[job.index];
  const kinds = [currentKind, ...job.kinds.filter(kind => kind !== currentKind)];
  const recent = kinds.flatMap(kind => {
    const count = job.counts[kind] || 0;
    if (!count) return [];
    return (data?.[kind]?.users || []).slice(-Math.min(count, 50)).reverse().map(user => ({ ...user, kind }));
  }).slice(0, 50);
  return { owner: job.owner, followers: job.counts.followers || 0, following: job.counts.following || 0, recent, results: job.results || [] };
}

export function scanEstimate(job, now = Date.now()) {
  if (!job) return { label: '等待扫描任务', percent: null, detail: '开始采集后显示进度', eta: '预计剩余：等待开始', elapsed: '已用时：0 秒' };
  const kind = job.kinds[job.index];
  const active = ['loading', 'running'].includes(job.phase);
  const count = job.counts[kind] || 0;
  const hasPageTotal = Number.isSafeInteger(job.totals?.[kind]) && job.totals[kind] >= 0;
  const total = hasPageTotal ? job.totals[kind] : job.expectedCounts?.[kind] || 0;
  const exact = hasPageTotal && !job.totalApproximate?.[kind];
  const source = hasPageTotal ? (exact ? '页面总人数' : '主页缩写人数估算') : '按上次完整名单估算';
  const start = job.kindStartedAt || job.startedAt || now;
  const seconds = Math.max(0, ((active ? now : job.updatedAt) - start) / 1000) || 0;
  const duration = value => value < 60 ? `${Math.ceil(value)} 秒` : `${Math.floor(value / 60)} 分 ${Math.ceil(value % 60)} 秒`;
  let eta = '预计剩余：正在计算';
  if (!active) eta = '本份扫描已结束，结果需核对';
  else if (job.stopRequested) eta = '正在停止采集';
  else if (job.phase === 'loading') eta = '预计剩余：等待名单加载';
  else if (hasPageTotal && !total) eta = '主页显示 0 人，仍需核对采集结果';
  else if (!total) eta = job.totalTabId ? '预计剩余：正在读取主页总人数' : '预计剩余：暂无总人数，无法估算';
  else if (count >= total) eta = '已达到参考人数，等待页面结束判定';
  else if (job.lastGrowthAt && now - job.lastGrowthAt > 15000) eta = '预计剩余：等待页面加载，预估暂停';
  else if (count > 0 && seconds >= 5) eta = `预计剩余：约 ${duration((total - count) / (count / seconds))}`;
  return {
    label: `第 ${job.index + 1} / ${job.kinds.length} 份 · ${kind === 'followers' ? '关注者' : '正在关注'}${active ? '' : ' · 已结束'}`,
    percent: total ? Math.min(active ? 99 : 100, Math.floor(count / total * 100)) : null,
    detail: hasPageTotal || total ? `已采集 ${count} / ${hasPageTotal && !exact ? '约 ' : ''}${total} 人 · ${source}` : `已采集 ${count} 人 · ${job.totalTabId ? '总人数读取中' : '总人数未知'}`,
    eta, elapsed: `本份已用时：${duration(seconds)}`
  };
}
