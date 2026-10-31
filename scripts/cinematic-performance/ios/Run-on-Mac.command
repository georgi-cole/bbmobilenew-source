#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
package_dir="$PWD"
results_dir="$package_dir/results"
mkdir -p "$results_dir"

echo "The Big Eye — isolated iPhone presentation tests"
echo "This package installs a separate QA app and keeps the installed game intact."
echo "Connect and unlock the iPhone. Trust this Mac and enable Developer Mode if iOS asks."
echo "No Remote Login, password sharing or Node installation is needed."
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Open Xcode once and finish its setup, then run this file again."
  exit 1
fi
xcodebuild -version | tee "$results_dir/xcode-version.txt"
echo ""
echo "Available destinations:"
xcodebuild -project "$package_dir/ios/App/App.xcodeproj" -scheme PresentationDeviceTests -showdestinations 2>&1 | tee "$results_dir/destinations.txt"
echo ""
read -r -p "Paste the connected iPhone id from the list above (not a simulator): " device_id
if [[ ! "$device_id" =~ ^[A-Fa-f0-9-]{16,40}$ ]]; then
  echo "Invalid device id. Nothing was installed."
  exit 1
fi
read -r -p "Apple development Team ID (10 letters/digits, found in Xcode Signing settings): " team_id
if [[ ! "$team_id" =~ ^[A-Za-z0-9]{10}$ ]]; then
  echo "Invalid Team ID. Nothing was installed."
  exit 1
fi
echo ""
echo "1 = short installation/video/Skip test (start here)"
echo "2 = Twin live verdict screenshots"
echo "3 = seven full Twin performance iterations (allow about an hour)"
echo "4 = seven full Credits performance iterations (allow about 90 minutes)"
echo "5 = native background/resume and route exit"
read -r -p "Choose 1, 2, 3, 4 or 5: " test_choice
case "$test_choice" in
  1) test_name=testDeviceFixtureSmoke ;;
  2) test_name=testTwinVerdictsOnDevice ;;
  3) test_name=testTwinPerformance ;;
  4) test_name=testCreditsPerformance ;;
  5) test_name=testBackgroundResumeAndRouteExit ;;
  *) echo "No test selected."; exit 1 ;;
esac
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
result_path="$results_dir/$test_name-$stamp.xcresult"
echo "Keep the phone unlocked and let Xcode control it until the test finishes."
echo "The full results and screenshots will be saved in: $results_dir"
echo "Xcode may ask to sign in to your own Apple account or enable developer tools."
# Values are passed as arguments, never evaluated as shell commands.
set +e
xcodebuild test \
  -project "$package_dir/ios/App/App.xcodeproj" \
  -scheme PresentationDeviceTests \
  -destination "platform=iOS,id=$device_id" \
  -only-testing:"PresentationDeviceTests/PresentationDeviceTests/$test_name" \
  -parallel-testing-enabled NO \
  -resultBundlePath "$result_path" \
  -allowProvisioningUpdates \
  "DEVELOPMENT_TEAM=$team_id" 2>&1 | tee "$results_dir/$test_name-$stamp.log"
status=${PIPESTATUS[0]}
set -e
echo "xcodebuild exit status: $status" > "$results_dir/$test_name-$stamp.status.txt"
cp device-test-artifact.json "$results_dir/"
cp mac-project-receipt.json "$results_dir/"
if [[ -d "$result_path" ]]; then
  echo "Opening the saved Xcode results."
  open "$result_path"
fi
echo "Keep the .xcresult bundle and the log together. A failed run is useful evidence too."
echo "Return the results folder for review; do not mark a device pass from installation alone."
read -r -p "Press Return to close. " _unused_reply
exit "$status"
