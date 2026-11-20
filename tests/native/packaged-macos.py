import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import urlopen

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 tests/native/packaged-macos.py /path/to/Doolittle.app")

app = Path(sys.argv[1]).resolve(strict=True)
expected_node = app / "Contents/Resources/runtime/bin/node"
binary = app / "Contents/MacOS/Doolittle"
cli = app / "Contents/MacOS/doolittle-native"
subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)], check=True)
with tempfile.TemporaryDirectory(prefix="doolittle-native-app-smoke-") as folder:
    root = Path(folder)
    for child in ("home", "workspace", "profile"):
        (root / child).mkdir(mode=0o700)
    (root / "profile/settings.json").write_text(
        json.dumps({"model": {"provider": "offline", "model": "offline-test"}})
    )
    env = {"HOME": str(root / "home"), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"}
    subprocess.run(
        [str(cli), "--workspace", str(root / "workspace"), "--profile", str(root / "profile"),
         "--offline", "native", "probe", "--json"],
        cwd=root, env=env, check=True, timeout=45, stdout=subprocess.DEVNULL,
    )
    print("Packaged Rust CLI completed an authenticated ElizaOS health probe.")
    with (root / "desktop.log").open("w+") as logs:
        proc = subprocess.Popen(
            [str(binary), "--offline", "--workspace", str(root / "workspace"), "--profile", str(root / "profile")],
            cwd=root,
            env=env,
            stdout=logs, stderr=logs,
        )
        listener = None
        observed_node = None
        try:
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline and proc.poll() is None:
                children = subprocess.run(
                    ["/usr/bin/pgrep", "-P", str(proc.pid)],
                    text=True, capture_output=True,
                ).stdout.split()
                for child in children:
                    command = subprocess.run(
                        ["/bin/ps", "-p", child, "-o", "command="],
                        text=True, capture_output=True,
                    ).stdout.strip()
                    if not command.startswith(str(expected_node) + " "):
                        continue
                    observed_node = child
                    sockets = subprocess.run(
                        ["/usr/sbin/lsof", "-nP", "-a", "-p", child, "-iTCP", "-sTCP:LISTEN", "-Fn"],
                        capture_output=True, text=True,
                    ).stdout
                    address = re.search(r"^n127\.0\.0\.1:(\d+)$", sockets, re.MULTILINE)
                    if address:
                        listener = "http://127.0.0.1:" + address.group(1)
                        break
                if listener:
                    break
                time.sleep(.25)
            if listener is None:
                logs.seek(0)
                raise RuntimeError("Bundled Node did not publish a local listener. " + logs.read()[-1600:])
            try:
                urlopen(listener + "/health", timeout=3)
            except HTTPError as error:
                if error.code != 401:
                    raise
            else:
                raise RuntimeError("Packaged listener did not require its private capability")
            print("Signed GPUI app started its bundled Node and authenticated loopback ElizaOS listener.")
        finally:
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=10)
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            state = subprocess.run(
                ["/bin/ps", "-p", observed_node, "-o", "stat="],
                capture_output=True, text=True,
            ).stdout.strip()
            if not state or state.startswith("Z"):
                print("Bundled ElizaOS shut down after its host exited.")
                break
            time.sleep(.25)
        else:
            raise RuntimeError("Runtime process did not shut down after its host exited")
