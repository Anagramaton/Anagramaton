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


## Deploying to Vercel

The project is pre-configured for [Vercel](https://vercel.com) — just import the GitHub repository. Vercel will run `npm run build` (via `vercel.json`) and serve the bundled output from the `dist` folder.

