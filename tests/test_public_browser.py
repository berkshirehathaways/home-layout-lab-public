from pathlib import Path
from tempfile import TemporaryDirectory
import base64
import http.server
import json
import socketserver
import threading
import importlib

playwright_api = importlib.import_module('playwright.sync_api')
expect = playwright_api.expect
sync_playwright = playwright_api.sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')


def blank_project(photo=None, name='공격 문자열'):
    return {
        'schemaVersion': 2,
        'units': 'mm',
        'title': 'Public fixture',
        'background': {'kind': 'blank', 'widthPx': 1200, 'heightPx': 800, 'imageData': None, 'mmPerPx': 1, 'status': 'reference', 'calibration': None, 'validationLines': []},
        'rooms': [{'id': 'workspace', 'name': '공간', 'use': '사용자 지정', 'labelPx': [600, 380], 'anchorPx': [600, 400]}],
        'geometry': {'schemaVersion': 1, 'walls': [], 'fixedObstacles': [], 'doors': [], 'roomPolygons': [], 'coverage': {'walls': 'unregistered', 'fixedObstacles': 'unregistered', 'doors': 'unregistered', 'roomPolygons': 'unregistered'}},
        'furniture': [{'id': 'item-1', 'number': 1, 'name': name, 'widthMm': 1200, 'depthMm': 600, 'heightMm': None, 'kind': 'generic', 'targetRoom': 'workspace', 'clearanceFrontMm': 0, 'verified': False, 'excludeFromMove': False, 'source': 'fixture', 'note': '', 'photo': photo}],
        'scenes': [{'id': 'A', 'name': 'A | 시작안', 'placements': {}}, {'id': 'B', 'name': 'B | 비교안', 'placements': {}}, {'id': 'C', 'name': 'C | 빈 도면', 'placements': {}}],
        'activeScene': 'A'
    }


def main():
    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=ROOT, **kwargs)
    server = socketserver.TCPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    with TemporaryDirectory() as tmp, sync_playwright() as playwright:
        image = Path(tmp) / 'plan.png'
        image.write_bytes(PNG)
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(accept_downloads=True)
        requests = []
        page.on('request', lambda request: requests.append(request.url))
        base = f'http://127.0.0.1:{server.server_address[1]}'
        page.goto(f'{base}/index.html')
        expect(page.locator('#background-status')).to_contain_text('도면 없음')
        page.set_input_files('#background-file', str(image))
        expect(page.locator('#background-status')).to_contain_text('도면 업로드됨')
        page.click('#add-item')
        page.fill('#f-name', '내 책상')
        page.fill('#f-width', '120')
        page.fill('#f-depth', '60')
        page.click('#item-form button[type="submit"]')
        expect(page.locator('#catalog')).to_contain_text('내 책상')
        page.wait_for_timeout(500)
        stored = page.evaluate("JSON.parse(localStorage.getItem('home-layout-lab-public-v2:/'))")
        assert stored['background']['kind'] == 'upload'
        assert stored['furniture'][0]['name'] == '내 책상'
        with page.expect_download() as download:
            page.click('#export-json')
        assert download.value.suggested_filename.endswith('.json')
        payload = '<img src=x onerror=alert(1)>'
        malicious = Path(tmp) / 'malicious.json'
        malicious.write_text(json.dumps(blank_project(name=payload)), encoding='utf-8')
        page.once('dialog', lambda dialog: dialog.accept())
        page.set_input_files('#json-file', str(malicious))
        expect(page.locator('#catalog')).to_contain_text(payload)
        assert page.locator('img[onerror]').count() == 0
        before_rejection = page.evaluate('window.__layoutLab.getProject()')
        external = Path(tmp) / 'external.json'
        external.write_text(json.dumps(blank_project(photo='https://evil.test/photo.jpg')), encoding='utf-8')
        page.set_input_files('#json-file', str(external))
        expect(page.locator('#toast')).to_contain_text('불러오기 실패')
        assert page.evaluate('window.__layoutLab.getProject()') == before_rejection
        external_background = blank_project()
        external_background['background'] = {'kind': 'upload', 'widthPx': 1200, 'heightPx': 800, 'imageData': 'https://evil.test/plan.png', 'mmPerPx': 1, 'status': 'reference', 'calibration': None, 'validationLines': []}
        external.write_text(json.dumps(external_background), encoding='utf-8')
        page.set_input_files('#json-file', str(external))
        expect(page.locator('#toast')).to_contain_text('도면 이미지')
        assert page.evaluate('window.__layoutLab.getProject()') == before_rejection
        page.set_input_files('#background-file', {'name': 'fake.png', 'mimeType': 'image/png', 'buffer': b'<svg onload="alert(1)"></svg>'})
        expect(page.locator('#toast')).to_contain_text('래스터 이미지만')
        assert page.evaluate('window.__layoutLab.getProject()') == before_rejection
        external_requests = [url for url in requests if not (url.startswith(base + '/') or url.startswith('data:') or url.startswith('blob:') or url == 'about:blank')]
        assert not external_requests, external_requests
        browser.close()
    server.shutdown()
    print('PASS: plan upload, furniture registration, storage, JSON download, escaped text, rejected external photo, rejected SVG, and local-only requests')


if __name__ == '__main__':
    main()
