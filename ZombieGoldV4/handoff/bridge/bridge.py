#!/usr/bin/env python3
"""Small, read-only job worker. GitHub is the queue; no model/API key is needed."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import tempfile
import time
import uuid

REMOTE = "https://github.com/ito777higo/GacorZombie.git"
BRANCH = "codex/device-bridge"
PREFIX = "ZombieGoldV4/handoff/bridge/queue/"
ID = re.compile(r"[a-z][a-z0-9-]{0,63}\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
ACTIONS = {"inspect_local", "check_handoff"}


class BridgeError(Exception):
    pass


class Conflict(BridgeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(encode(value))
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def run(args, cwd=None, data=None, env=None, check=True):
    result = subprocess.run(args, cwd=cwd, input=data, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
    if check and result.returncode:
        # Do not forward Git's stderr: credential helpers may include sensitive text.
        raise BridgeError(f"{args[0]} {args[1] if len(args) > 1 else ''} failed "
                          f"(exit {result.returncode}); check network and GitHub Git authentication")
    return result


def config_load(path):
    config = json.loads(Path(path).read_text())
    if config.get("remote") != REMOTE or config.get("branch") != BRANCH:
        raise BridgeError("This worker only supports the configured GacorZombie queue")
    if not ID.fullmatch(config.get("device", "")):
        raise BridgeError("Invalid device ID")
    if not re.fullmatch(r"[0-9a-f]{32}", config.get("installation_id", "")):
        raise BridgeError("Invalid installation ID")
    state = Path(config["state_dir"]).expanduser().resolve()
    project = Path(config["project_dir"]).expanduser().resolve()
    if state == project or project in state.parents:
        raise BridgeError("Worker state must be outside the game project")
    config["state_dir"] = str(state)
    config["project_dir"] = str(project)
    return config


class Store:
    def __init__(self, config, allow_test_remote=False):
        self.remote = config["remote"]
        if self.remote != REMOTE and not allow_test_remote:
            raise BridgeError("Unexpected Git remote")
        self.branch = config.get("branch", BRANCH)
        if self.branch != BRANCH:
            raise BridgeError("Unexpected queue branch")
        self.state = Path(config["state_dir"])
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.repo = self.state / "transport.git"
        if not self.repo.exists():
            run(["git", "init", "--bare", "-q", str(self.repo)])
            self.git("remote", "add", "origin", self.remote)
        if self.git("remote", "get-url", "origin").stdout.decode().strip() != self.remote:
            raise BridgeError("Existing transport belongs to another remote")

    def git(self, *args, data=None, extra_env=None, check=True):
        env = dict(os.environ)
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
            env.pop(key, None)
        env["GIT_TERMINAL_PROMPT"] = "0"
        env.update(extra_env or {})
        return run(["git", "--git-dir", str(self.repo), *args], data=data, env=env, check=check)

    def refresh(self):
        self.git("fetch", "--quiet", "--no-tags", "origin", f"refs/heads/{self.branch}")
        return self.git("rev-parse", "FETCH_HEAD").stdout.decode().strip()

    def read(self, revision, path):
        result = self.git("show", f"{revision}:{path}", check=False)
        if result.returncode:
            # Distinguish an absent path from errors such as a corrupt/missing commit.
            self.git("cat-file", "-e", f"{revision}^{{commit}}")
            return None
        return result.stdout

    def paths(self, revision, prefix):
        return self.git("ls-tree", "-r", "--name-only", revision, "--", prefix).stdout.decode().splitlines()

    def write(self, changes, expected):
        """Compare-and-swap through an ordinary non-force Git push; retry other writers."""
        for path in changes:
            if not path.startswith(PREFIX) or ".." in Path(path).parts:
                raise BridgeError("Writes must stay inside the queue")
        for _ in range(5):
            parent = self.refresh()
            for path, old in expected.items():
                if self.read(parent, path) != old:
                    raise Conflict(f"Queue entry changed: {path}")
            with tempfile.TemporaryDirectory(dir=self.state) as directory:
                env = {"GIT_INDEX_FILE": str(Path(directory) / "index"),
                       "GIT_AUTHOR_NAME": "GacorZombie Bridge", "GIT_COMMITTER_NAME": "GacorZombie Bridge",
                       "GIT_AUTHOR_EMAIL": "bridge@users.noreply.github.com",
                       "GIT_COMMITTER_EMAIL": "bridge@users.noreply.github.com"}
                self.git("read-tree", parent, extra_env=env)
                for path, content in changes.items():
                    blob = self.git("hash-object", "-w", "--stdin", data=content).stdout.decode().strip()
                    self.git("update-index", "--add", "--cacheinfo", f"100644,{blob},{path}", extra_env=env)
                tree = self.git("write-tree", extra_env=env).stdout.decode().strip()
                commit = self.git("-c", "commit.gpgsign=false", "commit-tree", tree, "-p", parent,
                                  data=b"Record device bridge job or receipt\n", extra_env=env).stdout.decode().strip()
            result = self.git("push", "--quiet", "origin", f"{commit}:refs/heads/{self.branch}", check=False)
            if result.returncode == 0:
                return commit
            # A rejected push is retried only when another writer advanced the branch.
            if self.refresh() == parent:
                raise BridgeError("GitHub push failed; verify this computer has Git write authentication")
        raise BridgeError("Queue is busy; retry later")


def job_path(job_id):
    if not ID.fullmatch(job_id):
        raise BridgeError("Invalid job ID")
    return PREFIX + f"jobs/{job_id}.json"


def receipt_path(job_id):
    job_path(job_id)
    return PREFIX + f"receipts/{job_id}.json"


def validate_job(job):
    if job.get("schema_version") != 1 or not ID.fullmatch(job.get("target", "")):
        raise BridgeError("Invalid job schema/target")
    job_path(job.get("id", ""))
    if job.get("action") not in ACTIONS:
        raise BridgeError("Unsupported action; arbitrary commands and prompts are not executable")
    if set(job) - {"schema_version", "id", "target", "action", "created_at", "source_commit"}:
        raise BridgeError("Unsupported job fields")
    if job["action"] == "check_handoff" and not SHA.fullmatch(job.get("source_commit", "")):
        raise BridgeError("check_handoff requires an exact 40-character source commit")


def enqueue(store, target, action, job_id, source_commit=None):
    job = {"schema_version": 1, "id": job_id, "target": target, "action": action, "created_at": now()}
    if source_commit is not None:
        job["source_commit"] = source_commit
    validate_job(job)
    path = job_path(job_id)
    store.write({path: encode(job)}, {path: None})
    return job


def inspect_local(config):
    project = Path(config["project_dir"])
    result = {"project_dir": str(project), "project_exists": project.is_dir(),
              "host": platform.node(), "platform": platform.system(), "architecture": platform.machine()}
    if not project.is_dir():
        return "blocked", {**result, "reason": "Configured project folder is missing"}
    head = run(["git", "-C", str(project), "rev-parse", "--verify", "HEAD"], check=False)
    result["git_head"] = head.stdout.decode().strip() if head.returncode == 0 else None
    status = run(["git", "-C", str(project), "status", "--porcelain=v1", "-z", "--untracked-files=normal"], check=False)
    result["has_uncommitted_changes"] = bool(status.stdout) if status.returncode == 0 else None
    root = project / "ZombieGoldV4"
    required = ["index.html", "src/main.js", "src/game.js"]
    result["game_source_present"] = all((root / file).is_file() for file in required)
    result["missing_game_files"] = [file for file in required if not (root / file).is_file()]
    result["source_files_sha256"] = {file: hashlib.sha256((root / file).read_bytes()).hexdigest()
                                     for file in required if (root / file).is_file()}
    # A successful inspection may correctly report missing game source. It is not a game acceptance.
    return "succeeded", result


def check_handoff(store, job):
    commit = job["source_commit"]
    store.git("fetch", "--quiet", "--no-tags", "origin", "refs/heads/codex/mobile-zombiegold-handoff")
    branch_head = store.git("rev-parse", "FETCH_HEAD").stdout.decode().strip()
    ancestor = store.git("merge-base", "--is-ancestor", commit, branch_head, check=False)
    if ancestor.returncode:
        return "blocked", {"source_commit": commit, "reason": "Commit is not in the handoff branch history"}
    required = ["ZombieGoldV4/index.html", "ZombieGoldV4/src/main.js", "ZombieGoldV4/src/game.js",
                "ZombieGoldV4/handoff/SOURCE_MANIFEST.json"]
    missing = [path for path in required if store.read(commit, path) is None]
    assets = store.paths(commit, "ZombieGoldV4/assets/")
    if not assets:
        missing.append("ZombieGoldV4/assets/")
    return ("blocked" if missing else "succeeded"), {
        "source_commit": commit, "missing": missing, "asset_files": len(assets),
        "scope": "File presence only; does not verify manifest hashes, rendering, or gameplay",
        "gameplay_verified": False, "original_art_verified": False}


def register(store, config):
    path = PREFIX + f"workers/{config['device']}.json"
    previous = store.read(store.refresh(), path)
    if previous:
        old = json.loads(previous)
        if old["installation_id"] != config["installation_id"]:
            raise BridgeError("This device ID is registered by another installation; do not run two owners")
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(old["last_seen"])
        if age.total_seconds() < 300:
            return
    value = {"device": config["device"], "installation_id": config["installation_id"],
             "host": platform.node(), "platform": platform.system(), "last_seen": now(),
             "actions": sorted(ACTIONS), "project_dir": config["project_dir"]}
    store.write({path: encode(value)}, {path: previous})


def publish_receipt(store, receipt):
    path = receipt_path(receipt["job_id"])
    payload = encode(receipt)
    try:
        return store.write({path: payload}, {path: None})
    except Conflict:
        if store.read(store.refresh(), path) != payload:
            raise BridgeError("Another receipt already exists for this job")
        return None


def process_once(store, config):
    register(store, config)
    outbox = Path(config["state_dir"]) / "outbox"
    outbox.mkdir(exist_ok=True, mode=0o700)
    # An offline/crashed worker republishes its durable receipt, without rerunning the job.
    for file in sorted(outbox.glob("*.json")):
        publish_receipt(store, json.loads(file.read_text()))
        file.unlink()
    revision = store.refresh()
    completed = []
    for path in store.paths(revision, PREFIX + "jobs/"):
        if not path.endswith(".json"):
            continue
        job = json.loads(store.read(revision, path))
        if job.get("target") != config["device"]:
            continue
        validate_job(job)
        if path != job_path(job["id"]):
            raise BridgeError("Job ID does not match its queue path")
        if store.read(revision, receipt_path(job["id"])):
            continue
        claim_path = PREFIX + f"claims/{job['id']}.json"
        previous = store.read(revision, claim_path)
        claim = {"installation_id": config["installation_id"], "device": config["device"], "started_at": now()}
        if previous:
            claim = json.loads(previous)
            if claim["installation_id"] != config["installation_id"]:
                continue
        else:
            try:
                store.write({claim_path: encode(claim)}, {claim_path: None, path: encode(job)})
            except Conflict:
                continue
        # Actions are deliberately read-only and can safely resume after a crash before outbox persistence.
        try:
            state, result = inspect_local(config) if job["action"] == "inspect_local" else check_handoff(store, job)
        except (BridgeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            state, result = "failed", {"reason": str(error)}
        receipt = {"schema_version": 1, "job_id": job["id"], "device": config["device"],
                   "installation_id": config["installation_id"], "action": job["action"],
                   "started_at": claim["started_at"], "finished_at": now(), "state": state, "result": result}
        file = outbox / f"{job['id']}.json"
        atomic_json(file, receipt)
        commit = publish_receipt(store, receipt)
        file.unlink()
        completed.append({"job_id": job["id"], "state": state, "receipt_commit": commit})
    return completed


@contextlib.contextmanager
def local_lock(config):
    state = Path(config["state_dir"])
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / "process.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BridgeError("Another bridge process is already using this local state")
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    worker = commands.add_parser("worker")
    worker.add_argument("--once", action="store_true")
    submit = commands.add_parser("enqueue")
    submit.add_argument("--target", required=True)
    submit.add_argument("--action", choices=sorted(ACTIONS), default="inspect_local")
    submit.add_argument("--id", default=None)
    submit.add_argument("--source-commit")
    commands.add_parser("status")
    args = parser.parse_args()
    config = config_load(args.config)
    with local_lock(config):
        store = Store(config)
        if args.command == "enqueue":
            job_id = args.id or f"job-{uuid.uuid4().hex[:16]}"
            print(json.dumps(enqueue(store, args.target, args.action, job_id, args.source_commit), ensure_ascii=False))
        elif args.command == "status":
            revision = store.refresh()
            jobs = []
            for path in store.paths(revision, PREFIX + "jobs/"):
                job = json.loads(store.read(revision, path))
                receipt = store.read(revision, receipt_path(job["id"]))
                claim = store.read(revision, PREFIX + f"claims/{job['id']}.json")
                jobs.append({"job": job, "state": json.loads(receipt)["state"] if receipt else
                             "claimed_unfinished" if claim else "queued",
                             "receipt": json.loads(receipt) if receipt else None})
            workers = [json.loads(store.read(revision, path))
                       for path in store.paths(revision, PREFIX + "workers/")]
            print(json.dumps({"queue_commit": revision, "workers": workers, "jobs": jobs}, ensure_ascii=False, indent=2))
        else:
            while True:
                try:
                    completed = process_once(store, config)
                    if completed or args.once:
                        print(json.dumps({"device": config["device"], "completed": completed}), flush=True)
                except (BridgeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
                    if args.once:
                        raise
                    print(f"{now()} worker error: {error}", file=sys.stderr, flush=True)
                if args.once:
                    break
                time.sleep(20)


if __name__ == "__main__":
    try:
        main()
    except (BridgeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"bridge: {error}", file=sys.stderr)
        sys.exit(1)
