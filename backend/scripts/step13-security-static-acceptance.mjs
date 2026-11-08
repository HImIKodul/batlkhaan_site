import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('src/api/app.ts');
const cfg=read('src/api/config.ts');
const auth=read('src/api/auth/auth-service.ts');
const crypto=read('src/api/auth/crypto.ts');
const cookies=read('src/api/auth/cookies.ts');
const access=read('src/api/auth/access.ts');
const limiter=read('src/api/http/rate-limit.ts');
const rolePolicy=read('src/api/auth/role-policy.ts');
const server=read('src/api/server.ts');
const report=read('src/services/prisma-strategy-report-service.ts');
const client=fs.readFileSync(path.join(root,'../frontend/src/api/client.ts'),'utf8');
const frontendApp=fs.readFileSync(path.join(root,'../frontend/src/App.tsx'),'utf8');
const checks=[]; const check=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});
const has=(s,x)=>s.includes(x);

// Production configuration and transport hardening.
check('prod_secure_cookie',has(cfg,'COOKIE_SECURE must be true in production'));
check('prod_https_origins',has(cfg,'Production origin must use HTTPS'));
check('secrets_distinct',has(cfg,'must be distinct'));
check('access_ttl_bounded',has(cfg,'must not exceed 1800'));
check('refresh_ttl_bounded',has(cfg,'must not exceed 90 days'));
check('qpay_https_guard',has(cfg,'QPAY_BASE_URL')&&has(cfg,'must use HTTPS in production'));
check('request_body_bounded',has(cfg,'REQUEST_BODY_LIMIT_BYTES'));
check('server_timeouts',has(server,'requestTimeout=config.requestTimeoutMs')&&has(server,'headersTimeout=config.headersTimeoutMs'));
check('security_headers',has(app,'strict-transport-security')&&has(app,'content-security-policy')&&has(app,'permissions-policy'));
check('request_id_sanitized',has(app,'^[A-Za-z0-9._:-]{1,128}$'));
check('cors_allowlist',has(app,'config.allowedOrigins.has(origin)'));
check('cookie_mutation_origin_required_in_prod',has(app,'BROWSER_ORIGIN_REQUIRED'));

// Authentication/session controls.
check('password_scrypt',has(crypto,'scrypt(')&&has(crypto,'timingSafeEqual'));
check('jwt_alg_typ_checked',has(crypto,'parsedHeader.alg!=="HS256"')&&has(crypto,'parsedHeader.typ!=="JWT"'));
check('jwt_iss_aud_claims_checked',has(crypto,'claims.iss !== config.issuer')&&has(crypto,'claims.aud !== config.audience'));
check('jwt_user_status_token_version_checked',has(access,'user.status !== "ACTIVE"')&&has(access,'user.tokenVersion !== claims.tv'));
check('refresh_tokens_hashed',has(auth,'hashRefreshToken(refreshToken)'));
check('refresh_replay_family_revoke',has(auth,'REFRESH_REPLAY')&&has(auth,'tokenVersion: { increment: 1 }'));
check('refresh_rotation_compare_and_set',has(auth,'updateMany({ where: { id: session.id, revokedAt: null }')&&has(auth,'REFRESH_ROTATION_RACE'));
check('refresh_cookie_http_only_strict',has(cookies,'HttpOnly')&&has(cookies,'SameSite=Strict'));
check('unknown_login_dummy_work',has(auth,'dummyPasswordHash')&&has(auth,'user?.passwordHash??await this.dummyPasswordHash'));
check('auth_ip_and_account_rate_limit',has(app,'authIpLimiter.check')&&has(app,'authAccountLimiter.check'));
check('refresh_rate_limit',has(app,'refreshLimiter.check'));
check('limiter_bounded_memory',has(limiter,'maxBuckets=50_000'));
check('retry_after',has(app,'retry-after'));

