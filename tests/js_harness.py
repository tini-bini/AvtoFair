from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import quickjs

ROOT = Path(__file__).resolve().parents[1]


class JsHarness:
    def __init__(self) -> None:
        self.context = quickjs.Context()
        self.context.eval(
            """
            var globalThis = this;
            var window = this;
            var location = { href: 'https://www.avto.net/Ads/details.asp?id=123456', hostname: 'www.avto.net', origin: 'https://www.avto.net' };
            var console = { log: function(){}, error: function(){}, warn: function(){} };
            var __storageLocal = {};
            var __storageSync = {};
            var chrome = {
              runtime: { lastError: null },
              storage: {
                local: {
                  get: function(keys, callback) {
                    var result = {};
                    if (Array.isArray(keys)) {
                      keys.forEach(function(key) { result[key] = __storageLocal[key]; });
                    } else if (typeof keys === 'string') {
                      result[keys] = __storageLocal[keys];
                    } else if (keys && typeof keys === 'object') {
                      Object.keys(keys).forEach(function(key) {
                        result[key] = Object.prototype.hasOwnProperty.call(__storageLocal, key) ? __storageLocal[key] : keys[key];
                      });
                    }
                    callback(result);
                  },
                  set: function(values, callback) {
                    Object.keys(values || {}).forEach(function(key) { __storageLocal[key] = values[key]; });
                    if (callback) callback();
                  }
                },
                sync: {
                  get: function(keys, callback) {
                    var result = {};
                    if (Array.isArray(keys)) {
                      keys.forEach(function(key) { result[key] = __storageSync[key]; });
                    } else if (typeof keys === 'string') {
                      result[keys] = __storageSync[keys];
                    }
                    callback(result);
                  },
                  set: function(values, callback) {
                    Object.keys(values || {}).forEach(function(key) { __storageSync[key] = values[key]; });
                    if (callback) callback();
                  },
                  remove: function(keys, callback) {
                    var list = Array.isArray(keys) ? keys : [keys];
                    list.forEach(function(key) { delete __storageSync[key]; });
                    if (callback) callback();
                  }
                }
              }
            };
            """
        )

    def load(self, *relative_paths: str) -> None:
        for relative in relative_paths:
            self.context.eval((ROOT / relative).read_text(encoding="utf-8"))

    def call(self, expression: str) -> Any:
        payload = self.context.eval(f"JSON.stringify({expression})")
        return json.loads(payload)

    def call_async(self, expression: str) -> Any:
        self.context.eval(
            f"""
            globalThis.__testResult = null;
            globalThis.__testError = null;
            (async function() {{
              try {{
                globalThis.__testResult = await ({expression});
              }} catch (error) {{
                globalThis.__testError = String(error && error.message ? error.message : error);
              }}
            }})();
            """
        )
        while self.context.execute_pending_job():
            pass
        error = self.context.eval("globalThis.__testError")
        if error:
            raise AssertionError(error)
        payload = self.context.eval("JSON.stringify(globalThis.__testResult)")
        if payload is None:
            return None
        return json.loads(payload)
