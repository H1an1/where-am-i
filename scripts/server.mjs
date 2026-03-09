#!/usr/bin/env node
// OwnTracks HTTP receiver — gives your AI agent GPS awareness
// Zero dependencies. Node.js 18+ required.
//
// ENV config:
//   PORT        — listen port (default: 8073)
//   AUTH_USER   — basic auth username (default: none)
//   AUTH_SECRET — basic auth password (default: none, no auth required)
//   DATA_DIR    — where to store location files (default: ./data)

import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = parseInt(process.env.PORT || '8073', 10);
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_SECRET = process.env.AUTH_SECRET || '';
const DATA_DIR = resolve(process.env.DATA_DIR || join(import.meta.dirname, '..', 'data'));
const CURRENT_FILE = join(DATA_DIR, 'current-location.json');
const LOG_FILE = join(DATA_DIR, 'location-log.jsonl');

mkdirSync(DATA_DIR, { recursive: true });

function checkAuth(req) {
  if (!AUTH_SECRET) return true; // no auth configured
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  // Trim decoded value — OwnTracks mobile sometimes adds trailing spaces
  const decoded = Buffer.from(auth.slice(6), 'base64').toString().trim();
  return decoded === `${AUTH_USER}:${AUTH_SECRET}`;
}

const server = createServer((req, res) => {
  // GET / — current location (requires auth if configured)
  if (req.method === 'GET' && req.url === '/') {
    if (!checkAuth(req)) { res.writeHead(401); res.end('Unauthorized'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (existsSync(CURRENT_FILE)) {
      res.end(readFileSync(CURRENT_FILE, 'utf8'));
    } else {
      res.end(JSON.stringify({ status: 'waiting for first location update' }));
    }
    return;
  }

  // POST — OwnTracks location update
  if (req.method === 'POST') {
    if (!checkAuth(req)) { res.writeHead(401); res.end('Unauthorized'); return; }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        if (data._type === 'location') {
          const location = {
            lat: data.lat,
            lon: data.lon,
            alt: data.alt,
            acc: data.acc,       // accuracy in meters
            vel: data.vel,       // velocity km/h
            batt: data.batt,     // battery %
            conn: data.conn,     // w=wifi, m=mobile
            tid: data.tid,       // tracker ID
            tst: data.tst,       // timestamp (epoch)
            timestamp: new Date(data.tst * 1000).toISOString(),
            receivedAt: new Date().toISOString()
          };

          writeFileSync(CURRENT_FILE, JSON.stringify(location, null, 2));
          appendFileSync(LOG_FILE, JSON.stringify(location) + '\n');
          console.log(`📍 ${location.timestamp} | ${location.lat}, ${location.lon} | acc: ${location.acc}m | batt: ${location.batt}%`);
        }

        // OwnTracks expects an empty JSON array response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
      } catch (e) {
        console.error('Parse error:', e.message);
        res.writeHead(400);
        res.end('Bad request');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌍 OwnTracks receiver running on http://0.0.0.0:${PORT}`);
  console.log(`   Auth: ${AUTH_SECRET ? 'enabled' : 'disabled (set AUTH_SECRET to enable)'}`);
  console.log(`   Data: ${DATA_DIR}`);
});
