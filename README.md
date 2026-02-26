# Team Weekly Activity Tracker (React + Firebase)

A lightweight React app that lets you:

- Create a team
- Collect weekly status updates from team members
- Generate an AI summary for the selected week

## Tech stack

- React + Vite
- Firebase (Anonymous Auth + Firestore)
- Gemini API for AI summaries

## Setup

1. Install dependencies
   ```bash
   npm install
   ```
2. Copy env file and fill in your keys:
   ```bash
   cp .env.example .env
   ```
3. Enable in Firebase console:
   - **Authentication**: Anonymous sign-in
   - **Firestore Database**
4. Start dev server:
   ```bash
   npm run dev
   ```

## Firestore structure

- `teams/{teamId}`
  - `name`
  - `createdAt`
- `teams/{teamId}/weeklyInputs/{inputId}`
  - `memberName`
  - `update`
  - `weekKey` (example: `2026-W09`)
  - `createdAt`
- `teams/{teamId}/summaries/{summaryId}`
  - `weekKey`
  - `content`
  - `createdAt`

## Notes

- AI summary button needs `VITE_GEMINI_API_KEY`.
- This app uses anonymous auth for quick setup. You can replace with email or Google auth later.
