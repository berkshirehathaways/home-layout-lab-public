from pathlib import Path
import re

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + (root / 'src/style.css').read_text(encoding='utf-8') + '\n</style>')
for name in re.findall(r'<script src="src/([a-z-]+)\.js"></script>', html):
    html = html.replace(f'<script src="src/{name}.js"></script>', '<script>\n' + (root / f'src/{name}.js').read_text(encoding='utf-8') + '\n</script>')
(root / 'standalone.html').write_text(html, encoding='utf-8')
print('Built standalone.html')
