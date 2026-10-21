# Chrome Web Store Listing — X 关系簿

Last Updated: 2026-10-21

状态：0.12.0 已于2026-10-21成功提交Chrome商店审核，后台显示待审核；已选择审核通过后自动发布，尚未公开上架。

## Store Listing

Extension Name: X 关系簿

Short Description: 在本机整理 X 关注与粉丝，分析互关关系并对比列表快照。

Detailed Description:

一键收集可访问的 X 关注者和正在关注名单，整理关注关系。

输入目标用户名，选择扫描两份名单或其中一份。扫描时显示收集进度，可随时停止。也支持导入名单、搜索、标签备注、CSV 导出和本机备份。

扫描时默认临时缩小页面到 25%，也可选择 50%、67%、80% 或保持原比例，让页面容纳更多用户。只缩放扫描标签页，扫描结束或停止后恢复此前的比例。实际名单加载数量仍取决于 X。

核实名单完整后，可查看未回关、互关及我未回关的用户。保存至少两次完整粉丝快照后，可对比名单新增和消失。首次快照只建立基线，名单消失不代表已经证实取关。

支持搜索用户名和简介、按已有标签筛选、点击单元格编辑标签备注、忽略用户管理和20/50/100/200条分页。通过CSV导出筛选结果，或用整库JSON备份保存名单资料、标签备注、忽略设置、快照和扫描摘要。

选择较早的关系簿JSON备份，可对比当前记录的双向未回关关系。两次均为相同未回关关系时，显示整数day观察间隔：≤24小时绿色，>24至72小时黄色，>72小时红色，未知显示破折号。时间不等于真实关注或回关日期，无法证明期间关系持续不变。当前不直接导入X官方归档文件。

本扩展为独立项目，与X Corp.没有隶属、认可或赞助关系。支持：https://github.com/layman369/x-relationship-notebook/issues 。联系：1917931073x@gmail.com。

名单与备注保存在本机，不上传到开发者服务器。请先在浏览器登录 X，扫描中保持目标标签页打开。扫描仅能收集页面展示且当前账号可访问的名单，结果可能受加载限制影响，完整性需用户核对。每份名单上限 10000 人或 10 分钟。不提供自动关注或取关。

Category: Social & Communication

Single Purpose: 在本机收集、整理并分析 X 关注关系名单。

Primary Language: 简体中文

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|---|---|---|---|
| Store Icon | 128×128 PNG | 已生成 | store/assets/store-icon-128.png |
| Screenshot 1 | 1280×800 PNG | 已生成：关系管理、标签备注 | store/assets/01-relationships-1280x800.png |
| Screenshot 2 | 1280×800 PNG | 已生成：未回关我的 | store/assets/02-not-following-back-1280x800.png |
| Screenshot 3 | 1280×800 PNG | 已生成：我未回关的 | store/assets/03-not-followed-back-1280x800.png |
| Small Promo Tile | 440×280 PNG | 已生成 | store/assets/small-promo-440x280.png |
| Marquee Promo | 1400×560 PNG | 已生成 | store/assets/marquee-1400x560.png |

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| sidePanel | permissions | Show a persistent progress panel beside X with readable text, collected user counts, recent profiles and a stop button while the X page is temporarily zoomed out. |
| storage | permissions | Save relationship lists, profile text and avatar URLs, notes/tags, ignored settings, follower snapshots and scan summaries locally. Retain active scan progress in session storage; no records are sent to the developer. |
| scripting | permissions | After a user starts a scan, read rendered cards and scroll the matching X list, and read public profile counts from a temporary profile tab. No follow, unfollow or message actions are submitted. |
| https://x.com/* | host_permissions | Open the requested follower and following lists on X and run the scanner after the user starts a task. Also prefill the account name from an X profile page when the user opens the popup. |
| https://www.x.com/* | host_permissions | Support X pages opened on the www hostname for the same user-requested scanning and account-name prefill features. |

0.2.0 移除 activeTab，增加范围限定为 X 的页面访问权限。无全站权限、无需 cookies / identity / tabs 权限。

0.2.1 权限范围不变。X 域页面加载后运行轻量就绪通知脚本；无用户发起的活动任务时，不读取卡片或滚动。扫描启动时检查权限并在用户点击后请求恢复被收回的 X 域权限。真正的扫描脚本只注入匹配任务的文档 ID，避免对临时空白页或登录页面启动扫描。

## Privacy & Data Use

### 后台数据类别填写依据

