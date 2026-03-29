from __future__ import annotations

import sys

from _common import PLACEHOLDER_RE, ensure, print_fail, print_ok, read_text, text_files


def main() -> int:
    try:
        for path in text_files():
            content = read_text(path)
            ensure("\t" not in content, f"Tab character found in {path}")
            ensure(not PLACEHOLDER_RE.search(content), f"Placeholder token found in {path}")
            for line_number, line in enumerate(content.splitlines(), start=1):
                ensure(line == line.rstrip(), f"Trailing whitespace in {path}:{line_number}")
        print_ok("Repository text hygiene checks passed.")
        return 0
    except AssertionError as error:
        print_fail(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
