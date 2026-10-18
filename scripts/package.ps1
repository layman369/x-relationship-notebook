$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$outputFolder = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
$runtimeFiles = @('manifest.json','popup.html','popup.js','app.html','app.js','profile-ui.js','profile.css','list-view.js','list.css','core.js','storage.js','style.css','scan.css','scan-controls.js','scan-launch.js','progress-model.js','ui-refresh.js','scan-page.js','profile-counts.js','scan-ready.js','background.js','sidepanel.html','sidepanel.js','sidepanel.css','README.md')
$runtimePaths = $runtimeFiles | ForEach-Object { Join-Path $projectRoot $_ }
$archivePath = Join-Path $outputFolder "x-relationship-notebook-$($extensionManifest.version).zip"
Compress-Archive -LiteralPath $runtimePaths -DestinationPath $archivePath -Force
Get-Item -LiteralPath $archivePath | Select-Object FullName,Length
