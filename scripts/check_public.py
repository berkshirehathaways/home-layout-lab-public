from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
forbidden = tuple(''.join(parts) for parts in (('PRIVATE_', 'HOME_SEED'), ('PRIVATE_', 'FLOORPLAN'), ('PRIVATE_', 'ACCOUNT_NAME'), ('PRIVATE_', 'KITCHEN_HOOK'), ('PRIVATE_', 'DEPLOYMENT_SECRET')))
blocked = {'assets', 'reviews', 'exports', 'web', 'artifacts', '.vercel', '.omo', '.omx'}
failures = []
listed = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root, capture_output=True, check=True).stdout
files = [root / name.decode() for name in set(listed.split(b'\0')) if name]
for path in files:
    relative = path.relative_to(root)
    if path.is_symlink():
        failures.append(f'symlink not allowed: {relative}')
        continue
    if any(part in blocked for part in relative.parts):
        failures.append(f'blocked path present: {relative}')
        continue
    if path.stat().st_size > 4000000 and path.name != 'standalone.html':
        failures.append(f'unexpected large file: {relative}')
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        failures.append(f'unreviewed binary file: {relative}')
        continue
    for email in re.findall(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', text):
        if not email.endswith(('@users.noreply.github.com', '@example.invalid')):
            failures.append(f'personal email found: {relative}')
    for value in forbidden:
        if value in text:
            failures.append(f'private marker {value!r} in {relative}')
metadata = subprocess.run(['git', 'log', '--all', '--format=%an <%ae>%n%cn <%ce>'], cwd=root, capture_output=True, text=True, check=True).stdout
for identity in metadata.splitlines():
    if identity != 'Home Layout Lab contributors <contributors@example.invalid>':
        failures.append('Git author/committer identity needs a publication review')
if failures:
    print('\n'.join(failures))
    raise SystemExit(1)
print('PASS: publishable files and reachable author metadata passed generic privacy checks; run gitleaks and source-specific audit separately')
