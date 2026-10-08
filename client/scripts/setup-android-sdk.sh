#!/usr/bin/env bash
# Installe le SDK Android (ligne de commande) pour compiler l'APK sans Android Studio,
# par exemple dans GitHub Codespaces ou sur Ubuntu :  npm run android:sdk -w client
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
TOOLS_ZIP="commandlinetools-linux-13114758_latest.zip"

# JDK 21 requis par Capacitor 8
if ! java -version 2>&1 | grep -Eq 'version "(2[1-9]|[3-9][0-9])'; then
  echo "→ Installation du JDK 21"
  sudo apt-get update -qq && sudo apt-get install -y -qq openjdk-21-jdk-headless
fi

if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "→ Téléchargement des outils Android en ligne de commande"
  mkdir -p "$SDK/cmdline-tools"
  curl -fsSL -o /tmp/android-cmdline-tools.zip "https://dl.google.com/android/repository/$TOOLS_ZIP"
  unzip -q -o /tmp/android-cmdline-tools.zip -d "$SDK/cmdline-tools"
  rm -rf "$SDK/cmdline-tools/latest" && mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --sdk_root="$SDK" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;36.0.0"

# Emplacement du SDK pour Gradle (fichier local, ignoré par git)
echo "sdk.dir=$SDK" > "$(dirname "$0")/../android/local.properties"
echo "✔ SDK Android prêt dans $SDK — compilez avec : npm run apk:debug -w client"
