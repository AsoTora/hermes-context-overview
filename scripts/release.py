#!/usr/bin/env python3
"""Dependency-free release contract and reproducible, allowlisted artifacts."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
FILES = tuple(sorted(('plugin.yaml', 'desktop/plugin.js', 'LICENSE', 'README.md',
                      'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/releases.md',
                      'docs/verification.md', 'docs/screenshots/harness-dark-1280.png',
                      'docs/screenshots/harness-dark-390.png', 'docs/screenshots/harness-light-1280.png',
                      'docs/screenshots/harness-light-390.png', 'docs/theme-review.md',
                      'docs/screenshots/themes/sheet-light-1280-1.png',
                      'docs/screenshots/themes/sheet-light-1280-2.png',
                      'docs/screenshots/themes/sheet-dark-1280-1.png',
                      'docs/screenshots/themes/sheet-dark-1280-2.png',
                      'docs/screenshots/themes/sheet-light-390-1.png',
                      'docs/screenshots/themes/sheet-light-390-2.png',
                      'docs/screenshots/themes/sheet-dark-390-1.png',
                      'docs/screenshots/themes/sheet-dark-390-2.png')))


def contract(root, tag=None):
    package = json.loads((root / 'package.json').read_text())
    version = package['version']
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('version must be stable SemVer')
    if package.get('private') is not True or package.get('dependencies') or package.get('optionalDependencies'):
        raise ValueError('package must stay private with no production dependencies')
    versions = re.findall(r'^version: (.+)$', (root / 'plugin.yaml').read_text(), re.M)
    if versions != [version]:
        raise ValueError('plugin.yaml version mismatch')
    if tag is not None and tag != f'v{version}':
        raise ValueError('tag must exactly match v' + version)
    changelog = (root / 'CHANGELOG.md').read_text()
    sections = list(re.finditer(r'^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$', changelog, re.M))
    if not sections or sections[0][1] != version or sum(s[1] == version for s in sections) != 1:
        raise ValueError('missing, duplicate or non-current changelog section')
    end = sections[1].start() if len(sections) > 1 else len(changelog)
    notes = changelog[sections[0].start():end].strip() + '\n'
    body = changelog[sections[0].end():end].strip()
    if not re.search(r'^- \S', body, re.M):
        raise ValueError('release notes must include a nonempty bullet')
    for name in FILES:
        path = root / name
        if path.is_symlink() or not path.is_file() or any((root / p).is_symlink() for p in Path(name).parents):
            raise ValueError('allowlisted input missing or symlink: ' + name)
    return version, notes


def names(version):
    return (f'hermes-context-overview-{version}.tar.gz', 'plugin.js', 'release-notes.md')


def pack(root, out, tag=None):
    version, notes = contract(root, tag)
    out.mkdir(parents=True, exist_ok=True)
    archive, standalone, notes_name = names(version)
    with (out / archive).open('wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
                for name in FILES:
                    data = (root / name).read_bytes()
                    info = tarfile.TarInfo(name)
                    info.size, info.mode, info.mtime = len(data), 0o644, 0
                    info.uid = info.gid = 0
                    info.uname = info.gname = ''
                    tar.addfile(info, io.BytesIO(data))
    (out / standalone).write_bytes((root / 'desktop/plugin.js').read_bytes())
    (out / notes_name).write_text(notes)
    (out / 'SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256((out / name).read_bytes()).hexdigest()}  {name}\n'
        for name in names(version)))
    verify(root, out, tag)
    print(f'Built {archive}, plugin.js, release-notes.md, SHA256SUMS')


def verify(root, out, tag=None):
    version, notes = contract(root, tag)
    expected = names(version)
    lines = (out / 'SHA256SUMS').read_text().splitlines()
    if len(lines) != len(expected):
        raise ValueError('checksum manifest member count mismatch')
    for line, name in zip(lines, expected):
        digest = hashlib.sha256((out / name).read_bytes()).hexdigest()
        if line != f'{digest}  {name}':
            raise ValueError('checksum mismatch: ' + name)
    if (out / 'plugin.js').read_bytes() != (root / 'desktop/plugin.js').read_bytes():
        raise ValueError('standalone source mismatch')
    if (out / 'release-notes.md').read_text() != notes:
        raise ValueError('release notes mismatch')
    with tarfile.open(out / expected[0], 'r:gz') as tar:
        members = tar.getmembers()
        if [m.name for m in members] != list(FILES):
            raise ValueError('archive allowlist mismatch')
        for member in members:
            if not member.isfile() or member.mode != 0o644 or member.mtime != 0 or member.uid or member.gid or member.uname or member.gname:
                raise ValueError('noncanonical archive metadata')
            stream = tar.extractfile(member)
            if stream is None or stream.read() != (root / member.name).read_bytes():
                raise ValueError('archive source mismatch: ' + member.name)
    print('Verified checksums, exact archive allowlist/content and standalone entry', file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('check', 'notes', 'pack', 'verify'))
    parser.add_argument('--tag', help='Require exact vX.Y.Z matching the source version')
    parser.add_argument('--out', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    try:
        if args.command in ('check', 'notes'):
            version, notes = contract(ROOT, args.tag)
            print(notes if args.command == 'notes' else f'Release contract OK: {version}', end='' if args.command == 'notes' else '\n')
        else:
            globals()[args.command](ROOT, args.out, args.tag)
    except (ValueError, KeyError, OSError, tarfile.TarError) as error:
        parser.exit(1, f'Release blocked: {error}\n')


if __name__ == '__main__':
    main()
