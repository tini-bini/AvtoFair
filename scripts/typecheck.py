from __future__ import annotations

from _common import ROOT, ensure, find_get_element_ids, html_ids, manifest, parse_javascript, print_fail, print_ok, read_text, runtime_files

DYNAMIC_POPUP_IDS = {
    "open-current-btn",
    "save-current-btn",
}


def main() -> int:
    try:
        data = manifest()
        ensure(data["manifest_version"] == 3, "Manifest must stay on MV3.")
        ensure(tuple(int(part) for part in data["version"].split(".")) >= (1, 0, 0), "Manifest version must be release-grade.")

        for path in runtime_files():
            if path.suffix == ".js":
                parse_javascript(path)

        popup_ids = html_ids(ROOT / "popup.html")
        popup_script_ids = find_get_element_ids(ROOT / "script.js")
        missing = sorted((popup_script_ids - popup_ids) - DYNAMIC_POPUP_IDS)
        ensure(not missing, f"Popup script references missing ids: {', '.join(missing)}")

        manifest_text = read_text(ROOT / "manifest.json")
        ensure("popup.js" not in manifest_text and "styles/popup.css" not in manifest_text, "Legacy popup assets must stay removed.")

        print_ok("Manifest, syntax, and DOM contract checks passed.")
        return 0
    except AssertionError as error:
        print_fail(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
