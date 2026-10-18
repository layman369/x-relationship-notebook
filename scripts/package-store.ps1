$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
& (Join-Path $PSScriptRoot 'package.ps1')
$relativeFiles = @('CHROMEWEBSTORE.md', 'README.md')
foreach ($folder in @('store', 'docs', 'icons')) {
  $relativeFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File -Recurse | ForEach-Object {
    $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
  }
}
$archivePath = Join-Path $projectRoot "dist/x-relationship-notebook-store-materials-$($manifest.version).zip"
$extensionPath = Join-Path $projectRoot "dist/x-relationship-notebook-$($manifest.version).zip"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
$zip = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in $relativeFiles) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $projectRoot $relativePath), $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $extensionPath, "extension/x-relationship-notebook-$($manifest.version).zip", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally { $zip.Dispose() }
Get-Item -LiteralPath $archivePath | Select-Object FullName,Length
