# 发布资料使用说明

资料日期：2026-10-18；版本：0.12.0。状态：本地资料已准备，未提交商店，隐私政策尚未公开托管。

## 两个包的用途

- `dist/x-relationship-notebook-0.12.0.zip`：扩展运行包，上传浏览器扩展商店。
- `dist/x-relationship-notebook-store-materials-0.12.0.zip`：发布者自用资料包，包含文案、隐私政策、图片和审核说明，不是扩展安装包。

## 填表与图片

`CHROMEWEBSTORE.md` 是资料总表，含名称、介绍、单一用途、权限理由、数据申报依据及开发者信息。发布者为 layman369，联系邮箱为用户确认的 1917931073x@gmail.com，支持地址为 https://github.com/layman369/x-relationship-notebook/issues 。

`store/assets/` 包含商店图标、三张1280×800截图、440×280宣传图和1400×560宣传图。截图来自当前界面的独立网页预览，明确标注虚构示例数据，仅规范尺寸和文件格式，不增加不存在的功能。头像为本地文字占位，不构成真实 X 扫描验收证据。

重现示例：运行 `node scripts/store-preview.mjs`，访问 `http://127.0.0.1:4174/app.html?view=following`，或将 view 改为 notBack / fansOnly。示例只使用内存，不读取或修改已安装扩展的用户记录；关闭服务后丢弃更改。新安装不包含示例数据。

## 隐私网页上线（本次尚未执行）

1. 将 docs/ 内的文件随源码提交至项目 GitHub 仓库。
2. 仓库 Settings → Pages 选择从 master 分支的 /docs 目录部署。
3. 部署完成后，验证 `https://layman369.github.io/x-relationship-notebook/privacy.html` 可公开访问且显示实际政策，再填写商店隐私政策 URL。
4. 当前地址只是计划地址，不应宣称已上线。

## 提交前剩余事项

在独立浏览器配置文件完成真实 Chrome / Edge 登录 X 的扫描、停止、缩放恢复与原生侧边栏验收；注册商店开发者账号并按后台要求完成验证；核对隐私申报；上传运行包与素材并提交审核。后台要求可能变化，以实际字段为准。

审核步骤见 REVIEWER-GUIDE.md。两份 example-backups JSON 是完全虚构样例，只能在独立测试配置文件恢复，不包含在运行包里。通过后台允许的方式提供给审核员，不共享真实 X 凭据。

## 官方参考

- [Chrome 注册](https://developer.chrome.com/docs/webstore/register)
- [Chrome 发布](https://developer.chrome.com/docs/webstore/publish)
- [Chrome 图片](https://developer.chrome.com/docs/webstore/images)
- [Chrome 用户数据](https://developer.chrome.com/docs/webstore/user_data)
- [Edge 注册](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)
- [Edge 发布](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)

不要在公开 Issues 上传真实关系备份、私人备注或账号凭据。隐私问题可直接联系上述邮箱。
