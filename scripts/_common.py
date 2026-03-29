from __future__ import annotations

import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import Request, urlopen

import quickjs

ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist"

RUNTIME_PATHS = [
    "manifest.json",
    "popup.html",
    "script.js",
    "styles.css",
    "panel.js",
    "content.js",
    "service-worker.js",
    "privacy-policy.html",
    "assets",
    "lib",
    "styles",
]

TEXT_EXTENSIONS = {".js", ".json", ".html", ".css", ".md", ".txt", ".py", ".yml", ".yaml"}
PLACEHOLDER_RE = re.compile(r"\[(?:PROJECT_NAME|TARGET USERS|FLOW_1|FLOW_2|FLOW_3|STACK|TARGET|BRANCH_NAME|REMOTE_NAME|PAYPAL_ME_LINK_\d+)\]")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def manifest() -> dict:
    return read_json(ROOT / "manifest.json")


def runtime_files() -> list[Path]:
    files: list[Path] = []
    for item in RUNTIME_PATHS:
        path = ROOT / item
        if not path.exists():
            continue
        if path.is_dir():
            files.extend(sorted(child for child in path.rglob("*") if child.is_file()))
        else:
            files.append(path)
    return files


def repo_files() -> list[Path]:
    return [path for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts]


def js_files(include_scripts: bool = True) -> list[Path]:
    files = [path for path in runtime_files() if path.suffix == ".js"]
    if include_scripts:
        files.extend(sorted((ROOT / "scripts").glob("*.py")))
    return files


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def print_ok(message: str) -> None:
    print(f"[ok] {message}")


def print_fail(message: str) -> None:
    print(f"[fail] {message}", file=sys.stderr)


def parse_javascript(path: Path) -> None:
    quickjs.Context().eval(f"new Function({json.dumps(read_text(path))});")


class IdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name == "id" and value:
                self.ids.add(value)


def html_ids(path: Path) -> set[str]:
    parser = IdCollector()
    parser.feed(read_text(path))
    return parser.ids


def find_get_element_ids(js_path: Path) -> set[str]:
    content = read_text(js_path)
    return set(re.findall(r"getElementById\(\"([^\"]+)\"\)", content))


def validate_paypal_url(url: str) -> tuple[bool, str]:
    request = Request(url, method="HEAD")
    try:
        with urlopen(request, timeout=20) as response:
            final_url = response.geturl()
            return response.status == 200 and "paypal.com/paypalme/" in final_url.lower(), final_url
    except URLError as error:
        return False, str(error)


def support_url() -> str:
    constants = read_text(ROOT / "lib" / "constants.js")
    match = re.search(r'SUPPORT_URL:\s*"([^"]+)"', constants)
    ensure(match is not None, "SUPPORT_URL was not found in lib/constants.js.")
    return match.group(1)


def package_extension() -> Path:
    DIST_DIR.mkdir(exist_ok=True)
    version = manifest()["version"]
    artifact = DIST_DIR / f"AutoFair-chrome-extension-v{version}.zip"
    if artifact.exists():
        artifact.unlink()

    with zipfile.ZipFile(artifact, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in runtime_files():
            archive.write(path, path.relative_to(ROOT).as_posix())
    return artifact


def text_files(paths: Iterable[Path] | None = None) -> list[Path]:
    source = paths if paths is not None else repo_files()
    return [path for path in source if path.suffix.lower() in TEXT_EXTENSIONS]
