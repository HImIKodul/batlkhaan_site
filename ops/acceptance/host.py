#!/usr/bin/env python3
"""Guarded acceptance on the owner's normal Linux host. Never deploys or touches main DB writes.
Stages: preflight, database, contracts, workflows, domains, browser, performance, source, exact-runtime.
DATABASE_URL is derived from the local development URL but forced to one fixed QA database.
"""
import os,sys,json,subprocess,hashlib,time,secrets,re,urllib.parse,shlex,shutil,signal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BACK=ROOT/'backend';QA='mmri_codexfix_release_20261110';CONTAINER='mmri-v3-local-postgres-1'
OUT=Path(os.environ.get('BUSINESSMRI_ACCEPTANCE_RUN_DIR',ROOT/'CODEX_PROGRESS/03-executed-acceptance/host')).resolve()
if not OUT.is_relative_to(ROOT/'CODEX_PROGRESS'):raise SystemExit('Evidence must be under source CODEX_PROGRESS')
OUT.mkdir(parents=True,exist_ok=True);PRIVATE=OUT/'private';PRIVATE.mkdir(exist_ok=True,mode=0o700);PRIVATE.chmod(0o700)
NODE=os.environ.get('BUSINESSMRI_NODE') or str(Path.home()/'.nvm/versions/node/v22.23.2/bin/node')
if not Path(NODE).is_file():NODE=shutil.which('node') or 'node'
class Blocked(RuntimeError):pass
RESULTS=OUT/'host-results.json';results=json.loads(RESULTS.read_text()) if RESULTS.exists() else []
ENV=dict(os.environ);ENV['MMRI_CONNECTED_RELEASE_GATE']='NO'
ENV['PATH']=str(Path(NODE).parent)+':'+ENV.get('PATH','')
def save():RESULTS.write_text(json.dumps(results,indent=2)+'\n')
def record(name,status,command,evidence=None,dependency=None,defect=None):
 results.append(dict(item=name,status=status,command=command,evidence=evidence,dependency=dependency,defect_repaired=defect,time=time.strftime('%Y-%m-%dT%H:%M:%S%z')));save();print(status,name,flush=True)
def run(name,args,cwd=ROOT,env=None,timeout=90,stdin=None,stdout=None,required=True):
 log=OUT/(name+'.log');command=shlex.join(map(str,args));print('RUN',name,flush=True)
 with log.open('wb') as err:
  try:
   child=subprocess.Popen(list(map(str,args)),cwd=cwd,env=env or ENV,stdin=stdin,stdout=stdout or err,stderr=err,start_new_session=True)
   try:code=child.wait(timeout=timeout)
   except subprocess.TimeoutExpired:
    os.killpg(child.pid,signal.SIGTERM)
    try:child.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
    raise
   r=subprocess.CompletedProcess(args,code)
   infra=r.returncode!=0 and re.search(r'listen EPERM|permission denied while trying to connect to the docker|socket\.cc.*Operation not permitted',log.read_text(errors='replace'))
   status='PASS' if r.returncode==0 else ('BLOCKED' if infra else 'FAIL');record(name,status,command,str(log.relative_to(ROOT)))
   if required and r.returncode:raise (Blocked if infra else RuntimeError)(name+' failed; see evidence')
   return r.returncode
  except (OSError,subprocess.TimeoutExpired) as e:
   record(name,'BLOCKED' if isinstance(e,OSError) else 'FAIL',command,str(log.relative_to(ROOT)),str(e));
   if required:raise RuntimeError(name+' could not finish') from e
   return 124
# Captured subprocess data is file-backed; it does not require Node captured-pipe support.
def capture(args,db=None,input=None):
 with (PRIVATE/'capture.out').open('w+b') as out,(PRIVATE/'capture.err').open('w+b') as err:
  r=subprocess.run(args,cwd=ROOT,env=ENV,input=input.encode() if input is not None else None,stdout=out,stderr=err,timeout=90)
  if r.returncode:
   err.seek(0);details=err.read().decode(errors='replace')
   if 'Operation not permitted' in details or 'permission denied' in details.lower():raise Blocked('Local service access denied; details retained privately')
   raise RuntimeError('Required local command failed (details retained privately)')
  out.seek(0);return out.read().decode().strip()