本机处理仍属于数据处理，不应申报为「完全不处理任何用户数据」。公开用户名、昵称及可能包含个人信息的简介/用户手写备注需按后台实际定义核对 Personally identifiable information；公开资料和关系名单对应 Website content；扫描目标、计数和时间摘要需核对 User activity。凭据、私信及无关浏览历史不读取。不能因为不向开发者上传，就隐瞒扩展本机保存和处理的资料。用户自行写入的文本可能包含其他类别的信息，扩展不针对其进行画像。

Remote code: No. All executable code is bundled locally. Public avatar URLs are image resources, not remotely executed code.

本地处理用户数据：是。上传给开发者或开发者服务器：否。无分析遥测。

| Data type | Local processing | Off-device transmission | Purpose | Shared with third parties |
|---|---|---|---|---|
| Usernames / display names | 是 | 不由扩展上传 | 整理关注与粉丝名单 | 否 |
| Profile biographies and avatar URLs | 是 | 显示头像时向 X 图片服务器请求图片；不上传简介给开发者 | 展示用户资料及搜索 | 不向开发者或其他第三方分享 |
| Website content: relationship list membership | 是 | 不由扩展上传 | 关系分析及快照差集 | 否 |
| User activity: scan target and counters | 当前浏览器会话内 | 不由扩展上传 | 扫描进度及停止操作 | 否 |
| User-entered notes and tags | 是 | 不由扩展上传 | 用户整理关系 | 否 |
| Passwords / cookies / authentication tokens | 不读取 | 无 | 不适用 | 否 |
| Health / financial / private messages / precise location | 不读取 | 无 | 不适用 | 否 |

用户主动扫描或打开个人主页时，浏览器会正常访问 X 并请求页面；该访问受 X 自身政策约束。用户主动导出的 CSV / JSON 是本地文件，由用户自行保存和分享。

- 数据不出售给第三方。
- 数据仅用于此扩展的关注关系管理功能。
- 数据不用于信用评级或借贷。

## Privacy Policy

Privacy Policy: docs/privacy.md；可托管网页 docs/privacy.html。

Privacy Policy URL: https://layman369.github.io/x-relationship-notebook/privacy.html

状态：2026-10-18 已开启GitHub Pages，部署源master分支/docs；已验证HTTP 200、政策正文及联系邮箱。

## Distribution

Visibility / Regions: 2026-10-21提交时设置为免费、公开、所有地区。建议免费、公开、简体中文为主；地区待后台选择，Chrome与Edge分别提交。

## 审核步骤与材料状态

完整审核指南：store/REVIEWER-GUIDE.md（含英文摘要）。审核样例为store/example-backups/内两份完全虚构的JSON，不在扩展运行包中；只在独立测试浏览器配置文件恢复。新安装扩展无预置账号。

素材来自当前界面的独立网页预览，标明虚构示例数据，不宣称是真实X扫描记录。只规范输出尺寸与格式，不增添产品不存在的功能。图标为原创关系笔记本图形，源码icons/source.svg，不使用X官方标识。

发布进度：开发者账号、商品详情、地区及隐私申报已完成，2026-10-21已提交Chrome商店审核；尚未获得审核通过。真实Chrome/Edge登录X的扫描、停止、缩放恢复和原生侧边栏验收仍需实测，不因提交审核视为已完成。资料使用方法见store/PUBLISHING-GUIDE.md。

### English listing copy (optional locale)

X Relationship Notebook helps you manage accessible X follower and following lists locally. Review mutual connections and missing follow-backs in either direction; search biographies, add tags and notes, manage ignored users, paginate lists and export filtered CSV results.

Start a user-requested scan from the extension. A readable side panel shows counts, estimated progress, remaining time and a stop control while the scan tab is temporarily zoomed out. Results require manual completeness verification and may be affected by inaccessible accounts, rate limits, virtualized lists and site changes.

Compare current records with an earlier Notebook JSON backup. Matching negative relationships at both observations display an integer day interval with green/yellow/red indicators. This is an observation interval, not an exact follow date or proof of an uninterrupted relationship. Complete follower snapshots can show names added or missing between records, without proving why a name disappeared.

Records and notes are not uploaded to the developer. X page visits and avatar image requests to X servers still occur. No ads, analytics, automatic follow/unfollow actions or messages. This independent project is not affiliated with X Corp. Support: https://github.com/layman369/x-relationship-notebook/issues . Contact: 1917931073x@gmail.com .

## Developer Info

Publisher Name: layman369

Contact Email: 1917931073x@gmail.com（用户已确认拟公开）

Support URL: https://github.com/layman369/x-relationship-notebook/issues

