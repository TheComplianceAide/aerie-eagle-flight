import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import deploy_functions as release

SHA = 'a' * 40
FILES = {k: b'{}' for k in release.REQUIRED}
FILES.update({'src/feature/render.mjs': b'export {};', 'test/fixture.txt': b'excluded'})
OFFER = {'releaseRevision': SHA, 'checkoutMode': 'test', 'checkout': True, 'restore': True,
         'priceAmount': 199, 'priceCurrency': 'usd'}
PLAYER = {'authenticated': False, 'fullAccess': False, 'worlds': ['winnipesaukee']}
TRIGGERS = [{'name': release.APP + '/' + n, 'types': [t]} for n, t in release.TRIGGERS.items()]


class PackageTests(unittest.TestCase):
    def test_unix_modes_and_digest_independent_of_umask_or_input_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'package.zip'
            original = os.umask(0o077)
            try:
                release.package(FILES, SHA, output)
            finally:
                os.umask(original)
            digest = hashlib.sha256(output.read_bytes()).digest()
            release.package(dict(reversed(list(FILES.items()))), SHA, output)
            self.assertEqual(digest, hashlib.sha256(output.read_bytes()).digest())
            with ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), release.REQUIRED | {'src/', 'src/feature/', 'src/feature/render.mjs'})
                for e in archive.infolist():
                    self.assertEqual(e.create_system, 3)
                    expected = (stat.S_IFDIR | 0o755) if e.is_dir() else (stat.S_IFREG | 0o644)
                    self.assertEqual(e.external_attr >> 16, expected)
                self.assertEqual(json.loads(archive.read('package.json'))['aerieReleaseRevision'], SHA)

    def test_unreadable_host_json_fails_before_upload(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'bad.zip'
            with ZipFile(output, 'w') as archive:
                entry = ZipInfo('host.json')
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | 0o600) << 16
                archive.writestr(entry, b'{}')
            with self.assertRaisesRegex(release.ReleaseError, 'permissions for host.json'):
                release.verify_package(output, SHA, {'host.json'})


class DeploymentTests(unittest.TestCase):
    def test_upload_acceptance_cannot_mask_a_failed_health_check(self):
        commands = []
        def command(args, *_args, **_kwargs):
            commands.append(args)
            return b'FlexConsumption' if args[:3] == ['az', 'resource', 'show'] else b''
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'snapshot', return_value=FILES), \
             patch.object(release, 'run', side_effect=command), patch('builtins.print'), \
             patch.object(release, 'wait_healthy', side_effect=release.ReleaseError('HTTP 503')):
            with self.assertRaisesRegex(release.ReleaseError, 'HTTP 503'):
                release.deploy(SHA, 'test', Path(tmp))
        self.assertEqual(sum('config-zip' in c for c in commands), 1)
        self.assertFalse(any('appsettings' in c for c in commands))

    def test_plan_change_stops_before_a_cli_path_that_could_edit_settings(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, 'snapshot', return_value=FILES), \
             patch.object(release, 'run', return_value=b'Dynamic') as command, patch('builtins.print'):
            with self.assertRaisesRegex(release.ReleaseError, 'hosting plan'):
                release.deploy(SHA, 'test', Path(tmp))
        self.assertFalse(any('config-zip' in call.args[0] for call in command.call_args_list))