def sql(db,query):
 if db not in [QA,'postgres','mmri'] and not re.fullmatch(r'mmri_acceptance_(restore|flow)_[0-9]{14}',db):raise RuntimeError('Unapproved database identifier')
 return capture(['docker','exec','-i',CONTAINER,'psql','-X','-U','mmri','-d',db,'-At','-v','ON_ERROR_STOP=1'],input=query)
def scalar(db,q):return json.loads(sql(db,q))
def local_url(raw):
 u=urllib.parse.urlsplit(raw)
 if u.scheme not in ['postgres','postgresql'] or u.hostname not in ['127.0.0.1','localhost'] or u.port!=55432 or urllib.parse.unquote(u.username or '')!='mmri':raise RuntimeError('Only the known loopback development PostgreSQL endpoint is permitted')
 return urllib.parse.urlunsplit((u.scheme,u.netloc,'/'+QA,'schema=public',''))
def config():
 d={}
 if (BACK/'.env').exists():
  for line in (BACK/'.env').read_text().splitlines():
   if '=' in line and not line.lstrip().startswith('#'):
    k,v=line.split('=',1);d[k.strip()]=v.strip().strip('"').strip("'")
 raw=os.environ.get('BUSINESSMRI_LOCAL_DATABASE_URL') or d.get('DATABASE_URL','');url=local_url(raw)
 env=dict(ENV);env.update(DATABASE_URL=url,PGDATABASE=QA,NODE_ENV='development',MMRI_ENVIRONMENT='development',API_HOST='127.0.0.1',PORT='4391',ALLOWED_ORIGINS='http://127.0.0.1:5391',MMRI_PUBLIC_APP_URL='http://127.0.0.1:5391',MMRI_MAIL_PROVIDER='mock',MMRI_MOCK_MAIL_DIR=str(PRIVATE/'mailbox'),MMRI_MAIL_REQUEST_TIMEOUT_MS='1000',MMRI_PASSWORD_RESET_TTL_MINUTES='30',MMRI_BILLING_PROVIDER='mock',MMRI_BILLING_ENFORCEMENT='true',MMRI_DIAGNOSTIC_PRICE_MNT='300000',MMRI_RETAKE_PRICE_MNT='300000',MMRI_AI_REPORT_PROVIDER='disabled',MMRI_AI_REPORT_REQUIRED='false',OPENAI_API_KEY='',RESEND_API_KEY='',QPAY_CLIENT_ID='',QPAY_CLIENT_SECRET='',QPAY_INVOICE_CODE='',MMRI_OPERATOR_EMAILS='',MMRI_OPERATOR_USER_IDS='',MMRI_REPORT_STORAGE_DIR=str(PRIVATE/'reports'),SKIP_RETAKE='',MMRI_QA_ALLOW_SHARED='',MMRI_CRITICAL_DB_TESTS='YES',AUTH_IP_RATE_LIMIT='10000',AUTH_ACCOUNT_RATE_LIMIT='10',API_RATE_LIMIT='100000',REFRESH_RATE_LIMIT='10000',COOKIE_SECURE='false',TRUST_PROXY='false',MMRI_REPORT_REVIEW_REQUIRED='false',RELEASE_SHA='local-acceptance',INSTANCE_ID='acceptance-'+secrets.token_hex(8),API='http://127.0.0.1:4391/api/v1',BASE='http://127.0.0.1:5391/',ORIGIN='http://127.0.0.1:5391',MMRI_TASK12_BASE_URL='http://127.0.0.1:4391/api/v1')
 # Preserve only these local auth secrets so the existing synthetic owner's password stays valid.
 for k in ['PASSWORD_PEPPER','ACCESS_TOKEN_SECRET','AUDIT_HASH_SALT']:env[k]=d.get(k) or secrets.token_urlsafe(48)
 return env
COUNTS="""SELECT coalesce(jsonb_object_agg(tablename,n),'{}') FROM (SELECT tablename,((xpath('/row/n/text()',query_to_xml(format('SELECT count(*) AS n FROM public.%I',tablename),false,true,'')))[1]::text)::bigint n FROM pg_tables WHERE schemaname='public') x;"""
def snapshot(db,label):
 identity=scalar(db,"SELECT json_build_object('database',current_database(),'user',current_user,'serverVersion',current_setting('server_version'),'address',inet_server_addr(),'port',inet_server_port(),'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user));")
 counts=scalar(db,COUNTS);r={'identity':identity,'counts':counts};(OUT/(label+'.json')).write_text(json.dumps(r,indent=2)+'\n');return r
