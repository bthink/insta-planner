#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname "$0")" || exit 1
node scripts/launcher.mjs start
if [ $? -ne 0 ]; then
  read -r -p "Naciśnij Enter, aby zamknąć..."
fi
