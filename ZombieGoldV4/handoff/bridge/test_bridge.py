import importlib.util
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import bridge


def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, check=True).stdout.decode().strip()


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        git("init", "--bare", "-q", str(self.remote))
        seed = self.root / "seed"
        seed.mkdir()
        git("init", "-q", "-b", bridge.BRANCH, cwd=seed)
        git("config", "user.name", "Bridge Test", cwd=seed)
        git("config", "user.email", "test@example.invalid", cwd=seed)
        (seed / "seed.txt").write_text("seed")
        git("add", "seed.txt", cwd=seed)
        git("-c", "commit.gpgsign=false", "commit", "-qm", "Seed queue", cwd=seed)
        git("remote", "add", "origin", str(self.remote), cwd=seed)
        git("push", "-q", "origin", bridge.BRANCH, cwd=seed)
        self.project = self.root / "project"
        self.project.mkdir()
        (self.project / "original.txt").write_text("preserve me")
        self.config = self.configuration("mobile")
        self.store = bridge.Store(self.config, allow_test_remote=True)

    def configuration(self, device):
        return {"remote": str(self.remote), "branch": bridge.BRANCH, "device": device,
                "state_dir": str(self.root / device), "project_dir": str(self.project),
                "installation_id": ("a" if device == "mobile" else "b") * 32}

    def test_real_git_job_receipt_preserves_project_and_is_not_repeated(self):
        bridge.enqueue(self.store, "mobile", "inspect_local", "smoke-one")
        done = bridge.process_once(self.store, self.config)
        self.assertEqual([item["state"] for item in done], ["succeeded"])
        receipt = json.loads(self.store.read(self.store.refresh(), bridge.receipt_path("smoke-one")))
        self.assertFalse(receipt["result"]["game_source_present"])
        self.assertEqual(receipt["device"], "mobile")
        self.assertEqual((self.project / "original.txt").read_text(), "preserve me")
        self.assertEqual([file.name for file in self.project.iterdir()], ["original.txt"])
        previous = self.store.refresh()
        with mock.patch.object(bridge, "inspect_local", side_effect=AssertionError("Must not rerun")):
            self.assertEqual(bridge.process_once(self.store, self.config), [])
        self.assertEqual(self.store.refresh(), previous)

    def test_targeting_and_duplicate_id_rejection(self):
        bridge.enqueue(self.store, "primary", "inspect_local", "primary-only")
        self.assertEqual(bridge.process_once(self.store, self.config), [])
        with self.assertRaises(bridge.Conflict):
            bridge.enqueue(self.store, "mobile", "inspect_local", "primary-only")
        primary = self.configuration("primary")
        done = bridge.process_once(bridge.Store(primary, allow_test_remote=True), primary)
        self.assertEqual(len(done), 1)

    def test_offline_outbox_recovery_does_not_execute_again(self):
        bridge.enqueue(self.store, "mobile", "inspect_local", "offline-case")
        original = bridge.publish_receipt
        with mock.patch.object(bridge, "publish_receipt", side_effect=bridge.BridgeError("offline")):
            with self.assertRaises(bridge.BridgeError):
                bridge.process_once(self.store, self.config)
        self.assertTrue((Path(self.config["state_dir"]) / "outbox/offline-case.json").exists())
        with mock.patch.object(bridge, "inspect_local", side_effect=AssertionError("Must use saved receipt")):
            self.assertEqual(bridge.process_once(self.store, self.config), [])
        receipt = json.loads(self.store.read(self.store.refresh(), bridge.receipt_path("offline-case")))
        self.assertEqual(receipt["state"], "succeeded")

    def test_non_force_push_retries_other_writer_without_lost_jobs(self):
        other = bridge.Store(self.configuration("primary"), allow_test_remote=True)
        original = self.store.git
        raced = False

        def competing_push(*args, **kwargs):
            nonlocal raced
            if args[0] == "push" and not raced:
                raced = True
                bridge.enqueue(other, "primary", "inspect_local", "racing-b")
            return original(*args, **kwargs)

        with mock.patch.object(self.store, "git", side_effect=competing_push):
            bridge.enqueue(self.store, "mobile", "inspect_local", "racing-a")
        head = self.store.refresh()
        self.assertIsNotNone(self.store.read(head, bridge.job_path("racing-a")))
        self.assertIsNotNone(self.store.read(head, bridge.job_path("racing-b")))

    def test_no_shell_commands_paths_or_second_device_owner(self):
        for action in ("shell", "codex", "rm -rf anything"):
            with self.assertRaises(bridge.BridgeError):
                bridge.enqueue(self.store, "mobile", action, "bad-command")
        for job_id in ("../../outside", "a;touch-other", "a/b"):
            with self.assertRaises(bridge.BridgeError):
                bridge.job_path(job_id)
        with self.assertRaises(bridge.BridgeError):
            self.store.write({"outside.txt": b"bad"}, {})
        bridge.register(self.store, self.config)
        duplicate = {**self.config, "installation_id": "c" * 32}
        with self.assertRaises(bridge.BridgeError):
            bridge.register(self.store, duplicate)

    def test_project_missing_is_blocked_and_lock_excludes_second_process(self):
        config = {**self.config, "project_dir": str(self.root / "missing")}
        bridge.enqueue(self.store, "mobile", "inspect_local", "missing-project")
        done = bridge.process_once(self.store, config)
        self.assertEqual(done[0]["state"], "blocked")
        with bridge.local_lock(config):
            with self.assertRaises(bridge.BridgeError):
                with bridge.local_lock(config):
                    pass

    def test_missing_source_in_handoff_cannot_pass(self):
        head = self.store.refresh()
        self.store.git("push", "--quiet", "origin", f"{head}:refs/heads/codex/mobile-zombiegold-handoff")
        bridge.enqueue(self.store, "mobile", "check_handoff", "missing-original", head)
        done = bridge.process_once(self.store, self.config)
        self.assertEqual(done[0]["state"], "blocked")
        receipt = json.loads(self.store.read(self.store.refresh(), bridge.receipt_path("missing-original")))
        self.assertFalse(receipt["result"]["original_art_verified"])
        self.assertIn("ZombieGoldV4/index.html", receipt["result"]["missing"])

    def test_launchagent_has_literal_paths_and_no_shell(self):
        spec = importlib.util.spec_from_file_location("bridge_install", Path(__file__).with_name("install.py"))
        installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(installer)
        state = Path("/Users/a/Library/Application Support/GacorZombieBridge/mobile")
        value = installer.plist_data(Path("/some python/bin/python3"), state / "bridge.py", state / "config.json", state,
                                     "com.gacorzombie.bridge.mobile")
        recovered = plistlib.loads(plistlib.dumps(value))
        self.assertEqual(recovered["ProgramArguments"][0], "/some python/bin/python3")
        self.assertNotIn("sh", recovered["ProgramArguments"])
        self.assertTrue(recovered["RunAtLoad"])
        self.assertTrue(recovered["KeepAlive"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
