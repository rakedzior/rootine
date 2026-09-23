param(
    [ValidatePattern('^[a-zA-Z0-9_][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$')][string]$Mac,
    [ValidatePattern('^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')]
    [string]$Device = '0DD46927-6D07-493E-BD3E-7EEDEF491BDD',
    [string]$IdentityFile
)
# Windows owns source; the Mac receives a disposable copy and only builds/runs it.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $Mac) {
    $config = Join-Path $repoRoot '.local/ios-remote.json'
    if (-not (Test-Path -LiteralPath $config)) { throw 'Supply -Mac user@address or configure .local/ios-remote.json.' }
    $Mac = (Get-Content -LiteralPath $config -Raw | ConvertFrom-Json).mac
}
if ($Mac -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$') { throw 'Invalid Mac SSH destination.' }
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new')
if ($IdentityFile) { $sshOptions += @('-i', (Resolve-Path -LiteralPath $IdentityFile).Path, '-o', 'IdentitiesOnly=yes') }
function Assert-Exit([string]$Operation) {
    if ($LASTEXITCODE -ne 0) { throw "$Operation failed (exit $LASTEXITCODE)." }
}
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$localRun = Join-Path $repoRoot "output/ios-spaces/$stamp"
$remoteRun = "RootineRemote/runs/$stamp"
New-Item -ItemType Directory -Path $localRun -Force | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$archive = Join-Path $localRun 'source.tar.gz'
$fileList = Join-Path $localRun 'files.txt'
Push-Location $repoRoot
try {
    $files = @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard -- ios contracts)
    Assert-Exit 'Source inventory'
    $files = @($files | Sort-Object -Unique | Where-Object {
        $_ -match '^(ios|contracts)/' -and
        $_ -notmatch '(?i)(^|/)(Secrets[^/]*\.xcconfig|DerivedData|xcuserdata|\.git|\.build|\.swiftpm|\.local|node_modules|build|output|\.env[^/]*)(/|$)' -and
        $_ -notmatch '(?i)\.(p8|p12|pem|key|mobileprovision)$' -and
        (Test-Path -LiteralPath (Join-Path $repoRoot $_) -PathType Leaf)
    })
    if (-not $files.Count) { throw 'No iOS source files found.' }
    [IO.File]::WriteAllLines($fileList, $files, $utf8)
    & tar -czf $archive -T $fileList
    Assert-Exit 'Source archive'
    $revision = & git rev-parse HEAD
    Assert-Exit 'Source revision'
    $changes = @(& git status --porcelain -- ios contracts)
    Assert-Exit 'Source status'
    @{ captured_from = 'Windows working tree'; commit = $revision; source_changes = $changes
       archive_sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash; mac = $Mac; device = $Device
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $localRun 'source.json') -Encoding UTF8
} finally { Pop-Location }
# Upload the literal program: no nested shell quoting or source changes on the Mac.
$runner = @'
import json, os, pathlib, plistlib, signal, subprocess, sys, tarfile, time, traceback
import xml.etree.ElementTree as ET

device = sys.argv[1]
out = pathlib.Path('artifacts')
out.mkdir(exist_ok=True)
results = pathlib.Path('results')  # Raw xcresult trees stay remote; deep staging paths exceed Windows limits.
results.mkdir(exist_ok=True)
test_runs = (('ui', 'RootineUITests/RemainingSpacesUITests', 3600), ('unit', 'RootineTests', 600))
status = {'test_exit': None, 'unit_test_exit': None, 'ui_test_exit': None,
          'build_exit': None, 'errors': [], 'screenshots': []}
original = {}
bundle = None
ready = False

def run(*args, capture=False, timeout=180):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, text=True, timeout=timeout,
                          stdout=subprocess.PIPE if capture else None).stdout

def logged(name, args, timeout=3600):
    with (out / name).open('w') as log:
        process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            return process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            log.write('\nCommand timed out.\n')
            return 124

def issue(label, error):
    status['errors'].append(label + ': ' + str(error))
    traceback.print_exc()

def launch(flag, capture=False):
    args = ['xcrun', 'simctl', 'launch', '--terminate-running-process', device, bundle,
            '-AppleLanguages', '(pl)', '-AppleLocale', 'pl_PL']
    if capture:
        args += ['-rootine.appearance', 'system']  # Temporary launch override, not a saved preference.
    run(*args, flag)

