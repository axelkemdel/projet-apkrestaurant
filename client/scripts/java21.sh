# Sélection du JDK 21 exigé par Capacitor 8 / Gradle 8.14 (à « sourcer » depuis un script bash).
# Gradle 8.14 ne fonctionne pas avec Java 25 (« Unsupported class file major version 69 »),
# version installée par défaut dans GitHub Codespaces : on cherche donc précisément un JDK 21.

find_jdk21() {
  local d
  for d in "${JAVA_HOME:-}" /usr/lib/jvm/java-21-openjdk-* /usr/lib/jvm/temurin-21* /usr/lib/jvm/msopenjdk-21* \
    /usr/local/sdkman/candidates/java/21* "$HOME"/.sdkman/candidates/java/21*; do
    [ -n "$d" ] && [ -x "$d/bin/java" ] || continue
    if "$d/bin/java" -version 2>&1 | grep -q 'version "21'; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

use_jdk21() {
  local jdk
  if ! jdk="$(find_jdk21)"; then
    echo "→ Installation du JDK 21 (apt)"
    sudo apt-get update -qq && sudo apt-get install -y -qq openjdk-21-jdk-headless
    jdk="$(find_jdk21)" || { echo "✘ JDK 21 introuvable après installation" >&2; return 1; }
  fi
  export JAVA_HOME="$jdk"
  export PATH="$JAVA_HOME/bin:$PATH"
  echo "✔ Java 21 : $JAVA_HOME"
}