def qa_identity():
 r=snapshot(QA,'qa-before')
 if r['identity']['database']!=QA or r['counts'].get('companies')!=1:raise RuntimeError('QA must be the designated existing single-company database')
 if sql(QA,"SELECT count(*) FROM users WHERE email='synthetic-owner@businessmri.invalid';")!='1':raise RuntimeError('Designated synthetic owner absent; no mutation permitted')
 if sql(QA,"SELECT count(*) FROM company_memberships m JOIN users u ON u.id=m.\"userId\" WHERE u.email='synthetic-owner@businessmri.invalid' AND m.role='OWNER';")!='1':raise RuntimeError('Synthetic company ownership does not match')
 return r
ORPHANS="""CREATE TEMP TABLE acceptance_fk_orphans(name text,n bigint); DO $$ DECLARE fk record; j text; nn text; n bigint; BEGIN FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace LOOP SELECT string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' AND ' ORDER BY k.ord),string_agg(format('c.%I IS NOT NULL',ca.attname),' AND ') INTO j,nn FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY k(ca,pa,ord) JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=k.ca JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=k.pa; EXECUTE format('SELECT count(*) FROM %s c WHERE %s AND NOT EXISTS(SELECT 1 FROM %s p WHERE %s)',fk.conrelid::regclass,nn,fk.confrelid::regclass,j) INTO n; INSERT INTO acceptance_fk_orphans VALUES(fk.conname,n); END LOOP; END $$; SELECT coalesce(json_agg(row_to_json(o)),'[]') FROM acceptance_fk_orphans o;"""
def integrity(db):
 # Separate -At statements return JSON only after quieting CREATE/DO command tags.
 rows=json.loads(sql(db,'\\set QUIET on\n'+ORPHANS));bad=[r for r in rows if r['n']]
 checks=scalar(db,"SELECT json_build_object('unvalidatedConstraints',(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated),'invalidIndexes',(SELECT count(*) FROM pg_index WHERE indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND (NOT indisvalid OR NOT indisready)),'disabledTriggers',(SELECT count(*) FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND tgenabled='D'));")
 report={'database':db,'foreignKeys':rows,'checks':checks,'status':'FAIL' if bad or any(checks.values()) else 'PASS'};(OUT/(db+'-integrity.json')).write_text(json.dumps(report,indent=2)+'\n')
 if report['status']!='PASS':raise RuntimeError('Database integrity check failed')
def require_database():
 marker=OUT/'database-complete.json'
 if not marker.exists() or json.loads(marker.read_text()).get('database')!=QA:raise RuntimeError('Run database stage successfully first')
def preflight():
 run('docker-access',['docker','version','--format','{{.Server.Version}}'])
 mapping=capture(['docker','port',CONTAINER,'5432/tcp']);
 if mapping.strip()!='127.0.0.1:55432':raise RuntimeError('Unexpected PostgreSQL container port mapping')
 (OUT/'database-identities.json').write_text(json.dumps(json.loads(sql('postgres',"SELECT json_agg(json_build_object('name',datname,'owner',pg_get_userbyid(datdba),'connections',datallowconn)) FROM pg_database WHERE NOT datistemplate;")),indent=2)+'\n')
 qa_identity();snapshot('mmri','main-readonly-before')
 record('database-identity','PASS','docker port; read-only PostgreSQL identity, owner and row-count queries','qa-before.json')
