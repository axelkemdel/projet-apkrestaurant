#!/usr/bin/env bash
# Crée le keystore de signature Android de production de Appresto (une seule fois, jamais commité).
#
#   npm run keystore:create            (depuis la racine du dépôt)
#
# Emplacement : APPRESTO_KEYSTORE, par défaut ~/.appresto/appresto-release-key.jks (HORS du dépôt).
# ⚠ Sauvegardez ce fichier ET son mot de passe hors de la machine (gestionnaire de mots de
# passe, clé USB chiffrée) : sans eux, plus aucune mise à jour de l'application n'est possible
# sur les tablettes déjà installées (Android exige la même signature).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=java21.sh
source "$HERE/java21.sh"
use_jdk21 >/dev/null

KEYSTORE="${APPRESTO_KEYSTORE:-$HOME/.appresto/appresto-release-key.jks}"
ALIAS="${APPRESTO_KEY_ALIAS:-appresto-alias}"

if [ -e "$KEYSTORE" ]; then
  echo "✘ $KEYSTORE existe déjà : on ne l'écrase jamais (l'application ne pourrait plus être mise à jour)." >&2
  exit 1
fi
mkdir -p "$(dirname "$KEYSTORE")"
chmod 700 "$(dirname "$KEYSTORE")" 2>/dev/null || true

# Commande de référence :
#   keytool -genkey -v -keystore appresto-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias appresto-alias
# keytool demande le mot de passe (12 caractères minimum conseillés) et l'identité (nom, organisation, ville, pays).
# Non interactif possible : APPRESTO_KEYSTORE_PASSWORD et APPRESTO_DNAME="CN=Appresto, O=…, L=Ouagadougou, C=BF".
args=(-genkey -v -keystore "$KEYSTORE" -keyalg RSA -keysize 2048 -validity 10000 -alias "$ALIAS")
[ -n "${APPRESTO_KEYSTORE_PASSWORD:-}" ] && args+=(-storepass:env APPRESTO_KEYSTORE_PASSWORD -keypass:env APPRESTO_KEYSTORE_PASSWORD)
[ -n "${APPRESTO_DNAME:-}" ] && args+=(-dname "$APPRESTO_DNAME")
keytool "${args[@]}"
chmod 600 "$KEYSTORE"

echo
echo "✔ Keystore créé : $KEYSTORE (alias $ALIAS)"
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" ${APPRESTO_KEYSTORE_PASSWORD:+-storepass:env APPRESTO_KEYSTORE_PASSWORD} 2>/dev/null | grep -E "SHA256:|Valid" || true
echo "⚠ Sauvegardez-le maintenant, avec son mot de passe, en dehors de cette machine."
