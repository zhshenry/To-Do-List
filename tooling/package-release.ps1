param(
  [ValidateSet('Portable', 'All')]
  [string]$Mode = 'Portable'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))
$releasePrefix = $releaseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$version = $package.version

function Resolve-ReleaseTarget([string]$Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Release target is outside the release directory: $fullPath"
  }
  return $fullPath
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '') }
    finally { $algorithm.Dispose() }
  } finally { $stream.Dispose() }
}

$portableRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'portable')
$installerRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'installer')
$archiveRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'archive')
$metadataRoot = Resolve-ReleaseTarget (Join-Path $releaseRoot 'metadata')
New-Item -ItemType Directory -Force -Path $portableRoot, $installerRoot, $archiveRoot, $metadataRoot | Out-Null

foreach ($artifact in Get-ChildItem -LiteralPath $portableRoot) {
  $artifactVersion = $null
  if ($artifact.Name -match '^To Do List (?<version>.+) Portable$') { $artifactVersion = $Matches.version }
  elseif ($artifact.Name -match '^To Do List-(?<version>.+)-Windows-x64-Portable\.zip$') { $artifactVersion = $Matches.version }
  if ($artifactVersion -and $artifactVersion -ne $version) {
    $oldRoot = Resolve-ReleaseTarget (Join-Path (Join-Path $archiveRoot $artifactVersion) 'portable')
    New-Item -ItemType Directory -Force -Path $oldRoot | Out-Null
    try {
      Move-Item -LiteralPath $artifact.FullName -Destination (Join-Path $oldRoot $artifact.Name) -Force
    } catch {
      Write-Warning "Old portable release is still running and was left in place: $($artifact.FullName)"
    }
  }
}

foreach ($artifact in Get-ChildItem -LiteralPath $installerRoot -File) {
  if ($artifact.Name -match '^To Do List Setup-(?<version>.+)-x64(?:\.exe|\.exe\.blockmap)$' -and $Matches.version -ne $version) {
    $oldRoot = Resolve-ReleaseTarget (Join-Path (Join-Path $archiveRoot $Matches.version) 'installer')
    New-Item -ItemType Directory -Force -Path $oldRoot | Out-Null
    Move-Item -LiteralPath $artifact.FullName -Destination (Join-Path $oldRoot $artifact.Name) -Force
  }
}

$unpacked = Resolve-ReleaseTarget (Join-Path $releaseRoot 'win-unpacked')
$portableDirectory = Resolve-ReleaseTarget (Join-Path $portableRoot "To Do List $version Portable")
$portableZip = Resolve-ReleaseTarget (Join-Path $portableRoot "To Do List-$version-Windows-x64-Portable.zip")
if (Test-Path -LiteralPath (Join-Path $unpacked 'To Do List.exe')) {
  if (Test-Path -LiteralPath $portableDirectory) { Remove-Item -LiteralPath $portableDirectory -Recurse -Force }
  if (Test-Path -LiteralPath $portableZip) { Remove-Item -LiteralPath $portableZip -Force }
  Move-Item -LiteralPath $unpacked -Destination $portableDirectory
  Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $portableDirectory 'README.txt')
  Compress-Archive -LiteralPath $portableDirectory -DestinationPath $portableZip -CompressionLevel Optimal
} elseif (Test-Path -LiteralPath (Join-Path $portableDirectory 'To Do List.exe')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $portableDirectory 'README.txt') -Force
  if (Test-Path -LiteralPath $portableZip) { Remove-Item -LiteralPath $portableZip -Force }
  Compress-Archive -LiteralPath $portableDirectory -DestinationPath $portableZip -CompressionLevel Optimal
} else {
  throw 'Missing both the Electron Builder output and an existing portable package.'
}

foreach ($artifact in Get-ChildItem -LiteralPath $releaseRoot -File) {
  if ($artifact.Name -like 'To-Do-List-Setup-0.1.0-*') {
    $oldRoot = Resolve-ReleaseTarget (Join-Path $archiveRoot '0.1.0')
    New-Item -ItemType Directory -Force -Path $oldRoot | Out-Null
    Move-Item -LiteralPath $artifact.FullName -Destination (Join-Path $oldRoot $artifact.Name) -Force
  } elseif ($artifact.Name -like 'To Do List Setup-*') {
    Move-Item -LiteralPath $artifact.FullName -Destination (Join-Path $installerRoot $artifact.Name) -Force
  } elseif ($artifact.Extension -eq '.yml') {
    Move-Item -LiteralPath $artifact.FullName -Destination (Join-Path $metadataRoot $artifact.Name) -Force
  }
}

Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\PORTABLE-README.txt') -Destination (Join-Path $releaseRoot 'README.txt') -Force
$hashFiles = @($portableZip)
$hashFiles += Get-ChildItem -LiteralPath $installerRoot -Filter '*.exe' | Select-Object -ExpandProperty FullName
$hashLines = foreach ($file in $hashFiles) {
  $relative = $file.Substring($releasePrefix.Length).Replace('\', '/')
  "$(Get-Sha256 $file) *$relative"
}
Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Value $hashLines -Encoding utf8

Write-Host "Default portable package: $portableZip"
if ($Mode -eq 'All') { Write-Host "Optional installer directory: $installerRoot" }
