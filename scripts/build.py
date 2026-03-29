from __future__ import annotations

import sys

from _common import package_extension, print_fail, print_ok


def main() -> int:
    try:
        artifact = package_extension()
        print_ok(f"Built extension package: {artifact}")
        return 0
    except Exception as error:  # pragma: no cover - release script
        print_fail(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
