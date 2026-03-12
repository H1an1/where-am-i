#!/bin/bash
# GPS Status Injector for HEARTBEAT.md
# Reads OwnTracks GPS data and writes a status line into HEARTBEAT.md header.
# Run via launchd/cron every 1-2 minutes.
#
# Config: set these paths for your setup
GPS_FILE="${GPS_FILE:-./data/current-location.json}"
HEARTBEAT="${HEARTBEAT:-../../HEARTBEAT.md}"
PLACES_FILE="${PLACES_FILE:-./known-places.json}"

if [ ! -f "$GPS_FILE" ]; then
  exit 0
fi

# Read GPS data
LAT=$(jq -r '.lat' "$GPS_FILE")
LON=$(jq -r '.lon' "$GPS_FILE")
TST=$(jq -r '.tst' "$GPS_FILE")
BATT=$(jq -r '.batt' "$GPS_FILE")
CONN=$(jq -r '.conn' "$GPS_FILE")
ACC=$(jq -r '.acc' "$GPS_FILE")

# Calculate age
NOW=$(date +%s)
AGE_MIN=$(( (NOW - TST) / 60 ))

# Connection type
case "$CONN" in
  w) CONN_STR="WiFi" ;;
  m) CONN_STR="移动数据" ;;
  o) CONN_STR="离线" ;;
  *) CONN_STR="$CONN" ;;
esac

# Check known places
PLACE=""
if [ -f "$PLACES_FILE" ]; then
  PLACE=$(jq -r --arg lat "$LAT" --arg lon "$LON" '
    .[] | select(
      ((.lat - ($lat|tonumber)) | fabs) < .radius and
      ((.lon - ($lon|tonumber)) | fabs) < .radius
    ) | .name' "$PLACES_FILE" 2>/dev/null | head -1)
fi

# Reverse geocode unknown locations via OSM Nominatim (WGS-84, free)
if [ -z "$PLACE" ]; then
  RGEO=$(curl -s "https://nominatim.openstreetmap.org/reverse?lat=${LAT}&lon=${LON}&format=json&accept-language=zh&zoom=18" -H "User-Agent: OpenClaw-GPS/1.0" 2>/dev/null)
  PLACE=$(echo "$RGEO" | jq -r '.display_name // empty' 2>/dev/null | cut -d',' -f1-2)
  [ -z "$PLACE" ] && PLACE="未知位置 ($LAT, $LON)"
fi

# Format time
UPDATE_TIME=$(date -r "$TST" "+%H:%M" 2>/dev/null || date -d "@$TST" "+%H:%M" 2>/dev/null)

# Build status line
if [ "$AGE_MIN" -gt 120 ]; then
  STATUS="⚠️ GPS 数据过旧（${AGE_MIN}分钟前），可能断连"
else
  STATUS="📍 在 ${PLACE} | 更新于 ${UPDATE_TIME}（${AGE_MIN}分钟前）| 🔋${BATT}% ${CONN_STR} | 精度${ACC}m"
fi

# Inject into HEARTBEAT.md between GPS markers
if grep -q "<!-- GPS_START -->" "$HEARTBEAT"; then
  sed -i '' '/<!-- GPS_START -->/,/<!-- GPS_END -->/c\
<!-- GPS_START -->\
> '"$STATUS"'\
<!-- GPS_END -->' "$HEARTBEAT"
else
  sed -i '' '1a\
<!-- GPS_START -->\
> '"$STATUS"'\
<!-- GPS_END -->\
' "$HEARTBEAT"
fi