def database(env):
 preflight();before=json.loads((OUT/'qa-before.json').read_text());stamp=time.strftime('%Y%m%d%H%M%S');restore='mmri_acceptance_restore_'+stamp
 dump=PRIVATE/'qa-before-migration.dump'
 if dump.exists():raise RuntimeError('Backup exists; choose a new evidence directory (no overwrite)')
 with dump.open('xb') as dest:run('qa-backup',['docker','exec',CONTAINER,'pg_dump','-U','mmri','-d',QA,'-Fc','--no-owner','--no-acl'],stdout=dest,timeout=120)
 digest=hashlib.sha256(dump.read_bytes()).hexdigest();(OUT/'backup-sha256.json').write_text(json.dumps({'database':QA,'sha256':digest,'privatePath':'private/qa-before-migration.dump'},indent=2)+'\n')
 # CREATE is non-destructive and must fail if the name already exists. Never DROP or overwrite.
 sql('postgres','CREATE DATABASE "'+restore+'";')
 with dump.open('rb') as src:run('restore-before-migration',['docker','exec','-i',CONTAINER,'pg_restore','-U','mmri','-d',restore,'--no-owner','--no-acl','--exit-on-error'],stdin=src,timeout=120)
 restored=snapshot(restore,'backup-restored-counts');integrity(restore)
 if before['counts']!=restored['counts']:raise RuntimeError('Restore row counts differ; migration refused')
 record('backup-restore-proof','PASS','pg_dump -Fc; pg_restore to NEW '+restore+'; compare every public table count','backup-restored-counts.json')
 migration='20261110040000_email_ownership_payment_ledger'
 (OUT/'qa-before-migration.json').write_text(json.dumps(before,indent=2)+'\n')
 applied=json.loads(sql(QA,"SELECT coalesce(json_agg(migration_name ORDER BY migration_name),'[]') FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"))
 source=sorted(p.name for p in (BACK/'prisma/migrations').iterdir() if p.is_dir())
 if set(source)-set(applied) not in [set(),{migration}] or set(applied)-set(source):raise RuntimeError('Unexpected pending/applied migration set; refused')
 run('migration-31-qa-only',[NODE,'node_modules/prisma/build/index.js','migrate','deploy'],cwd=BACK,env=env)
 after=snapshot(QA,'qa-after-migration');integrity(QA)
 if any(after['counts'].get(k)!=v+(1 if k=='_prisma_migrations' and migration not in applied else 0) for k,v in before['counts'].items()):raise RuntimeError('Migration changed existing table row counts')
 run('schema-drift',[NODE,'node_modules/prisma/build/index.js','migrate','diff','--from-schema-datasource','prisma/schema.prisma','--to-schema-datamodel','prisma/schema.prisma','--exit-code'],cwd=BACK,env=env)
 run('migration-status',[NODE,'node_modules/prisma/build/index.js','migrate','status'],cwd=BACK,env=env)
 (OUT/'database-complete.json').write_text(json.dumps({'database':QA,'restoredBackupDatabase':restore,'migration':migration,'rowCountsPreserved':True},indent=2)+'\n')
 record('database-acceptance','PASS','migration deploy to fixed QA only; drift; FK orphan census; constraints/indexes/triggers; counts','database-complete.json')
def contracts(env):
 require_database();qa_identity()
 run('prisma-generate',[NODE,'node_modules/prisma/build/index.js','generate'],cwd=BACK,env=env)
 for name,file in [('real-auth-postgres','qa-critical-auth-postgres.ts'),('real-qpay-contention','qa-billing-race-regression.ts')]:run(name,[NODE,'--import','tsx','scripts/'+file],cwd=BACK,env=env,timeout=120)
 after=snapshot(QA,'qa-after-contracts');before=json.loads((OUT/'qa-after-migration.json').read_text())
 if before['counts']!=after['counts']:raise RuntimeError('Real contract tests left row-count residue in preserved QA')
 record('single-company-preserved','PASS','all public table counts before/after real contracts','qa-after-contracts.json')
def clone_flow(env):
 require_database();qa_identity();stamp=time.strftime('%Y%m%d%H%M%S');db='mmri_acceptance_flow_'+stamp;dump=PRIVATE/('flow-'+stamp+'.dump')
 with dump.open('xb') as dest:run('flow-snapshot-'+stamp,['docker','exec',CONTAINER,'pg_dump','-U','mmri','-d',QA,'-Fc','--no-owner','--no-acl'],stdout=dest,timeout=120)
 sql('postgres','CREATE DATABASE "'+db+'";')
 with dump.open('rb') as src:run('flow-restore-'+stamp,['docker','exec','-i',CONTAINER,'pg_restore','-U','mmri','-d',db,'--no-owner','--no-acl','--exit-on-error'],stdin=src,timeout=120)
 u=urllib.parse.urlsplit(env['DATABASE_URL']);env=dict(env,DATABASE_URL=urllib.parse.urlunsplit((u.scheme,u.netloc,'/'+db,u.query,'')),PGDATABASE=db)
 (OUT/'flow-databases.jsonl').open('a').write(json.dumps({'database':db,'purpose':'temporary acceptance fixtures; QA remains single-company','retained':True})+'\n');return env
