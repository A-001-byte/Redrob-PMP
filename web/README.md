# Redrob Ranker — Web Interface (Phase 4)

Two ways to demo the ranking system without touching the terminal:

| Surface | Stack | Use for |
|---|---|---|
| `web\backend\` + `web\frontend\` | FastAPI + React 18/Tailwind/Vite | Local development, Docker, the full UX |
| `web\streamlit_app.py` | Streamlit (single server) | HuggingFace Spaces public demo |

Both are read-only wrappers around the Phase 1-3 pipeline. Nothing in
`pipeline\` is modified; the Re-rank button shells out to
`python pipeline\rank.py --precomputed precomputed\ --out submission\submission.csv`
exactly as an organizer would (~45 s, CPU-only, zero network).

---

## 1. Run locally (FastAPI + React)

Prereqs: Python 3.11 with the project deps already installed (Phases 1-3),
Node 18+.

**Terminal 1 — backend (port 8000):**

```powershell
cd D:\H2S
pip install -r web\backend\requirements.txt   # fastapi, uvicorn (rest already present)
uvicorn web.backend.main:app --port 8000
```

Startup takes ~10 s (loads features.pkl + texts.pkl + embedding mmaps into
memory once). Verify: `http://localhost:8000/health` →
`{"status":"ok","artifacts_loaded":true,"model_cached":true}`.

**Terminal 2 — frontend (port 5173):**

```powershell
cd D:\H2S\web\frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The frontend targets
`http://localhost:8000` by default; point it elsewhere with
`VITE_API_URL=https://my-host` in `web\frontend\.env`.

Production bundle: `npm run build` → static site in `web\frontend\dist\`
(serve with anything; keep the backend reachable at `VITE_API_URL`).

### API surface

| Endpoint | What |
|---|---|
| `GET /health` | status + artifacts/model checks |
| `GET /api/results` | current top-100 with score parts + profile fields |
| `GET /api/candidate/{id}` | full drawer profile (career history, skills, behavioral, system scores) |
| `GET /api/metrics` | honeypot/DQ counts, mean scores, location/title distributions, last run time |
| `GET /api/export` | submission.csv download |
| `POST /api/rerank` | runs rank.py, streams SSE progress (60 s cooldown, single-flight) |
| `POST /api/preview` | scoring-only ranking of up to 200 uploaded candidate ids |

---

## 2. Run locally (Streamlit)

```powershell
cd D:\H2S
streamlit run web\streamlit_app.py
```

Open **http://localhost:8501**. Same data, same design system, one process.

---

## 3. Deploy to HuggingFace Spaces

The Space runs the Streamlit app only (single server — no FastAPI/React
build complexity on Spaces).

1. Create a Space: **SDK = Streamlit**, hardware = CPU basic (free) works;
   "CPU upgrade" makes the in-app Re-rank comfortably fast.

2. The Space repo needs this layout (the app resolves everything relative
   to its own location, so keep `web\streamlit_app.py` where it is):

   ```
   /  (Space repo root)
   ├─ README.md            # with the frontmatter below
   ├─ requirements.txt     # copy of web\requirements-spaces.txt
   ├─ web\streamlit_app.py
   ├─ pipeline\            # all .py files (rank.py + its imports)
   ├─ precomputed\         # all artifacts (~700 MB, git-lfs)
   ├─ submission\          # submission.csv, rank_details.json, rank_timing.json
   ├─ models\              # both cached transformer models (git-lfs)
   └─ data\                # OPTIONAL: candidates.jsonl (487 MB) + labeling_candidates.json
                           # enables career-history in the profile dialog;
                           # the app degrades gracefully without it
   ```

3. Space `README.md` frontmatter:

   ```yaml
   ---
   title: Redrob Ranker
   emoji: 📡
   colorFrom: blue
   colorTo: indigo
   sdk: streamlit
   app_file: web/streamlit_app.py
   pinned: false
   ---
   ```

4. Push (anything over 10 MB must go through git-lfs):

   ```powershell
   cd D:\H2S
   git init spaces-deploy   # or work in a clean clone of the Space
   # copy the layout above into it, then:
   git lfs install
   git lfs track "*.pkl" "*.npy" "*.bin" "*.jsonl" "models/**"
   git add . ; git commit -m "Redrob Ranker demo"
   git remote add space https://huggingface.co/spaces/<user>/redrob-ranker
   git push space main
   ```

Notes:
- `HF_HUB_OFFLINE=1` is set inside rank.py itself — the Space never
  downloads models at rank time; they load from `models\`.
- First page load takes ~15 s while features.pkl is cached; subsequent
  loads are instant (`st.cache_resource`).
- The Re-rank button has a 60 s cooldown, same as the API.

---

## 4. Design system

All styling (both UIs) follows the generated UI UX Pro Max design system
"Redrob Ranker": Data-Dense Dashboard style, Fira Code headings /
Fira Sans body, primary `#1E40AF`, accent `#D97706`, status colors
(green/amber/red) reserved for status, no gradients, no emoji icons,
WCAG AA contrast. Tokens live in `web\frontend\tailwind.config.js` and the
`C` dict in `web\streamlit_app.py`.
