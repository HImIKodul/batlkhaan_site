# MMRI R17.21.8 — Step 6/6 Accepted 61,440-Question Final Integration

This is the self-contained Linux source freeze produced after the five-domain repair and fresh 61,440-question + answer acceptance audit.

## Active methodology targets
- Marketing: 3.0.3 / QBANK 3.1.3 (MARKETING_V3)
- Human Resources: 4.1.4 / BUSINESSMRI-v2.4-HRMRI
- Finance: 4.2.4 / BUSINESSMRI-v2.4-FINMRI
- Information Technology: 4.3.4 / BUSINESSMRI-v2.4-ISMRI
- Production & Operations: 4.4.4 / BUSINESSMRI-v2.4-OPMRI

The accepted master contains 61,440 rows: 12,288 per domain. The Step-5 acceptance gate finished with 0 CRITICAL, 0 HIGH and 0 MEDIUM residual defects. Earlier runtime bundles remain packaged for rollback/history.

## Clean replacement on Debian/Linux

```bash
cd "$HOME/Downloads"
ZIP="$(find . -maxdepth 1 -type f -name 'MMRI_FINAL_FROZEN_MASTER_v3.1.20_R17_21_8_STEP6_OF6_ACCEPTED_61440_INTEGRATED_LINUX_2026-10-23.zip' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
[ -f "$ZIP" ] || { echo "ZIP not found"; exit 1; }

if [ -x "$HOME/MMRI_LOCAL/STOP_LOCAL.sh" ]; then
  (cd "$HOME/MMRI_LOCAL" && ./STOP_LOCAL.sh) || true
fi
rm -rf /tmp/mmri_step6_final "$HOME/MMRI_LOCAL"
mkdir -p /tmp/mmri_step6_final "$HOME/MMRI_LOCAL"
unzip -q "$ZIP" -d /tmp/mmri_step6_final
SRC="$(find /tmp/mmri_step6_final -mindepth 1 -maxdepth 1 -type d | head -n1)"
cp -a "$SRC/." "$HOME/MMRI_LOCAL/"
cd "$HOME/MMRI_LOCAL"
bash VERIFY_STEP6_OF6_FINAL_ACCEPTED_INTEGRATION.sh
./START_LOCAL.sh
```

## Connected release gate

The source/runtime regression passed in the build environment. Docker/PostgreSQL and fresh npm dependency installation are not available here, so the connected database promotion and browser production build are intentionally not marked as executed.

On the Debian deployment machine with Docker and package access:

```bash
cd "$HOME/MMRI_LOCAL"
bash RUN_STEP6_CONNECTED_RELEASE_GATE.sh
```

That gate runs PostgreSQL, migrations, five-domain imports/promotion, backend production build and frontend production build.
