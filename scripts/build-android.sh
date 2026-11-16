#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
android_dir="$project_dir/android"
boring_dir="$android_dir/app/src/main/cpp/boringssl"
boring_revision="a2f9a2474d0703e6ac3111a07129ead7c5aa8245"

mkdir -p "$boring_dir" "$project_dir/.cache" "$project_dir/dist"
if [[ ! -f "$boring_dir/CMakeLists.txt" ]]; then
  archive="$project_dir/.cache/boringssl-$boring_revision.tar.gz"
  curl --fail --show-error --silent --location --retry 3 \
    "https://codeload.github.com/google/boringssl/tar.gz/$boring_revision" -o "$archive"
  tar -xf "$archive" --strip-components=1 -C "$boring_dir"
fi

cd "$android_dir"
if [[ -n "${OMNICAST_GRADLE:-}" ]]; then
  "$OMNICAST_GRADLE" --console=plain assembleDebug
else
  ./gradlew --console=plain assembleDebug
fi
cp app/build/outputs/apk/debug/app-debug.apk "$project_dir/dist/OmniCast-Mobile-debug.apk"
printf '%s\n' "$project_dir/dist/OmniCast-Mobile-debug.apk"
