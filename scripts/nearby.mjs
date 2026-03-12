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

// OwnTracks on iOS reports WGS-84 coordinates (standard GPS).
// AMap API requires GCJ-02. Default: convert WGS→GCJ automatically.
// Set COORD_SYSTEM=gcj02 if your device already reports GCJ-02.
const COORD_SYSTEM = process.env.COORD_SYSTEM || 'wgs84'; // iOS CoreLocation = WGS-84, needs conversion for AMap

// --- WGS-84 → GCJ-02 conversion (required for AMap when source is WGS-84) ---
const _PI = Math.PI, WGS_A = 6378245.0, WGS_EE = 0.00669342162296594323;
function outOfChina(lat, lon) { return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271; }
function _transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2 / 3;
  ret += (20 * Math.sin(y * _PI) + 40 * Math.sin(y / 3 * _PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * _PI) + 320 * Math.sin(y * _PI / 30)) * 2 / 3;
  return ret;
}
function _transformLon(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2 / 3;
  ret += (20 * Math.sin(x * _PI) + 40 * Math.sin(x / 3 * _PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * _PI) + 300 * Math.sin(x / 30 * _PI)) * 2 / 3;
  return ret;
}
function wgs2gcj(wgsLat, wgsLon) {
  if (outOfChina(wgsLat, wgsLon)) return [wgsLat, wgsLon];
  const x = wgsLon - 105, y = wgsLat - 35;
  let dLat = _transformLat(x, y);
  let dLon = _transformLon(x, y);
  const radLat = wgsLat / 180 * _PI;
  let magic = Math.sin(radLat); magic = 1 - WGS_EE * magic * magic;
  const sqrtM = Math.sqrt(magic);
  dLat = (dLat * 180) / (WGS_A * (1 - WGS_EE) / (magic * sqrtM) * _PI);
  dLon = (dLon * 180) / (WGS_A / sqrtM * Math.cos(radLat) * _PI);
  return [wgsLat + dLat, wgsLon + dLon];
}
function toGcj02(lat, lon) {
  return COORD_SYSTEM === 'wgs84' ? wgs2gcj(lat, lon) : [lat, lon];
}

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

// Convert to GCJ-02 for AMap if needed
const [gcjLat, gcjLon] = toGcj02(parseFloat(lat), parseFloat(lng));

const url = `https://restapi.amap.com/v5/place/around?key=${KEY}&keywords=${encodeURIComponent(keyword)}&location=${gcjLon},${gcjLat}&radius=${radius}&show_fields=business&page_size=${limit}`;

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