try:
    status['xcode'] = run('xcodebuild', '-version', capture=True).strip()
    listing = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json', capture=True))
    selected = next((d for group in listing['devices'].values() for d in group if d['udid'] == device), None)
    if selected is None:
        raise RuntimeError('The selected preview simulator is unavailable; no other device will be used.')
    if selected['state'] != 'Booted':
        run('xcrun', 'simctl', 'boot', device)
    run('xcrun', 'simctl', 'bootstatus', device, '-b', timeout=600)
    ready = True
    for setting in ('appearance', 'content_size'):
        original[setting] = run('xcrun', 'simctl', 'ui', device, setting, capture=True).strip()
    if original['appearance'] not in ('light', 'dark') or not original['content_size']:
        raise RuntimeError('Could not read simulator settings; refusing to change them.')
    scheme = pathlib.Path('ios/Rootine/Rootine.xcodeproj/xcshareddata/xcschemes/Rootine.xcscheme')
    tree = ET.parse(scheme)
    action = tree.getroot().find('TestAction')
    if action is None:
        raise RuntimeError('Rootine scheme has no TestAction.')
    action.set('selectedDebuggerIdentifier', '')
    action.set('selectedLauncherIdentifier', 'Xcode.IDEFoundation.Launcher.PosixSpawn')
    tree.write(scheme.with_name('RootineHeadless.xcscheme'), encoding='utf-8', xml_declaration=True)
    common = ['-project', 'ios/Rootine/Rootine.xcodeproj', '-scheme', 'RootineHeadless',
              '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,id=' + device,
              '-derivedDataPath', 'DerivedData', 'CODE_SIGNING_ALLOWED=NO']
    run('xcrun', 'simctl', 'ui', device, 'appearance', 'dark')
    run('xcrun', 'simctl', 'ui', device, 'content_size', 'large')
    # UI goes first: a later unit-test host stall must not prevent the UI attempt.
    for name, selector, timeout in test_runs:
        try:
            # Xcode 26's simulator launcher otherwise waits indefinitely for SIGCONT over SSH.
            # One invocation-scoped user default; no preference files or normal debug scheme changes.
            startup = ['-IDERunOperationLaunchesWithoutSuspendingCausingPossibleLossOfEarlyDiagnostics=YES'] if name == 'unit' else []
            status[name + '_test_exit'] = logged(name + '-tests.log', ['xcodebuild', 'test', *common, *startup,
                '-parallel-testing-enabled', 'NO', '-maximum-concurrent-test-simulator-destinations', '1',
                '-only-testing:' + selector, '-resultBundlePath', str(results / (name + '-tests.xcresult'))], timeout)
        except Exception as error:
            status[name + '_test_exit'] = 1
            issue(name + ' tests', error)
    status['test_exit'] = next((status[name + '_test_exit'] for name, _, _ in test_runs
                               if status[name + '_test_exit'] != 0), 0)
    # Build independently after testing: a failed test must not suppress review evidence.
    status['build_exit'] = logged('build.log', ['xcodebuild', 'build', *common])
    if status['build_exit'] == 0:
        app = pathlib.Path('DerivedData/Build/Products/Debug-iphonesimulator/Rootine.app')
        with (app / 'Info.plist').open('rb') as handle:
            bundle = plistlib.load(handle)['CFBundleIdentifier']
        run('xcrun', 'simctl', 'install', device, app)
        captures = out / 'captures'
        captures.mkdir(exist_ok=True)
        screens = [('nutrition', '--rootine-preview-nutrition'), ('more', '--rootine-preview-more')]
        screens += [(name, '--rootine-preview-module=' + name) for name in ('notes', 'sport', 'goals', 'work', 'travel', 'health', 'affairs')]
        cases = [(name, flag, 'dark', 'large') for name, flag in screens]
        cases += [(name, flag, 'light', 'large') for name, flag in screens[:2]]
        cases += [(name, flag, 'dark', 'extra-extra-extra-large') for name, flag in screens if name in ('nutrition', 'health')]
        for name, flag, appearance, size in cases:
            run('xcrun', 'simctl', 'ui', device, 'appearance', appearance)
            run('xcrun', 'simctl', 'ui', device, 'content_size', size)
            launch(flag, capture=True)
            time.sleep(6)  # Let the five-second offline notice clear; this is not a UI assertion.
            filename = name + '-' + appearance + '-' + size + '.png'
            run('xcrun', 'simctl', 'io', device, 'screenshot', captures / filename)
            caption = 'Spaces ' + name + ('' if appearance == 'dark' and size == 'large' else ' ' + appearance + ' ' + size)
            status['screenshots'].append({'exportedFileName': filename, 'suggestedHumanReadableName': caption})
