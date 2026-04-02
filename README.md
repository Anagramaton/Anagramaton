# Anagramaton

A daily word-chaining puzzle game. Build words by connecting adjacent tiles on a letter grid, rack up the highest score, and compete on a global daily leaderboard.

---

## How to Play

Click the **HOW TO PLAY** button on the start screen (or the 🎮 icon in the settings menu) for an in-game walkthrough. The short version:

1. **Chain tiles** — select 4 or more adjacent letter tiles to form a word.
2. **Score big** — longer words and re-used tiles earn multipliers.
3. **Submit your 10 best words** before time runs out.
4. **Compare** your score against the board's top-10 optimal words in the round-over screen.

---

## Project structure

| File / folder | What it does |
|---|---|
| `index.html` | Main page — game board, modals, settings |
| `main.js` | Entry point — wires up all UI interactions |
| `gameLogic.js` | Core word-validation and tile-chaining logic |
| `scoreLogic.js` | Scoring formula (base points + reuse + length multipliers) |
| `leaderboard.js` | Frontend helpers — player name prompt, score submission, leaderboard fetch |
| `roundOverModal.js` | End-of-round results modal (VS board, leaderboard tab) |
| `howToModal.js` | Multi-page "How to Play" modal |
| `api/` | Serverless API routes (Vercel Functions) |
| `api/daily.js` | `GET /api/daily` — returns today's `dailyId` |
| `api/leaderboard.js` | `GET /api/leaderboard` — fetches top scores from Supabase |
| `api/scores.js` | `POST /api/scores` — saves a player's score to Supabase |
| `scripts/` | Local dev scripts (`npm run generate`) |

---

## Local development

```bash
# Install dependencies (only needed for the Supabase API routes)
npm install

# Serve the frontend (no API features)
npx serve .
# or: python3 -m http.server 3000

# To test the API routes locally, use the Vercel CLI:
npx vercel dev
```

> The game is fully playable in a plain static server. API/leaderboard features only work when the Supabase environment variables are set (see below).

---

## Deploying to Vercel

The project is pre-configured for [Vercel](https://vercel.com) — just import the GitHub repository and Vercel will detect the `api/` serverless functions automatically.

### Enabling the leaderboard (Supabase setup)

The daily leaderboard requires a free [Supabase](https://supabase.com) project.

#### 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Give it any name (e.g. `anagramaton`).
3. Choose a region close to your players.

#### 2 — Create the `scores` table

Open the **SQL Editor** in your Supabase dashboard and run:

```sql
create table scores (
  id          bigint generated always as identity primary key,
  daily_id    text        not null,
  player_name text        not null,
  score       integer     not null,
  words       text[]      default '{}',
  hints_used  integer     default 0,
  created_at  timestamptz default now(),

  unique (daily_id, player_name)
);

-- Allow the anon key to read scores
alter table scores enable row level security;

create policy "Public read" on scores
  for select using (true);

-- Allow the service key to insert/update scores (done server-side only)
create policy "Service insert" on scores
  for insert with check (true);

create policy "Service update" on scores
  for update using (true);
```

#### 3 — Get your API keys

In Supabase → **Project Settings → API**:

| Setting | Where to find it |
|---|---|
| `SUPABASE_URL` | "Project URL" |
| `SUPABASE_ANON_KEY` | "anon / public" key |
| `SUPABASE_SERVICE_KEY` | "service_role" key (keep this secret!) |

#### 4 — Add environment variables to Vercel

1. Open your Vercel project → **Settings → Environment Variables**.
2. Add all three variables from step 3.
3. **Redeploy** (Vercel → Deployments → click the three-dot menu on the latest deployment → Redeploy).

Once redeployed the **Leaderboard** tab in the round-over screen will be live.

> **Preview deployments**: Vercel preview builds (from pull-request branches) share the same environment variables as your production project, so the leaderboard works in previews too once the variables are added.

---

## Environment variables reference

| Variable | Required | Used in | Description |
|---|---|---|---|
| `SUPABASE_URL` | For leaderboard | `api/leaderboard.js`, `api/scores.js` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | For leaderboard | `api/leaderboard.js` | Public anon key (safe to expose in read queries) |
| `SUPABASE_SERVICE_KEY` | For leaderboard | `api/scores.js` | Service role key — used server-side only, never exposed to the browser |

---

## Scripts

```bash
npm run generate   # Regenerates prebuiltBoards.json
```

The bootstrap word pool is derived at runtime from `wordList.js` — no separate `bootstrapWords.js` file is needed.
