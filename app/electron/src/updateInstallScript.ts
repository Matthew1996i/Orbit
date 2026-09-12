export const MAC_INSTALL_SCRIPT = `#!/bin/sh
set -eu
parent_pid="$1"
target="$2"
staged="$3"
backup="$4"
count=0
while kill -0 "$parent_pid" 2>/dev/null; do
  count=$((count + 1))
  [ "$count" -lt 60 ] || exit 1
  sleep 1
done
/bin/mv "$target" "$backup"
if /bin/mv "$staged" "$target"; then
  if /usr/bin/open -n "$target"; then exit 0; fi
  /bin/mv "$target" "$staged"
fi
/bin/mv "$backup" "$target"
/usr/bin/open -n "$target"
exit 1
`;
