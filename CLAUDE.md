# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install dependencies: `npm install`
- Start the app: `npm start`
- Development server: `npm run dev`
- Open the main app: `http://localhost:3000`
- Open the admin console: `http://localhost:3000/admin`

`npm start` and `npm run dev` both run `node server.js`. There is no separate frontend build step.

No `test`, `lint`, or `build` script is defined in `package.json`; there is currently no repo-level command for running the full test suite, linting, building, or a single test.

## Runtime configuration

Copy `.env.example` to `.env` when local configuration is needed. The server reads these variables:

- `DEEPSEEK_API_KEY`: optional for local demos; when absent, the backend falls back to mock AI responses.
- `PORT` and `HOST`: server bind configuration; defaults are `3000` and `0.0.0.0`.
- `ADMIN_USERNAME` and `ADMIN_PASSWORD`: admin login credentials; defaults are `admin` and `admin123`.
- `ALERT_WEBHOOK_URL` and `ALERT_EMAIL`: optional crisis alert channels. The current code sends webhook alerts when `ALERT_WEBHOOK_URL` is set.

Runtime data is stored in `xiling.db` at the repository root. Deleting that file resets users, chats, mood check-ins, admin sessions, crisis alerts, config, and generated content.

## Architecture overview

This is a single-process Node/Express app. `server.js` is the backend entrypoint, database schema owner, API layer, static file server, and app bootstrap. It uses:

- Express for HTTP routes and static file serving.
- `better-sqlite3` for the local SQLite database.
- `dotenv` for environment variables.
- DeepSeek chat completions for AI responses when `DEEPSEEK_API_KEY` is configured.
- `sherpa-onnx-node` for offline TTS, with browser speech synthesis as a frontend fallback.

`server.js` creates and migrates its tables in code, seeds default crisis keywords and config values, and then exposes API routes for auth, chat, mood check-ins, moments, diaries, user settings, admin dashboard/config/keywords/crisis workbench, and TTS.

The backend serves static assets from:

- `public/` as the main web root.
- `Background/` under `/background`.
- `public/model/` under `/model`, with special headers for Live2D model and WASM assets.

## Frontend structure

The browser app is plain HTML/CSS/JavaScript; it does not use a bundler or framework.

- `public/index.html` is the main companion UI. It loads PIXI, Live2D Cubism, and the app modules directly with script tags.
- `public/admin.html` is the admin console and loads `api.js` plus `admin.js`.
- `public/css/style.css` contains the shared styling for the main app and admin UI.
- `public/js/api.js` is the shared fetch client and defines all backend API calls.
- `public/js/app.js` owns global app state, Live2D initialization, model registry, model switching, day/night mode, and overall UI bootstrapping.
- `public/js/chat.js` owns chat rendering, chat history filters, sending messages, voice input hooks, and read-aloud controls.
- `public/js/mood.js` owns the mood check-in overlay and mood-driven UI updates.
- `public/js/moments.js` owns moments and diary UI actions.
- `public/js/voice.js` owns shared audio playback, offline TTS requests, browser TTS fallback, and lip-sync integration.
- `public/js/mediapipe.js` owns optional camera-based face and gesture tracking. It imports MediaPipe Tasks Vision from a CDN at runtime.
- `public/js/admin.js` owns admin login, dashboard data, user table, crisis workbench, mood stats, config editing, and crisis keyword management.

Live2D models and related expression/motion assets live under `public/model/`. `app.js` registers the available characters and maps UI events to each model's expressions and motions.

## Main data and feature flows

- Authentication is simple token-based auth. User tokens are formed from the user id and password; admin sessions are random tokens stored in `admin_sessions`.
- Chat requests go through `/api/chat/send`. The server saves the user message, checks crisis keywords, injects today's mood into the system prompt, streams DeepSeek output when requested, and lets the client save the final streamed assistant response through `/api/chat/save-response`.
- Crisis detection combines local keyword matching from `crisis_keywords` with a safety instruction in the AI prompt. Keyword hits create records in `crisis_alerts` and may send a webhook alert.
- Mood check-ins are one per user per local date. Today’s mood is injected into later chat prompts and affects the companion tone.
- Moments and diaries are generated through DeepSeek and persisted in SQLite. Diary generation summarizes the current user's chat history for the local date.
- Admin routes use separate admin auth and expose dashboard stats, user summaries, crisis alert status/risk updates, mood stats, config values, and crisis keyword CRUD.

## Project notes from existing docs

`使用说明.txt` states the local environment target: Node.js v18 or higher, npm, and a modern browser such as Chrome or Edge with WebGL and Web Speech API support.

`项目说明.md` is a PRD for a Live2D + DeepSeek AI companion app. It describes the intended product scope: daily chat, voice/call mode, mood check-ins, crisis keyword detection and intervention, generated diaries/moments/albums, and an admin crisis workbench. The implemented repository is currently a local Express/SQLite web app rather than the mobile/MySQL/Redis architecture mentioned as future planning in the PRD.
