#!/bin/bash
TOKEN=$(grep SKILL_RUNNER_TOKEN /opt/bmt-app/skill-runner/.env | cut -d= -f2)
RESPONSE=$(curl -s -X POST http://localhost:3021/run-skill \
  -H "Content-Type: application/json" \
  -H "x-token: $TOKEN" \
  -d '{"skill":"media-lubostron"}')
echo "Response: $RESPONSE"
JOB_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")
echo "JobId: $JOB_ID"
sleep 30
echo "--- Status ---"
curl -s "http://localhost:3021/job/$JOB_ID" -H "x-token: $TOKEN" | python3 -m json.tool
echo "--- Debug log ---"
cat /tmp/skill-debug-$JOB_ID.log 2>/dev/null || echo "Brak pliku debug"
