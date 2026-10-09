#!/usr/bin/env bash
# Compile l'APK de débogage avec le JDK 21 (après « npm run cap:sync »).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=java21.sh
source "$HERE/java21.sh"
use_jdk21
cd "$HERE/../android"
# Un démon Gradle lancé auparavant avec une autre version de Java est arrêté
./gradlew --stop >/dev/null 2>&1 || true
./gradlew assembleDebug
echo "✔ APK : $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
