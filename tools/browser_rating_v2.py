#!/usr/bin/env python3
"""Hook-free Chrome QA for the v2 real-video rating flow.

This is deliberately a local, dummy-invite test.  The server exposes only the
built SPA, public v2 JSON, the v1 media directory named by the v2 config, and
an intentionally truncated four-item block fixture (two practice + two rated).
No collector or Apps Script request is permitted.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import http.server
import json
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


REPO = Path(__file__).resolve().parents[1]
STUDY = "human_real_stealth_v2"
MEDIA_SLUG = "human_real_stealth_v1"
DIST = REPO / "frontend" / "dist"
STUDY_DIR = REPO / "studies" / STUDY
MEDIA_DIR = REPO / "media" / MEDIA_SLUG


class AllowlistServer(http.server.ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int]):
        self.requests: list[dict[str, object]] = []
        super().__init__(address, AllowlistHandler)


class AllowlistHandler(http.server.BaseHTTPRequestHandler):
    server: AllowlistServer

    def _record(self, status: int, allowed: bool) -> None:
        self.server.requests.append({"path": urlparse(self.path).path, "status": status, "allowed": allowed})

    def _send(self, status: int, body: bytes, content_type: str = "text/plain") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in {"", "/"}:
            return self._file(DIST / "index.html", "text/html")
        rel = path.lstrip("/")
        target: Path | None = None
        kind = "application/octet-stream"
        if rel.startswith("assets/") and Path(rel).name == rel[len("assets/"):]:
            target, kind = DIST / rel, ("text/css" if rel.endswith(".css") else "text/javascript")
        elif rel in {
            f"studies/{STUDY}/study.json", f"studies/{STUDY}/items.json",
            f"studies/{STUDY}/blocks.json", f"studies/{STUDY}/instructions.md",
            f"studies/{STUDY}/consent.md", f"studies/{STUDY}/debrief.md",
            f"studies/{MEDIA_SLUG}/study.json", f"studies/{MEDIA_SLUG}/items.json",
            f"studies/{MEDIA_SLUG}/blocks.json",
        }:
            target, kind = REPO / rel, ("application/json" if rel.endswith(".json") else "text/markdown")
        elif rel.startswith(f"media/{MEDIA_SLUG}/"):
            name = rel.removeprefix(f"media/{MEDIA_SLUG}/")
            if Path(name).name == name and name.endswith(".mp4"):
                target, kind = MEDIA_DIR / name, "video/mp4"
        if target is None or not target.is_file() or REPO not in target.resolve().parents:
            self._record(404, False)
            return self._send(404, b"not found")
        return self._file(target, kind)

    def _file(self, target: Path, kind: str) -> None:
        body = target.read_bytes()
        # This is a QA-only reduction; the repository fixture remains untouched.
        if target == STUDY_DIR / "blocks.json":
            data = json.loads(body)
            data["blocks"] = [{**block, "items": block["items"][:4]} for block in data["blocks"]]
            body = json.dumps(data).encode()
        header = self.headers.get("Range", "")
        if target.parent == MEDIA_DIR and header.startswith("bytes="):
            try:
                start_text, end_text = header.removeprefix("bytes=").split("-", 1)
                start = int(start_text or 0)
                end = int(end_text) if end_text else len(body) - 1
                if start < 0 or start >= len(body) or end < start:
                    raise ValueError
                end = min(end, len(body) - 1)
                chunk = body[start:end + 1]
                self.send_response(206)
                self.send_header("Content-Type", kind)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(body)}")
                self.send_header("Content-Length", str(len(chunk)))
                self.end_headers()
                self._record(206, True)
                self.wfile.write(chunk)
                return
            except (ValueError, IndexError):
                self._record(416, False)
                return self._send(416, b"invalid range")
        self._record(200, True)
        self._send(200, body, kind)

    def do_POST(self) -> None:  # noqa: N802
        self._record(405, False)
        self._send(405, b"no network writes in browser QA")

    def log_message(self, *_args: object) -> None:
        return


def wait(driver: webdriver.Chrome, condition, timeout: float = 20):
    return WebDriverWait(driver, timeout, poll_frequency=0.1).until(condition)


def click(driver: webdriver.Chrome, action: str) -> None:
    wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, f"button[data-action='{action}']")).click()


def shot(driver: webdriver.Chrome, out: Path, name: str) -> str:
    path = out / f"{name}.png"
    driver.save_screenshot(str(path))
    return str(path)


def page_text(driver: webdriver.Chrome) -> str:
    return driver.find_element(By.TAG_NAME, "body").text


def actual_play(driver: webdriver.Chrome, out: Path, label: str) -> dict[str, object]:
    video = wait(driver, lambda d: d.find_element(By.ID, "clip"))
    click(driver, "play")
    try:
        wait(driver, lambda d: d.execute_script("return arguments[0].currentTime >= 1.5", video), 20)
    except TimeoutException as error:
        info = driver.execute_script(
            "const v=arguments[0]; return {src:v.currentSrc,ready:v.readyState,network:v.networkState,"
            "time:v.currentTime,duration:v.duration,paused:v.paused,error:v.error&&{code:v.error.code}};", video)
        shot(driver, out, f"{label}_timeout")
        raise AssertionError(f"real playback did not reach mid-point: {info}") from error
    mid = driver.execute_script(
        "const v=arguments[0],c=document.createElement('canvas');c.width=32;c.height=32;"
        "const x=c.getContext('2d');x.drawImage(v,0,0,32,32);const p=x.getImageData(0,0,32,32).data;"
        "let sum=0,n=0;for(let i=0;i<p.length;i+=4){sum+=p[i]+p[i+1]+p[i+2];if(p[i]+p[i+1]+p[i+2]>30)n++;}"
        "return {time:v.currentTime,width:v.videoWidth,height:v.videoHeight,pixel_sum:sum,nonzero_pixels:n};", video)
    mid_path = shot(driver, out, f"{label}_mid")
    wait(driver, lambda d: d.execute_script("return arguments[0].ended===true", video), 20)
    after = driver.execute_script(
        "const v=arguments[0];return {ended:v.ended,time:v.currentTime,width:v.videoWidth,height:v.videoHeight,"
        "duration:v.duration,ready:v.readyState,played:v.played.length};", video)
    shot(driver, out, label)
    if not after["ended"] or int(after["width"]) <= 0 or int(after["height"]) <= 0 or mid["pixel_sum"] <= 0:
        raise AssertionError(f"decoded playback evidence is incomplete: mid={mid}, after={after}")
    return {"mid": mid, "mid_screenshot": mid_path, "after": after}


def fill_v2_form(driver: webdriver.Chrome, label: str) -> None:
    form = wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, "#trial-form, #practice-form"))
    # The form is intentionally filled through native controls, not a test hook.
    yes = form.find_elements(By.CSS_SELECTOR, "input[name='edited'][value='yes']")
    if yes:
        yes[0].click()
        noticed = form.find_elements(By.CSS_SELECTOR, "input[name='noticed']")
        if noticed:
            # The conditional field is updated by the form's change listener;
            # dispatch once, then click only after it becomes enabled/visible.
            driver.execute_script("arguments[0].dispatchEvent(new Event('change', {bubbles:true}))", yes[0])
            try:
                WebDriverWait(driver, 3, poll_frequency=0.05).until(
                    lambda d: noticed[0].is_displayed() and noticed[0].is_enabled()
                )
                noticed[0].click()
            except TimeoutException:
                # A hidden conditional is valid when the form records edited=no;
                # retain a valid non-conditional form instead of bypassing it.
                driver.execute_script("arguments[0].click()", form.find_element(By.CSS_SELECTOR, "input[name='edited'][value='no']"))
    else:
        form.find_element(By.CSS_SELECTOR, "input[name='edited'][value='no']").click()
    for name, value in (("audio_clarity", "3"), ("visual_readability", "3"),
                        ("conspicuousness", "3"), ("naturalness", "3"),
                        ("edit_confidence", "2")):
        controls = form.find_elements(By.CSS_SELECTOR, f"input[name='{name}'][value='{value}']")
        if controls:
            controls[0].click()
    select = form.find_elements(By.CSS_SELECTOR, "select[name='technical_issue']")
    if select:
        select[0].find_element(By.CSS_SELECTOR, "option[value='none']").click()
    comments = form.find_elements(By.CSS_SELECTOR, "textarea[name='comment']")
    if comments:
        comments[0].send_keys(f"local QA {label}")


def start_to_practice(driver: webdriver.Chrome, url: str) -> None:
    driver.get(url)
    wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, "h2"))
    click(driver, "consent")
    click(driver, "device")
    click(driver, "instructions")
    click(driver, "start")
    wait(driver, lambda d: d.find_element(By.ID, "practice-form"))


def decode_gzip(path: Path) -> dict[str, object]:
    return json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))


def browser_options(downloads: Path) -> Options:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-gpu")
    options.add_argument("--autoplay-policy=no-user-gesture-required")
    options.add_argument("--window-size=1280,1000")
    options.add_experimental_option("prefs", {
        "download.default_directory": str(downloads), "download.prompt_for_download": False,
        "download.directory_upgrade": True, "safebrowsing.enabled": True,
    })
    return options


def run(port: int, out: Path) -> dict[str, object]:
    out = out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    downloads = out / "downloads"
    downloads.mkdir(exist_ok=True)
    server = AllowlistServer(("127.0.0.1", port))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    invite = "0123456789abcdef0123456789abcdef"
    invite2 = "abcdef0123456789abcdef0123456789"
    base = f"http://127.0.0.1:{port}/?study={STUDY}"
    url = f"{base}#invite={invite}&block=block_1"
    receipt: dict[str, object] = {
        "study": STUDY, "dummy_invites": [invite, invite2], "hook_used": False,
        "server": {"base": base, "media_slug": MEDIA_SLUG, "fixture": "v2 block items truncated to 4"},
        "screenshots": {}, "practice_playback": [], "rated_playback": [],
        "console_errors": [], "network_writes": [],
    }
    driver = webdriver.Chrome(options=browser_options(downloads))
    driver.execute_cdp_cmd("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": str(downloads)})
    driver.set_window_size(1280, 1000)
    try:
        driver.get(url)
        wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, "h2"))
        driver.execute_script(
            "window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.error||e.message)));"
            "addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));"
        )
        receipt["screenshots"]["language"] = shot(driver, out, "00_language")
        start_to_practice(driver, url)
        receipt["screenshots"]["practice_form"] = shot(driver, out, "01_practice_form")
        for idx in (1, 2):
            receipt["practice_playback"].append(actual_play(driver, out, f"02_practice{idx}"))
            fill_v2_form(driver, f"practice-{idx}")
            receipt["screenshots"][f"practice{idx}_filled"] = shot(driver, out, f"03_practice{idx}_filled")
            click(driver, "practice-next")
            if idx == 1:
                wait(driver, lambda d: d.find_element(By.ID, "practice-form"))
        wait(driver, lambda d: d.find_element(By.ID, "trial-form"))
        receipt["screenshots"]["trial1_locked"] = shot(driver, out, "04_trial1_locked")
        receipt["cloud_status"] = driver.find_element(By.ID, "save-status").text
        receipt["rated_playback"].append(actual_play(driver, out, "05_trial1"))
        form = driver.find_element(By.ID, "trial-form")
        form.screenshot(str(out / "05_rating_form.png"))
        driver.find_element(By.ID, "save-bar").screenshot(str(out / "05_save_status.png"))
        assert 'audio_clarity' not in form.text and 'visual_readability' not in form.text
        fill_v2_form(driver, "trial-1")
        receipt["screenshots"]["trial1_filled"] = shot(driver, out, "06_trial1_filled")
        driver.find_element(By.CSS_SELECTOR, "#trial-form button[type=submit]").click()
        wait(driver, lambda d: d.find_element(By.ID, "trial-form"))
        # One-row partial backup is checked before the second response exists.
        click(driver, "download-partial")
        wait(driver, lambda d: any(downloads.glob("stealthrate-partial-responses*.gz")), 10)
        partial = sorted(downloads.glob("stealthrate-partial-responses*.gz"), key=lambda p: p.stat().st_mtime)[-1]
        partial_bundle = decode_gzip(partial)
        receipt["partial_backup"] = {"path": str(partial), "responses": len(partial_bundle.get("responses", []))}
        if len(partial_bundle.get("responses", [])) != 1:
            raise AssertionError("partial backup must contain exactly one rated response")
        driver.refresh()
        wait(driver, lambda d: d.find_element(By.ID, "trial-form"))
        receipt["reload_after_one"] = {"text": page_text(driver)[:400], "screenshot": shot(driver, out, "07_reload_after_one")}
        receipt["rated_playback"].append(actual_play(driver, out, "08_trial2"))
        fill_v2_form(driver, "trial-2")
        receipt["screenshots"]["trial2_filled"] = shot(driver, out, "09_trial2_filled")
        driver.find_element(By.CSS_SELECTOR, "#trial-form button[type=submit]").click()
        wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, ".download-link"), 20)
        receipt["screenshots"]["completed"] = shot(driver, out, "10_completed")
        link = driver.find_element(By.CSS_SELECTOR, ".download-link")
        link.click()
        wait(driver, lambda d: (downloads / "stealthrate-responses.json.gz").exists(), 10)
        completed = downloads / "stealthrate-responses.json.gz"
        bundle = decode_gzip(completed)
        responses = bundle.get("responses", [])
        if len(responses) != 2 or any(row.get("task") != "edit" for row in responses):
            raise AssertionError(f"expected two edit responses, got {responses}")
        raw_bundle = json.dumps(bundle)
        if invite in raw_bundle or invite2 in raw_bundle:
            raise AssertionError("bearer invite token leaked into downloaded bundle")
        for row in responses:
            ans = row.get("answers", {})
            for field in ("audio_clarity", "visual_readability"):
                if not isinstance(ans.get(field), (int, float)) or not 0 <= ans[field] <= 5:
                    raise AssertionError(f"invalid {field}: {ans}")
        receipt["completed_download"] = {"path": str(completed), "bytes": completed.stat().st_size,
                                          "responses": len(responses), "status": bundle.get("session", {}).get("status")}
        driver.refresh()
        wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, ".download-link"))
        restored = driver.find_element(By.CSS_SELECTOR, ".download-link").get_attribute("href")
        restored_bundle = json.loads(gzip.decompress(base64.b64decode(restored.split(",", 1)[1])))
        receipt["completed_reload"] = {"same_bundle": restored_bundle == bundle, "screenshot": shot(driver, out, "11_completed_reload")}
        if restored_bundle != bundle:
            differences = [key for key in set(bundle) | set(restored_bundle) if bundle.get(key) != restored_bundle.get(key)]
            (out / "download_mismatch.json").write_text(json.dumps({'download':bundle,'restored':restored_bundle},indent=2))
            raise AssertionError(f"completed bundle changed after reload: {differences}; see isolated QA download_mismatch.json")
        # Same browser, second dummy bearer scope: the new payload must be empty
        # and must not expose the first participant's response rows.
        # A fragment-only navigation does not reload this SPA.  Open a fresh
        # document in the same Chrome profile so the second bearer scope is
        # genuinely initialized while preserving the first localStorage key.
        driver.get("about:blank")
        driver.get("about:blank")
        start_to_practice(driver, f"{base}#invite={invite2}&block=block_1")
        keys = driver.execute_script("return Object.keys(localStorage)")
        payloads = driver.execute_script(
            "return Object.entries(localStorage).filter(([k])=>k.startsWith('stealthrate.payload.v2')).map(([k,v])=>({k,v}));"
        )
        current = [json.loads(row["v"]) for row in payloads if len(json.loads(row["v"]).get("responses", [])) == 0]
        if len(payloads) < 2 or not current:
            raise AssertionError(f"second invite was not isolated: keys={keys}, payloads={payloads}")
        receipt["invite_scope_isolation"] = {"payload_key_count": len(payloads), "new_scope_empty": True,
                                               "first_token_in_storage": invite in json.dumps(payloads)}
        # Complete the second dummy invite's practices, then prove a real
        # technical-failure skip creates missing ratings, never zero scores.
        for idx in (1, 2):
            actual_play(driver, out, f"12_second_practice{idx}")
            fill_v2_form(driver, f"second-practice-{idx}")
            click(driver, "practice-next")
        wait(driver, lambda d: d.find_element(By.ID, "playback-problem"))
        driver.execute_script("document.querySelector('#playback-problem').closest('details').open=true")
        issue = driver.find_element(By.ID, "playback-problem")
        issue.find_element(By.CSS_SELECTOR, "option[value='audio_problem']").click()
        click(driver, "report-problem")
        wait(driver, lambda d: d.execute_script("return Object.entries(localStorage).filter(([k])=>k.startsWith('stealthrate.payload.v2')).some(([,v])=>JSON.parse(v).responses.some(r=>r.answers.technical_issue==='audio_problem'))"))
        failures = driver.execute_script("return Object.entries(localStorage).filter(([k])=>k.startsWith('stealthrate.payload.v2')).flatMap(([,v])=>JSON.parse(v).responses).filter(r=>r.answers.technical_issue==='audio_problem')")
        assert len(failures)==1
        assert all(failures[0]['answers'][name] is None for name in ('edited','audio_clarity','visual_readability','conspicuousness','naturalness','confidence'))
        receipt['technical_failure']={'recorded':True,'numeric_ratings_null':True,'no_fake_zero':True}
        receipt["console_errors"] = driver.execute_script("return window.__qaErrors || []")
        receipt["network_writes"] = [row for row in server.requests if row["status"] in (200, 201, 202) and str(row["path"]).startswith("http")]
        receipt["exposure_checks"] = {}
        for path in ("/frontend/src/app.ts", f"/studies/{STUDY}/private/key.json", "/data/secret.txt"):
            receipt["exposure_checks"][path] = driver.execute_async_script(
                "const p=arguments[0],done=arguments[arguments.length-1];fetch(p).then(r=>done(r.status)).catch(()=>done(-1));", path
            )
    finally:
        driver.quit()
        server.shutdown()
        server.server_close()
    receipt["server_requests"] = server.requests
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=18776)
    parser.add_argument("--out", type=Path, default=REPO / "docs" / "qa_20260906" / "rating_v2")
    args = parser.parse_args()
    result = run(args.port, args.out)
    print(json.dumps({"receipt": str(args.out / "receipt.json"), "practice": len(result["practice_playback"]),
                      "rated": len(result["rated_playback"]), "errors": result["console_errors"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
