# 审核测试步骤 / Reviewer test instructions

版本：0.12.0；开发者：layman369；联系：1917931073x@gmail.com。
扩展不需要开发者提供的账号、订阅、付款或 API 密钥。测试真实扫描需审核员自行在浏览器登录其拥有或获准使用的 X 账号；请勿要求分享个人登录凭据。

## 不依赖 X 登录的功能测试
1. 安装扩展后，打开工具栏弹窗，点击「打开关系管理台」。新安装不含演示账号或预置名单。
2. 为减少外部站点依赖，本材料提供两份完全虚构的整库备份：example-backups/review-current.json 与 review-baseline.json。它们不包含真实用户资料，也不在安装包内。
3. 只在独立测试浏览器配置文件中，通过「恢复备份」选择 review-current.json，并确认替换。管理台显示 sample_owner 账号。
4. 检查分类、人数、搜索、20/50/100/200 分页、简介、标签选择、单元格编辑、忽略/取消忽略及过滤设置。
5. 点击「对比备份」，选择 review-baseline.json。两次均为同一未回关关系的用户显示 4 day 红色标签；只在新记录出现的用户显示破折号。分别查看「未回关我的」及「我未回关的」。对比不替换当前记录；清除对比移除标签。
6. 导出 CSV 与全部 JSON，检查数据；在测试环境修改一条备注，恢复之前的 JSON，确认备注与忽略信息恢复。粉丝快照仅在粉丝名单完整时允许保存，第一次建立基线。
7. 上述完整标记仅对应专门提供的虚构测试数据；不可据此认定任意真实扫描完整。

## 真实 X 页面扫描测试
1. 在同一浏览器配置文件登录你有权使用的 X 账号。准备一个可访问的少量用户账号列表用于测试。
2. 从弹窗或管理台输入目标用户名，点击「扫描两份名单」。确认只打开目标 X 名单及短暂用于读取公开人数的后台主页。
3. 扫描标签页默认临时缩放至 25%；浏览器原生侧边栏正常字号显示进度、预计时间、已采集人数、最近用户及停止按钮。若未自动打开，点击「打开右侧进度」。
4. 点击停止，检查已写入部分名单保留、标签页缩放恢复。启动新任务检查先粉丝后关注的顺序。
5. 检查本机头像/简介字段和扫描摘要。扫描结果默认不完整，未回关分类不会在缺乏完整性确认时武断判断。到达底部或人数一致均不代表已经完整。
6. 登录失效、不可访问页面、限流或站点布局变化时，扩展应提示限制。没有数据时不自动确认完整空名单。

## 权限与隐私核对
只申请 storage、scripting、sidePanel 及 https://x.com/*、https://www.x.com/*。不读取 Cookie 值或令牌，不发送关注、取关或私信，不调用站点私有接口。头像显示会请求 pbs.twimg.com；其他数据不发送到开发者服务器。无远程代码、广告、分析遥测。

## English summary for reviewers
Open the extension popup and launch the relationship manager. The extension has no subscription or developer-managed login. Test management features by restoring review-current.json ONLY in a disposable browser profile. The two example backups are entirely fictional and are not bundled in the extension. Select review-baseline.json via Compare backup; matching negative relationships in either direction show 4 day in red, while newly observed users show a dash. Test tags/notes, ignoring, filters, CSV, backup/restore and snapshots.
For live scanning, use an X account you own or are authorized to use. The extension opens the target follower/following pages and temporarily a profile page for public counts. The scan tab defaults to 25% zoom while the native side panel remains readable. Stop should retain already stored records and restore zoom. Incomplete records must not imply missing relationships. Network access to X and its avatar server is expected; records are not uploaded to the developer. Known limitations include rate limits, inaccessible accounts, virtualized lists, layout changes and username changes.

## 提交前状态
自动化测试及独立网页截图不能替代商店版本在真实 Chrome / Edge 与已登录 X 页面的验收。审核与原生侧边栏兼容性仍需实机验证。本文件不宣称扩展已通过商店审核。
