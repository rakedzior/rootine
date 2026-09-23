param(
    [ValidatePattern('^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$')]
    [string]$Mac,
    [ValidateSet('Check', 'Screenshot', 'Preview', 'Current', 'TestAccount')]
    [string]$Action = 'Screenshot',
    [string]$IdentityFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $Mac) {
    $configPath = Join-Path $repoRoot '.local/ios-remote.json'
    if (-not (Test-Path -LiteralPath $configPath)) {
        throw 'Supply -Mac user@address or configure .local/ios-remote.json with a mac field.'
    }
    $Mac = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).mac
    if ($Mac -notmatch '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$') {
        throw 'Invalid mac address in .local/ios-remote.json.'
    }
}
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new')
if ($IdentityFile) {
    $sshOptions += @('-i', (Resolve-Path -LiteralPath $IdentityFile).Path, '-o', 'IdentitiesOnly=yes')
}

function Assert-Exit([string]$Operation) {
    if ($LASTEXITCODE -ne 0) { throw "$Operation failed (exit $LASTEXITCODE)." }
}

# Check the selected Xcode rather than silently changing the Mac's developer tools.
& ssh @sshOptions $Mac 'set -eu; sw_vers; xcode-select -p; xcodebuild -version; python3 --version; xcrun simctl list devices available'
Assert-Exit 'Mac toolchain check'
if ($Action -eq 'Check') { return }

$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$localRun = Join-Path $repoRoot "output/ios-remote/$stamp"
New-Item -ItemType Directory -Path $localRun -Force | Out-Null
$archive = Join-Path $localRun 'source.tar.gz'
$fileList = Join-Path $localRun 'files.txt'
# Transfer the actual Windows working tree, including new source files, without a commit/push.
# Git's ignore rules exclude credentials, build products and local Xcode settings.
Push-Location $repoRoot
try {
    $files = @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard -- ios contracts scripts/ios-screenshot.py)
    Assert-Exit 'Source inventory'
    $files = @($files | Sort-Object -Unique | Where-Object {
        $_ -notmatch '(^|/)(Secrets\.xcconfig|DerivedData|xcuserdata)(/|$)' -and
        (Test-Path -LiteralPath (Join-Path $repoRoot $_) -PathType Leaf)
    })
    if ($files.Count -eq 0) { throw 'No iOS source files found.' }
    [IO.File]::WriteAllLines($fileList, $files, (New-Object Text.UTF8Encoding($false)))
    & tar -czf $archive -T $fileList
    Assert-Exit 'Source archive'
    $revision = & git rev-parse HEAD
    Assert-Exit 'Source revision'
    $changes = @(& git status --porcelain -- ios contracts scripts/ios-screenshot.py)
    Assert-Exit 'Source status'
    @{
        captured_from = 'Windows working tree'
        commit = $revision
        source_changes = $changes
        archive_sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
        mac = $Mac
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $localRun 'source.json') -Encoding UTF8
} finally {
    Pop-Location
}

# Each build gets its own folder; never overwrite or delete the user's Mac checkout.
$remoteRun = "RootineRemote/runs/$stamp"
& ssh @sshOptions $Mac "mkdir -p '$remoteRun'"
Assert-Exit 'Remote build directory'
& scp @sshOptions $archive "${Mac}:$remoteRun/source.tar.gz"
Assert-Exit 'Source upload'
$captureArgs = '--name welcome'
$configure = ''
if ($Action -eq 'Preview') {
    $captureArgs = '--preview --name preview'
    $configure = 'test -s ../../config/Secrets.xcconfig; cp ../../config/Secrets.xcconfig ios/Rootine/Config/Secrets.xcconfig; '
} elseif ($Action -eq 'TestAccount') {
    $captureArgs = '--preview --test-account --name test-account'
} elseif ($Action -eq 'Current') {
    $captureArgs = '--preview --current --name current'
}
$remoteCommand = "set -eu; cd '$remoteRun'; { tar -xzf source.tar.gz; ${configure}python3 scripts/ios-screenshot.py $captureArgs; } > build.log 2>&1"
& ssh @sshOptions $Mac $remoteCommand
$buildExit = $LASTEXITCODE
& scp @sshOptions "${Mac}:$remoteRun/build.log" (Join-Path $localRun 'build.log')
Assert-Exit 'Build log download'
if ($buildExit -ne 0) {
    throw "iOS build/capture failed (exit $buildExit). See $localRun/build.log"
}
& scp @sshOptions -r "${Mac}:$remoteRun/output/ios" $localRun
Assert-Exit 'Screenshot download'
Write-Host "Screenshots and build log: $localRun"
Write-Host "Mac build files retained at: ~/$remoteRun"
