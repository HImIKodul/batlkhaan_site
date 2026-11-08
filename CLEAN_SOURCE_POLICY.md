# Clean-source delivery policy

For this and future MMRI deliveries:

1. A release ZIP contains the entire current application, not only changed files.
2. A changed source file replaces the previous implementation in the canonical tree; obsolete duplicate source copies are removed.
3. Previous release ZIPs, recovery snapshots, build output, and historical audit artifacts are not placed inside the runnable source tree unless they are operationally required.
4. Database migrations are retained because they are part of the current executable database history and are required to build/update the schema correctly.
5. Current frozen methodology/question-bank artifacts required by runtime are retained; superseded runtime candidates are excluded from the clean delivery.
6. Linux run/setup scripts and configuration examples are delivered with the source.
