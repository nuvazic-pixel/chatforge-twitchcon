# ChatForge — Valley of Echoes

**Chat writes the legend. The community decides its fate.**

ChatForge is a Twitch-connected, cooperative fantasy-world experience for livestreams. Viewers submit ideas in chat; an AI parser turns them into proposed characters, items, dangers, or events; the streamer approves what becomes canon; and the world updates live on an OBS-ready map. When a crisis strikes, the community has **60 seconds** to decide how the valley responds.

Built for the **Codex x TwitchCon Hackathon (2026)**.

## Watch the loop

1. **Create** — a viewer sends \`!forge robots\` or \`!forge item a magic sword\` in Twitch chat.
2. **Moderate** — the AI generates a structured proposal. The streamer reviews, edits if needed, and approves it in the private Director panel.
3. **Publish** — the approved entity materializes on the fantasy map; the contributor earns **10 points**.
4. **Crisis** — an approved \`event\` with two resolutions opens a vote immediately. Alternatively, three approved non-event creations during a build phase trigger an AI-planned crisis (with a local fallback).
5. **Vote** — viewers type \`!vote 1\` or \`!vote 2\` in Twitch chat. A prominent overlay HUD displays the two choices, live totals, and remaining time.
6. **Resolve** — the vote outcome updates Chaos, appears on the overlay, and leads into the next round. The world summary identifies **🏆 Arhitectul Văii**, the highest-scoring contributor.

Only the **first valid vote per Twitch user ID per round** counts.

## What judges can see

- **Real Twitch integration:** Twitch EventSub WebSocket subscription to \`channel.chat.message\`.
- **AI-assisted worldbuilding:** OpenAI Responses API with structured output; server-side Zod normalization and validation.
- **Streamer-controlled moderation:** proposals remain off-map until explicitly approved; edits are revalidated.
- **Deterministic game state:** reducer-backed map, contributor scores, Chaos, voting, and predictable round transitions.
- **Readable OBS experience:** dark/gold fantasy map, clear voting overlay, live counts, a public world summary, and \`?transparent=1\` mode.
- **Testable without live credentials:** local fixture and Director demo modes.

### Game rules

| Mechanic | Behavior |
| --- | --- |
| Starting Chaos | 0 / 100 |
| Approved \`event\` | Chaos +30 (capped at 100) |
| Crisis trigger | Approved event with two resolutions, or three approved non-event creations in a build phase |
| Voting | 60 seconds; one counted vote per Twitch user per round |
| Winning option | Chaos −25 (floored at 0) |
| Tie or no votes | Chaos +15 (capped at 100) |
| Result display | 10-second result phase before the next build round |
| Contribution score | +10 per approved entity attributed to a viewer |
| Top contributor | “🏆 Arhitectul Văii”; alphabetical username tie-break |

At Chaos 100, the game announces the valley's fall and resets Chaos for the next round while keeping the map's creations. The world, scores, and moderation queue otherwise live **in memory** and reset when the server restarts.

## How it works

\`\`\`text
Twitch chat (!forge / !vote)
  │
  ▼
Twitch EventSub (WebSocket)
  ├─ !vote ────────────────► Cooperative voting engine ─────┐
  │                                                         │
  └─ !forge ─► Filter & cooldown ─► OpenAI parser             │
                              │                              │
                              ▼                              │
                        Zod validation                        │
                              │                              │
                              ▼                              │
                       Moderation queue                       │
                              │                              │
                      Streamer approves                       │
                              │                              │
                              ▼                              │
                        World reducer ◄───────────────────────┘
                              │
                              ▼
                     World snapshots (WebSocket)
                              │
                              ▼
                  Browser overlay / OBS Browser Source
\`\`\`

**Stack:** Node.js 22+, TypeScript, \`tsx\`, \`ws\`, Zod, OpenAI SDK, and vanilla HTML/CSS/JavaScript for the viewer overlay and Director panel. The current overlay is **not** a React/Vite application.

## Run locally

### Prerequisites

- Node.js **22 or newer** and npm
- For live mode: a Twitch developer application, a Twitch **User Access Token** with \`user:read:chat\`, and an OpenAI API key
- For OBS: OBS Studio with a Browser Source (optional for browser-only testing)

### Demo without Twitch or API credentials

\`\`\`powershell
npm ci
npm run demo:director
\`\`\`

Open the **private Director link** printed in the terminal. The demo provides simulated proposals so you can review and approve them without live accounts. Open the overlay link shown by the server in another browser tab.

Other scripts:

\`\`\`powershell
npm run demo:visual    # Visual map demo; simulated, no streamer moderation
npm run demo           # Console fixture
npm run check          # TypeScript typecheck
npm test               # Automated Node tests
\`\`\`

The project has a \`start\` script, **not** an \`npm run dev\` script. Demo and live servers use the same default port, so stop one before starting another.

### Live Twitch mode

1. Register or reuse an application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Authorize the Twitch account with a **User Access Token** containing \`user:read:chat\`, issued for the same Twitch Client ID.
3. Copy the example configuration:

   \`\`\`powershell
   Copy-Item .env.example .env
   \`\`\`

4. Fill out \`.env\` **locally**:

   \`\`\`dotenv
   OPENAI_API_KEY=
   OPENAI_MODEL=gpt-4o-mini
   TWITCH_CLIENT_ID=
   TWITCH_ACCESS_TOKEN=
   TWITCH_BROADCASTER_ID=
   \`\`\`

   \`TWITCH_BROADCASTER_ID\` is the **numeric ID** of the channel to monitor; the chatting account's user ID comes from the token. Never commit or share \`.env\`.

5. Start:

   \`\`\`powershell
   npm ci
   npm run check
   npm test
   npm start
   \`\`\`

6. Open the local Director link printed in the terminal; keep it private. Open the viewer overlay at \`http://127.0.0.1:4173/\`. In Twitch chat, try:

   \`\`\`text
   !forge robots
   !forge item a lantern that reveals lies
   !forge event A dragon threatens Echo Town. Defend the citadel or evacuate through the forest.
   \`\`\`

7. Approve the crisis in Director, then cast \`!vote 1\` or \`!vote 2\` **after the vote opens**.

A \`!forge\` command accepts a natural-language idea in English or Romanian, up to 500 characters. A five-second per-user cooldown applies. Generated in-world text is requested in English. AI proposals may take time to appear because the parsing pipeline is queued and the Director panel polls approximately every 1.5 seconds.

**OAuth note:** the current live implementation validates the Twitch access token at startup and periodically, but does **not** refresh it automatically. An expired or revoked token requires reauthorization and a restart.

## OBS overlay

- Viewer: \`http://127.0.0.1:4173/overlay\`
- Transparent page: \`http://127.0.0.1:4173/overlay?transparent=1\`
- Suggested Browser Source canvas: **1920 × 1080** (also check 1280 × 720).

The transparent mode removes the **page background**; the map's artwork remains visible. Reload the OBS Browser Source after restarting the server. The overlay, Director panel, and server are intended to run **on the same machine** using the loopback address \`127.0.0.1\`.

**Voting UI:** while the cooperative state is in \`vote\`, a prominent two-choice HUD displays the server's vote deadline and totals. During \`result\`, it displays the outcome. There are **no clickable viewer voting buttons**; votes are cast through Twitch chat.

## Moderation, security, and reliability

- The server listens on **127.0.0.1**; it is not a public hosting service.
- Every proposed entity is validated; approved edits are checked again server-side.
- The Director control API requires a random, per-server-start **Director key** and checks request origins for mutation requests.
- The key is embedded in the private Director link's URL fragment, not in the public overlay. **Never show it on stream, in screenshots, or in a public video.** Restarting the server invalidates previous Director keys.
- Viewer-generated and AI-generated display content is treated as data and rendered as text, not executable HTML.
- Overlay snapshots contain published world state and limited feedback, not pending private proposals or the Director key.
- Proposals are bounded to 50 pending items. Duplicate and invalid submissions are guarded against.
- An offline/demo path exists, but the live experience requires working Twitch and OpenAI credentials.
- **No database or persistence:** restarting resets world progress and the private Director URL. Lost Twitch messages during a complete disconnect are not replayed.

The AI prompt is not a substitute for moderation. The streamer has the final decision about what appears on the map.

## Verification

\`\`\`powershell
npm run check
npm test
node --check public/app.js
node --check public/vote-focus.js
node --check public/director.js
\`\`\`

The project was locally validated on Windows with **27 passing automated tests** for the v1.1 voting UI checkpoint. Those tests cover the reducer, parsing, moderation, EventSub-adjacent processing, voting rules, snapshot delivery/reconnection, overlay resource serving, and startup behavior. Live Twitch/OBS behavior should additionally be tested by the presenter.

Checkpoint tag: \`chatforge-twitchcon-demo-v1.1\`.

## How Codex was used

**OpenAI Codex was used during development**, alongside local PowerShell testing and iterative review. The project is intended to be judged as a working Twitch interaction, not as a claim that Codex runs inside the game.

At runtime, ChatForge calls the **OpenAI API** for entity parsing and automatic crisis planning. The deterministic world and voting rules run locally; votes do not call AI.

For the hackathon submission, include the **actual Codex development session ID** from the build thread. An OpenAI API response ID, local UUID, or this project's Git commit ID is not a substitute.

## Submission notes

The [official Codex x TwitchCon Hackathon rules](https://twitchcon-codex.devpost.com/rules) require a working repository with setup instructions, an English description explaining the project and Codex usage, the Codex session ID, and a **YouTube demo under 3 minutes** showing the experience functioning on Twitch **and** how Codex was used. A private GitHub repo must be shared with the judging address specified in those rules.

The planned demo flow is: viewer creates an entity → streamer approves it → crisis appears → live audience votes → Chaos and round resolve → world summary shows the top contributor.

**Project status:** v1.1 demo checkpoint. The core experience was locally tested; live judging, video production, Codex session ID entry, and Devpost submission are separate tasks.

## References

- [Twitch EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [Twitch chat authorization](https://dev.twitch.tv/docs/chat/authenticating/)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Hackathon rules and submission requirements](https://twitchcon-codex.devpost.com/rules)
