#!/bin/bash
# Memory-safe `next build` for this tight 3.7GB box.
# Runs the build in its own cgroup so it can never starve SSH, MySQL,
# or the running PM2 apps: memory throttled at 1.2G, killed at 1.5G,
# CPU/IO weight low so foreground services stay responsive.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/web"
exec systemd-run --scope --collect --quiet \
  -p MemoryHigh=1800M -p MemoryMax=2300M -p MemorySwapMax=2048M \
  -p CPUWeight=25 -p IOWeight=25 \
  --nice=10 \
  env NODE_OPTIONS="--max-old-space-size=1536" NEXT_TELEMETRY_DISABLED=1 \
  npm run build
