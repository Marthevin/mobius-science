#!/bin/sh
# Enter the test-only inspector launcher with the test runner's pinned Node executable.
set -eu
if [ "${OPEN_SCIENCE_E2E_USE_MOCK_KEYCHAIN:-}" != '1' ] ||
   [ -z "${OPEN_SCIENCE_E2E_STORAGE_ROOT:-}" ] ||
   [ -z "${OPEN_SCIENCE_E2E_EXECUTABLE:-}" ]; then
  echo 'Packaged mock credentials require explicit opt-in and isolated storage.' >&2
  exit 2
fi
case "$OPEN_SCIENCE_E2E_STORAGE_ROOT" in /*) ;; *) exit 2 ;; esac
case "$OPEN_SCIENCE_E2E_EXECUTABLE" in /*) ;; *) exit 2 ;; esac
if [ ! -f "$OPEN_SCIENCE_E2E_EXECUTABLE" ] || [ ! -x "$OPEN_SCIENCE_E2E_EXECUTABLE" ]; then
  exit 2
fi
mock_switch=0
for argument in "$@"; do
  if [ "$argument" = '--use-mock-keychain' ]; then mock_switch=1; fi
done
if [ "$mock_switch" != '1' ]; then exit 2; fi
if [ -z "${OPEN_SCIENCE_E2E_LAUNCHER_NODE:-}" ] || [ ! -x "$OPEN_SCIENCE_E2E_LAUNCHER_NODE" ]; then exit 2; fi
case "$OPEN_SCIENCE_E2E_LAUNCHER_NODE" in /*) ;; *) exit 2 ;; esac
fixture_directory=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
unset NODE_OPTIONS
exec "$OPEN_SCIENCE_E2E_LAUNCHER_NODE" "$fixture_directory/launch-mock-keychain.mjs" "$@"
