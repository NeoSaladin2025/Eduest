$ErrorActionPreference = "Stop"

$fw = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fw "csc.exe"
$winmd = "C:\Windows\System32\WinMetadata"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$srcCs = Join-Path $PSScriptRoot "EduestPrinterBridge.cs"
$outDir = Join-Path $repoRoot "public\downloads"
$outExe = Join-Path $outDir "EduestPrinterBridge.exe"

if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

& $csc /nologo /optimize+ /target:winexe /out:$outExe `
  /r:"$fw\System.dll" `
  /r:"$fw\System.Core.dll" `
  /r:"$fw\System.Drawing.dll" `
  /r:"$fw\System.Windows.Forms.dll" `
  /r:"$fw\System.Runtime.dll" `
  /r:"$fw\System.Runtime.Serialization.dll" `
  /r:"$fw\System.Runtime.WindowsRuntime.dll" `
  /r:"$fw\System.Runtime.InteropServices.WindowsRuntime.dll" `
  /r:"$fw\System.Threading.Tasks.dll" `
  /r:"$winmd\Windows.Data.winmd" `
  /r:"$winmd\Windows.Foundation.winmd" `
  /r:"$winmd\Windows.Storage.winmd" `
  /r:"$winmd\Windows.UI.winmd" `
  $srcCs

if ($LASTEXITCODE -ne 0) {
  throw "EduestPrinterBridge.exe build failed with code $LASTEXITCODE"
}

Write-Host "Built successfully:" $outExe ((Get-Item $outExe).Length) "bytes"
