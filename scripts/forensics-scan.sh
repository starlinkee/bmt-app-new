#!/usr/bin/env bash
# Skan sekretów i śladów włamania na zamontowanym (read-only) dysku z snapshotu.
# Uruchamiać w Hetzner Rescue System jako root:  bash forensics-scan.sh
# Raport (BEZ wartości sekretów — tylko nazwy, typy, ścieżki): /root/report.txt
set -u

MNT=/mnt/snap
REPORT=/root/report.txt
: > "$REPORT"

say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
hdr() { say ""; say "=================== $* ==================="; }

# ---------------------------------------------------------------- mount
mkdir -p "$MNT"
if ! mountpoint -q "$MNT"; then
  n=0
  while read -r dev fstype; do
    case "$fstype" in
      ext4) opts="ro,noload" ;;
      xfs)  opts="ro,norecovery,nouuid" ;;
      btrfs|ext3|ext2) opts="ro" ;;
      *) continue ;;
    esac
    tmp="/mnt/probe$n"; n=$((n+1))
    mkdir -p "$tmp"
    if mount -o "$opts" "$dev" "$tmp" 2>/dev/null; then
      if [ -f "$tmp/etc/os-release" ] && [ -d "$tmp/etc" ]; then
        umount "$tmp"
        mount -o "$opts" "$dev" "$MNT" && break
      else
        umount "$tmp"
      fi
    fi
  done < <(lsblk -lnpo NAME,FSTYPE,TYPE | awk '$3=="part"||$3=="lvm"{print $1, $2}')
fi

if ! mountpoint -q "$MNT"; then
  echo "Nie udało się zamontować systemu plików z /etc/os-release. Sprawdź 'lsblk -f' i zamontuj ręcznie do $MNT (mount -o ro,noload /dev/sdXN $MNT), potem uruchom skrypt ponownie."
  exit 1
fi

say "Skan: $(date -u +%FT%TZ)   Zamontowano: $(findmnt -no SOURCE,OPTIONS "$MNT")"

# ---------------------------------------------------------------- info
hdr "0. SYSTEM"
grep -E '^(PRETTY_NAME|VERSION)=' "$MNT/etc/os-release" | tee -a "$REPORT"
say "hostname: $(cat "$MNT/etc/hostname" 2>/dev/null)"
say "ostatnia modyfikacja /etc/passwd: $(stat -c %y "$MNT/etc/passwd" 2>/dev/null)"
say "ostatni wpis w auth.log/wtmp: $(ls -l --time-style=long-iso "$MNT"/var/log/wtmp "$MNT"/var/log/auth.log 2>/dev/null | awk '{print $6,$7,$8}' | tr '\n' ';')"

# ---------------------------------------------------------------- lista plików do skanu
DIRS=""
for d in root home etc opt srv var/www var/lib/docker/containers var/lib/docker/volumes \
         var/backups var/log var/spool/cron usr/local tmp var/tmp dev/shm; do
  [ -d "$MNT/$d" ] && DIRS="$DIRS $MNT/$d"
done
FILELIST=$(mktemp)
# shellcheck disable=SC2086
find $DIRS -type f -size -5M \
  -not -path '*/node_modules/*' -not -path '*/.cache/*' -not -path '*/proc/*' \
  -print0 2>/dev/null > "$FILELIST"
say "Plików do przeskanowania: $(tr -cd '\0' < "$FILELIST" | wc -c)"

# ---------------------------------------------------------------- 1. klucze prywatne
hdr "1. KLUCZE PRYWATNE (ścieżka, czy zaszyfrowany)"
xargs -0 -a "$FILELIST" grep -Il -e 'BEGIN [A-Z ]*PRIVATE KEY' 2>/dev/null | while read -r f; do
  if grep -q 'ENCRYPTED' "$f" 2>/dev/null; then enc="zaszyfrowany (passphrase)"; else enc="BEZ HASŁA — do wymiany"; fi
  say "${f#$MNT}  ->  $enc"
done