// Tenant/RBAC separation.
check('assessment_input_roles_split',has(app,'const ASSESSMENT_INPUT: CompanyRole[]=["OWNER","ADMIN","ASSESSOR"]'));
check('review_write_roles_split',has(app,'const REVIEW_WRITE: CompanyRole[]=["OWNER","ADMIN","CONSULTANT"]'));
check('viewer_not_input_writer',!has(app,'ASSESSMENT_INPUT: CompanyRole[]=["OWNER","ADMIN","ASSESSOR","VIEWER"'));
check('consultant_not_diagnostic_input',!has(app,'ASSESSMENT_INPUT: CompanyRole[]=["OWNER","ADMIN","ASSESSOR","CONSULTANT"'));
check('assessor_not_review_writer',!has(app,'REVIEW_WRITE: CompanyRole[]=["OWNER","ADMIN","ASSESSOR"'));
check('company_access_membership_based',has(access,'companyMembership.findUnique')&&has(access,'allowed.includes'));
check('assessment_access_tenant_scoped_notfound',has(access,'company: { memberships: { some: { userId, role: { in: [...allowed] as any } } } }')&&has(access,'throw notFound("Assessment not found")'));
check('strategy_generation_review_roles',/strategy\/generate[\s\S]{0,220}REVIEW_WRITE/.test(app));
check('milestone_update_review_roles',/action-plan\/milestones[\s\S]{0,220}REVIEW_WRITE/.test(app));
check('report_payload_review_roles',/report-payload[\s\S]{0,220}REVIEW_WRITE/.test(app));
check('trace_restricted',/assessments\/:assessmentId\/trace[\s\S]{0,240}\["OWNER","ADMIN","CONSULTANT"\]/.test(app));
check('last_owner_protected',has(rolePolicy,'ownerCount<=1')&&has(app,'assertOwnerTransitionAllowed'));
check('membership_change_audited',has(app,'eventType:"MEMBERSHIP_CHANGED"')&&has(app,'previousRole')&&has(app,'nextRole'));

// Read-only viewer behavior and research governance.
check('viewer_report_read_only_branch',has(app,'membership.role==="VIEWER"?await strategyReports.readPublishedReport'));
check('published_report_read_does_not_generate',has(report,'async readPublishedReport')&&has(report,'publishedAt:{not:null}')&&!/async readPublishedReport[\s\S]{0,1200}\.create\(/.test(report));
check('pilot_enrollment_requires_coordinator',/pilot\/studies\/:studyId\/enrollments[\s\S]{0,360}requireStudyCreator/.test(app));
check('pilot_enrollment_requires_company_admin',/pilot\/studies\/:studyId\/enrollments[\s\S]{0,440}COMPANY_ADMIN/.test(app));
check('pilot_feedback_excludes_viewer',has(app,'COMPANY_CONTENT_WRITE: CompanyRole[]=["OWNER","ADMIN","ASSESSOR","CONSULTANT"]'));

// Browser token handling.
check('access_token_memory_only',has(client,'let memoryAccessToken:string|null=null')&&has(client,'return memoryAccessToken'));
check('no_access_token_localstorage',!has(client,'localStorage.getItem(K.access)')&&!has(client,'localStorage.setItem(K.access)'));
check('legacy_persistent_token_cleanup',has(client,"const LEGACY_ACCESS_KEY=['mmri','accessToken'].join('.')")&&has(client,'localStorage.removeItem(LEGACY_ACCESS_KEY)'));
check('refresh_cookie_bootstrap',has(client,'export async function restoreSession()')&&has(frontendApp,'restoreSession().finally'));
// MMRI-17: only a definitive 401/403 from the refresh endpoint may clear local work; transient failures (5xx, 429, network, timeout) must keep it.
check('failed_refresh_clears_context_only_on_401_403',/if\(!r\.ok\)\{if\(r\.status===401\|\|r\.status===403\)session\.clear\(\);return false\}/.test(client)&&!/if\(!r\.ok\)\{session\.clear\(\)/.test(client));
check('login_clears_stale_context',/async login[\s\S]{0,360}session\.clear\((?:true)?\);[\s\S]{0,160}session\.accessToken=x\.accessToken/.test(client));
check('logout_clears_context',/async logout\(\)[\s\S]{0,1200}finally\{session\.clear\(\)\}/.test(client));

// Sensitive public-route surface must remain narrow.
const falseCount=(app.match(/false\);/g)||[]).length;
// 11 earlier public routes + POST /auth/password-reset/request and /confirm (security-reviewed: enumeration-safe 202 with constant minimum latency, per-IP and per-account limiters, 256-bit salted-hash single-use tokens, session revocation on confirm).
check('public_route_count_expected',falseCount===13);
check('auth_me_not_public',!/auth\/me[\s\S]{0,220}false\);/.test(app));
check('assessment_routes_not_public',!/assessments\/:assessmentId[\s\S]{0,260}false\);/.test(app));
check('trace_route_not_public',!/assessments\/:assessmentId\/trace[\s\S]{0,260}false\);/.test(app));

const failed=checks.filter(x=>x.status==='FAIL');
console.log(JSON.stringify({suite:'Step 13 security/RBAC static acceptance',passed:checks.length-failed.length,total:checks.length,failed:failed.map(x=>x.name),publicFalseAuthRouteCount:falseCount},null,2));
if(failed.length)process.exit(1);
