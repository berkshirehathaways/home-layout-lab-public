# Public fork template

Keep this project independent of any private deployment or personal dataset. Start with an empty project. Never commit user drawings, uploaded photos, backups, credentials, or private history.

Use vanilla HTML/JavaScript/SVG, internal millimetres and centimetre form inputs. Reuse geometry and PNG export behavior. No dependencies without explicit request.

Run `python3 build.py`, `node --check src/app.js`, `node --test tests/*.cjs`, and the browser upload/backup tests when changing the editor. Record actual results in STATUS.md and TEST_REPORT.md.

Local commits use an intent line and git-native Lore trailers such as Tested, Constraint, and Confidence. Remote publication requires direct user authorization.