Homepage URL: https://github.com/layman369/x-relationship-notebook

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.12.0 | 2026-10-18 | 补齐商店材料、原创图标、政策及审核步骤；运行包排除文档并保留图标目录 | Submitted 2026-10-21 |
| 0.11.1 | 2026-10-18 | 双向未回关时间对比，整数 day 标签 | Draft |
| 0.11.0 | 2026-10-18 | 历史备份对比与颜色提示 | Draft |
| 0.10.5 | 2026-10-18 | 侧边栏增加分类人数，与卡片同步；菜单字号和间距缩小 | Draft |
| 0.10.4 | 2026-10-18 | 扫描对比详情默认展开，并在数据刷新时保持手动收起状态 | Draft |
| 0.10.3 | 2026-10-18 | 关系总览返回页顶，右下角新增回到顶部图标，支持键盘与减少动态效果，权限不变 | Draft |
| 0.10.2 | 2026-10-18 | 移除可见页尾状态栏；分类定位至统计卡片，统计区与完整表格同屏适配，权限不变 | Draft |
| 0.10.1 | 2026-10-18 | 紧凑卡片及工具栏、窗口自适应表格、两行简介与可折叠扫描详情；备份恢复移至更新时间卡片，权限不变 | Draft |
| 0.10.0 | 2026-10-18 | 持久保存扫描用时、主页人数与实际采集人数，最近30次摘要、对比展示及备份恢复；权限不变 | Draft |
| 0.9.1 | 2026-10-18 | 精简为标签备注列头的已有标签选择，移除独立筛选栏，保留单元格编辑；权限不变 | Draft |
| 0.9.0 | 2026-10-18 | 标签备注组合筛选及单元格点击编辑，分页导出同步筛选；权限不变 | Draft |
| 0.8.2 | 2026-10-18 | 备份文件名加入本地导出时间，精确到秒；数据格式与权限不变 | Draft |
| 0.8.1 | 2026-10-18 | 临时后台主页读取关注/粉丝总数，区分精确值与缩写估算，超时回退与任务清理；权限不变 | Draft |
| 0.8.0 | 2026-10-18 | 自适应等待及滚动步长，加载降速、底部重叠补扫与真实时间结束阈值，停止立即中断等待；权限不变 | Draft |
| 0.7.0 | 2026-10-18 | 增量卡片解析、事件合并、批量保存与界面刷新限频，滚动参数及权限不变 | Draft |
| 0.6.3 | 2026-10-18 | 分类及卡片点击后自动定位内容区，支持键盘焦点和减少动态效果，权限不变 | Draft |
| 0.6.2 | 2026-10-18 | 管理台字号、字重和对比度优化，扩大资料列，优化长简介阅读；权限不变 | Draft |
| 0.6.1 | 2026-10-18 | 修复列表滚动时表头上沿内容穿透；表头与工具栏背景遮挡、滚动绘制边界优化，权限不变 | Draft |
| 0.6.0 | 2026-10-18 | 移除页面浮层；侧栏增加进度条、当前名单百分比与时间预估，未知总数及停滞状态明确提示；权限不变 | Draft |
| 0.5.4 | 2026-10-18 | 修复可点击用户卡片简介漏采，以及缺字段批次清空已知简介和头像；新增回归测试，权限不变 | Draft |
| 0.5.3 | 2026-10-18 | 添加账号改用统一样式对话框，行内校验及键盘操作，权限不变 | Draft |
| 0.5.2 | 2026-10-18 | 突出呈现当前账号数据更新时间及两份名单各自的写入时间，权限不变 | Draft |
| 0.5.1 | 2026-10-18 | 六张统计卡片与左侧分类的名称、顺序和数量一致，补齐我未回关的；响应式布局，权限不变 | Draft |
| 0.5.0 | 2026-10-18 | 新增头像链接与简介采集、列表及侧栏展示、简介搜索展开、导出和备份；图片失效回退；权限不变，更新截图 | Draft |
| 0.4.3 | 2026-10-18 | 统计区新增可点击的已忽略用户卡片与人数提示，响应式五卡片布局；截图需更新，权限不变 | Draft |
| 0.4.2 | 2026-10-18 | 新增已忽略用户管理页签、人数提示、搜索分页及取消忽略；支持管理不在最新名单中的已忽略用户；权限不变 | Draft |
| 0.4.1 | 2026-10-18 | 用户忽略及取消忽略；按账号保存的忽略过滤开关；统计、列表、导出及变化展示同步过滤，权限不变 | Draft |
| 0.4.0 | 2026-10-18 | 统计卡片可点击筛选；20/50/100/200 条分页及页码跳转；固定高度卡片内滚动；更新列表截图，权限不变 | Draft |
| 0.3.1 | 2026-10-18 | 移除内置演示入口及虚构数据生成代码，一次性清理旧演示账号并保留其他账号数据；截图需更新 | Draft |
| 0.3.0 | 2026-10-18 | 默认 25% 扫描；新增正常字号侧边栏、实时人数与最近用户；新增 sidePanel 权限；截图需更新 | Draft |
| 0.2.2 | 2026-10-18 | 可选扫描缩放比例，默认 50%，单标签页临时缩放及结束恢复；权限范围不变；扫描设置截图需更新 | Draft |
| 0.2.1 | 2026-10-18 | 修复空白页误触发注入；目标文档就绪握手与 ID 校验；增加 X 权限检查及恢复入口 | Draft |
| 0.2.0 | 2026-10-18 | 一键双名单扫描、进度与停止、会话任务状态、串行增量保存；新增 X 域权限 | Draft |
| 0.1.0 | 2026-10-18 | 分段采集、导入、关系分析与粉丝快照 | Draft |

