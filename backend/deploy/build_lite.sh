#!/usr/bin/env bash
# Builds medsupply_lite.zip (code + data, NO model, NO scikit-learn) from the project root.
set -e
cd "$(dirname "$0")/.."
rm -rf build_lite medsupply_lite.zip
mkdir build_lite
cp -r medsupply_member_c data lambda_handler.py build_lite/
find build_lite -name __pycache__ -prune -exec rm -rf {} \;
(cd build_lite && zip -qr ../medsupply_lite.zip .)
ls -lh medsupply_lite.zip
