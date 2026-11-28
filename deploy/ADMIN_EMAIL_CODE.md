# Sign-in with an e-mail code (all roles)

Every account (Sadmin, Admin, User) signs in the same way:

1. e-mail and password;
2. a six-digit code is mailed to the account's own address (only after the password is correct);
3. the code is entered and the session opens.

A device the person chose to trust (30 days, revocable, bound to that account) skips step 2. A password change, a password reset and an account deletion revoke every trusted device.
There is no authenticator (TOTP) step and no per-account switch.

Limits (unchanged): a code works once; customers' codes last 10 minutes and administrators' codes 5 minutes (the mail and the screen state the real value); 60 s between codes; at most 5 codes per hour;
5 wrong guesses lock a code; 5 wrong sign-in attempts lock an administrator account for 24 h (a Sadmin can unlock it).

Needs a working mail provider (`MMRI_MAIL_PROVIDER`, see `scripts/gmail-check.mjs`). Create the first Sadmin with `node dist/admin-cli.js bootstrap --email <owner> --role SUPER_ADMIN --password-stdin`.
