"""Build a signed Android APK of Atelier without Gradle or Android Studio.

Needs: JDK 17+ (java, javac, keytool on PATH) and the Android build-tools 34 + platform 34 in ./android-sdk
(downloaded once from dl.google.com). Run:   python tools/build_apk.py
Output: dist/Atelier-<version>.apk

Pipeline: flat web build -> aapt2 compile/link (manifest, resources, assets/www) -> javac -> d8 (dex)
-> zip -> zipalign -> apksigner (release key in android/, created on first run â€” keep it safe for updates).
"""
import os
import secrets
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SDK = ROOT / 'android-sdk'
BT = SDK / 'build-tools' / 'android-14'
ANDROID_JAR = SDK / 'platforms' / 'android-34' / 'android.jar'
APP = ROOT / 'android'
BUILD = ROOT / 'build' / 'apk'
DIST = ROOT / 'dist'
VERSION_NAME, VERSION_CODE = '1.8', 9
KEYSTORE = APP / 'atelier-release.jks'
KEYPROPS = APP / 'keystore.properties'


def run(cmd, **kw):
    print('>', ' '.join(str(c) for c in cmd)[:220], flush=True)
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print(r.stdout[-4000:], r.stderr[-4000:])
        raise SystemExit(f'step failed: {cmd[0]}')
    return r.stdout


def icons(res_dir):
    from PIL import Image
    src = Image.open(ROOT / 'icons' / 'icon-512.png').convert('RGBA')
    for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        out = res_dir / f'mipmap-{d}'
        out.mkdir(parents=True, exist_ok=True)
        src.resize((px, px), Image.LANCZOS).save(out / 'ic_launcher.png')


def keystore():
    if KEYSTORE.exists() and KEYPROPS.exists():
        return KEYPROPS.read_text().strip().split('=', 1)[1]
    pw = secrets.token_urlsafe(18)
    run(['keytool', '-genkeypair', '-keystore', KEYSTORE, '-alias', 'atelier', '-keyalg', 'RSA', '-keysize', '2048',
         '-validity', '10000', '-storepass', pw, '-keypass', pw, '-dname', 'CN=Atelier, O=Atelier, C=US'])
    KEYPROPS.write_text('password=' + pw + '\n')
    print('created release key', KEYSTORE, '(back it up â€” needed to publish updates)')
    return pw


def main():
    for p in (BT / 'aapt2.exe', BT / 'zipalign.exe', BT / 'lib' / 'd8.jar', BT / 'lib' / 'apksigner.jar', ANDROID_JAR):
        if not p.exists():
            raise SystemExit(f'missing {p} â€” download the Android build-tools/platform first')
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir(parents=True)
    DIST.mkdir(exist_ok=True)

    # 1. web app -> assets/www (flat build, same as the website); keep js/config.js on this version
    import re
    cfg = ROOT / 'js' / 'config.js'
    t = cfg.read_text(encoding='utf-8')
    cfg.write_text(re.sub(r"APP_VERSION = '[^']*'", f"APP_VERSION = '{VERSION_NAME}'", t), encoding='utf-8', newline='\n')
    run([sys.executable, ROOT / 'tools' / 'build_deploy.py'])
    www = BUILD / 'assets' / 'www'
    shutil.copytree(ROOT / 'deploy' / 'atelier-site', www)

    # 2. resources
    gen_res = BUILD / 'res-gen'
    icons(gen_res)
    run([BT / 'aapt2.exe', 'compile', '--dir', APP / 'res', '-o', BUILD / 'res.zip'])
    run([BT / 'aapt2.exe', 'compile', '--dir', gen_res, '-o', BUILD / 'res-gen.zip'])
    gen = BUILD / 'gen'
    run([BT / 'aapt2.exe', 'link', '-o', BUILD / 'base.apk', '-I', ANDROID_JAR, '--manifest', APP / 'AndroidManifest.xml',
         '--min-sdk-version', '24', '--target-sdk-version', '34', '--version-code', VERSION_CODE, '--version-name', VERSION_NAME,
         '-A', BUILD / 'assets', '--java', gen, '--auto-add-overlay', BUILD / 'res.zip', BUILD / 'res-gen.zip'])

    # 3. java -> class -> dex
    classes = BUILD / 'classes'
    classes.mkdir()
    sources = [str(p) for p in (APP / 'src').rglob('*.java')] + [str(p) for p in gen.rglob('*.java')]
    # Java 8 standard library for java.* (lambdas are desugared by d8), Android APIs from android.jar
    run(['javac', '--release', '8', '-classpath', ANDROID_JAR, '-Xlint:-options', '-encoding', 'UTF-8', '-d', classes, *sources])
    dex = BUILD / 'dex'
    dex.mkdir()
    run(['java', '-cp', BT / 'lib' / 'd8.jar', 'com.android.tools.r8.D8', '--release', '--min-api', '24', '--lib', ANDROID_JAR,
         '--output', dex, *[str(p) for p in classes.rglob('*.class')]])

    # 4. package, align, sign
    unaligned = BUILD / 'unaligned.apk'
    shutil.copy(BUILD / 'base.apk', unaligned)
    with zipfile.ZipFile(unaligned, 'a', zipfile.ZIP_DEFLATED) as z:
        z.write(dex / 'classes.dex', 'classes.dex')
    aligned = BUILD / 'aligned.apk'
    run([BT / 'zipalign.exe', '-p', '-f', '4', unaligned, aligned])
    pw = keystore()
    out = DIST / f'Atelier-{VERSION_NAME}.apk'
    run(['java', '-jar', BT / 'lib' / 'apksigner.jar', 'sign', '--ks', KEYSTORE, '--ks-key-alias', 'atelier',
         '--ks-pass', 'env:ATELIER_KS', '--key-pass', 'env:ATELIER_KS', '--out', out, aligned], env={**os.environ, 'ATELIER_KS': pw})
    print(run(['java', '-jar', BT / 'lib' / 'apksigner.jar', 'verify', '--verbose', out])[:600])
    print(f'APK ready: {out} ({out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
