$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = Join-Path $repoRoot 'server_upload'

if (-not (Test-Path -LiteralPath $targetRoot)) {
  New-Item -ItemType Directory -Path $targetRoot | Out-Null
}

$filesToCopy = @(
  '.env',
  '.env.example',
  '.gitignore',
  'favicon.ico',
  'package.json',
  'package-lock.json',
  'README.md'
)

$dirsToMirror = @(
  'deploy',
  'dist',
  'keys',
  'prisma',
  'public',
  'src',
  'test',
  'web'
)

function Copy-DirectoryContents {
  param(
    [string]$SourcePath,
    [string]$TargetPath,
    [string[]]$ExcludeNames = @()
  )

  if (Test-Path -LiteralPath $TargetPath) {
    Remove-Item -LiteralPath $TargetPath -Recurse -Force
  }

  New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null

  Get-ChildItem -LiteralPath $SourcePath -Force | Where-Object {
    $_.Name -notin $ExcludeNames
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $TargetPath -Recurse -Force
  }
}

foreach ($relativePath in $filesToCopy) {
  $sourcePath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    continue
  }

  $targetPath = Join-Path $targetRoot $relativePath
  $targetDir = Split-Path -Parent $targetPath
  if ($targetDir -and -not (Test-Path -LiteralPath $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

foreach ($relativePath in $dirsToMirror) {
  $sourcePath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    continue
  }

  $targetPath = Join-Path $targetRoot $relativePath
  if ($relativePath -eq 'web') {
    Copy-DirectoryContents -SourcePath $sourcePath -TargetPath $targetPath -ExcludeNames @('node_modules', '.vscode')
    continue
  }

  if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetRoot -Recurse -Force
}

Write-Output "Synchronized server_upload from $repoRoot"
