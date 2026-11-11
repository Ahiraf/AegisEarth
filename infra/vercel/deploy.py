"""Deploy the checked and built main commit to the existing Vercel projects."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

TEAM = "team_9ApVXPRdZiBsxFQpQ8C940G2"
PROJECTS = {
    "api": ("aegisearth-api", "prj_W0P0xFAGVlZbORk6AQKB2K5Qq9XG"),
    "frontend": ("aegisearth", "prj_TJIfTUHS7cVFDDGuhJfGoZCSQlVa"),
}
SOURCE_PATHS = {
    "api": (
        "backend",
        "Dockerfile",
        "vercel.json",
        "infra/vercel/container-start.sh",
        ":(exclude)backend/tests",
        ":(exclude)backend/model_packages/*/golden",
    ),
    "frontend": ("frontend",),
}
COMMIT_KEY = "aegisearthCommit"
READY_PATH = "/api/v1/health/ready"


def request(url, *, token=None, body=None, headers=None):
    request_headers = {"User-Agent": "AegisEarth-CD", **(headers or {})}
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    with urlopen(Request(url, data=body, headers=request_headers), timeout=45) as response:
        return response.read()


def vercel(path, *, body=None, headers=None, **query):
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        raise RuntimeError("Add VERCEL_TOKEN to the repository's GitHub Actions secrets.")
    params = urlencode({"teamId": TEAM, **query})
    try:
        response = request(
            f"https://api.vercel.com{path}?{params}", token=token, body=body, headers=headers
        )
    except HTTPError as error:
        raise RuntimeError(f"Vercel {path} returned HTTP {error.code}.") from None
    return json.loads(response) if response else None


def is_current_main(commit):
    repository = os.environ["GITHUB_REPOSITORY"]
    api = os.environ["GITHUB_API_URL"]
    ref = request(f"{api}/repos/{repository}/git/ref/heads/main", token=os.environ["GH_TOKEN"])
    return json.loads(ref)["object"]["sha"] == commit


def changed(target, commit):
    name, _ = PROJECTS[target]
    live = vercel(f"/v13/deployments/{name}.vercel.app")
    metadata = live.get("meta") or {}
    deployed = metadata.get(COMMIT_KEY) or metadata.get("githubCommitSha")
    if not deployed or not re.fullmatch(r"[0-9a-f]{40}", deployed):
        return True
    diff = subprocess.run(
        ["git", "diff", "--quiet", deployed, commit, "--", *SOURCE_PATHS[target]],
        stderr=subprocess.DEVNULL,
        check=False,
    )
    # An unknown previous commit also warrants a fresh deployment.
    return diff.returncode != 0


def package_frontend(output):
    dist = Path("frontend/dist")
    if not (dist / "index.html").is_file():
        raise RuntimeError("Build the frontend before packaging it.")
    with tarfile.open(output / "frontend.tar.gz", "w:gz") as archive:
        for path in sorted(dist.rglob("*")):
            if path.is_file():
                archive.add(path, arcname=path.relative_to(dist), recursive=False)
    config = json.loads(Path("frontend/vercel.json").read_text(encoding="utf-8"))
    config.pop("framework", None)
    config["buildCommand"] = "mkdir -p dist && tar -xzf frontend.tar.gz -C dist"
    config["outputDirectory"] = "dist"
    (output / "vercel.json").write_text(json.dumps(config), encoding="utf-8")


def package_api(output):
    tracked = subprocess.check_output(["git", "ls-files", "-z", "backend"], text=True).split("\0")
    with tarfile.open(output / "backend.tar.gz", "w:gz") as archive:
        for path in filter(None, tracked):
            if "/tests/" not in path and not path.endswith(".fits"):
                archive.add(path, arcname=path, recursive=False)
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8").splitlines()
    base = next(line for line in dockerfile if line.startswith("FROM "))
    lines = [f"{base} AS source", "ADD backend.tar.gz /source/", ""]
    for line in dockerfile:
        if line.startswith("COPY backend/"):
            *sources, destination = line.removeprefix("COPY ").split()
            line = " ".join(
                ["COPY --from=source", *(f"/source/{path}" for path in sources), destination]
            )
        elif line.startswith("COPY infra/vercel/container-start.sh "):
            line = line.replace("infra/vercel/", "", 1)
        lines.append(line)
    (output / "Dockerfile").write_text("\n".join(lines) + "\n", encoding="utf-8")
    for filename in ("vercel.json", "infra/vercel/container-start.sh"):
        source = Path(filename)
        (output / source.name).write_bytes(source.read_bytes())


def upload(output):
    files = []
    for path in sorted(output.iterdir()):
        body = path.read_bytes()
        digest = hashlib.sha1(body).hexdigest()
        vercel(
            "/v2/files",
            body=body,
            headers={
                "Content-Type": "application/octet-stream",
                "x-vercel-digest": digest,
            },
        )
        files.append({"file": path.name, "sha": digest, "size": len(body)})
    return files


def deploy(target, commit):
    name, project = PROJECTS[target]
    domain = f"{name}.vercel.app"
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory)
        if target == "api":
            package_api(output)
        else:
            package_frontend(output)
        files = upload(output)
    if not is_current_main(commit):
        print(f"Skipping {name}: a newer commit is on main.")
        return
    payload = {
        "name": name,
        "project": project,
        "target": "production",
        "files": files,
        "meta": {COMMIT_KEY: commit, "aegisearthBranch": "main"},
    }
    release = vercel(
        "/v13/deployments",
        body=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        skipAutoDetectionConfirmation="1",
    )
    print(f"{name} deployment {release['id']} started for {commit}.", flush=True)
    for _ in range(72):
        status = vercel(f"/v13/deployments/{release['id']}")
        state = status["readyState"]
        if state in {"ERROR", "CANCELED", "BLOCKED"} or status.get("aliasError"):
            raise RuntimeError(
                f"{name} release {release['id']} stopped at {state}. Check Vercel logs."
            )
        if state == "READY" and domain in (status.get("alias") or []):
            break
        time.sleep(10)
    else:
        raise RuntimeError(
            f"{name} release {release['id']} did not reach its production domain in time."
        )

    origin = f"https://{domain}"
    for _ in range(6):
        try:
            if target == "frontend":
                request(origin)
            if json.loads(request(origin + READY_PATH)).get("status") == "ready":
                print(f"{origin} is live and ready.")
                return
        except (URLError, ValueError):
            pass
        time.sleep(5)
    raise RuntimeError(f"The readiness check for {origin} failed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", *PROJECTS))
    args = parser.parse_args()
    commit = os.environ["GITHUB_SHA"]
    if subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() != commit:
        raise RuntimeError("The checkout does not match the checked commit.")
    current = is_current_main(commit)
    if args.action == "plan":
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            for target in PROJECTS:
                should_deploy = current and changed(target, commit)
                print(f"{target}={str(should_deploy).lower()}", file=output)
    elif current:
        deploy(args.action, commit)
    else:
        print("A newer commit is on main. Skipping this release.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, URLError) as error:
        raise SystemExit(str(error)) from None
