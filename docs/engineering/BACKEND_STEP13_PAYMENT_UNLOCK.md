# Backend Step 13/20 — Payment → entitlement → diagnosis unlock

This step keeps payment as an adapter boundary so the backend can be completed before QPay credentials are available.

## Supported provider modes

- `mock` — local/development only. The authenticated mock-pay route is hard-disabled in production.
- `manual` — optional temporary static QR mode. The customer can see the configured QR, but only an account whose immutable id is listed in `MMRI_OPERATOR_USER_IDS` can confirm payment. Customers cannot self-unlock.
- `qpay` — production QPay Merchant V2 adapter. Provider payment status is re-checked server-side before an entitlement is created.

## Authoritative flow

`invoice -> provider-confirmed payment -> PAID invoice -> one entitlement -> one assessment claim -> diagnosis unlock`

The browser is never authoritative for payment success.

## Important integrity rules

- One provider payment reference can settle only one invoice.
- A paid/refunded invoice must carry a payment reference and paid timestamp.
- A live entitlement must match the source invoice company, domain and plan.
- A live entitlement requires a `PAID` source invoice.
- A refunded invoice revokes any active/consumed entitlement but never deletes historical assessments/reports.
- An active assessment blocks creation of another invoice for the same company/domain.
- Concurrent callbacks use compare-and-set settlement plus an idempotent entitlement upsert.
- Company admins may request QPay reconciliation; the backend still checks QPay directly.
- Manual payment confirmation/refund recording is operator-only.
- QPay network calls have a bounded timeout and concurrent token requests are coalesced.
- Production refuses a QPay sandbox base URL.

## Temporary QR mode

When needed later, set:

```env
MMRI_BILLING_PROVIDER=manual
MMRI_BILLING_ENFORCEMENT=true
MMRI_OPERATOR_USER_IDS=<account id of the operator>
MMRI_MANUAL_PAYMENT_QR_TEXT=...
# or MMRI_MANUAL_PAYMENT_QR_IMAGE=...
# or MMRI_MANUAL_PAYMENT_SHORT_URL=...
```

No customer-facing manual-confirm endpoint exists. An authenticated configured operator must confirm the payment after verifying the bank transaction.

## QPay later

Switch only environment values/credentials:

```env
MMRI_BILLING_PROVIDER=qpay
MMRI_BILLING_ENFORCEMENT=true
MMRI_BILLING_CALLBACK_BASE_URL=https://YOUR_API_HOST
QPAY_BASE_URL=https://merchant.qpay.mn
QPAY_CLIENT_ID=...
QPAY_CLIENT_SECRET=...
QPAY_INVOICE_CODE=...
QPAY_REQUEST_TIMEOUT_MS=10000
```

The diagnosis entitlement/unlock engine does not need to be redesigned when QPay is connected.