except Exception as error:
    issue('Verification', error)
finally:
    # Valid failed test reports still contain useful attachments and must be exported.
    for name, _, _ in test_runs:
        result = results / (name + '-tests.xcresult')
        if result.exists():
            try:
                summary = run('xcrun', 'xcresulttool', 'get', 'test-results', 'summary', '--path', result, capture=True)
                report = json.loads(summary)
                (out / (name + '-tests-summary.json')).write_text(summary, encoding='utf-8')
                (out / 'attachments').mkdir(exist_ok=True)
                run('xcrun', 'xcresulttool', 'export', 'attachments', '--path', result,
                    '--output-path', out / 'attachments' / name, timeout=300)
                if report.get('totalTestCount', 0) <= report.get('skippedTests', 0):
                    raise RuntimeError('The test report contains no executed tests.')
            except Exception as error:
                issue(name + ' test report/attachment export', error)
            # Archive even incomplete reports, without deleting the original or extracting on Windows.
            try:
                with tarfile.open(out / (result.name + '.tar.gz'), 'w:gz') as report_archive:
                    report_archive.add(result, arcname=result.name)
            except Exception as error:
                issue(name + ' result archive', error)
        elif status[name + '_test_exit'] == 0:
            status['errors'].append(name + ' test command succeeded but produced no result bundle.')
    for setting, value in original.items():
        try:
            run('xcrun', 'simctl', 'ui', device, setting, value)
        except Exception as error:
            issue('Restore ' + setting, error)
    if ready:
        try:
            bundle = bundle or 'app.rootine.mobile'
            launch('--rootine-preview-more')
        except Exception as error:
            issue('Restore preview', error)
    status['original_simulator_settings'] = original
    status['passed'] = status['test_exit'] == 0 and status['build_exit'] == 0 and not status['errors']
    if status['screenshots']:
        (out / 'captures' / 'manifest.json').write_text(json.dumps(status['screenshots'], indent=2), encoding='utf-8')
    (out / 'status.json').write_text(json.dumps(status, indent=2) + '\n', encoding='utf-8')
sys.exit(0 if status['passed'] else 1)
'@
$runnerPath = Join-Path $localRun 'verify.py'
[IO.File]::WriteAllText($runnerPath, $runner.Replace("`r`n", "`n"), $utf8)
& ssh @sshOptions $Mac "mkdir -p '$remoteRun/artifacts'"
Assert-Exit 'Remote run directory'
& scp @sshOptions $archive $runnerPath "${Mac}:$remoteRun/"
Assert-Exit 'Source and runner upload'
& ssh @sshOptions $Mac "cd '$remoteRun' && { tar -xzf source.tar.gz && caffeinate -is python3 verify.py '$Device'; } > artifacts/workflow.log 2>&1"
$verificationExit = $LASTEXITCODE
& scp @sshOptions -r "${Mac}:$remoteRun/artifacts" $localRun
$downloadExit = $LASTEXITCODE
$galleryExit = 0
$artifacts = Join-Path $localRun 'artifacts'
if ($downloadExit -eq 0 -and @(Get-ChildItem -LiteralPath $artifacts -Filter '*.png' -Recurse -File).Count) {
    & node (Join-Path $PSScriptRoot 'ios-review-gallery.mjs') $artifacts (Join-Path $localRun 'review')
    $galleryExit = $LASTEXITCODE
}
Write-Host "Evidence: $localRun"
Write-Host "Mac copy retained at: ~/$remoteRun"
if ($verificationExit -ne 0 -or $downloadExit -ne 0 -or $galleryExit -ne 0) {
    throw "Verification did not complete successfully (remote=$verificationExit, download=$downloadExit, gallery=$galleryExit). Inspect the saved logs; screenshots do not imply passing tests."
}
Write-Host 'Build, tests, evidence capture and preview restoration completed. Visual review is still required.'
