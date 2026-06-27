param(
  [string]$ArtifactZip,
  [string]$Server,
  [string]$User,
  [string]$RemotePath
)

$ErrorActionPreference = "Stop"

$defaultServer = $env:OPENCLAW_UPLOAD_SERVER
$defaultUser = $env:OPENCLAW_UPLOAD_USER

function ConvertTo-ShellSingleQuoted([string]$Value) {
  $quote = [char]39
  return $quote + $Value.Replace([string]$quote, "$quote`"$quote`"$quote") + $quote
}

function Read-RequiredInput([string]$Prompt) {
  $value = Read-Host $Prompt
  if (-not $value.Trim()) {
    throw "$Prompt is required."
  }
  return $value.Trim('" ')
}

Write-Host "OpenClaw plugin upload"
Write-Host ""

if (-not $ArtifactZip) {
  $ArtifactZip = Read-RequiredInput "Path file zip to upload"
}

if (-not $Server) {
  if ($defaultServer) {
    $inputServer = Read-Host "IP/host server [$defaultServer]"
    $Server = if ($inputServer.Trim()) { $inputServer.Trim() } else { $defaultServer }
  } else {
    $Server = Read-RequiredInput "IP/host server"
  }
}

if (-not $User) {
  if ($defaultUser) {
    $inputUser = Read-Host "SSH user [$defaultUser]"
    $User = if ($inputUser.Trim()) { $inputUser.Trim() } else { $defaultUser }
  } else {
    $User = Read-RequiredInput "SSH user"
  }
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

$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("openclaw-plugin-upload-" + [System.Guid]::NewGuid().ToString("N"))
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
    throw "openclaw.plugin.json not found in artifact zip. Are you using an OpenClaw plugin artifact?"
  }

  $pluginRoot = $manifest.Directory.FullName
  $manifestJson = Get-Content -Raw -LiteralPath $manifest.FullName | ConvertFrom-Json
  $pluginId = $manifestJson.id
  if (-not $pluginId) {
    throw "openclaw.plugin.json is missing id."
  }
  $safePluginId = $pluginId -replace "[^A-Za-z0-9._-]", "-"

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

  if (-not $RemotePath) {
    $defaultRemotePath = "/opt/appdata/openclaw/plugin/$pluginId/plugin"
    $inputRemotePath = Read-Host "Remote plugin path [$defaultRemotePath]"
    $RemotePath = if ($inputRemotePath.Trim()) { $inputRemotePath.Trim() } else { $defaultRemotePath }
  }

  if (-not $RemotePath.StartsWith("/opt/appdata/openclaw/plugin/")) {
    throw "RemotePath must be under /opt/appdata/openclaw/plugin/ when using sudo upload: $RemotePath"
  }

  Copy-Item -Path (Join-Path $pluginRoot "*") -Destination $stagingRoot -Recurse -Force

  $target = "${User}@${Server}"
  $remoteStaging = "/tmp/openclaw-plugin-upload-$safePluginId-" + [System.Guid]::NewGuid().ToString("N")
  $remoteStagingQ = ConvertTo-ShellSingleQuoted $remoteStaging
  $remotePathQ = ConvertTo-ShellSingleQuoted $RemotePath

  Write-Host ""
  Write-Host "Plugin: $pluginId"
  Write-Host "If SSH does not use a saved key, Windows will ask for the password below."
  Write-Host "Remote staging folder: ${target}:${remoteStaging}"

  Write-Host ""
  Write-Host "Uploading plugin to staging folder..."
  & scp -r $stagingRoot "${target}:${remoteStaging}"

  if ($LASTEXITCODE -ne 0) {
    throw "scp failed with exit code $LASTEXITCODE"
  }

  Write-Host ""
  Write-Host "Installing plugin to ${target}:${RemotePath} with sudo..."
  $installCommand = "sudo mkdir -p $remotePathQ && sudo find $remotePathQ -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && sudo cp -a $remoteStagingQ/. $remotePathQ/ && rm -rf $remoteStagingQ"
  & ssh -t $target $installCommand

  if ($LASTEXITCODE -ne 0) {
    throw "sudo install failed with exit code $LASTEXITCODE"
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
