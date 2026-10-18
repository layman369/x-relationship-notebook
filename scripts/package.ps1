$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$outputFolder = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
$runtimeFiles = @('manifest.json','popup.html','popup.js','app.html','app.js','profile-ui.js','profile.css','list-view.js','list.css','core.js','storage.js','style.css','scan.css','scan-controls.js','scan-launch.js','progress-model.js','ui-refresh.js','scan-page.js','profile-counts.js','scan-ready.js','background.js','sidepanel.html','sidepanel.js','sidepanel.css','icons/icon-16.png','icons/icon-32.png','icons/icon-48.png','icons/icon-128.png')
$archivePath = Join-Path $outputFolder "x-relationship-notebook-$($extensionManifest.version).zip"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
$zip = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in $runtimeFiles) {
    $source = Join-Path $projectRoot $relativePath
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $source, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
Get-Item -LiteralPath $archivePath | Select-Object FullName,Length