class Services:
 def __init__(self,env):self.env=env;self.children=[]
 def start(self,args,cwd,log,env=None):
  f=(OUT/log).open('ab');p=subprocess.Popen(args,cwd=cwd,env=env or self.env,stdin=subprocess.DEVNULL,stdout=f,stderr=f,start_new_session=True);f.close();self.children.append(p);return p
 def __enter__(self):
  import socket,urllib.request
  for port in [4391,5391,4392,4393]:
   with socket.socket() as s:
    try:s.bind(('127.0.0.1',port))
    except PermissionError:raise Blocked('Loopback socket access denied')
    except OSError:raise Blocked('Acceptance port unavailable; never killing another process')
  try:
   self.start([NODE,'dist/api/server.js'],BACK,'api.log')
   self.start([NODE,'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5391','--strictPort'],ROOT/'frontend','frontend.log')
   for url in ['http://127.0.0.1:4391/health','http://127.0.0.1:5391/']:
    for i in range(40):
     try:
      with urllib.request.urlopen(url,timeout=1) as r:
       body=r.read().decode()
       if any(p.poll() is not None for p in self.children):raise RuntimeError('Owned service exited; refusing another process at this port')
       if url.endswith('/health') and json.loads(body).get('data',{}).get('instanceId')!=self.env['INSTANCE_ID']:raise RuntimeError('API identity differs from owned acceptance process')
       if r.status==200:break
     except OSError:time.sleep(.5)
    else:raise RuntimeError('Owned acceptance service did not become ready')
   return self
  except BaseException:self.__exit__(None,None,None);raise
 def __exit__(self,*_):
  for p in reversed(self.children):
   if p.poll() is None:os.killpg(p.pid,signal.SIGTERM)
  for p in reversed(self.children):
   try:p.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
def build(env):
 run('prisma-generate',[NODE,'node_modules/prisma/build/index.js','generate'],cwd=BACK,env=env)
 run('backend-build',[NODE,'node_modules/typescript/bin/tsc','-p','tsconfig.production.json'],cwd=BACK,env=env)
 run('frontend-build',[NODE,'node_modules/typescript/bin/tsc','--noEmit'],cwd=ROOT/'frontend',env=env)
def workflows(env):
 env=clone_flow(env);build(env);env['VITE_DEV_API_TARGET']='http://127.0.0.1:4391';env['MMRI_REPORT_REVIEW_REQUIRED']='true'
 cases=[('super-admin-review-retake','qa-admin-review-e2e.mjs',420),('http-password-recovery','qa-password-recovery-regression.mjs',150),('concurrent-refresh','qa-wsa-session-regression.mjs',120),('session-lifecycle','qa-session-lifecycle-regression.mjs',150),('authorization-tenant-matrix','qa-authorization-matrix.mjs',180),('super-admin-api','qa-admin-regression.mjs',150),('account-admin-api','qa-admin-accounts-regression.mjs',180),('admin-reset-revocation','qa-admin-reset-sessions-regression.mjs',120)]
 for name,file,budget in cases:
  caseenv=dict(env,OUT_DIR=str(OUT))
  if name=='super-admin-review-retake':caseenv['MMRI_ACCEPTANCE_OWNER_CREDENTIAL_FILE']=str(PRIVATE/'matrix-owner.json')
  if name=='authorization-tenant-matrix':
   owner=json.loads((PRIVATE/'matrix-owner.json').read_text());caseenv.update(OWNER_EMAIL=owner['email'],OWNER_PASSWORD=owner['password'])
  if name=='http-password-recovery':caseenv['API']='http://127.0.0.1:4391'
  if name=='concurrent-refresh':caseenv['AUTH_ACCOUNT_RATE_LIMIT']='1000'
  if name=='session-lifecycle':caseenv.update(AUTH_ACCOUNT_RATE_LIMIT='1000',TTL_API='http://127.0.0.1:4392/api/v1',RL_API='http://127.0.0.1:4393/api/v1')
  with Services(caseenv) as service:
   if name=='session-lifecycle':
    service.start([NODE,'dist/api/server.js'],BACK,'api-ttl.log',dict(caseenv,PORT='4392',ACCESS_TOKEN_TTL_SECONDS='60'))
    service.start([NODE,'dist/api/server.js'],BACK,'api-rate.log',dict(caseenv,PORT='4393',AUTH_IP_RATE_LIMIT='20',AUTH_ACCOUNT_RATE_LIMIT='10'))
    time.sleep(2)
   run(name,[NODE,'scripts/'+file]+(['it'] if name=='super-admin-review-retake' else []),cwd=BACK,env=caseenv,timeout=budget)
   if name=='authorization-tenant-matrix':
    matrix=json.loads((OUT/'authz-matrix.json').read_text())
    if matrix.get('warn',0):raise Blocked('Authorization matrix has inconclusive WARN cases; supply valid payloads/fixtures and rerun affected cases')
 (OUT/'workflows-complete.json').write_text(json.dumps({'database':env['PGDATABASE']})+'\n')
