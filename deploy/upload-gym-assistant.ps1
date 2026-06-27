param(
  [string]$ArtifactZip,
  [string]$Server,
  [string]$User,
  [string]$RemotePath
)

$ErrorActionPreference = "Stop"

$defaultArtifactZip = Join-Path $PSScriptRoot "gym-assistant-dist.zip"
$defaultServer = "10.242.73.159"
$defaultUser = "thanhdv"
$defaultRemotePath = "/opt/appdata/openclaw/plugin/gym/plugin"

Write-Host "Gym Assistant plugin upload"
Write-Host ""

if (-not $ArtifactZip) {
  $inputArtifactZip = Read-Host "Path file zip to upload [$defaultArtifactZip]"
  $ArtifactZip = if ($inputArtifactZip.Trim()) { $inputArtifactZip.Trim('" ') } else { $defaultArtifactZip }
}

if (-not $Server) {
  $inputServer = Read-Host "IP/host server [$defaultServer]"
  $Server = if ($inputServer.Trim()) { $inputServer.Trim() } else { $defaultServer }
}

if (-not $User) {
  $inputUser = Read-Host "SSH user [$defaultUser]"
  $User = if ($inputUser.Trim()) { $inputUser.Trim() } else { $defaultUser }
}

if (-not $RemotePath) {
  $inputRemotePath = Read-Host "Remote plugin path [$defaultRemotePath]"
  $RemotePath = if ($inputRemotePath.Trim()) { $inputRemotePath.Trim() } else { $defaultRemotePath }
}

if (-not (Test-Path -LiteralPath $ArtifactZip)) {
  throw "Artifact zip not found: $ArtifactZip"
}

$scp = Get-Command scp -ErrorAction SilentlyContinue
if (-not $scp) {
  throw "scp not found. Install or enable OpenSSH Client on Windows."
}

$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $ssh) {
  throw "ssh not found. Install or enable OpenSSH Client on Windows."
}

$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("gym-assistant-upload-" + [System.Guid]::NewGuid().ToString("N"))
$extractRoot = Join-Path $workRoot "artifact"
$stagingRoot = Join-Path $workRoot "staging"

New-Item -ItemType Directory -Path $extractRoot, $stagingRoot | Out-Null

try {
  Write-Host ""
  Write-Host "Extracting artifact to temp folder..."
  Expand-Archive -LiteralPath $ArtifactZip -DestinationPath $extractRoot -Force

  $manifest = Get-ChildItem -Path $extractRoot -Filter "openclaw.plugin.json" -Recurse -File |
    Select-Object -First 1

  if (-not $manifest) {
    throw "openclaw.plugin.json not found in artifact zip. Are you using the gym-assistant-dist artifact?"
  }

  $pluginRoot = $manifest.Directory.FullName
  $requiredPaths = @(
    (Join-Path $pluginRoot "dist"),
    (Join-Path $pluginRoot "package.json"),
    (Join-Path $pluginRoot "openclaw.plugin.json")
  )

  foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "Artifact is missing required plugin file/folder: $requiredPath"
    }
  }

  Copy-Item -Path (Join-Path $pluginRoot "*") -Destination $stagingRoot -Recurse -Force

  $target = "${User}@${Server}"
  Write-Host ""
  Write-Host "If SSH does not use a saved key, Windows will ask for the password below."
  Write-Host "Ensuring remote plugin folder exists: ${target}:${RemotePath}"
  & ssh $target "mkdir -p '$RemotePath'"
  if ($LASTEXITCODE -ne 0) {
    throw "ssh mkdir failed with exit code $LASTEXITCODE"
  }

  Write-Host ""
  Write-Host "Uploading gym assistant plugin to ${target}:${RemotePath}"
  & scp -r (Join-Path $stagingRoot "*") "${target}:${RemotePath}/"

  if ($LASTEXITCODE -ne 0) {
    throw "scp failed with exit code $LASTEXITCODE"
  }

  Write-Host ""
  Write-Host "Upload complete."
}
finally {
  if (Test-Path -LiteralPath $workRoot) {
    Write-Host ""
    Write-Host "Cleaning temp folder..."
    Remove-Item -LiteralPath $workRoot -Recurse -Force
  }
  Write-Host "Done."
}
