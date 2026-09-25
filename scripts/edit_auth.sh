#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# Sovereign — interactive DeepSeek credentials editor
# ============================================================
# Edits ~/cookies/deepseek-creds.json in place with backups.
# The backend loads this file at boot — restart it after editing:
#   ~/stop-factory.sh && ~/start-factory.sh
# ============================================================

set -u

# ── CONFIG ───────────────────────────────────────────────────
CREDS_FILE="${DEEPSEEK_CREDENTIALS_FILE:-$HOME/cookies/deepseek-creds.json}"
BACKUP_DIR="$(dirname "$CREDS_FILE")"

# ── PREREQ: jq ───────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is not installed."
  echo "Install it in Termux with:  pkg install jq"
  exit 1
fi

# ── HELPERS ──────────────────────────────────────────────────
mask() {
  local v="$1"
  local len=${#v}
  if [ "$len" -le 24 ]; then printf '%s' "$v"; return; fi
  printf '%s……%s (len=%d)' "${v:0:10}" "${v: -6}" "$len"
}

require_file() {
  if [ ! -e "$CREDS_FILE" ]; then
    echo "ERROR: file not found: $CREDS_FILE"
    echo "Create it with:"; echo "  mkdir -p ~/cookies"
    echo "  nano $CREDS_FILE"
    exit 2
  fi
  if [ ! -r "$CREDS_FILE" ] || [ ! -w "$CREDS_FILE" ]; then
    echo "ERROR: file not readable or writable: $CREDS_FILE"
    exit 3
  fi
}

backup_file() {
  local ts; ts=$(date +%Y%m%d-%H%M%S)
  local bak="$BACKUP_DIR/$(basename "$CREDS_FILE").bak-$ts"
  cp -p "$CREDS_FILE" "$bak" || { echo "backup failed"; exit 4; }
  echo "Backup: $bak"
}

show_current() {
  echo ""
  echo "Current values in $CREDS_FILE"
  echo "────────────────────────────────────────"
  for k in bearerToken cookies hifLeim hifDliq deviceId; do
    local v; v=$(jq -r --arg k "$k" '.[$k] // ""' "$CREDS_FILE")
    if [ -z "$v" ]; then
      printf '  %-12s (not set)\n' "$k:"
    else
      printf '  %-12s %s\n' "$k:" "$(mask "$v")"
    fi
  done
  echo ""
}

write_field() {
  local key="$1" value="$2"
  local tmp; tmp=$(mktemp)
  if ! jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$CREDS_FILE" > "$tmp" 2>/dev/null; then
    echo "ERROR: jq failed writing $key. File unchanged."
    rm -f "$tmp"; return 1
  fi
  if ! jq -e . "$tmp" >/dev/null 2>&1; then
    echo "ERROR: produced invalid JSON. File unchanged."
    rm -f "$tmp"; return 1
  fi
  mv "$tmp" "$CREDS_FILE" || { echo "ERROR: mv failed"; rm -f "$tmp"; return 1; }
  return 0
}

prompt_field() {
  local label="$1"
  local current; current=$(jq -r --arg k "$label" '.[$k] // ""' "$CREDS_FILE")
  echo ""
  echo "Current $label: $(mask "$current")"
  printf 'New %s (or ENTER to cancel): ' "$label"
  IFS= read -r input
  if [ -z "$input" ]; then
    echo "Cancelled — $label unchanged."
    return 1
  fi
  write_field "$label" "$input" || return 1
  echo "Updated $label."
  return 0
}

prompt_optional() {
  local label="$1"
  local current; current=$(jq -r --arg k "$label" '.[$k] // ""' "$CREDS_FILE")
  echo ""
  echo "Current $label: ${current:-(not set)}"
  printf 'New %s (or ENTER to keep current): ' "$label"
  IFS= read -r input
  if [ -z "$input" ]; then
    echo "$label unchanged."
    return 1
  fi
  write_field "$label" "$input" || return 1
  echo "Updated $label."
  return 0
}

update_bearer() {
  backup_file
  prompt_field bearerToken
}

update_cookies() {
  backup_file
  echo ""
  echo "Paste the entire cookie header, exactly as Chrome sends it."
  echo "Format: name1=value1; name2=value2; ..."
  prompt_field cookies
}

update_hif_device() {
  backup_file
  echo ""
  echo "These three come from localStorage in DevTools:"
  echo "  hifLeim   -> localStorage.hif_leim_cached"
  echo "  hifDliq   -> localStorage.hif_dliq_cached"
  echo "  deviceId  -> localStorage.deepseek-device-id"
  prompt_optional hifLeim
  prompt_optional hifDliq
  prompt_optional deviceId
}

update_all() {
  update_bearer
  update_cookies
  update_hif_device
}

show_menu() {
  echo "=============================="
  echo "SOVEREIGN AUTH EDITOR"
  echo "=============================="
  echo "1. Update bearerToken only"
  echo "2. Update cookies only"
  echo "3. Update hifLeim / hifDliq / deviceId"
  echo "4. Update everything"
  echo "5. Show current values"
  echo "6. Restart backend (to pick up changes)"
  echo "7. Exit"
  echo ""
}

verify_and_report() {
  echo ""
  echo "Updated values:"
  for k in bearerToken cookies hifLeim hifDliq deviceId; do
    local v; v=$(jq -r --arg k "$k" '.[$k] // ""' "$CREDS_FILE")
    if [ -z "$v" ]; then
      printf '  %-12s (not set)\n' "$k:"
    else
      printf '  %-12s %s\n' "$k:" "$(mask "$v")"
    fi
  done
  echo ""
  echo "Restart the backend to load changes:"
  echo "  ~/stop-factory.sh && ~/start-factory.sh"
  echo "Verify with:"
  echo "  curl -s http://127.0.0.1:8790/deepseek/health | head -c 120"
  echo ""
}

# ── MAIN LOOP ────────────────────────────────────────────────
require_file
show_current

while true; do
  show_menu
  printf 'Choice [1-7]: '
  IFS= read -r choice
  case "$choice" in
    1) update_bearer; verify_and_report ;;
    2) update_cookies; verify_and_report ;;
    3) update_hif_device; verify_and_report ;;
    4) update_all; verify_and_report ;;
    5) show_current ;;
    6) "$HOME/stop-factory.sh" && "$HOME/start-factory.sh"; sleep 2;
       curl -s http://127.0.0.1:8790/deepseek/health | head -c 200; echo "" ;;
    7) echo "Bye."; exit 0 ;;
    *) echo "Invalid choice." ;;
  esac
done