def domains(env):
 env=clone_flow(env);build(env);env['VITE_DEV_API_TARGET']='http://127.0.0.1:4391';env['MMRI_TASK12_PDF_OUT']=str(OUT/'pdf')
 with Services(env):
  for domain in ['marketing','it','finance','people','operations']:run('domain-'+domain,[NODE,'scripts/task12-fresh-user-final-gate.mjs'],cwd=BACK,env=dict(env,MMRI_TASK12_DOMAIN=domain),timeout=240)
def browser(env):
 marker=OUT/'workflows-complete.json'
 if not marker.exists():raise Blocked('Run workflows first; browser uses its owned synthetic review fixtures')
 db=json.loads(marker.read_text())['database']
 owned=[json.loads(l)['database'] for l in (OUT/'flow-databases.jsonl').read_text().splitlines()]
 if db not in owned or not re.fullmatch(r'mmri_acceptance_flow_[0-9]{14}',db):raise RuntimeError('Unknown workflow database; refused')
 u=urllib.parse.urlsplit(env['DATABASE_URL']);env=dict(env,DATABASE_URL=urllib.parse.urlunsplit((u.scheme,u.netloc,'/'+db,u.query,'')),PGDATABASE=db,MMRI_REPORT_REVIEW_REQUIRED='true')
 build(env);env['VITE_DEV_API_TARGET']='http://127.0.0.1:4391';env['PW']=os.environ.get('PW',str(Path.home()/'MMRI_TOOLS/pw/node_modules/playwright-core'));env['OUT']=str(OUT/'browser');env['MMRI_MOCK_MAIL_DIR']=str(PRIVATE/'mailbox')
 env['QA_CREDENTIAL_OUT']=str(PRIVATE/'browser-customer.json');env['QA_CREDENTIAL_FILE']=env['QA_CREDENTIAL_OUT'];env['ADMIN_CREDENTIAL_FILE']=str(PRIVATE/'browser-admin.json');(OUT/'browser').mkdir(exist_ok=True)
 run('create-browser-admin',[NODE,'--import','tsx','scripts/qa-create-browser-admin.ts'],cwd=BACK,env=env)
 with Services(env):
  run('browser-registration',[NODE,'qa/ui-auth-register.mjs'],env=env,timeout=90)
  run('browser-onboarding-save',[NODE,'qa/ui-onboarding-save.mjs'],env=dict(env,SHOT=str(OUT/'browser'),QA_CREDENTIAL_OUT_ONBOARD=env['QA_CREDENTIAL_FILE']),timeout=150)
  review=sql(env['PGDATABASE'],"SELECT id FROM report_reviews WHERE status IN ('AWAITING_REVIEW','IN_REVIEW') ORDER BY \"createdAt\" DESC LIMIT 1;")
  if not review:raise Blocked('No pending synthetic review fixture after workflows')
  run('browser-super-admin',[NODE,'qa/ui-admin.mjs',review],env=dict(env,ADMIN_VIEWPORTS='1280x900,390x844'),timeout=180)
  run('browser-recovery-account-data',[NODE,'qa/ui-recovery-legal-data.mjs'],env=env,timeout=180)
  for domain in ['marketing','it','finance','people','operations']:
   for width in [390,1280]:
    run('browser-answers-'+domain+'-'+str(width),[NODE,'qa/ui-answer-first-questions.mjs'],env=dict(env,DOMAIN=domain,VW=str(width),VH='900'),timeout=90)
  for engine in ['chromium','firefox','webkit']:
   engineenv=dict(env,BROWSER=engine,OUT=str(OUT/'browser'/engine))
   if engine!='chromium':
    engineenv['ADMIN_CREDENTIAL_FILE']=str(PRIVATE/('browser-admin-'+engine+'.json'))
    run('create-browser-admin-'+engine,[NODE,'--import','tsx','scripts/qa-create-browser-admin.ts'],cwd=BACK,env=engineenv)
   run('browser-axe-'+engine,[NODE,'qa/ui-final-bounded.mjs'],env=engineenv,timeout=100)
