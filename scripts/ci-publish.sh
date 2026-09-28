#!/usr/bin/env bash

# Source this from an Actions step after committing validated generated data.
# A normal push is an atomic fast-forward check. If main moved, the caller
# rebuilds from the latest main rather than merging stale generated files.
publish_main() {
  if ! git push origin HEAD:main; then
    echo '::warning::main changed or push failed; rebuild from current main' >&2
    return 75
  fi
}
