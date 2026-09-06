"""Read-only live demo preview verification; never starts or submits a study."""
import json
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from browser_smoke_20260906 import browser_options

out = Path(__file__).resolve().parents[1] / "docs/qa_20260906/live_preview"
out.mkdir(parents=True, exist_ok=True)
driver = webdriver.Chrome(options=browser_options(out, "chrome"))
try:
    driver.set_window_size(1280, 1100)
    driver.get("https://cskyl.github.io/stealth-rate/?guide=1&release=20260906-instructions")
    wait = WebDriverWait(driver, 25)
    wait.until(lambda d: d.execute_script("return !!document.querySelector('video')"))
    driver.execute_script("document.querySelector('video').play()")
    wait.until(lambda d: d.execute_script("return document.querySelector('video').currentTime >= 2.1"))
    result = driver.execute_script("const v=document.querySelector('video'); return {src:v.currentSrc,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,controls:v.controls,testHook:!!window.__STEALTHRATE_TEST__,script:document.querySelector('script[type=module]').src}")
    assert result["width"] > 0 and result["time"] >= 2 and not result["testHook"]
    assert driver.execute_script("return document.querySelector('#guide').open && document.querySelectorAll('.instruction-step').length === 3")
    result["expanded_guide_verified"] = True
    driver.save_screenshot(str(out / "preview.png"))
    wait.until(lambda d: d.execute_script("return document.querySelector('video').ended"))
    result["ended"] = True
    driver.execute_script("document.querySelector('#guide').scrollIntoView(); document.querySelectorAll('#guide details').forEach(d=>d.open=true)")
    driver.save_screenshot(str(out / "instructions.png"))
    (out / "receipt.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
finally:
    driver.quit()