# ---------------------------------------------------------------- 2. pliki .env (tylko nazwy zmiennych)
hdr "2. PLIKI .env / secrets (nazwa zmiennej, długość wartości — wartości NIE są pokazywane)"
find $DIRS -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' -o -name 'secrets*' \
  -o -name 'credentials*' -o -name '.npmrc' -o -name '.git-credentials' -o -name '.pgpass' \
  -o -name '.netrc' -o -name 'config.json' -path '*/.docker/*' -o -name 'service-account*.json' \) \
  -not -path '*/node_modules/*' -not -name '*.example' -not -name '*.sample' 2>/dev/null | while read -r f; do
  say ""
  say "# ${f#$MNT}  (zmodyfikowany: $(stat -c %y "$f" | cut -d. -f1))"
  awk -F= '
    /^[[:space:]]*#/ {next}
    /^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_.]*[[:space:]]*=/ {
      k=$1; sub(/^[[:space:]]*(export[[:space:]]+)?/,"",k); sub(/[[:space:]]+$/,"",k)
      v=substr($0,index($0,"=")+1); gsub(/^["'\'' ]+|["'\'' ]+$/,"",v)
      printf "   %s  (%s)\n", k, (length(v)==0 ? "pusta" : "wartość, " length(v) " zn.")
    }' "$f" | tee -a "$REPORT"
done

# ---------------------------------------------------------------- 3. zmienne kontenerów / systemd / pm2
hdr "3. ZMIENNE ŚRODOWISKOWE USŁUG (tylko nazwy)"
say "-- Docker (config.v2.json kontenerów):"
for c in "$MNT"/var/lib/docker/containers/*/config.v2.json; do
  [ -f "$c" ] || continue
  name=$(grep -o '"Name":"[^"]*"' "$c" | head -1)
  say "  kontener $name"
  if command -v python3 >/dev/null; then
    python3 - "$c" <<'PY' | tee -a "$REPORT"
import json,sys
d=json.load(open(sys.argv[1]))
for e in d.get("Config",{}).get("Env",[]) or []:
    k,_,v=e.partition("=")
    print(f"     {k}  ({'pusta' if not v else str(len(v))+' zn.'})")
PY
  fi
done
say "-- systemd Environment=:"
grep -rHoE '^\s*Environment(File)?=.*' "$MNT/etc/systemd" "$MNT/lib/systemd/system" "$MNT/usr/lib/systemd/system" 2>/dev/null \
  | sed -E 's/=[^= ]*( |$)/=***\1/g' | sed "s#$MNT##" | tee -a "$REPORT"
say "-- pm2 / ecosystem:"
find $DIRS -type f \( -name 'ecosystem.config.*' -o -name 'dump.pm2' \) 2>/dev/null | sed "s#$MNT##" | tee -a "$REPORT"

# ---------------------------------------------------------------- 4. wzorce znanych tokenów
hdr "4. WZORCE SEKRETÓW W PLIKACH (typ + ścieżka, bez wartości)"
COMBINED='AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}|postgres(ql)?://[^[:space:]:/@]+:[^[:space:]@]+@[^[:space:]]+|(mysql|mongodb(\+srv)?|redis|amqp)://[^[:space:]:/@]+:[^[:space:]@]+@[^[:space:]]+|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|re_[A-Za-z0-9]{24,}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|"private_key_id"|(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_KEY)[A-Z_]*["'"'"']?[[:space:]]*[=:][[:space:]]*["'"'"']?[^[:space:]"'"'"']{8,}'
xargs -0 -a "$FILELIST" grep -IHoE -e "$COMBINED" 2>/dev/null | awk -v mnt="$MNT" '
  {
    i=index($0,":"); path=substr($0,1,i-1); val=substr($0,i+1); sub(mnt,"",path)
    t="generyczne hasło/token (KEY=wartość)"
    if (val ~ /^AKIA/) t="AWS access key"
    else if (val ~ /^gh[pousr]_|^github_pat_/) t="GitHub token"
    else if (val ~ /^xox/) t="Slack token"
    else if (val ~ /^(sk|rk)_live_/) t="Stripe live key"
    else if (val ~ /^AIza/) t="Google API key"
    else if (val ~ /^eyJ/) t="JWT (np. Supabase anon/service_role)"
    else if (val ~ /^postgres/) t="Postgres connection string z hasłem"
    else if (val ~ /^(mysql|mongodb|redis|amqp)/) t="connection string z hasłem"
    else if (val ~ /^sk-ant-/) t="Anthropic API key"
    else if (val ~ /^sk-/) t="OpenAI-style API key"
    else if (val ~ /^re_/) t="Resend API key"
    else if (val ~ /^SG\./) t="SendGrid API key"
    else if (val ~ /private_key_id/) t="Google service account JSON"
    print t "\t" path
  }' | sort | uniq -c | sort -k2 | awk '{c=$1; $1=""; sub(/^ /,""); printf "%s  [x%s]\n", $0, c}' | tee -a "$REPORT"

# ---------------------------------------------------------------- 5. historia poleceń
hdr "5. HISTORIA POLECEŃ (pliki + liczba podejrzanych linii; treść NIE jest pokazywana)"
find "$MNT/root" "$MNT/home" -maxdepth 3 -type f \( -name '.bash_history' -o -name '.zsh_history' -o -name '.mysql_history' -o -name '.psql_history' -o -name '.python_history' -o -name '.node_repl_history' \) 2>/dev/null | while read -r f; do
  total=$(wc -l < "$f")
  sus=$(grep -ciE 'pass(word)?|token|secret|api[_-]?key|export [A-Z_]+=|curl .*-H|mysql .*-p|psql |ssh |scp |aws |gh auth|docker login' "$f")
  say "${f#$MNT}: $total linii, w tym $sus podejrzanych (hasła/tokeny/logowania) — przejrzyj ręcznie na klonie"
