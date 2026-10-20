"""Exercise actual release CLI/artifacts using disposable copies, never live state."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/release.py')
assert spec is not None and spec.loader is not None
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / '.local/release-tests'
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.root = Path(self.temp.name)
        for name in (*release.FILES, 'package.json', 'scripts/release.py'):
            dest = self.root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dest)
        self.out = self.root / 'dist'
        self.addCleanup(self.temp.cleanup)

    def cli(self, *args, success=True):
        result = subprocess.run(['python3', str(self.root / 'scripts/release.py'), *args],
                                text=True, capture_output=True, cwd=self.root)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result

    def test_actual_archive_extraction_installable_layout_and_entry_syntax(self):
        self.cli('pack', '--tag', 'v1.2.3')
        archive = self.out / 'hermes-context-overview-1.2.3.tar.gz'
        extracted = self.root / 'installed'
        extracted.mkdir()
        with tarfile.open(archive) as tar:
            self.assertEqual(tar.getnames(), list(release.FILES))
            # Independently reject traversal/links before extraction on Python 3.10+.
            for member in tar.getmembers():
                self.assertTrue(member.isfile())
                self.assertFalse(Path(member.name).is_absolute())
                self.assertNotIn('..', Path(member.name).parts)
            if hasattr(tarfile, 'data_filter'):
                tar.extractall(extracted, filter='data')
            else:
                tar.extractall(extracted)
        self.assertTrue((extracted / 'plugin.yaml').is_file())
        self.assertEqual((extracted / 'desktop/plugin.js').read_bytes(), (self.root / 'desktop/plugin.js').read_bytes())
        self.assertEqual((extracted / 'LICENSE').read_bytes(), (ROOT / 'LICENSE').read_bytes())
        result = subprocess.run(['node', '--check', str(extracted / 'desktop/plugin.js')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        # Independent checksum consumer, not the producer's verifier.
        for line in (self.out / 'SHA256SUMS').read_text().splitlines():
            digest, name = line.split('  ')
            self.assertEqual(hashlib.sha256((self.out / name).read_bytes()).hexdigest(), digest)

    def test_screenshots_are_explicit_complete_and_packaged(self):
        expected = {
            'docs/screenshots/overview-dark.png',
            'docs/screenshots/overview-light.png',
            'docs/screenshots/themes-dark.png',
            'docs/screenshots/themes-light.png',
        }
        self.assertEqual({name for name in release.FILES if name.startswith('docs/screenshots/')}, expected)
        readme = (self.root / 'README.md').read_text()
        for name in sorted(expected):
            self.assertIn('](' + name + ')', readme)
        self.cli('pack', '--tag', 'v1.2.3')
        with tarfile.open(self.out / 'hermes-context-overview-1.2.3.tar.gz') as tar:
            for name in sorted(expected):
                stream = tar.extractfile(name)
                self.assertIsNotNone(stream)
                assert stream is not None
                self.assertEqual(stream.read(), (ROOT / name).read_bytes())
        for name in sorted(expected):
            with self.subTest(missing=name):
                path = self.root / name
                data = path.read_bytes()
                path.unlink()
                self.cli('check', '--tag', 'v1.2.3', success=False)
                path.write_bytes(data)

    def test_rebuild_deterministic_despite_source_mtimes(self):
        self.cli('pack')
        first = {p.name: p.read_bytes() for p in self.out.iterdir()}
        for name in release.FILES:
            os.utime(self.root / name, (1234567890, 1234567890))
        self.cli('pack')
        self.assertEqual(first, {p.name: p.read_bytes() for p in self.out.iterdir()})

    def test_unknown_files_secrets_caches_and_previous_builds_excluded(self):
        for name in ('.env', '.git/config', 'node_modules/secret', '.local/evidence/private', 'tests/private', 'dist/old-secret', 'docs/screenshots/private.png'):
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('DO_NOT_PACKAGE')
        self.cli('pack')
        with tarfile.open(self.out / 'hermes-context-overview-1.2.3.tar.gz') as tar:
            self.assertEqual(tar.getnames(), list(release.FILES))
            for member in tar.getmembers():
                stream = tar.extractfile(member)
                self.assertIsNotNone(stream)
                assert stream is not None
                self.assertNotIn(b'DO_NOT_PACKAGE', stream.read())

    def test_corrupt_each_asset_or_checksum_is_rejected(self):
        for name in (*release.names('1.2.3'), 'SHA256SUMS'):
            with self.subTest(name=name):
                self.cli('pack')
                p = self.out / name
                p.write_bytes(p.read_bytes() + b'corruption')
                self.cli('verify', success=False)

    def test_invalid_and_mismatched_tags_fail_closed(self):
        for tag in ('v1.2.1', 'v1.2.0', '1.2.3', 'v01.2.3', 'v1.2.3-rc.1', '', 'v1.2.3\n', 'refs/tags/v1.2.3', '../../x'):
            with self.subTest(tag=tag):
                self.cli('pack', '--tag', tag, success=False)
        self.assertFalse(self.out.exists())

    def test_manifest_version_and_private_dependency_contract(self):
        original = (self.root / 'package.json').read_text()
        for field, value in (('version', '1.2.0'), ('version', '01.2.3'), ('private', False), ('dependencies', {'bad': '1'})):
            package = json.loads(original)
            package[field] = value
            (self.root / 'package.json').write_text(json.dumps(package))
            self.cli('check', success=False)
        (self.root / 'package.json').write_text(original)
        (self.root / 'plugin.yaml').write_text('version: 1.2.3\nversion: 1.2.3\n')
        self.cli('check', success=False)

    def test_absent_empty_duplicate_or_noncurrent_notes_block(self):
        for changelog in ('# Changelog\n', '## [1.2.3] - 2026-10-20\n',
                          '## [1.2.3] - 2026-10-20\n- Good\n## [1.2.3] - 2026-10-20\n- Duplicate\n',
                          '## [1.2.0] - 2026-10-20\n- Old\n## [1.2.3] - 2026-10-20\n- New\n'):
            (self.root / 'CHANGELOG.md').write_text(changelog)
            self.cli('pack', success=False)

    def test_notes_exactly_current_section(self):
        output = self.cli('notes', '--tag', 'v1.2.3').stdout
        changelog = (self.root / 'CHANGELOG.md').read_text()
        self.assertEqual(output, changelog[changelog.index('## [1.2.3]'):changelog.index('## [1.2.2]')].strip() + '\n')
        self.assertNotIn('## [1.2.1]', output)

    def test_symlink_allowlisted_input_rejected(self):
        entry = self.root / 'desktop/plugin.js'
        entry.unlink()
        entry.symlink_to(ROOT / 'desktop/plugin.js')
        self.cli('pack', success=False)

    def test_archive_injection_rejected_even_with_updated_checksum(self):
        self.cli('pack')
        archive = self.out / 'hermes-context-overview-1.2.3.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            info = tarfile.TarInfo('../private')
            info.size = 4
            tar.addfile(info, io.BytesIO(b'evil'))
        manifest = self.out / 'SHA256SUMS'
        lines = manifest.read_text().splitlines()
        lines[0] = hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name
        manifest.write_text('\n'.join(lines) + '\n')
        self.cli('verify', success=False)


if __name__ == '__main__':
    unittest.main()
