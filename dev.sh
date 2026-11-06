#!/usr/bin/env bash
# Mac/Linux geliştirme: örnek veri yoksa üretir, backend (127.0.0.1:5127) + Vite (127.0.0.1:5173) başlatır.
#   ./dev.sh                 # örnek veriyle
#   FC_CAREER_DB=/yol/fc_career.db ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

# .NET 9 SDK: sistemde yoksa ~/.dotnet'teki kullanıcı kurulumunu kullan (dotnet-install.sh).
if [ -x "$HOME/.dotnet/dotnet" ]; then export PATH="$HOME/.dotnet:$PATH"; fi
if ! dotnet --list-sdks 2>/dev/null | grep -q '^9\.'; then
  echo "HATA: .NET 9 SDK bulunamadı. Kurulum: https://dotnet.microsoft.com/download/dotnet/9.0" >&2
  exit 1
fi
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

export FC_CAREER_DB="${FC_CAREER_DB:-$PWD/fc_career.db}"
if [ ! -f "$FC_CAREER_DB" ]; then
  echo "» Örnek veri üretiliyor (6 ay, 3000 oyuncu)…"
  python3 exporter/tools/make_sample_export.py ./sample_export --months 6 --players 3000
  python3 exporter/tools/importer.py ./sample_export --db "$FC_CAREER_DB"
fi

if [ ! -d frontend/node_modules ]; then
  echo "» Frontend bağımlılıkları kuruluyor…"
  npm --prefix frontend install --no-audit --no-fund
fi

trap 'kill 0' EXIT INT TERM
dotnet run --project backend/FcMarket.Api &
echo "» Arayüz: http://127.0.0.1:5173/market"
npm --prefix frontend run dev &
wait
