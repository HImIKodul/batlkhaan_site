import path from "node:path";
export type BillingProviderMode = "qpay" | "mock" | "manual";

export interface ApiConfig {
  port: number;
  environment: string;
  issuer: string;
  audience: string;
  accessTokenSecret: string;
  passwordPepper: string;
  auditSalt: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  refreshCookieName: string;
  cookieSecure: boolean;
  allowedOrigins: Set<string>;
  trustProxy: boolean;
  trustProxyHops: number;
  requestBodyLimitBytes: number;
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
  apiRateLimit: number;
  authIpRateLimit: number;
  authAccountRateLimit: number;
  refreshRateLimit: number;
  rateLimitWindowMs: number;
  apiReplicaCount: number;
  metricsToken: string;
  releaseSha: string;
  instanceId: string;
  readinessDbTimeoutMs: number;
  shutdownDrainMs: number;
  shutdownForceTimeoutMs: number;
  reportStorageDir: string;
  /** "mock" writes messages to a local file (development and tests only). "disabled" sends nothing. No real mail provider is implemented yet. */
  adminSessionIdleMinutes: number;
  /** Rollout flag: when true, newly completed assessments need administrator approval before the customer sees the report. */
  reportReviewRequired: boolean;
  mailProvider: "mock" | "disabled";
  mockMailDir: string;
  publicAppUrl: string;
  passwordResetTtlMinutes: number;
  billingProvider: BillingProviderMode;
  billingEnforcement: boolean;
  diagnosticPriceMnt: number | null;
  retakePriceMnt: number | null;
  billingCallbackBaseUrl: string;
  qpayBaseUrl: string;
  qpayClientId: string;
  qpayClientSecret: string;
  qpayInvoiceCode: string;
  qpayRequestTimeoutMs: number;
  manualPaymentQrText: string;
  manualPaymentQrImage: string;
  manualPaymentShortUrl: string;
  operatorEmails: Set<string>;
  /** Immutable user ids allowed to use operator routes. The only operator grant honoured in production (an e-mail address is not proof of ownership: registration does not verify it). */
  operatorUserIds: Set<string>;
}

function requireSecret(name: string, fallback: string, environment: string): string {
  const value = process.env[name] || (environment === "production" ? "" : fallback);
  if (!value || value.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return value;
}

function boolEnv(name:string, fallback:boolean){
  const raw=process.env[name];
  if(raw===undefined)return fallback;
  return raw.toLowerCase()==="true"||raw==="1";
}

function priceEnv(name:string):number|null{
  const raw=(process.env[name]??"").trim();
  if(!raw)return null;
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<=0)throw new Error(`${name} must be a positive whole-number MNT amount`);
  return value;
}

function cleanBaseUrl(value:string){return value.replace(/\/+$/,'');}
function normalizeOrigin(value:string){
  try{const url=new URL(value);if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error();return url.origin;}
  catch{throw new Error(`Invalid ALLOWED_ORIGINS entry: ${value}`);}
}


function operatorUserIdSet(raw:string|undefined):Set<string>{
  const out=new Set<string>();
  for(const part of (raw??"").split(",")){
    const id=part.trim();
    if(!id)continue;
    if(!/^[A-Za-z0-9_-]{8,64}$/.test(id))throw new Error(`Invalid MMRI_OPERATOR_USER_IDS entry: ${id.slice(0,12)}`);
    out.add(id);
  }
  return out;
}

function operatorEmailSet(raw:string|undefined):Set<string>{
  const out=new Set<string>();
  for(const part of (raw??"").split(",")){
    const email=part.trim().toLowerCase();
    if(!email)continue;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error(`Invalid MMRI_OPERATOR_EMAILS entry: ${part.trim()}`);
    out.add(email);
  }
  return out;
}

