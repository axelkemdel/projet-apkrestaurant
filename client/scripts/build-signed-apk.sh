#!/usr/bin/env bash
# APK de production signé de THAONI APP.
#
#   CAP_SERVER_URL=https://thaoni-app.up.railway.app npm run apk:release     (depuis la racine)
#
# Étapes : vite build → npx cap sync android → ./gradlew assembleRelease → zipalign → apksigner
# → vérification de la signature. Résultat : android/app/build/outputs/apk/release/app-release-signed.apk
#
# Variables :
#   CAP_SERVER_URL            adresse HTTPS du serveur de production (obligatoire)
#   THAONI_KEYSTORE           keystore (défaut ~/.thaoni/thaoni-release-key.jks, cf. create-keystore.sh)
#   THAONI_KEY_ALIAS          alias de la clé (défaut thaoni-alias)
#   THAONI_KEYSTORE_PASSWORD  mot de passe du keystore (demandé s'il est absent, jamais affiché)
#   THAONI_KEY_PASSWORD       mot de passe de la clé (défaut : celui du keystore)
#   THAONI_VERSION_CODE       entier à incrémenter à chaque publication (défaut 1)
#   THAONI_VERSION_NAME       version affichée (défaut 1.0)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CLIENT="$(cd "$HERE/.." && pwd)"
# shellcheck source=java21.sh
source "$HERE/java21.sh"

fail() { echo "✘ $*" >&2; exit 1; }

# --- Contrôles préalables -----------------------------------------------------------
URL="${CAP_SERVER_URL:-${VITE_SERVER_URL:-}}"
[ -n "$URL" ] || fail "CAP_SERVER_URL manquante (ex. CAP_SERVER_URL=https://thaoni-app.up.railway.app)"
case "$URL" in
  https://*) ;;
  *) [ "${THAONI_ALLOW_HTTP:-}" = "true" ] || fail "Production : adresse HTTPS obligatoire ($URL). THAONI_ALLOW_HTTP=true pour un serveur local sans certificat." ;;
esac
export CAP_SERVER_URL="$URL"
# Pas de débogage Chrome dans un APK de production
unset CAP_DEBUG

KEYSTORE="${THAONI_KEYSTORE:-$HOME/.thaoni/thaoni-release-key.jks}"
ALIAS="${THAONI_KEY_ALIAS:-thaoni-alias}"
[ -f "$KEYSTORE" ] || fail "Keystore introuvable : $KEYSTORE (créez-le avec « npm run keystore:create »)"
if [ -z "${THAONI_KEYSTORE_PASSWORD:-}" ]; then
  read -rsp "Mot de passe du keystore : " THAONI_KEYSTORE_PASSWORD; echo
fi
export THAONI_KEYSTORE_PASSWORD
export THAONI_KEY_PASSWORD="${THAONI_KEY_PASSWORD:-$THAONI_KEYSTORE_PASSWORD}"

use_jdk21
keytool -list -keystore "$KEYSTORE" -alias "$ALIAS" -storepass:env THAONI_KEYSTORE_PASSWORD >/dev/null 2>&1 \
  || fail "Mot de passe incorrect ou alias « $ALIAS » absent de $KEYSTORE"

# SDK Android : ANDROID_HOME / ANDROID_SDK_ROOT, sinon android/local.properties (npm run android:sdk)
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ] && [ -f "$CLIENT/android/local.properties" ]; then
  SDK="$(sed -n 's/^sdk\.dir=//p' "$CLIENT/android/local.properties" | tail -1)"
fi
[ -n "$SDK" ] && [ -d "$SDK/build-tools" ] || fail "SDK Android introuvable : lancez « npm run android:sdk -w client »"
BUILD_TOOLS="$SDK/build-tools/$(ls -1 "$SDK/build-tools" | sort -V | tail -1)"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"
[ -x "$ZIPALIGN" ] && [ -x "$APKSIGNER" ] || fail "zipalign / apksigner absents de $BUILD_TOOLS"

# --- 1. Interface et 2. projet Android ------------------------------------------------
cd "$CLIENT"
echo "→ vite build (serveur : $CAP_SERVER_URL)"
npx vite build
echo "→ npx cap sync android"
npx cap sync android

# --- 3. Compilation release -----------------------------------------------------------
cd "$CLIENT/android"
./gradlew --stop >/dev/null 2>&1 || true
./gradlew assembleRelease

OUT="$CLIENT/android/app/build/outputs/apk/release"
UNSIGNED="$OUT/app-release-unsigned.apk"
[ -f "$UNSIGNED" ] || UNSIGNED="$OUT/app-release.apk"
[ -f "$UNSIGNED" ] || fail "APK release introuvable dans $OUT"
ALIGNED="$OUT/app-release-aligned.apk"
SIGNED="$OUT/app-release-signed.apk"

# --- 4. Alignement puis signature (v1 à v3) ---------------------------------------------
echo "→ zipalign"
"$ZIPALIGN" -p -f 4 "$UNSIGNED" "$ALIGNED"
echo "→ apksigner"
"$APKSIGNER" sign \
  --ks "$KEYSTORE" --ks-key-alias "$ALIAS" \
  --ks-pass env:THAONI_KEYSTORE_PASSWORD --key-pass env:THAONI_KEY_PASSWORD \
  --out "$SIGNED" "$ALIGNED"
rm -f "$ALIGNED" "$SIGNED.idsig"
"$APKSIGNER" verify --verbose --print-certs "$SIGNED" | grep -E "Verified using|SHA-256 digest" || fail "Signature invalide"

echo
echo "✔ APK de production signé : $SIGNED"
echo "  Serveur : $CAP_SERVER_URL · version ${THAONI_VERSION_NAME:-1.0} (${THAONI_VERSION_CODE:-1})"
