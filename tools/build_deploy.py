"""Build a flat, upload-anywhere copy of the app in deploy/atelier-site (no subfolders) + a zip.

Some drag-and-drop hosts (e.g. Netlify Drop) can skip subfolders, so every file is placed at the top
level and all import paths are rewritten to match:
  css/app.css -> app.css, icons/x.png -> x.png, js/x.js -> x.js, js/ui/x.js -> ui-x.js
Run:  python tools/build_deploy.py
"""
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'deploy' / 'atelier-site'


def write(name, text):
    (OUT / name).write_text(text, encoding='utf-8', newline='\n')


def main():
    if OUT.parent.exists():
        shutil.rmtree(OUT.parent)
    OUT.mkdir(parents=True)

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = html.replace('css/app.css', 'app.css').replace('icons/', '').replace('js/app.js', 'app.js')
    write('index.html', html)

    man = (ROOT / 'manifest.webmanifest').read_text(encoding='utf-8').replace('icons/', '')
    write('manifest.webmanifest', man)

    sw = (ROOT / 'sw.js').read_text(encoding='utf-8-sig')
    sw = sw.replace('./css/app.css', './app.css').replace('./icons/', './').replace('./js/ui/', './ui-').replace('./js/', './')
    write('sw.js', sw)

    shutil.copy(ROOT / 'css' / 'app.css', OUT / 'app.css')
    for p in (ROOT / 'icons').glob('*.png'):
        shutil.copy(p, OUT / p.name)

    q = r"(['\"`])"
    for p in (ROOT / 'js').glob('*.js'):
        t = p.read_text(encoding='utf-8-sig')
        t = re.sub(q + r"\./ui/([\w-]+)\.js", r"\1./ui-\2.js", t)
        t = t.replace('icons/icon-', 'icon-')
        write(p.name, t)
    for p in (ROOT / 'js' / 'ui').glob('*.js'):
        t = p.read_text(encoding='utf-8-sig')
        t = re.sub(q + r"\./([\w-]+)\.js", r"\1./ui-\2.js", t)   # sibling ui modules
        t = re.sub(q + r"\.\./([\w-]+)\.js", r"\1./\2.js", t)    # core modules
        t = t.replace('icons/icon-', 'icon-')
        write('ui-' + p.name, t)

    leftovers = [f.name for f in OUT.glob('*.js') if re.search(r"['\"`]\.\.?/(ui|js|css|icons)/", f.read_text(encoding='utf-8'))]
    if leftovers:
        raise SystemExit(f'Unrewritten paths in: {leftovers}')

    z = OUT.parent / 'atelier-site.zip'
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(OUT.iterdir()):
            zf.write(f, f.name)
    files = list(OUT.iterdir())
    print(f'{len(files)} files, {sum(f.stat().st_size for f in files) // 1024} KB -> {OUT}')
    print(f'zip: {z} ({z.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
