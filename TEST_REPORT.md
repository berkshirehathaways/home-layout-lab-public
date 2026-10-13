# Public template test report

## 2026-10-13 README localhost link

- Corrected the bare localhost URL followed by Korean text to an explicit Markdown link on a separate line.
- PASS: GitHub Markdown renderer returned `<a href="http://127.0.0.1:8765/">`; the Korean prose is outside the link. Privacy scan and `git diff --check` also passed.

## 2026-10-12 initial preparation

- `python3 build.py` -> PASS; generated `standalone.html`.
- `node --check src/app.js` -> PASS.
- `node --test tests/*.cjs` -> 2/2 PASS: public starter controls and DOM-free geometry.
- `python3 scripts/check_public.py` -> PASS: no private markers or blocked paths in publishable sources.
- `.venv/bin/python tests/test_public_browser.py` -> PASS: plan upload, furniture registration, browser storage, and JSON download.
- `gitleaks dir --redact ...` and `gitleaks git --redact ...` -> PASS: no secrets found in working tree or reachable history.
- Mutation QA: injected a synthetic private marker into README and a blocked image path; the checker exited 1 and reported both violations; scratch copy removed afterward.
- Git metadata audit found the initial author identity was private; it is scrubbed before the next commit. No remote exists.
- The browser fixture used a generated 1×1 PNG; no user file was read.
- No private floorplan, furniture, photo, credential, Vercel setting, or original Git history is included.
- Caveat: GitHub Pages sibling paths under the same `username.github.io` origin can access origin-wide localStorage; README documents separate-origin/profile use for sensitive plans.
- Adversarial browser QA passed: imported `<img ... onerror>` text stays escaped, external photo URLs and SVG disguised as PNG are rejected, and captured requests were only localhost/data/blob resources. Current project survives rejected files.
- GitHub publication: `gh repo create berkshirehathaways/home-layout-lab-public --public --source . --remote origin --push` succeeded. `git ls-remote origin refs/heads/main` returned `7cb5341`; GitHub API reports `PUBLIC` and default branch `main`. A fresh shallow clone reran privacy scan, syntax, and Node 2/2 tests successfully.
