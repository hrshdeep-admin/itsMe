# Active Learning Module (ALM)

A complete static GitHub Pages website with **32 prepared lessons in eight equally weighted life domains**. It works without a paid service, database, login, framework, or build step.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The website's HTML structure |
| `style.css` | Responsive light/dark interface |
| `app.js` | Navigation, learning session, timing, recall, scoring, tracking, backup/restore |
| `curriculum.json` | All eight domains and 32 lesson plans: teaching, exercises, tests, answer guides, missions |
| `favicon.svg` | Website icon |
| `README.md` | Setup and operating instructions |

## Publish on GitHub Pages

1. Create a GitHub repository (or choose an existing one).
2. Put **all six files** together in the repository root, or in a directory you intend to publish. For a project subfolder, relative links still work so long as the files stay together.
3. Commit and push the files.
4. On GitHub, open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, select the branch (usually `main`) and the folder (`/(root)` if the files are at the root), then save.
5. Visit the GitHub Pages URL GitHub provides after deployment.

Do not simply double-click `index.html` on your computer. Browser security often blocks fetching `curriculum.json` from a `file://` page. Use GitHub Pages or a local HTTP server.

### Optional local testing

From the folder that contains the files:

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000`.

## How to use

- Four sessions each week, ideally about one hour each. The website does not enforce fixed days or exact timing.
- Start a lesson in any **unvisited** domain during your current eight-session cycle. Once each of the eight domains receives one session, the next cycle opens. There are four cycles total, four lessons per domain, 32 sessions total.
- The six stages are **10 min recall + 5 min objective + 15 min teaching + 20 min practice + 7 min test + 3 min real-life application**.
- Start/pause/reset the timer for each stage. The phase does **not** automatically advance; proceed when ready. Switching pages pauses the timer.
- Fill in personal notes and exercises. These are autosaved to local browser storage.
- The three-question test is **closed-book until you submit**; answer guides appear after submission. Optional self-scoring is 0–2 per answer. Self-scoring is not a measure of personal worth.
- Specify a concrete when/where cue for your real-world mission before completing a session. Update its status later on the Dashboard.
- Reviews appear at the **next learning session**, approximately **7 days**, and approximately **30 days** after completion. A missed review schedules an extra attempt about three days later. Use the dedicated Review Queue to catch up.
- Previously completed lessons can be reread from their domain's lesson list without counting another session.

## Backup and privacy

**Your notes, progress, exercises, test answers and missions remain in this browser** using `localStorage`. They are **not** sent to GitHub or to a server by this site's code. Browser storage may be cleared by resetting site data, switching browsers/devices, or in private browsing mode.

- Click the download icon in the top bar (or **Export** in Session history) to download `alm-progress-YYYY-MM-DD.json`.
- Use **Import backup** under Session history to restore it. Import replaces current browser progress after confirmation.
- **Never commit or upload your private progress backup or personal interview PDF to a public GitHub repository.** Only the generic curriculum data belongs on GitHub Pages.

## Editing the curriculum

Open `curriculum.json`. Each lesson has a unique ID such as `D01L01`, a domain number, teaching points (`teach_15min`), four practice prompts (`practice_20min`), three test items and answer guides (`test_7min`), a real-world mission (`mission_3min`), and a review prompt (`next_review_prompt`). Keep IDs stable if people have already saved progress; changing an ID can break saved review and history links.

The current website deliberately expects **8 domains and 32 lessons**. Expanding the number of lessons or domains requires minor JavaScript changes to the cycle/unlocking logic, not just editing JSON.

## Safety and limitations

- Health-related lessons are educational, not diagnoses or treatment.
- Investing lessons are educational and not specific security recommendations.
- Practice technical work only in simulated or supervised safe settings.
- Time is a guide, not a compliance measure; the app does not enforce a full 60 minutes before completion.
- The site does not have online cross-device sync; manually export/import backups.
- External resource links are optional references and require an internet connection.

No external webfonts, trackers, CDNs, or libraries are needed.
