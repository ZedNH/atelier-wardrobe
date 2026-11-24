"""Publish a new version: build the APK, push the code, update the website and create a GitHub Release.

Phones running the app see the new Release (Settings → App updates, or automatically within a few hours)
and install it with one tap. The website (GitHub Pages) updates for everyone straight away.

  1. bump VERSION_NAME / VERSION_CODE in tools/build_apk.py
  2. python tools/release.py "What's new in this version"
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def exe(name, *fallbacks):
    p = shutil.which(name)
    for f in fallbacks:
        if not p and Path(f).exists():
            p = f
    if not p:
        raise SystemExit(f'{name} not found — install it first')
    return p


GIT = exe('git', r'C:\Program Files\Git\cmd\git.exe')
GH = exe('gh', r'C:\Program Files\GitHub CLI\gh.exe')


def run(cmd, cwd=ROOT, check=True):
    print('>', ' '.join(str(c) for c in cmd)[:200], flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and r.returncode != 0:
        print(r.stdout[-3000:], r.stderr[-3000:])
        raise SystemExit('step failed')
    return r.stdout.strip()


def main():
    notes = sys.argv[1] if len(sys.argv) > 1 else 'Improvements and fixes.'
    version = re.search(r"VERSION_NAME, VERSION_CODE = '([^']+)'", (ROOT / 'tools' / 'build_apk.py').read_text(encoding='utf-8')).group(1)
    tag = 'v' + version
    if run([GH, 'release', 'view', tag], check=False):
        raise SystemExit(f'{tag} already exists — bump VERSION_NAME / VERSION_CODE in tools/build_apk.py first')

    # 1. APK (also rebuilds deploy/atelier-site)
    run([sys.executable, ROOT / 'tools' / 'build_apk.py'])
    apk = ROOT / 'dist' / f'Atelier-{version}.apk'

    # 2. source code -> main
    run([GIT, 'add', '-A'])
    if run([GIT, 'status', '--porcelain']):
        run([GIT, 'commit', '-m', f'Atelier {version}'])
    run([GIT, 'push', 'origin', 'HEAD:main'])

    # 3. website -> gh-pages (the flat build, served by GitHub Pages)
    remote = run([GIT, 'remote', 'get-url', 'origin'])
    pages = ROOT / 'build' / 'pages'
    if pages.exists():
        shutil.rmtree(pages, ignore_errors=True)
    shutil.copytree(ROOT / 'deploy' / 'atelier-site', pages)
    (pages / '.nojekyll').write_text('')
    run([GIT, 'init', '-q', '-b', 'gh-pages'], cwd=pages)
    run([GIT, 'add', '-A'], cwd=pages)
    run([GIT, '-c', 'user.name=Atelier release', '-c', 'user.email=release@atelier.local', 'commit', '-q', '-m', f'Website {version}'], cwd=pages)
    run([GIT, 'push', '-f', remote, 'gh-pages'], cwd=pages)

    # 4. GitHub Release with the APK — this is what installed apps check
    run([GH, 'release', 'create', tag, apk, '--title', f'Atelier {version}', '--notes', notes])
    print(f'\nReleased {tag}. Phones will offer the update; the website is live in a minute.')


if __name__ == '__main__':
    main()
