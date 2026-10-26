#!/usr/bin/env python3
"""One-time per-Mac install of the fixed-action worker using a user LaunchAgent."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import uuid

import bridge


def plist_data(python, script, config_path, state, label):
    return {"Label": label,
            "ProgramArguments": [str(python), "-u", str(script), "--config", str(config_path), "worker"],
            "WorkingDirectory": str(state), "RunAtLoad": True, "KeepAlive": True,
            "ThrottleInterval": 30,
            "StandardOutPath": str(state / "worker.log"), "StandardErrorPath": str(state / "worker-error.log"),
            "EnvironmentVariables": {"PATH": os.environ.get("PATH", "/usr/bin:/bin:/usr/sbin:/sbin"),
                                     "GIT_TERMINAL_PROMPT": "0"}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=["primary", "mobile"], required=True)
    parser.add_argument("--project", required=True)
    args = parser.parse_args()
    if sys.platform != "darwin":
        raise bridge.BridgeError("Install this LaunchAgent on the intended Mac, not in a cloud container")
    if not shutil.which("git"):
        raise bridge.BridgeError("Git is missing; install Apple's Command Line Tools first")
    project = Path(args.project).expanduser().resolve()
    if not project.is_dir():
        raise bridge.BridgeError(f"Project folder does not exist: {project}")
    state = Path.home() / "Library" / "Application Support" / "GacorZombieBridge" / args.device
    config_path = state / "config.json"
    if config_path.exists():
        config = bridge.config_load(config_path)
        if config["project_dir"] != str(project) or config["device"] != args.device:
            raise bridge.BridgeError("Existing installation targets a different project; preserving it")
    else:
        config = {"schema_version": 1, "device": args.device, "project_dir": str(project),
                  "state_dir": str(state), "remote": bridge.REMOTE, "branch": bridge.BRANCH,
                  "installation_id": uuid.uuid4().hex}
        bridge.atomic_json(config_path, config)
    label = f"com.gacorzombie.bridge.{args.device}"
    domain = f"gui/{os.getuid()}"
    # Re-running the installer does not replace a running installation.
    if subprocess.run(["launchctl", "print", f"{domain}/{label}"], capture_output=True).returncode == 0:
        print(f"Already running: {label}\nConfig: {config_path}")
        return
    script = state / "bridge.py"
    shutil.copy2(Path(__file__).with_name("bridge.py"), script)
    # This proves Git read/write auth and publishes a real local inspection before reporting installed.
    with bridge.local_lock(config):
        store = bridge.Store(config)
        bridge.register(store, config)
        install_job = f"install-{args.device}-{config['installation_id'][:12]}"
        try:
            bridge.enqueue(store, args.device, "inspect_local", install_job)
        except bridge.Conflict:
            pass
        bridge.process_once(store, config)
        receipt = store.read(store.refresh(), bridge.receipt_path(install_job))
        if not receipt or __import__("json").loads(receipt)["state"] != "succeeded":
            raise bridge.BridgeError("Installation inspection did not succeed; background agent was not started")
    agents = Path.home() / "Library" / "LaunchAgents"
    agents.mkdir(parents=True, exist_ok=True)
    plist = agents / f"{label}.plist"
    payload = plistlib.dumps(plist_data(Path(sys.executable).resolve(), script, config_path, state, label))
    if plist.exists() and plist.read_bytes() != payload:
        raise bridge.BridgeError(f"Existing LaunchAgent differs; preserving {plist}")
    plist.write_bytes(payload)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
    subprocess.run(["launchctl", "print", f"{domain}/{label}"], stdout=subprocess.DEVNULL, check=True)
    print(f"Installed: {label}\nReceipt job: {install_job}\nConfig: {config_path}\nLogs: {state}")
    print(f"Stop: launchctl bootout {domain}/{label}")
    print("While logged in and awake, this Mac polls GitHub every 20 seconds. No model calls are made.")


if __name__ == "__main__":
    try:
        main()
    except (bridge.BridgeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Install blocked: {error}\nIf Git authentication is missing, authenticate GitHub Git locally "
              "(for example gh auth login then gh auth setup-git) and rerun. "
              "Codex app connector authorization does not necessarily authorize background Git.", file=sys.stderr)
        sys.exit(1)
