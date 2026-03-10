#!/usr/bin/env node
// Nearby POI search via AMap (高德) API
// Usage:
//   node nearby.mjs "咖啡"              — search near current location
//   node nearby.mjs "药店" --radius 1000 — custom radius
//   node nearby.mjs "餐厅" --lat 37.775 --lng -122.419  — explicit coords
//   node nearby.mjs "咖啡" --json        — JSON output
//
// ENV:
//   AMAP_API_KEY — required, get from https://lbs.amap.com
//   DATA_DIR     — location data dir (default: ../data)

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCRIPT_DIR = import.meta.dirname;
const DATA_DIR = resolve(process.env.DATA_DIR || join(SCRIPT_DIR, '..', 'data'));
const CURRENT_FILE = join(DATA_DIR, 'current-location.json');
const KEY = process.env.AMAP_API_KEY;

if (!KEY) {
  console.error('Missing AMAP_API_KEY. Get one at https://lbs.amap.com');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
const keyword = args.find(a => !a.startsWith('-'));
if (!keyword) { console.error('Usage: nearby.mjs <keyword> [--radius N] [--lat N --lng N] [--json] [--limit N]'); process.exit(1); }

const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const radius = flag('--radius') || '2000';
const limit = flag('--limit') || '10';
const jsonOut = args.includes('--json');
let lat = flag('--lat');
let lng = flag('--lng');

// Auto-detect location from OwnTracks data
if (!lat || !lng) {
  if (existsSync(CURRENT_FILE)) {
    const loc = JSON.parse(readFileSync(CURRENT_FILE, 'utf8'));
    lat = loc.lat;
    lng = loc.lon;
  } else {
    console.error('No location data. Pass --lat/--lng or wait for OwnTracks update.');
    process.exit(1);
  }
}

const url = `https://restapi.amap.com/v5/place/around?key=${KEY}&keywords=${encodeURIComponent(keyword)}&location=${lng},${lat}&radius=${radius}&show_fields=business&page_size=${limit}`;

const res = await fetch(url);
const data = await res.json();

if (data.infocode !== '10000') {
  console.error('AMap API error:', data.info);
  process.exit(1);
}

const pois = data.pois || [];
if (!pois.length) { console.log(`No results for "${keyword}" within ${radius}m`); process.exit(0); }

if (jsonOut) {
  const results = pois.map(p => ({
    name: p.name,
    address: p.address,
    distance: parseInt(p.distance),
    rating: p.business?.rating,
    cost: p.business?.cost,
    opentime: p.business?.opentime_today,
    tel: p.business?.tel,
    location: p.location,
    id: p.id
  }));
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const p of pois) {
    const b = p.business || {};
    const parts = [
      `${p.distance}m`,
      b.rating ? `⭐${b.rating}` : null,
      b.cost ? `¥${b.cost}` : null,
      `${p.name}`,
      `— ${p.address}`,
      b.opentime_today ? `(${b.opentime_today})` : null
    ].filter(Boolean);
    console.log(parts.join(' | '));
  }
}
