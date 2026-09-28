#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT

git init --bare -q "$fixture/remote.git"
git clone -q "$fixture/remote.git" "$fixture/seed"
git -C "$fixture/seed" config user.name smoke
git -C "$fixture/seed" config user.email smoke@example.com
git -C "$fixture/seed" switch -q -c main
printf '{"matches":{}}\n' > "$fixture/seed/highlights.json"
git -C "$fixture/seed" add highlights.json
git -C "$fixture/seed" commit -qm seed
git -C "$fixture/seed" push -q -u origin main
git -C "$fixture/remote.git" symbolic-ref HEAD refs/heads/main
git clone -q "$fixture/remote.git" "$fixture/updater"
git clone -q "$fixture/remote.git" "$fixture/curator"
for actor in updater curator; do
  git -C "$fixture/$actor" config user.name smoke
  git -C "$fixture/$actor" config user.email smoke@example.com
done

printf '{"matches":{"updater":1}}\n' > "$fixture/updater/highlights.json"
git -C "$fixture/updater" add highlights.json
git -C "$fixture/updater" commit -qm updater
printf '{"matches":{"curator":1}}\n' > "$fixture/curator/highlights.json"
git -C "$fixture/curator" add highlights.json
git -C "$fixture/curator" commit -qm curator
git -C "$fixture/curator" push -q origin HEAD:main

if (cd "$fixture/updater" && source "$repo_root/scripts/ci-publish.sh" && publish_main); then
  echo 'conflicting generated data was incorrectly published' >&2
  exit 1
fi
if [ -d "$fixture/updater/.git/rebase-merge" ] || [ -d "$fixture/updater/.git/rebase-apply" ]; then
  echo 'publish helper stranded the updater in a rebase' >&2
  exit 1
fi
git -C "$fixture/updater" fetch -q origin main
git -C "$fixture/updater" reset -q --hard origin/main
printf '{"matches":{"curator":1,"updater":1}}\n' > "$fixture/updater/highlights.json"
git -C "$fixture/updater" add highlights.json
git -C "$fixture/updater" commit -qm recomputed
(cd "$fixture/updater" && source "$repo_root/scripts/ci-publish.sh" && publish_main)
expected='{"matches":{"curator":1,"updater":1}}'
actual=$(git --git-dir="$fixture/remote.git" show main:highlights.json)
if [ "$actual" != "$expected" ]; then
  echo "recomputed publish lost an update: $actual" >&2
  exit 1
fi
echo 'ci publish collision smoke test passed'
