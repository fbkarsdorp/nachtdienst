#!/bin/sh
# Downloads the geographic sources used by pipeline/geo.py into data/geo/.
set -e
cd "$(dirname "$0")/../data/geo"
mkdir -p ne
curl -sSLO https://download.geonames.org/export/dump/NL.zip
unzip -o -q NL.zip NL.txt && mv NL.txt geonames_NL.txt && rm NL.zip
for f in ne_10m_admin_1_states_provinces ne_10m_lakes ne_10m_rivers_lake_centerlines ne_10m_rivers_europe; do
  curl -sSL -o ne/$f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
echo "geo sources in $(pwd)"
