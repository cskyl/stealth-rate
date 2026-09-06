#!/usr/bin/env python3
"""Bounded real-Firefox QA for StealthRate's isolated payload-mode frontend.

The server intentionally exposes only the built SPA, public study JSON, and
sample media.  This script never calls Apps Script or a collection endpoint.
The test hook is used only to shorten assignment routing; every trial gate is
opened by actual media playback and a real ``ended`` event.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import http.server
import json
import os
import shutil
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


REPO = Path(__file__).resolve().parents[1]
STUDY = "sample_synthetic_v0"
DIST = REPO / "frontend" / "dist"
STUDY_DIR = REPO / "studies" / STUDY
MEDIA_DIR = REPO / "media" / STUDY


class AllowlistServer(http.server.ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int]):
        self.requests: list[dict[str, object]] = []
        super().__init__(address, AllowlistHandler)


class AllowlistHandler(http.server.BaseHTTPRequestHandler):
    server: AllowlistServer

    def _record(self, status: int, allowed: bool) -> None:
        parsed = urlparse(self.path)
        self.server.requests.append({"path": parsed.path, "status": status, "allowed": allowed})

    def _send(self, status: int, body: bytes, content_type: str = "text/plain") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/" or path == "":
            target = DIST / "index.html"
            self._file(target, "text/html", True)
            return
        rel = path.lstrip("/")
        target: Path | None = None
        content_type = "application/octet-stream"
        if rel.startswith("assets/") and Path(rel).name == rel.removeprefix("assets/"):
            target = DIST / rel
            content_type = "text/javascript" if target.suffix == ".js" else "text/css"
        elif rel in {f"studies/{STUDY}/study.json", f"studies/{STUDY}/items.json", f"studies/{STUDY}/blocks.json"}:
            target = REPO / rel
            content_type = "application/json"
        elif rel.startswith(f"media/{STUDY}/"):
            media_name = rel.removeprefix(f"media/{STUDY}/")
            if Path(media_name).name == media_name and media_name.endswith(".mp4"):
                target = MEDIA_DIR / media_name
                content_type = "video/mp4"
        if target is None or not target.is_file() or REPO not in target.resolve().parents:
            self._record(404, False)
            self._send(404, b"not found")
            return
        self._file(target, content_type, True)

    def _file(self, target: Path, content_type: str, allowed: bool) -> None:
        body = target.read_bytes()
        if target == STUDY_DIR / "blocks.json":
            fixture = json.loads(body)
            for block in fixture["blocks"]:
                block["items"] = block["items"][:4]
            body = json.dumps(fixture).encode()
        range_header = self.headers.get("Range", "")
        if target.parent == MEDIA_DIR and range_header.startswith("bytes="):
            try:
                spec = range_header.removeprefix("bytes=").split(",", 1)[0]
                start_text, end_text = spec.split("-", 1)
                start = int(start_text or 0)
                end = int(end_text) if end_text else len(body) - 1
                if start < 0 or start >= len(body) or end < start:
                    raise ValueError("invalid range")
                end = min(end, len(body) - 1)
                chunk = body[start:end + 1]
                self.send_response(206)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(body)}")
                self.send_header("Content-Length", str(len(chunk)))
                self.end_headers()
                self._record(206, allowed)
                self.wfile.write(chunk)
                return
            except (ValueError, IndexError):
                self._record(416, False)
                self._send(416, b"invalid range")
                return
        self._record(200, allowed)
        self._send(200, body, content_type)

    def do_POST(self) -> None:  # noqa: N802
        # Payload mode must not need a backend.  Reject all writes explicitly.
        self._record(405, False)
        self._send(405, b"payload-mode QA server rejects POST")

    def log_message(self, *_args: object) -> None:
        return


def wait(driver: webdriver.Firefox, condition, timeout: float = 15):
    return WebDriverWait(driver, timeout, poll_frequency=0.1).until(condition)


def click(driver: webdriver.Firefox, action: str) -> None:
    wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, f"button[data-action='{action}']")).click()


def screenshot(driver: webdriver.Firefox, out: Path, name: str) -> str:
    path = out / f"{name}.png"
    driver.save_screenshot(str(path))
    return str(path)


def text(driver: webdriver.Firefox) -> str:
    return driver.find_element(By.TAG_NAME, "body").text


def fill_trial(driver: webdriver.Firefox) -> None:
    wait(driver, lambda d: d.find_element(By.ID, "trial-form").is_displayed())
    choice = driver.find_elements(By.CSS_SELECTOR, "#trial-form input[name='choice']")[0]
    choice.click()
    driver.find_element(By.CSS_SELECTOR, "#trial-form input[name='edited'][value='no']").click()
    driver.execute_script("const f=document.querySelector('#trial-form'); const s=f.querySelector('[name=mcq_confidence]'); s.value='2'; s.dispatchEvent(new Event('change',{bubbles:true}));")
    for name, value in (("edit_confidence", "2"), ("conspicuousness", "1"), ("naturalness", "5")):
        driver.find_element(By.CSS_SELECTOR, f"#trial-form input[name='{name}'][value='{value}']").click()
    driver.find_element(By.CSS_SELECTOR, "#trial-form button[type='submit']").click()


def genuine_play(driver: webdriver.Firefox, out: Path, label: str) -> dict[str, object]:
    video = wait(driver, lambda d: d.find_element(By.ID, "clip"))
    before = driver.execute_script(
        "return {ready: arguments[0].readyState, width: arguments[0].videoWidth, "
        "height: arguments[0].videoHeight, duration: arguments[0].duration};", video
    )
    click(driver, "play")
    try:
        wait(driver, lambda d: d.execute_script("return arguments[0].currentTime >= 1.5;", video), 25)
    except TimeoutException as error:
        failed = driver.execute_script(
            "return {ended: arguments[0].ended, paused: arguments[0].paused, "
            "currentTime: arguments[0].currentTime, duration: arguments[0].duration, "
            "ready: arguments[0].readyState, network: arguments[0].networkState, "
            "error: arguments[0].error ? {code: arguments[0].error.code, message: arguments[0].error.message} : null, "
            "src: arguments[0].currentSrc};", video
        )
        screenshot(driver, out, f"{label}_timeout")
        raise AssertionError(f"playback timed out: {failed}") from error
    wait(driver, lambda d: d.execute_script("return arguments[0].currentTime >= 1.5;", video), 8)
    mid = driver.execute_script(
        "const v=arguments[0], c=document.createElement('canvas'); c.width=32; c.height=32; "
        "const x=c.getContext('2d'); x.drawImage(v,0,0,32,32); "
        "const p=x.getImageData(0,0,32,32).data; let sum=0, nonzero=0; "
        "for(let i=0;i<p.length;i+=4){sum+=p[i]+p[i+1]+p[i+2]; if(p[i]+p[i+1]+p[i+2]>30)nonzero++;} "
        "return {width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime,pixel_sum:sum,nonzero_pixels:nonzero};", video
    )
    mid_path = screenshot(driver, out, f"{label}_mid")
    wait(driver, lambda d: d.execute_script("return arguments[0].ended === true;", video), 25)
    after = driver.execute_script(
        "return {ended: arguments[0].ended, currentTime: arguments[0].currentTime, "
        "width: arguments[0].videoWidth, height: arguments[0].videoHeight, "
        "duration: arguments[0].duration, ready: arguments[0].readyState};", video
    )
    screenshot(driver, out, label)
    if not after["ended"] or float(after["currentTime"]) < 1 or int(after["width"]) <= 0 or int(after["height"]) <= 0:
        raise AssertionError(f"playback did not decode/end: before={before} after={after}")
    return {"before": before, "mid": mid, "mid_screenshot": mid_path, "after": after}


def browser_options(download_dir: Path, browser: str) -> Options | ChromeOptions:
    if browser == "chrome":
        options = ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-gpu")
        options.add_argument("--autoplay-policy=no-user-gesture-required")
        options.add_argument("--window-size=1280,1000")
        options.add_experimental_option("prefs", {
            "download.default_directory": str(download_dir),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        })
        return options
    options = Options()
    options.binary_location = "/usr/local/bin/firefox"
    options.add_argument("-headless")
    options.set_preference("media.autoplay.default", 0)
    options.set_preference("media.autoplay.blocking_policy", 0)
    options.set_preference("browser.download.folderList", 2)
    options.set_preference("browser.download.dir", str(download_dir))
    options.set_preference("browser.download.useDownloadDir", True)
    options.set_preference("browser.helperApps.neverAsk.saveToDisk", "application/gzip,application/octet-stream")
    options.set_preference("pdfjs.disabled", True)
    return options


def run(port: int, out: Path, browser: str) -> dict[str, object]:
    out = out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    download_dir = out / "downloads"
    download_dir.mkdir(exist_ok=True)
    server = AllowlistServer(("127.0.0.1", port))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    # test=1 fixes the UI's headphone routing order only; media is still loaded
    # and played through the real video element below.
    base = f"http://127.0.0.1:{port}/?study={STUDY}&test=1&QA=20260906"
    items = json.loads((STUDY_DIR / "items.json").read_text(encoding="utf-8"))["items"]
    practice = [row["item_id"] for row in items if row["practice"]]
    trials = [row["item_id"] for row in items if not row["practice"]][:2]
    receipt: dict[str, object] = {
        "server": {"base": base, "allowlist": "dist assets, public study json, media mp4; POST rejected", "browser": browser},
        "routing_hook": {"used": False, "purpose": "isolated HTTP blocks fixture truncated to first four assigned clips; source unchanged", "bypassed_media": False},
        "headphone_routing": {"test_query": "test=1", "purpose": "deterministic left/right UI routing; no audio result is claimed"},
        "screenshots": {},
        "playback": [],
        "console_errors": [],
    }
    driver = webdriver.Chrome(options=browser_options(download_dir, browser)) if browser == "chrome" else webdriver.Firefox(options=browser_options(download_dir, browser))
    if browser == "chrome":
        driver.execute_cdp_cmd("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": str(download_dir), "eventsEnabled": True})
    driver.set_window_size(1280, 1000)
    try:
        driver.get(base)
        wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, "h2"))
        driver.execute_script(
            "window.__qaErrors=[]; window.addEventListener('error', e=>window.__qaErrors.push(String(e.error||e.message))); "
            "window.addEventListener('unhandledrejection', e=>window.__qaErrors.push(String(e.reason)));"
        )
        receipt["screenshots"]["language"] = screenshot(driver, out, "00_language")
        click(driver, "consent")
        click(driver, "device")
        click(driver, "headphones")
        for side in ("left", "right", "left", "right", "left", "right"):
            click(driver, f"headphone-{side}")
        driver.execute_script("document.querySelectorAll('details').forEach(d=>d.open=true)")
        screenshot(driver, out, "instructions_expanded")
        click(driver, "start")
        wait(driver, lambda d: d.execute_script("return Boolean(window.__STEALTHRATE_TEST__?.getState?.().assignment);"))
        wait(driver, lambda d: d.find_element(By.ID, "practice-form"))
        receipt["screenshots"]["practice"] = screenshot(driver, out, "01_practice")
        receipt["practice_playback"] = []
        receipt["practice_playback"].append(genuine_play(driver, out, "02_practice1_played"))
        click(driver, "practice-next")
        wait(driver, lambda d: d.find_element(By.ID, "practice-form"))
        receipt["practice_playback"].append(genuine_play(driver, out, "03_practice2_played"))
        click(driver, "practice-next")
        # Practice is the only routing shortcut; now prove a real missing-media 404 UI.
        wait(driver, lambda d: d.find_element(By.ID, "clip"))
        receipt["screenshots"]["trial_locked"] = screenshot(driver, out, "04_trial_locked")
        driver.execute_script(
            "const v=document.querySelector('#clip'); v.src='/media/sample_synthetic_v0/qa-missing-control.mp4'; v.load();"
        )
        wait(driver, lambda d: d.execute_script("return Boolean(document.querySelector('#clip')?.error);"), 10)
        receipt["media_404"] = {"video_error": True, "visible_text": text(driver)}
        receipt["screenshots"]["media_404"] = screenshot(driver, out, "05_media_404")
        driver.refresh()
        wait(driver, lambda d: d.find_element(By.ID, "clip"))
        receipt["playback"].append(genuine_play(driver, out, "06_trial1_played"))
        receipt["screenshots"]["trial_form"] = screenshot(driver, out, "07_trial1_form")
        fill_trial(driver)
        wait(driver, lambda d: d.execute_script("return window.__STEALTHRATE_TEST__.getState().itemIndex === 3;"))
        driver.refresh()
        wait(driver, lambda d: d.find_element(By.ID, "clip"))
        wait(driver, lambda d: d.execute_script("return Boolean(window.__STEALTHRATE_TEST__?.setAssignmentItems);"))
        wait(driver, lambda d: d.find_element(By.ID, "clip"))
        persisted = driver.execute_script("return {state:window.__STEALTHRATE_TEST__.getState(), keys:Object.keys(localStorage)};")
        receipt["reload_persistence"] = {"item_index": persisted["state"]["itemIndex"], "screen": persisted["state"]["screen"], "scoped_keys": persisted["keys"]}
        receipt["screenshots"]["trial2_reloaded"] = screenshot(driver, out, "08_trial2_reloaded")
        receipt["playback"].append(genuine_play(driver, out, "09_trial2_played"))
        fill_trial(driver)
        wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, ".download-link"), 15)
        receipt["screenshots"]["complete"] = screenshot(driver, out, "10_complete")
        link = driver.find_element(By.CSS_SELECTOR, ".download-link")
        link.click()
        wait(driver, lambda _d: (download_dir / "stealthrate-responses.json.gz").exists(), 10)
        downloaded = download_dir / "stealthrate-responses.json.gz"
        bundle = json.loads(gzip.decompress(downloaded.read_bytes()).decode("utf-8"))
        receipt["download"] = {"path": str(downloaded), "bytes": downloaded.stat().st_size, "responses": len(bundle.get("responses", [])), "events": len(bundle.get("events", [])), "status": bundle.get("session", {}).get("status")}
        assert len(bundle["responses"]) == 4, "two trial responses each must survive reload"
        driver.refresh()
        restored_link = wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, ".download-link"))
        restored_bytes = base64.b64decode(restored_link.get_attribute("href").split(",", 1)[1])
        assert json.loads(gzip.decompress(restored_bytes)) == bundle
        receipt["completed_refresh"] = {"same_download_restored": True}
        screenshot(driver, out, "11_completed_refresh")
        receipt["payload_forbidden_strings"] = [word for word in ("clean", "harmless_av", "audio_low", "audio_high", "visual_low", "visual_high") if word in json.dumps(bundle)]
        receipt["console_errors"] = driver.execute_script("return window.__qaErrors || [];")
        # Verify exact exposure boundary with real HTTP requests in this browser.
        checks = {}
        for path in ("/frontend/src/app.ts", "/studies/sample_synthetic_v0/study.yaml", "/studies/sample_synthetic_v0/private/key.json", "/local/sample_synthetic_v0/sessions.jsonl", "/data/secret.txt"):
            status = driver.execute_async_script(
                "const path=arguments[0], done=arguments[arguments.length-1]; "
                "fetch(path).then(r=>done(r.status)).catch(()=>done(-1));", path
            )
            checks[path] = status
        receipt["exposure_checks"] = checks
    finally:
        driver.quit()
        server.shutdown()
        server.server_close()
    receipt["server_requests"] = server.requests
    (out / "BROWSER_SMOKE_20260906.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=18765)
    parser.add_argument("--out", type=Path, default=REPO / "docs" / "qa_20260906")
    parser.add_argument("--browser", choices=("firefox", "chrome"), default="firefox")
    args = parser.parse_args()
    result = run(args.port, args.out, args.browser)
    print(json.dumps({"receipt": str(args.out / 'BROWSER_SMOKE_20260906.json'), "download": result.get("download"), "playback": len(result.get("playback", [])), "console_errors": result.get("console_errors")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
