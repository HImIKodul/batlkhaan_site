# MMRI 6/6 Final accepted integration

- Accepted master: 61,440 questions + answers.
- Acceptance gate before integration: 0 CRITICAL / 0 HIGH / 0 MEDIUM residual defects.
- Marketing: 3.0.3 / QBANK 3.1.3.
- HR: 4.1.4.
- Finance: 4.2.4.
- IT: 4.3.4.
- Production & Operations: 4.4.4.
- D26/D31 factual N/A is imported as N_A_CLAIM with null score in runtime bundles.
- Existing scored option values/order are preserved from the accepted master.
- Full connected PostgreSQL promotion remains executable through RUN_STEP6_CONNECTED_RELEASE_GATE.sh on a Docker-enabled Debian host.
