#!/usr/bin/env python3
"""Capture the actual SwiftUI app on macOS; no mockups or web rendering."""
import argparse
import datetime
import json
import pathlib
import platform
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]


def run(*args, capture=False, timeout=900):
    return subprocess.run(args, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, timeout=timeout).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--current', action='store_true',
                        help='Capture the visible screen of an already booted simulator without rebuilding.')
    parser.add_argument('--device', help='Simulator UDID (required if several simulators are booted).')
    parser.add_argument('--preview', action='store_true',
                        help='Keep a dedicated simulator and its login across builds.')
    parser.add_argument('--test-account', action='store_true',
                        help='Launch the existing Debug-only local sample account (--rootine-preview).')
    parser.add_argument('--name', default='current', help='Screenshot filename stem.')
    args = parser.parse_args()
    if platform.system() != 'Darwin':
        parser.error('Requires macOS with Xcode and an installed iPhone simulator runtime.')
    if not args.name or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in args.name):
        parser.error('--name must contain only letters, numbers, hyphens and underscores.')
    if args.device and not args.current:
        parser.error('--device is only supported with --current.')
    if args.test_account and (not args.preview or args.current):
        parser.error('--test-account requires --preview and cannot be used with --current.')

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = ROOT / 'output' / 'ios' / stamp
    output.mkdir(parents=True)
    created = False
    device = None
    try:
        preview_device = None
        preview_state = pathlib.Path.home() / 'RootineRemote' / 'preview-device.json'
        if args.preview:
            if args.device:
                parser.error('--preview manages its own simulator; do not combine with --device.')
            if preview_state.exists():
                saved = json.loads(preview_state.read_text())
                listing = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json', capture=True))
                preview_device = next((d for group in listing['devices'].values() for d in group
                                       if d['udid'] == saved['udid']), None)
                if preview_device is None:
                    raise RuntimeError('Saved preview simulator is unavailable. Restore its iOS runtime or explicitly reset preview-device.json.')
            elif args.current:
                raise RuntimeError('Build with --preview first to create the persistent simulator.')
        if args.current:
            listing = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json', capture=True))
            booted = [d for group in listing['devices'].values() for d in group
                      if d['state'] == 'Booted'
                      and (not args.device or d['udid'] == args.device)
                      and (not args.preview or d['udid'] == preview_device['udid'])]
            if len(booted) != 1:
                raise RuntimeError('Boot one simulator, or select a booted simulator with --device UDID.')
            device = booted[0]['udid']
        else:
            runtimes = json.loads(run('xcrun', 'simctl', 'list', 'runtimes', '--json', capture=True))['runtimes']
            runtimes = [r for r in runtimes if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')
                        and int(r['version'].split('.')[0]) >= 16]
            if not runtimes:
                raise RuntimeError('Install an iOS 16 or newer simulator runtime in Xcode.')
            runtime = max(runtimes, key=lambda r: tuple(map(int, r['version'].split('.'))))
            # iPhone 14 is available in Xcode 14.2 and newer toolchains.
            if preview_device:
                device = preview_device['udid']
            else:
                device = run('xcrun', 'simctl', 'create',
                             'Rootine Windows Preview' if args.preview else 'Rootine Screenshot ' + stamp,
                             'com.apple.CoreSimulator.SimDeviceType.iPhone-14', runtime['identifier'], capture=True).strip()
                created = True
                if args.preview:
                    preview_state.parent.mkdir(parents=True, exist_ok=True)
                    preview_state.write_text(json.dumps({'udid': device}) + '\n')
            if not preview_device or preview_device['state'] != 'Booted':
                run('xcrun', 'simctl', 'boot', device)
            run('xcrun', 'simctl', 'bootstatus', device, '-b')
            derived = (pathlib.Path.home() / 'RootineRemote' / 'DerivedData' / 'Preview'
                       if args.preview else ROOT / 'ios' / 'Rootine' / 'DerivedData' / 'Screenshots')
            run('xcodebuild', 'build', '-project', str(ROOT / 'ios/Rootine/Rootine.xcodeproj'),
                '-scheme', 'Rootine', '-configuration', 'Debug', '-destination', 'id=' + device,
                '-derivedDataPath', str(derived), 'CODE_SIGNING_ALLOWED=NO')
            app = derived / 'Build/Products/Debug-iphonesimulator/Rootine.app'
            bundle = run('/usr/libexec/PlistBuddy', '-c', 'Print :CFBundleIdentifier', str(app / 'Info.plist'), capture=True).strip()
            if args.preview:
                # Stop the old process without clearing its data or Keychain.
                subprocess.run(['xcrun', 'simctl', 'terminate', device, bundle], check=False, timeout=30,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            run('xcrun', 'simctl', 'install', device, str(app))
            run('xcrun', 'simctl', 'ui', device, 'appearance', 'dark')
            run('xcrun', 'simctl', 'status_bar', device, 'override', '--time', '9:41',
                '--batteryState', 'charged', '--batteryLevel', '100')
            launch = ('xcrun', 'simctl', 'launch', device, bundle,
                      '-AppleLanguages', '(pl)', '-AppleLocale', 'pl_PL')
            if args.test_account:
                launch += ('--rootine-preview',)
            try:
                run(*launch, timeout=90)
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                # A freshly migrated simulator can stall in SpringBoard even after bootstatus.
                # Restart only our own disposable device and retry the installed app once.
                print('App launch stalled; restarting the managed simulator.', flush=True)
                run('xcrun', 'simctl', 'shutdown', device, timeout=120)
                run('xcrun', 'simctl', 'boot', device)
                run('xcrun', 'simctl', 'bootstatus', device, '-b')
                run(*launch, timeout=90)
            if args.preview:
                run('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', device)
            # Fresh simulator has no saved account: capture the real entry screen.
            # Verify the resulting image visually; this delay is not a UI readiness assertion.
            time.sleep(5)
        target = output / (args.name + '.png')
        run('xcrun', 'simctl', 'io', device, 'screenshot', str(target))
        revision = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True, capture_output=True)
        status = subprocess.run(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True, capture_output=True)
        (output / 'capture.json').write_text(json.dumps({
            'captured_at_utc': stamp, 'commit': revision.stdout.strip(),
            'working_tree_dirty': bool(status.stdout.strip()), 'simulator': device,
            'mode': 'visible-screen' if args.current else ('persistent-preview' if args.preview else 'fresh-install'),
            'test_account': args.test_account,
            'image': target.name,
            'xcode': run('xcodebuild', '-version', capture=True).strip(),
        }, indent=2) + '\n', encoding='utf-8')
        print('\nScreenshot: ' + str(target))
    finally:
        if created and not args.preview:
            # Only remove the disposable simulator created by this invocation.
            subprocess.run(['xcrun', 'simctl', 'shutdown', device], check=False)
            subprocess.run(['xcrun', 'simctl', 'delete', device], check=False)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
