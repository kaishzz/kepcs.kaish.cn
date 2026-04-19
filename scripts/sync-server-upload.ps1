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
  if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetRoot -Recurse -Force
}

Write-Output "Synchronized server_upload from $repoRoot"
