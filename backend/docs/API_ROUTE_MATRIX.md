# MMRI API Route Matrix v2.5.0

Total routes: **38**

| Method | Path | Layer | Auth |
|---|---|---|---|
| GET | `/health` | System | Public |
| POST | `/api/v1/auth/register` | Authentication | Public |
| POST | `/api/v1/auth/login` | Authentication | Public |
| POST | `/api/v1/auth/refresh` | Authentication | Refresh cookie |
| POST | `/api/v1/auth/logout` | Authentication | Refresh cookie |
| GET | `/api/v1/auth/me` | Authentication | Bearer |
| GET | `/api/v1/billing/plans` | Billing catalog | Public |
| GET | `/api/v1/companies/:companyId/billing/status` | Billing | OWNER/ADMIN |
| POST | `/api/v1/companies/:companyId/billing/invoices` | Billing | OWNER/ADMIN |
| GET | `/api/v1/billing/invoices/:invoiceId` | Billing | OWNER/ADMIN of invoice company |
| POST | `/api/v1/billing/invoices/:invoiceId/mock-pay` | Local payment test only | OWNER/ADMIN; non-production MOCK only |
| GET | `/api/v1/billing/qpay/callback/:invoiceId` | QPay callback | Public callback token + provider verification |
| POST | `/api/v1/billing/qpay/callback/:invoiceId` | QPay callback | Public callback token + provider verification |
| POST | `/api/v1/companies` | Company/RBAC | Bearer |
| GET | `/api/v1/companies` | Company/RBAC | Bearer |
| GET | `/api/v1/companies/:companyId` | Company/RBAC | Company member |
| GET | `/api/v1/companies/:companyId/assessments` | Company/RBAC | Company member |
| POST | `/api/v1/companies/:companyId/members` | Company/RBAC | OWNER/ADMIN |
| POST | `/api/v1/companies/:companyId/assessments` | Company/RBAC + entitlement gate | OWNER/ADMIN/ASSESSOR/CONSULTANT |
| GET | `/api/v1/assessments/:assessmentId` | Assessment | Company member |
| POST | `/api/v1/assessments/:assessmentId/respondents` | Assessment | Write roles |
| POST | `/api/v1/assessments/:assessmentId/start` | Assessment | Write roles |
| POST | `/api/v1/assessments/:assessmentId/pause` | Assessment | Write roles |
| POST | `/api/v1/assessments/:assessmentId/resume` | Assessment | Write roles |
| GET | `/api/v1/assessments/:assessmentId/next-question` | Assessment | Write roles |
| POST | `/api/v1/assessments/:assessmentId/answers` | Assessment | Write roles |
| POST | `/api/v1/assessments/:assessmentId/complete` | Assessment | Write roles |
| GET | `/api/v1/assessments/:assessmentId/progress` | Assessment | Company member |
| GET | `/api/v1/assessments/:assessmentId/results` | Assessment | Company member |
| POST | `/api/v1/assessments/:assessmentId/strategy/generate` | Strategy | Write roles |
| GET | `/api/v1/assessments/:assessmentId/diagnosis` | Strategy/Report | Company member |
| GET | `/api/v1/assessments/:assessmentId/recommendations` | Strategy/Report | Company member |
| GET | `/api/v1/assessments/:assessmentId/action-plan` | Strategy/Report | Company member |
| PATCH | `/api/v1/assessments/:assessmentId/action-plan/milestones/:milestoneId` | Strategy/Report | Write roles |
| GET | `/api/v1/assessments/:assessmentId/report-payload` | Strategy/Report | OWNER/ADMIN/CONSULTANT/VIEWER |
| GET | `/api/v1/assessments/:assessmentId/report` | Strategy/Report | OWNER/ADMIN/CONSULTANT/VIEWER |
| GET | `/api/v1/methodology/current/profile-questions` | Methodology public metadata | Bearer |
| GET | `/api/v1/methodology/current/respondent-roles` | Methodology public metadata | Bearer |
