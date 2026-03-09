---
name: owntracks
description: Receive and query GPS location from OwnTracks iOS/Android app via a lightweight HTTP server. Use when the user asks about location tracking, "where am I", GPS awareness, geofencing, or setting up OwnTracks. Triggers on "owntracks", "location", "GPS", "where am I", "位置".
---

# OwnTracks Location Receiver

Lightweight OwnTracks HTTP endpoint that gives your agent GPS awareness.

## Architecture

```
OwnTracks app → (HTTPS via ngrok/tunnel) → receiver server → data/
                                                              ├── current-location.json
                                                              └── location-log.jsonl
```

## Setup

### 1. Start the receiver

```bash
# Generate a secret and start
node scripts/server.mjs
# Default port: 8073. Override: PORT=9090 node scripts/server.mjs
# Set auth: AUTH_USER=yi AUTH_SECRET=<token> node scripts/server.mjs
# Without AUTH_SECRET, server runs without authentication (not recommended for public endpoints)
```

### 2. Expose via tunnel (if behind NAT)

```bash
ngrok http 8073
```

### 3. Configure OwnTracks app

- **Mode:** HTTP
- **URL:** `https://<your-tunnel-domain>/`
- **Authentication:** Username + password (matching AUTH_USER / AUTH_SECRET)
- **Monitoring:** Significant (battery-friendly) or Move (precise)

⚠️ Common gotcha: OwnTracks may add a trailing space when pasting the password. The server trims credentials automatically.

## Querying Location

Read current location:
```bash
cat data/current-location.json
```

Fields: `lat`, `lon`, `alt`, `acc` (meters), `vel` (km/h), `batt` (%), `conn` (w=wifi, m=mobile), `tid`, `tst` (epoch), `timestamp` (ISO), `receivedAt` (ISO).

Query log:
```bash
# Last 5 locations
tail -5 data/location-log.jsonl

# Locations from today
grep "$(date +%Y-%m-%d)" data/location-log.jsonl
```

## Running as a Service

Use OpenClaw cron or systemd/launchd to keep the server running. Example launchd plist or cron entry left to the user's preference.

## Files

- `scripts/server.mjs` — HTTP receiver (zero dependencies, Node.js only)
- `data/current-location.json` — Latest location (created automatically)
- `data/location-log.jsonl` — Append-only location history
