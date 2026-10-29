#!/bin/sh
# Runs every behavior test; output is compared against test/baseline/all.txt
cd "$(dirname "$0")/.."
for t in golden spin drift drift-angle autodrift landing landing5 edges flip3 fly park loopnoassist bumpy2 simvar; do
  echo "##### $t"; node test/$t.js 2>&1
done
echo "##### fuzz0"; node test/fuzz.js
echo "##### fuzz1"; LVL=1 node test/fuzz.js