done

# ---------------------------------------------------------------- 6. SSH
hdr "6. SSH — authorized_keys (klucze publiczne, bezpieczne do pokazania)"
find "$MNT/root" "$MNT/home" -maxdepth 3 -name authorized_keys 2>/dev/null | while read -r f; do
  say "# ${f#$MNT}  (zmodyfikowany: $(stat -c %y "$f" | cut -d. -f1))"
  ssh-keygen -lf "$f" 2>/dev/null | tee -a "$REPORT"
done
say "-- known_hosts (dokąd ten serwer się łączył — cele lateral movement):"
find "$MNT/root" "$MNT/home" -maxdepth 3 -name known_hosts 2>/dev/null | while read -r f; do
  say "# ${f#$MNT}: $(wc -l < "$f") wpisów"
done
say "-- klucze prywatne w ~/.ssh:"
find "$MNT/root/.ssh" "$MNT"/home/*/.ssh -maxdepth 1 -type f ! -name '*.pub' ! -name authorized_keys ! -name known_hosts* ! -name config 2>/dev/null | sed "s#$MNT##" | tee -a "$REPORT"

# ---------------------------------------------------------------- 7. persystencja
hdr "7. MOŻLIWA PERSYSTENCJA ATAKUJĄCEGO"
say "-- konta z powłoką logowania:"
grep -vE '(nologin|false|sync)$' "$MNT/etc/passwd" | cut -d: -f1,3,6,7 | tee -a "$REPORT"
say "-- konta z UID 0:"
awk -F: '$3==0{print $1}' "$MNT/etc/passwd" | tee -a "$REPORT"
say "-- sudoers.d:"
ls -l --time-style=long-iso "$MNT/etc/sudoers.d" 2>/dev/null | tee -a "$REPORT"
say "-- cron (/etc/cron*, crontab, spool):"
ls -l --time-style=long-iso "$MNT"/etc/cron.d "$MNT"/etc/cron.hourly "$MNT"/etc/cron.daily "$MNT"/var/spool/cron/crontabs 2>/dev/null | tee -a "$REPORT"
grep -vE '^\s*#|^\s*$' "$MNT/etc/crontab" 2>/dev/null | tee -a "$REPORT"
say "-- /etc/ld.so.preload, rc.local:"
cat "$MNT/etc/ld.so.preload" "$MNT/etc/rc.local" 2>/dev/null | tee -a "$REPORT"
say "-- jednostki systemd zmienione w ostatnich 60 dniach:"
find "$MNT/etc/systemd/system" "$MNT/lib/systemd/system" -type f -mtime -60 2>/dev/null | sed "s#$MNT##" | tee -a "$REPORT"
say "-- pliki wykonywalne w /tmp, /var/tmp, /dev/shm:"
find "$MNT/tmp" "$MNT/var/tmp" "$MNT/dev/shm" -type f -perm /111 2>/dev/null | sed "s#$MNT##" | tee -a "$REPORT"
say "-- ukryte pliki/katalogi w / i /tmp:"
find "$MNT" -maxdepth 1 -name '.*' 2>/dev/null | sed "s#$MNT##" | tee -a "$REPORT"
find "$MNT/tmp" "$MNT/var/tmp" -maxdepth 2 -name '.*' 2>/dev/null | sed "s#$MNT##" | tee -a "$REPORT"
say "-- /usr/local/bin i /opt zmienione w ostatnich 60 dniach:"
find "$MNT/usr/local/bin" "$MNT/opt" -type f -mtime -60 -not -path '*/node_modules/*' 2>/dev/null | head -50 | sed "s#$MNT##" | tee -a "$REPORT"

# ---------------------------------------------------------------- 8. logowania
hdr "8. LOGOWANIA (adresy IP i konta)"
say "-- udane logowania SSH wg auth.log (IP, konto, liczba):"
zgrep -h 'Accepted' "$MNT"/var/log/auth.log* 2>/dev/null \
  | awk '{for(i=1;i<=NF;i++){if($i=="for")u=$(i+1); if($i=="from")ip=$(i+1)} print u, ip}' | sort | uniq -c | sort -rn | head -40 | tee -a "$REPORT"
say "-- ostatnie logowania (wtmp):"
last -f "$MNT/var/log/wtmp" -F 2>/dev/null | head -60 | tee -a "$REPORT"
say "-- nieudane próby (top IP):"
zgrep -h 'Failed password' "$MNT"/var/log/auth.log* 2>/dev/null \
  | grep -oE 'from [0-9a-fA-F:.]+' | sort | uniq -c | sort -rn | head -15 | tee -a "$REPORT"

rm -f "$FILELIST"
hdr "KONIEC"
say "Raport: $REPORT  — pobierz:  scp root@<IP>:/root/report.txt .   albo:  cat /root/report.txt"
say "Raport nie zawiera wartości sekretów, ale przejrzyj go zanim go komuś pokażesz."
