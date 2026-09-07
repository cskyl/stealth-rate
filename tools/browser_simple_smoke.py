"""One local real-video smoke for the short intro; no participant/cloud writes."""
import json
import threading
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from browser_rating_v2 import AllowlistServer, browser_options, wait, click, fill_v2_form

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/qa_20260906/simple_flow'
OUT.mkdir(parents=True, exist_ok=True)
server = AllowlistServer(('127.0.0.1', 18779))
threading.Thread(target=server.serve_forever, daemon=True).start()
driver = webdriver.Chrome(options=browser_options(OUT))
try:
    driver.get('http://127.0.0.1:18779/?study=human_real_stealth_v2')
    wait(driver, lambda d: d.find_element(By.CSS_SELECTOR, '[data-action=start]'))
    driver.save_screenshot(str(OUT / 'intro.png'))
    click(driver, 'start')
    video = wait(driver, lambda d: d.find_element(By.ID, 'clip'))
    assert not driver.find_elements(By.ID, 'practice-form')
    first = driver.find_element(By.TAG_NAME, 'body').text
    click(driver, 'play')
    wait(driver, lambda d: d.execute_script('return arguments[0].ended', video), 25)
    fill_v2_form(driver, 'local-smoke-only')
    driver.find_element(By.CSS_SELECTOR, '#trial-form button[type=submit]').click()
    wait(driver, lambda d: d.find_element(By.ID, 'clip'))
    driver.refresh()
    wait(driver, lambda d: d.find_element(By.ID, 'clip'))
    after = driver.find_element(By.TAG_NAME, 'body').text
    assert first != after
    driver.save_screenshot(str(OUT / 'next_video.png'))
    result = {'short_intro': True, 'mandatory_practice': False,
              'real_video_played': True, 'one_rating_saved': True,
              'reload_on_next_video': True, 'human_returns': 0,
              'cloud_tested': False}
    (OUT / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
finally:
    driver.quit()
    server.shutdown()
