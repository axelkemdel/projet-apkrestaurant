#!/usr/bin/env bash
# Installe le SDK Android (ligne de commande) pour compiler l'APK sans Android Studio,
# par exemple dans GitHub Codespaces ou sur Ubuntu :  npm run android:sdk -w client
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
TOOLS_ZIP="commandlinetools-linux-13114758_latest.zip"

HERE="$(cd "$(dirname "$0")" && pwd)"
# JDK 21 exactement (Gradle 8.14 refuse Java 25, installé par défaut dans Codespaces)
# shellcheck source=java21.sh
source "$HERE/java21.sh"
use_jdk21

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
echo "sdk.dir=$SDK" > "$HERE/../android/local.properties"

# Gradle utilisera toujours ce JDK 21, même si « java » désigne une autre version
mkdir -p "$HOME/.gradle"
touch "$HOME/.gradle/gradle.properties"
sed -i '/^org.gradle.java.home=/d' "$HOME/.gradle/gradle.properties"
echo "org.gradle.java.home=$JAVA_HOME" >> "$HOME/.gradle/gradle.properties"
echo "✔ SDK Android prêt dans $SDK — compilez avec : npm run apk:debug -w client"