## Review Notes

真实 X 页面扫描与 Chrome/Edge 加载兼容性仍待验收。模拟环境测试不能作为完整列表采集证明。单份达到底部后仍标记部分列表，必须由用户核对确认完整；列表裁剪、推荐卡片、网络限流和改名均可能影响分析。不支持回溯历史取关或识别改名后的稳定用户身份。

安装包采用白名单打包，排除 .git、测试、CHROMEWEBSTORE.md、演示截图和环境文件。

0.3.0 侧边栏不跟随 X 页面缩放；启动任务时打开，另有独立的打开入口，关闭后任务仍继续。默认在浏览器右侧，实际位置由浏览器偏好决定。展示的数据与已有本机名单相同，不新增远程传输。原生侧边栏打开及 X 实际采集待真实浏览器验收。

0.4.0 用户可点击统计卡片查看对应名单，通过分页浏览所有结果。每页可选 20、50、100 或 200 条；列表内部滚动，表头和翻页入口持续可见，搜索和导出仍作用于完整筛选结果。

0.4.1 用户可忽略指定账号，并切换是否在统计、名单、导出和变化结果中隐藏。忽略设置只保存在本机，与现有备份一起导入导出；原始采集名单和快照不因忽略而删除。新增忽略设置截图待更新。

0.5.0 用户列表及右侧进度面板显示采集到的头像和简介；简介保存为本机纯文本，头像保留公开的 X 图片链接。显示头像时向 pbs.twimg.com 发起图片请求，不携带页面来源信息，不使用第三方头像服务。加载失败显示本地文字占位。资料字段兼容旧备份，并随用户主动导出写入本地 CSV/JSON 文件。


## GitHub 分发记录

2026-10-19 已发布 GitHub Release v0.12.0：https://github.com/layman369/x-relationship-notebook/releases/tag/v0.12.0 。附件为运行 ZIP 与 SHA256SUMS.txt，公开下载后校验通过。该状态仅指 GitHub 分发，不表示已提交或通过 Chrome / Edge 商店审核。


## Chrome提交进度（2026-10-21）

- 项目ID：ggpjbpcpkibjljfejghmencldcplnole。
- 管理入口：https://chrome.google.com/webstore/devconsole/04cf1799-11cd-40e1-a01b-38c6d6a92881/ggpjbpcpkibjljfejghmencldcplnole/edit/listing
- 初次上传因账号缺少两步验证被拒；用户启用后重试成功，0.12.0运行ZIP已上传。
- 商品详情已保存并刷新核对：介绍752字符，社交分类，中文（中国），原创图标、三张截图、小型及顶部宣传图；主页和支持链接已填写。
- 隐私权已保存并复核：单一用途、storage/scripting/sidePanel/主机权限理由、无远程代码；勾选个人身份信息、用户活动、网站内容以及三项有限用途声明；未声明读取身份验证信息、私信、位置或无关浏览历史。政策链接为已上线地址。
- 测试说明294字符，已保存；凭据留空，因为扩展无开发者登录，真实扫描由审核员使用获准使用的X账号测试。
- 分发保留后台设置：免费、公开、所有地区。账号原有非交易者声明保持不变。
- 发布者名称保存为layman369；联系邮箱1917931073x@gmail.com已完成验证，后台确认通过。
- 已点击最终提交审核，后台明确显示“已将您的扩展程序提交送审”，状态为“待审核”；选择审核通过后自动发布，当前尚未公开上架。
- 提交成功截图：artifacts/store-submitted-0.12.0.jpg。