function intEnv(name:string,fallback:number,min:number,max:number):number{
  const raw=process.env[name];
  const value=raw===undefined?fallback:Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

function assertHttpsServiceUrl(name:string,value:string,environment:string,disallowLocal:boolean){
  if(environment!=="production")return;
  let url:URL; try{url=new URL(value);}catch{throw new Error(`${name} must be a valid URL`);}
  if(url.protocol!=="https:")throw new Error(`${name} must use HTTPS in production`);
  if(disallowLocal&&["localhost","127.0.0.1","::1"].includes(url.hostname))throw new Error(`${name} must not use a local hostname in production`);
}

function looksLikePlaceholder(value:string){return /replace|change[-_ ]?me|example|your[-_ ]?|development[-_ ]/i.test(value);}
function assertProductionDatabaseUrl(environment:string){
  if(environment!=="production")return;
  const raw=(process.env.DATABASE_URL??"").trim();
  if(!raw)throw new Error("DATABASE_URL is required in production");
  let url:URL;try{url=new URL(raw)}catch{throw new Error("DATABASE_URL must be a valid PostgreSQL URL");}
  if(!["postgres:","postgresql:"].includes(url.protocol))throw new Error("DATABASE_URL must use PostgreSQL in production");
  if(!url.hostname||["localhost","127.0.0.1","::1"].includes(url.hostname))throw new Error("DATABASE_URL must not point to a local database in production");
  const ssl=(url.searchParams.get("sslmode")??"").toLowerCase();
  if(!["require","verify-ca","verify-full"].includes(ssl))throw new Error("DATABASE_URL must require TLS with sslmode=require, verify-ca or verify-full in production");
  const username=decodeURIComponent(url.username||"").toLowerCase();
  if(!username)throw new Error("DATABASE_URL must include a runtime database user");
  if(["postgres","root","admin","administrator"].includes(username))throw new Error("DATABASE_URL must use a least-privilege runtime database user, not a database administrator");
  if(!url.password)throw new Error("DATABASE_URL must include a runtime database password");
  if(looksLikePlaceholder(raw))throw new Error("DATABASE_URL must not contain placeholders in production");
}
function assertProductionReportStorage(environment:string){
  if(environment!=="production")return;
  const raw=(process.env.MMRI_REPORT_STORAGE_DIR??"").trim();
  if(!raw)throw new Error("MMRI_REPORT_STORAGE_DIR is required in production");
  if(!path.isAbsolute(raw))throw new Error("MMRI_REPORT_STORAGE_DIR must be an absolute persistent path in production");
  const resolved=path.resolve(raw);
  if(resolved==="/"||resolved==="/tmp"||resolved.startsWith("/tmp/")||resolved==="/var/tmp"||resolved.startsWith("/var/tmp/"))throw new Error("MMRI_REPORT_STORAGE_DIR must not use temporary storage in production");
}

function assertProductionSecurity(environment:string,args:{cookieSecure:boolean;origins:string[];accessTokenSecret:string;passwordPepper:string;auditSalt:string;metricsToken:string;issuer:string;audience:string;accessTtl:number;refreshTtl:number}){
  if(environment!=="production")return;
  if(!args.cookieSecure)throw new Error("COOKIE_SECURE must be true in production");
  if(args.origins.length===0)throw new Error("ALLOWED_ORIGINS must contain at least one production origin");
  for(const origin of args.origins){
    let url:URL; try{url=new URL(origin);}catch{throw new Error(`Invalid ALLOWED_ORIGINS entry: ${origin}`);}
    if(url.protocol!=="https:")throw new Error(`Production origin must use HTTPS: ${origin}`);
    if(["localhost","127.0.0.1","::1"].includes(url.hostname))throw new Error(`Production origin must not be local: ${origin}`);
    if(url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error(`Production origin must be a bare HTTPS origin: ${origin}`);
  }
  const securitySecrets=[args.accessTokenSecret,args.passwordPepper,args.auditSalt,args.metricsToken];
  if(new Set(securitySecrets).size!==4)throw new Error("ACCESS_TOKEN_SECRET, PASSWORD_PEPPER, AUDIT_HASH_SALT and METRICS_TOKEN must be distinct");
  for(const value of securitySecrets){if(value.length<48||looksLikePlaceholder(value))throw new Error("Production security secrets must be at least 48 characters and must not contain placeholders");}
  if(!args.issuer.trim()||!args.audience.trim())throw new Error("ACCESS_TOKEN_ISSUER and ACCESS_TOKEN_AUDIENCE are required");
  if(args.accessTtl>1800)throw new Error("ACCESS_TOKEN_TTL_SECONDS must not exceed 1800 in production");
  if(args.refreshTtl>7776000)throw new Error("REFRESH_TOKEN_TTL_SECONDS must not exceed 90 days in production");
}

export function loadApiConfig(): ApiConfig {
  const environment = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map(x => x.trim()).filter(Boolean).map(normalizeOrigin);
  /* LOCAL DEVELOPMENT ONLY: the Vite dev/preview servers may run on 5173-5176 (the next free port when 5173 is taken). Never added in production. */
  if(environment!=="production")for(const port of [5173,5174,5175,5176])for(const host of ["localhost","127.0.0.1"]){const o=`http://${host}:${port}`;if(!origins.includes(o))origins.push(o);}
  const mailProvider=((process.env.MMRI_MAIL_PROVIDER??(environment==="production"?"disabled":"mock")).trim().toLowerCase()) as "mock"|"disabled";
  if(!["mock","disabled"].includes(mailProvider))throw new Error("MMRI_MAIL_PROVIDER must be mock or disabled (no real mail provider is implemented yet)");
  if(environment==="production"&&mailProvider==="mock")throw new Error("MMRI_MAIL_PROVIDER=mock is forbidden in production");
  const publicAppUrl=cleanBaseUrl(process.env.MMRI_PUBLIC_APP_URL??origins[0]??"http://localhost:5173");
  const passwordResetTtlMinutes=intEnv("MMRI_PASSWORD_RESET_TTL_MINUTES",30,5,120);
  const mockMailDir=(process.env.MMRI_MOCK_MAIL_DIR??"").trim()||new URL("../../.mock-mailbox",import.meta.url).pathname;
  const billingProvider=((process.env.MMRI_BILLING_PROVIDER??(environment==="production"?"qpay":"mock")).trim().toLowerCase()) as BillingProviderMode;
  if(!["qpay","mock","manual"].includes(billingProvider))throw new Error("MMRI_BILLING_PROVIDER must be qpay, mock or manual");
  const qpayClientId=(process.env.QPAY_CLIENT_ID??"").trim();
  const qpayClientSecret=(process.env.QPAY_CLIENT_SECRET??"").trim();
  const qpayInvoiceCode=(process.env.QPAY_INVOICE_CODE??"").trim();
  const qpayRequestTimeoutMs=intEnv("QPAY_REQUEST_TIMEOUT_MS",10_000,1_000,60_000);
  if(environment==="production"){
    for(const [name,value] of [["QPAY_CLIENT_ID",qpayClientId],["QPAY_CLIENT_SECRET",qpayClientSecret],["QPAY_INVOICE_CODE",qpayInvoiceCode]] as const){if(value&&looksLikePlaceholder(value))throw new Error(`${name} must not contain a placeholder in production`);}
    if((process.env.MIGRATION_DATABASE_URL??"").trim())throw new Error("MIGRATION_DATABASE_URL must not be exposed to the runtime API process");
  }
  const manualPaymentQrText=(process.env.MMRI_MANUAL_PAYMENT_QR_TEXT??"").trim();
  const manualPaymentQrImage=(process.env.MMRI_MANUAL_PAYMENT_QR_IMAGE??"").trim();
  const manualPaymentShortUrl=(process.env.MMRI_MANUAL_PAYMENT_SHORT_URL??"").trim();
  const operatorEmails=operatorEmailSet(process.env.MMRI_OPERATOR_EMAILS);
  const operatorUserIds=operatorUserIdSet(process.env.MMRI_OPERATOR_USER_IDS);
  if(environment==="production"&&operatorEmails.size>0)throw new Error("MMRI_OPERATOR_EMAILS is not honoured in production (e-mail ownership is not verified); list immutable account ids in MMRI_OPERATOR_USER_IDS and remove MMRI_OPERATOR_EMAILS");
  const billingEnforcement=boolEnv("MMRI_BILLING_ENFORCEMENT", environment==="production");
  const diagnosticPriceMnt=priceEnv("MMRI_DIAGNOSTIC_PRICE_MNT")??300000;
  const retakePriceMnt=priceEnv("MMRI_RETAKE_PRICE_MNT")??300000;
  if(billingProvider==="qpay"&&(!qpayClientId||!qpayClientSecret||!qpayInvoiceCode)){
    throw new Error("QPAY_CLIENT_ID, QPAY_CLIENT_SECRET and QPAY_INVOICE_CODE are required when MMRI_BILLING_PROVIDER=qpay");
  }
  const port=intEnv("PORT",4000,1,65535);
  const issuer=process.env.ACCESS_TOKEN_ISSUER ?? "mmri-api";
  const audience=process.env.ACCESS_TOKEN_AUDIENCE ?? "mmri-web";
  const accessTokenSecret=requireSecret("ACCESS_TOKEN_SECRET", "development-access-secret-change-me-0001", environment);
  const metricsToken=requireSecret("METRICS_TOKEN", "development-metrics-token-change-me-0001", environment);
  const passwordPepper=requireSecret("PASSWORD_PEPPER", "development-password-pepper-change-0001", environment);
  const auditSalt=requireSecret("AUDIT_HASH_SALT", "development-audit-hash-salt-change-001", environment);
  const accessTokenTtlSeconds=intEnv("ACCESS_TOKEN_TTL_SECONDS",900,60,3600);
  const refreshTokenTtlSeconds=intEnv("REFRESH_TOKEN_TTL_SECONDS",2592000,3600,15552000);
  const cookieSecure=(process.env.COOKIE_SECURE ?? (environment === "production" ? "true" : "false")) === "true";
  const trustProxy=(process.env.TRUST_PROXY ?? "false") === "true";
  const trustProxyHops=intEnv("TRUST_PROXY_HOPS",1,1,8);
  const apiReplicaCount=intEnv("MMRI_API_REPLICA_COUNT",1,1,100);
  if(environment==="production"&&apiReplicaCount!==1)throw new Error("MMRI_API_REPLICA_COUNT must remain 1 until a shared distributed rate limiter is configured");
  const billingCallbackBaseUrl=cleanBaseUrl(process.env.MMRI_BILLING_CALLBACK_BASE_URL??"http://127.0.0.1:4000");
  const qpayBaseUrl=cleanBaseUrl(process.env.QPAY_BASE_URL??"https://merchant-sandbox.qpay.mn");
  assertProductionSecurity(environment,{cookieSecure,origins,accessTokenSecret,passwordPepper,auditSalt,metricsToken,issuer,audience,accessTtl:accessTokenTtlSeconds,refreshTtl:refreshTokenTtlSeconds});
  assertProductionDatabaseUrl(environment);
  assertProductionReportStorage(environment);
  if(environment==="production"&&billingProvider==="mock")throw new Error("MMRI_BILLING_PROVIDER=mock is forbidden in production");
  if(environment==="production"&&!billingEnforcement)throw new Error("MMRI_BILLING_ENFORCEMENT=true is required in production");
  if(billingProvider==="qpay"){
    assertHttpsServiceUrl("QPAY_BASE_URL",qpayBaseUrl,environment,true);
    assertHttpsServiceUrl("MMRI_BILLING_CALLBACK_BASE_URL",billingCallbackBaseUrl,environment,true);
    if(environment==="production"&&new URL(qpayBaseUrl).hostname.toLowerCase().includes("sandbox"))throw new Error("QPAY_BASE_URL must not point to the QPay sandbox in production");
  }
  if(billingProvider==="manual"&&environment==="production"){
    if(operatorUserIds.size===0)throw new Error("MMRI_OPERATOR_USER_IDS is required when MMRI_BILLING_PROVIDER=manual in production");
    if(!manualPaymentQrText&&!manualPaymentQrImage&&!manualPaymentShortUrl)throw new Error("Manual payment mode requires MMRI_MANUAL_PAYMENT_QR_TEXT, MMRI_MANUAL_PAYMENT_QR_IMAGE or MMRI_MANUAL_PAYMENT_SHORT_URL");
    if(manualPaymentQrText.length>4096)throw new Error("MMRI_MANUAL_PAYMENT_QR_TEXT is too large");
    if(manualPaymentShortUrl){let u:URL;try{u=new URL(manualPaymentShortUrl)}catch{throw new Error("MMRI_MANUAL_PAYMENT_SHORT_URL must be a valid URL")};if(u.protocol!=="https:")throw new Error("MMRI_MANUAL_PAYMENT_SHORT_URL must use HTTPS in production");if(manualPaymentShortUrl.length>2048)throw new Error("MMRI_MANUAL_PAYMENT_SHORT_URL is too large");}
    if(manualPaymentQrImage){const dataOk=/^data:image\/(?:png|jpeg|webp);base64,/i.test(manualPaymentQrImage);const httpsOk=manualPaymentQrImage.startsWith("https://");if(!dataOk&&!httpsOk)throw new Error("MMRI_MANUAL_PAYMENT_QR_IMAGE must be HTTPS or a PNG/JPEG/WebP data URL in production");if(manualPaymentQrImage.length>2_000_000)throw new Error("MMRI_MANUAL_PAYMENT_QR_IMAGE is too large");}
  }
  const refreshCookieName=(process.env.REFRESH_COOKIE_NAME??(environment==="production"?"__Secure-mmri_refresh":"mmri_refresh")).trim();
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(refreshCookieName))throw new Error("REFRESH_COOKIE_NAME format is invalid");
  if(environment==="production"&&!refreshCookieName.startsWith("__Secure-"))throw new Error("REFRESH_COOKIE_NAME must use the __Secure- prefix in production");
  const shutdownDrainMs=intEnv("SHUTDOWN_DRAIN_MS",5_000,0,30_000);
  const shutdownForceTimeoutMs=intEnv("SHUTDOWN_FORCE_TIMEOUT_MS",45_000,5_000,120_000);
  if(shutdownForceTimeoutMs<=shutdownDrainMs)throw new Error("SHUTDOWN_FORCE_TIMEOUT_MS must be greater than SHUTDOWN_DRAIN_MS");
  if(environment==="production"&&shutdownForceTimeoutMs<30_000)throw new Error("SHUTDOWN_FORCE_TIMEOUT_MS must be at least 30000 in production");
  return {
    port,
    environment,
    issuer,
    audience,
    accessTokenSecret,
    passwordPepper,
    auditSalt,
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    refreshCookieName,
    cookieSecure,
    allowedOrigins: new Set(origins),
    trustProxy,
    trustProxyHops,
    requestBodyLimitBytes:intEnv("REQUEST_BODY_LIMIT_BYTES",1_000_000,1024,5_000_000),
    requestTimeoutMs:intEnv("REQUEST_TIMEOUT_MS",30_000,1_000,120_000),
    headersTimeoutMs:intEnv("HEADERS_TIMEOUT_MS",15_000,1_000,60_000),
    keepAliveTimeoutMs:intEnv("KEEP_ALIVE_TIMEOUT_MS",5_000,1_000,30_000),
    apiRateLimit:intEnv("API_RATE_LIMIT",600,10,100_000),
    authIpRateLimit:intEnv("AUTH_IP_RATE_LIMIT",20,3,10_000),
    authAccountRateLimit:intEnv("AUTH_ACCOUNT_RATE_LIMIT",10,3,1_000),
    refreshRateLimit:intEnv("REFRESH_RATE_LIMIT",60,5,10_000),
    rateLimitWindowMs:intEnv("RATE_LIMIT_WINDOW_MS",60_000,1_000,3_600_000),
    apiReplicaCount,
    metricsToken,
    releaseSha:(process.env.RELEASE_SHA??"dev").trim().slice(0,128)||"dev",
    instanceId:(process.env.INSTANCE_ID??process.env.HOSTNAME??"local").trim().slice(0,128)||"local",
    readinessDbTimeoutMs:intEnv("READINESS_DB_TIMEOUT_MS",3_000,250,30_000),
    shutdownDrainMs,
    shutdownForceTimeoutMs,
    reportStorageDir:path.resolve(process.env.MMRI_REPORT_STORAGE_DIR||process.env.REPORT_STORAGE_DIR||path.join(process.cwd(),"report-storage")),
    adminSessionIdleMinutes:intEnv("MMRI_ADMIN_SESSION_IDLE_MINUTES",30,5,120),
    reportReviewRequired:boolEnv("MMRI_REPORT_REVIEW_REQUIRED",false),
    mailProvider,
    mockMailDir,
    publicAppUrl,
    passwordResetTtlMinutes,
    billingProvider,
    billingEnforcement,
    diagnosticPriceMnt,
    retakePriceMnt,
    billingCallbackBaseUrl,
    qpayBaseUrl,
    qpayClientId,
    qpayClientSecret,
    qpayInvoiceCode,
    qpayRequestTimeoutMs,
    manualPaymentQrText,
    manualPaymentQrImage,
    manualPaymentShortUrl,
    operatorEmails,
    operatorUserIds
  };
}