def performance(env):
 env=clone_flow(env);build(env);env['VITE_DEV_API_TARGET']='http://127.0.0.1:4391'
 with Services(env):run('bounded-two-user-performance',[NODE,'scripts/qa-load-journeys.mjs'],cwd=BACK,env=dict(env,USERS='2',DOMAINS='it,finance',OUT_DIR=str(OUT),MAX_QUESTIONS='420'),timeout=240)
def exact_runtime():
 v=capture([NODE,'--version']);npm=capture(['npm','--version']);(OUT/'runtime-available.json').write_text(json.dumps({'node':v,'npm':npm,'requiredNode':'v22.16.0','requiredNpm':'10.9.2'},indent=2)+'\n')
 if v!='v22.16.0' or npm!='10.9.2':record('exact-runtime','BLOCKED','node --version; npm --version','runtime-available.json',dependency='Select Node 22.16.0/npm 10.9.2 and rerun exact-runtime');return
 dest=OUT/'clean-source'
 if dest.exists():raise RuntimeError('Clean-install destination already exists; use a new evidence directory')
 paths=capture(['git','ls-files','-z','--cached','--others','--exclude-standard']).split('\0')
 for rel in paths:
  if not rel or rel.startswith('CODEX_PROGRESS/'):continue
  p=ROOT/rel
  if p.is_file() and not p.is_symlink():q=dest/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
 for folder in ['backend','frontend']:
  run('clean-install-'+folder,['npm','ci','--no-audit','--no-fund'],cwd=dest/folder,timeout=180)
  run('clean-build-'+folder,['npm','run','build'],cwd=dest/folder,timeout=120)
 record('exact-runtime-clean-install','PASS','Node 22.16.0/npm 10.9.2; npm ci; npm run build in clean copy')
def guards():
 for raw in ['postgresql://x:x@production.invalid:5432/mmri','postgresql://mmri:x@127.0.0.1:5432/mmri','postgresql://postgres:x@127.0.0.1:55432/mmri','https://127.0.0.1:55432/mmri']:
  try:local_url(raw);raise AssertionError('Unsafe endpoint accepted')
  except RuntimeError:pass
 assert urllib.parse.urlsplit(local_url('postgresql://mmri:x@127.0.0.1:55432/mmri')).path=='/'+QA
 assert urllib.parse.urlsplit(local_url('postgresql://mmri:x@127.0.0.1:55432/mmri?host=production.invalid&schema=other')).query=='schema=public'
 record('host-runner-target-guards','PASS','python3 ops/acceptance/host.py self-test-guards')
if __name__=='__main__':
 stage=sys.argv[1] if len(sys.argv)>1 else ''
 try:
  if stage=='self-test-guards':guards()
  elif stage=='exact-runtime':exact_runtime()
  elif stage=='source':run('full-source-release-gate',['bash','ops/release-gate.sh'],timeout=90)
  elif stage in ['preflight','database','contracts','workflows','domains','browser','performance']:
   env=config();{'preflight':lambda _:preflight(),'database':database,'contracts':contracts,'workflows':workflows,'domains':domains,'browser':browser,'performance':performance}[stage](env)
  else:raise RuntimeError('Choose preflight/database/contracts/workflows/domains/browser/performance/source/exact-runtime/self-test-guards')
 except Exception as e:
  # Never print DB URLs or provider credentials even when a driver fails.
  record(stage or 'stage','BLOCKED' if isinstance(e,(PermissionError,FileNotFoundError,Blocked)) else 'FAIL','python3 ops/acceptance/host.py '+stage,dependency=str(e) if not re.search('postgres(?:ql)?://|password=',str(e),re.I) else 'Private connection/configuration error; see private diagnostics');sys.exit(1)
