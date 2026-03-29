from __future__ import annotations

import subprocess
import sys

from _common import ROOT, print_fail, print_ok, support_url, validate_paypal_url

COMMANDS = [
    ("lint", [sys.executable, "scripts/lint.py"]),
    ("typecheck", [sys.executable, "scripts/typecheck.py"]),
    ("test", [sys.executable, "scripts/test.py"]),
    ("build", [sys.executable, "scripts/build.py"]),
]


def main() -> int:
    try:
        for label, command in COMMANDS:
            completed = subprocess.run(command, cwd=ROOT, check=False)
            if completed.returncode != 0:
                raise RuntimeError(f"{label} failed with exit code {completed.returncode}.")

        valid, details = validate_paypal_url(support_url())
        if not valid:
            raise RuntimeError(f"PayPal validation failed: {details}")

        print_ok(f"Release validation passed. PayPal resolved to {details}")
        return 0
    except Exception as error:  # pragma: no cover - release script
        print_fail(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