class HealthTests(unittest.TestCase):
    def test_both_hosts_and_all_typed_triggers(self):
        with patch.object(release, 'public_json', side_effect=[OFFER, PLAYER, OFFER, PLAYER]) as read, \
             patch.object(release, 'run', return_value=json.dumps(TRIGGERS)) as command:
            release.verify_health(SHA, 'test')
            self.assertEqual([call.args for call in read.call_args_list],
                             [(origin, route) for origin in release.ORIGINS for route in ('config', 'status')])
            self.assertIn('function', command.call_args.args[0])
            self.assertIn('list', command.call_args.args[0])

    def test_paused_gate_checks_both_hosts_free_access_and_all_triggers(self):
        paused = {'releaseRevision': SHA, 'checkoutMode': 'live', 'checkout': False, 'restore': True}
        with patch.object(release, 'public_json', side_effect=[paused, PLAYER, paused, PLAYER]) as read, \
             patch.object(release, 'run', return_value=json.dumps(TRIGGERS)):
            release.verify_health(SHA, 'live', checkout_paused=True)
            self.assertEqual([call.args for call in read.call_args_list],
                             [(origin, route) for origin in release.ORIGINS for route in ('config', 'status')])
        for override in [{'checkout': True}, {'restore': False}, {'priceAmount': 199}, {'checkoutMode': 'test'},
                         {'releaseRevision': 'b' * 40}]:
            with self.subTest(override=override), patch.object(release, 'public_json', side_effect=[paused, PLAYER, dict(paused, **override)]):
                with self.assertRaisesRegex(release.ReleaseError, 'www.playaerie.com'):
                    release.verify_health(SHA, 'live', checkout_paused=True)
        with patch.object(release, 'public_json', side_effect=[paused, dict(PLAYER, fullAccess=True)]):
            with self.assertRaisesRegex(release.ReleaseError, 'anonymous'):
                release.verify_health(SHA, 'live', checkout_paused=True)
        with patch.object(release, 'public_json', side_effect=[paused, PLAYER, paused, PLAYER]), \
             patch.object(release, 'run', return_value='[]'):
            with self.assertRaisesRegex(release.ReleaseError, 'Missing indexed Function triggers'):
                release.verify_health(SHA, 'live', checkout_paused=True)

    def test_deploy_and_verify_cli_forward_paused_expectation(self):
        for action in ['deploy', 'verify']:
            with self.subTest(action=action), patch.object(release.sys, 'argv', ['deploy_functions.py', action, SHA, '--mode', 'live', '--checkout-paused']), \
                 patch.object(release, 'deploy') as deploy, patch.object(release, 'verify_health') as verify, patch('builtins.print'):
                release.main()
                target = deploy if action == 'deploy' else verify
                self.assertTrue(target.call_args.kwargs['checkout_paused'])

    def test_wrong_revision_unavailable_offer_wrong_mode_and_unexpected_access(self):
        for bad in [{'releaseRevision': 'b' * 40}, {'checkout': False}, {'checkoutMode': 'live'}, {'priceAmount': 99}]:
            with self.subTest(bad=bad), patch.object(release, 'public_json', side_effect=[OFFER, PLAYER, dict(OFFER, **bad)]):
                with self.assertRaisesRegex(release.ReleaseError, 'www.playaerie.com'):
                    release.verify_health(SHA, 'test')
        with patch.object(release, 'public_json', side_effect=[OFFER, dict(PLAYER, fullAccess=True)]):
            with self.assertRaisesRegex(release.ReleaseError, 'anonymous'):
                release.verify_health(SHA, 'test')

    def test_missing_checkout_return_endpoint_does_not_pass(self):
        without_confirmation = [t for t in TRIGGERS if t['name'].split('/')[-1] != 'aerie-checkout-confirm']
        with patch.object(release, 'public_json', side_effect=[OFFER, PLAYER, OFFER, PLAYER]), \
             patch.object(release, 'run', return_value=json.dumps(without_confirmation)):
            with self.assertRaisesRegex(release.ReleaseError, 'aerie-checkout-confirm'):
                release.verify_health(SHA, 'test')

    def test_missing_timer_and_persistent_503_do_not_pass(self):
        wrong = [dict(t, types=['httpTrigger']) for t in TRIGGERS]
        with patch.object(release, 'public_json', side_effect=[OFFER, PLAYER, OFFER, PLAYER]), \
             patch.object(release, 'run', return_value=json.dumps(wrong)):
            with self.assertRaisesRegex(release.ReleaseError, 'aerie-purchase-confirmations'):
                release.verify_health(SHA, 'test')
        with patch.object(release, 'verify_health', side_effect=release.ReleaseError('HTTP 503')):
            with self.assertRaisesRegex(release.ReleaseError, 'HTTP 503'):
                release.wait_healthy(SHA, 'test', timeout=0)

    def test_cold_start_can_recover(self):
        with patch.object(release, 'verify_health', side_effect=[release.ReleaseError('HTTP 503'), None]) as verify, \
             patch.object(release.time, 'sleep'):
            release.wait_healthy(SHA, 'test')
            self.assertEqual(verify.call_count, 2)


if __name__ == '__main__':
    unittest.main()
