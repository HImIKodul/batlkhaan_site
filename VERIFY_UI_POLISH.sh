#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")" && pwd)}"
# When installed in the real project this script lives at project root. In the
# review snapshot it is under root-scripts/, so support both layouts.
if [ ! -d "$ROOT/frontend/src" ] && [ -d "$ROOT/../frontend-src" ]; then
  ROOT="$(cd "$ROOT/.." && pwd)"
  FRONTEND="$ROOT/frontend-src"
  BACKEND_RENDERER="$ROOT/backend-pdf-renderer"
elif [ -d "$ROOT/frontend/src" ]; then
  FRONTEND="$ROOT/frontend/src"
  BACKEND_RENDERER="$ROOT/backend/pdf_renderer"
else
  echo "ERROR: frontend source not found from $ROOT" >&2
  exit 2
fi
export FRONTEND BACKEND_RENDERER
python3 - <<'PY'
from pathlib import Path
import os,re,sys
F=Path(os.environ['FRONTEND'])
R=Path(os.environ['BACKEND_RENDERER'])
fail=[]; passed=[]
def check(name,cond,detail=''):
    (passed if cond else fail).append((name,detail))

landing=(F/'pages/Landing.tsx').read_text(encoding='utf-8')
report=(F/'pages/Report.tsx').read_text(encoding='utf-8')
reportcss=(F/'pages/report.css').read_text(encoding='utf-8')
main=(F/'main.tsx').read_text(encoding='utf-8')
settings=(F/'pages/Settings.tsx').read_text(encoding='utf-8')
diagnosis=(F/'pages/DiagnosisHub.tsx').read_text(encoding='utf-8')
diagnosiscss=(F/'pages/diagnosis.css').read_text(encoding='utf-8')
assessment=(F/'components/AssessmentInline.tsx').read_text(encoding='utf-8')
questionnairecss=(F/'pages/questionnaire.css').read_text(encoding='utf-8')
results=(F/'pages/Results.tsx').read_text(encoding='utf-8')
resultscss=(F/'pages/results.css').read_text(encoding='utf-8')
prefs=(F/'design/preferences.css').read_text(encoding='utf-8') if (F/'design/preferences.css').exists() else ''
legacy=(F/'styles.css').read_text(encoding='utf-8')
tokens_css=(F/'design/tokens.css').read_text(encoding='utf-8')
tokens_ts=(F/'design/tokens.ts').read_text(encoding='utf-8')
report_palette=(F/'data/reportExperience.ts').read_text(encoding='utf-8')
buttons_css=(F/'components/buttons.css').read_text(encoding='utf-8')
forms_css=(F/'components/forms.css').read_text(encoding='utf-8')
shell_css=(F/'components/shell.css').read_text(encoding='utf-8')

hero='Бизнесийнхээ хүчтэй, сул талыг мэдэж, дараагийн 12 сард юу хийхээ тодорхой болго.'
sub='Аль чиглэл хүчтэй, аль нь сул байгааг тодорхойлж, дараагийн 12 сард яг юу хийхээ харуулсан төлөвлөгөөтэй тайлан авна.'
labels=['BusinessMRI.mn гэж юу вэ?','Оношилгооны тайлангаар юу харах вэ?','Хэрхэн оношилгоо хийлгэх вэ?']
check('homepage hero copy (2026-10-30 brief)','Бизнесийнхээ бодит дүр зургийг хар.' in landing and 'Дараагийн 12 сарынхаа зөв алхмыг тодорхойл.' in landing)
check('homepage has a single hero heading',sub not in landing and landing.count('<h1')==1)
check('three exact guide labels (result + payment guides merged)',all(x in landing for x in labels) and 'Оношилгооны үр дүн юу вэ?' not in landing and landing.count("{id:'")==3 and "'result'" not in landing)
check('homepage radar removed (component, stylesheet and usage)',not (F/'components/BusinessRadar.tsx').exists() and not (F/'components/radar.css').exists() and 'BusinessRadar' not in landing)
check('homepage has no category button row (the five domains are not repeated on the homepage; they live on the Diagnosis page)','className={`mmri-domain' not in landing and 'className="mmri-domain"' not in landing and 'mmri-home2__domains' not in landing and 'OpalGlass' not in landing)
check('homepage guides are three equal glass controls (number, title, arrow)','grid-template-columns:repeat(3,minmax(0,1fr))' in (F/'pages/landing.css').read_text(encoding='utf-8') and 'grid-template-columns:auto minmax(0,1fr) auto' in (F/'pages/landing.css').read_text(encoding='utf-8') and 'mmri-home2__guide is-' in (F/'pages/Landing.tsx').read_text(encoding='utf-8'))
landing_css=(F/'pages/landing.css').read_text(encoding='utf-8')
check('homepage hero is ONE figure (reference 02: plates + clear five-area window): the old ring/arcs graphic (MmriCore) is gone, diagnosis stays reachable from the hero button','HeroCrystal' in landing and 'MmriCore' not in landing and not (F/'components/MmriCore.tsx').exists() and 'mmri-core' not in landing_css and landing.count('<HeroCrystal')==1 and not (F/'components/ReportGlassPreview.tsx').exists() and 'startDiagnosis' in landing and '<Glyph' not in landing)
hx=(F/'components/HeroCrystal.tsx').read_text(encoding='utf-8')
import re as _re
check('hero figure is ONE stack of five category slabs (the only buttons are the slabs), no score/api/random, no icons, five area names, no digits in visible copy','api.' not in hx and 'Math.random' not in hx and 'score' not in hx.lower().replace('--','') and hx.count('<button')==1 and 'hx__slab' in hx and 'lucide-react' not in hx and all(n in hx for n in ['Маркетинг','Санхүү','Хүний нөөц','Үйлдвэрлэл']) and 'aria-label=' in hx and not _re.search(r'>\s*\d+(\.\d+)?\s*<',hx))
# Step 7/10 - one canonical design system across CSS + TS consumers.
check('TS tokens mirror blue-white brand',"brand: '#1B63D8'" in tokens_ts and "canvas: '#F2F7FE'" in tokens_ts and '#5B5CE6' not in tokens_ts)
check('TS geometry mirrors CSS token scale','radius: { small: 8, control: 12, surface: 18, focal: 24' in tokens_ts and 'controlHeight: { compact: 36, default: 46, touch: 48 }' in tokens_ts)
check('five domain colors are canonical CSS tokens',all(x in tokens_css for x in ['--mmri-domain-marketing: #32D7C6','--mmri-domain-it: #49B7FF','--mmri-domain-finance: #FFC25A','--mmri-domain-people: #A879FF','--mmri-domain-operations: #FF5BCF']))
check('five domain colors are canonical TS tokens','domainVisualTokens' in tokens_ts and all(x in tokens_ts for x in ["marketing: { accent: '#32D7C6'","it: { accent: '#49B7FF'","finance: { accent: '#FFC25A'","people: { accent: '#A879FF'","operations: { accent: '#FF5BCF'"]))
check('report/radar palette consumes canonical TS domain tokens','domainVisualTokens' in report_palette and '#FF3D8D' not in report_palette and '#00A6FF' not in report_palette)
check('Results consumes canonical CSS domain tokens',all(x in resultscss for x in ['var(--mmri-domain-marketing)','var(--mmri-domain-it)','var(--mmri-domain-finance)','var(--mmri-domain-people)','var(--mmri-domain-operations)']))
check('shared buttons use one control material',buttons_css.count('.mmri-button--primary{')==1 and 'border-radius:var(--radius-button)' in buttons_css)
check('shared form controls use glass material/focus ring','var(--mmri-glass-control-blur)' in forms_css and 'var(--mmri-focus-ring)' in forms_css and 'rgba(10,16,100,.34)' in forms_css)
check('shell controls use shared material tokens',all(x in shell_css for x in ['var(--mmri-glass-control-blur)','var(--mmri-glass-control-shadow)','border-radius:var(--mmri-radius-control)']))
check('diagnosis page is a flex column: profile-gate/error banner owns a row with a gap and its height comes out of the cards','display:flex;flex-direction:column;gap:14px' in diagnosiscss and ':has(>.mmri-support-alert) .diagnosis-square{height:clamp(' in diagnosiscss)
check('diagnosis status is one simple pill','diagnosis-status-icon' in diagnosiscss and 'diagnosis-status-icon' in diagnosis and 'status-track' not in diagnosiscss)
check('secondary domain icon geometry is tokenized','--mmri-domain-icon-size-large: 72px' in tokens_css and 'width:var(--mmri-domain-icon-size-large)' in (F/'pages/billing.css').read_text(encoding='utf-8'))
check('shared controls do not duplicate primary button rules',buttons_css.count('.mmri-button--primary{')==1 and buttons_css.count('.mmri-button--secondary{')==1)
retired=['#5B5CE6','#4D4FD1','#4143B8','#EFEFFF','#312E81','#111827']
active_text='\n'.join(p.read_text(encoding='utf-8',errors='ignore') for p in F.rglob('*') if p.is_file() and p.suffix in {'.css','.ts','.tsx'})
check('retired purple/navy token palette absent from active source',not any(x.lower() in active_text.lower() for x in retired))
# Hover rules for the fixed-geometry controls must not introduce movement.
for name,css,selector in [
 ('category tile hover stationary',(F/'components/glass.css').read_text(encoding='utf-8'),'.cat-tile:hover'),
 ('PDF button stationary',reportcss,'.report-top-download:hover'),
]:
    blocks=re.findall(re.escape(selector)+r'[^\{]*\{([^}]*)\}',css)
    check(name,all(not re.search(r'\btransform\s*:\s*(?!none)',b) for b in blocks),str(blocks[:2]))
check('PDF button busy state','aria-busy={pdfBusy}' in report and 'pdfLock.current' in report)
check('PDF download validates binary signature','assertDownloadedPdf' in report and "'%PDF-'" in report)
check('PDF demo print is exactly three pages','total={3}' in report and 'PrintPageThree' in report and 'PrintRoadmapPage' not in report)
check('PDF no obsolete 250-300 frontend gate','words<250' not in report and 'words>300' not in report)
check('preferences imported',"./design/preferences.css" in main)
check('preference CSS keeps system accessibility only (no text-size/theme/density layers)','prefers-reduced-motion' in prefs and 'forced-colors' in prefs and 'data-mmri-font-size' not in prefs and 'data-mmri-theme' not in prefs and 'data-mmri-density' not in prefs)
check('no separate dark theme remains (single liquid-glass environment)','data-mmri-theme' not in prefs and 'mmri.theme' not in settings)
check('no source backup files',not any(F.rglob('*.bak')))
check('unused home.css removed',not (F/'pages/home.css').exists())
check('legacy stylesheet bounded',len(legacy.encode())<145_000,str(len(legacy.encode())))
css_imports=[x for x in main.splitlines() if x.startswith('import ') and '.css' in x]
check('CSS import count controlled',len(css_imports)<=22,str(len(css_imports)))
# Preference layer intentionally stays last.
check('preferences are last CSS layer',css_imports and 'preferences.css' in css_imports[-1],css_imports[-1] if css_imports else '')
check('settings stores no display preferences (text size removed; no theme/density)','mmriFontSize' not in settings and 'mmriTheme' not in settings and 'mmriDensity' not in settings)
check('diagnosis zero answers stay zero percent',':42' not in diagnosis and 'Math.max(1,Math.min(99' not in diagnosis and 'Math.max(0,Math.round' in diagnosis)
check('diagnosis visible top title removed','<h1 className="diagnosis-square-head__title">Оношилгоо</h1>' in diagnosis and 'position:absolute;width:1px' in diagnosiscss)
check('diagnosis locked payment includes price',"state==='locked'?'ТӨЛӨХ · 300,000₮'" in diagnosis)
check('diagnosis uses intentional 3+2 desktop grid','grid-template-columns:repeat(6' in diagnosiscss and '.diagnosis-square:nth-child(4){grid-column:2/span 2}' in diagnosiscss)
check('questionnaire progress is answer-count based','sessionProgress=progress?.status&&terminalRouting.has(progress.status as any)?100:countProgress' in assessment and 'Math.max(countProgress' not in assessment)
check('questionnaire answer semantic rail','mmri-radio-card::before' in questionnairecss and 'var(--answer-color' in questionnairecss)
check('questionnaire mobile touch actions','min-height:52px' in questionnairecss and '@media (max-width:640px)' in questionnairecss)
check('results header is domain-aware','<span>{area.name}</span>' in results and 'Маркетингийн оношилгоо' not in results)
check('results module comparison is domain-aware','{modules.length} үндсэн бүрэлдэхүүн' in results and '{areaName}: бүрэлдэхүүний харьцуулалт' in results and 'Маркетингийн тогтолцооны харьцуулалт' not in results)
check('results canonical findings come from backend payload','items={strengths}' in results and 'items={weaknesses}' in results and 'CapabilityFindings kind="strength"' in results and 'CapabilityFindings kind="weakness"' in results)
check('results preliminary state is explicit and customer-safe','result-provisional-banner' in results and 'RELATIVE_RANK' in results and 'Урьдчилсан үр дүн' in results)
check('results hide internal root classification codes','rootCauseLabel(f.classification)' in results and ' · {f.classification}' not in results)
check('results five-domain accent contract',all(x in resultscss for x in ['data-result-domain=marketing','data-result-domain=it','data-result-domain=finance','data-result-domain=people','data-result-domain=operations']))
check('results semantic strength weakness surfaces','result-ranked--strength' in resultscss and 'result-ranked--weakness' in resultscss)
check('results no customer-facing canonical jargon','Каноник оношилгоог' not in results)
check('report progress never fabricates minimum percent','Math.max(1,Math.min(99' not in report and '||42' not in report)
check('report history newest first','new Date(b.date).getTime()-new Date(a.date).getTime()' in report and 'new Date(b.completedAt||b.updatedAt).getTime()-new Date(a.completedAt||a.updatedAt).getTime()' in report)
check('report roadmap completion is report-specific','m.reportId||m.assessmentId||m.date' in report)
check('report score is centered circle without /100','report-score-stage' in report and '/100' not in report and '.report-score{display:grid;place-items:center' in reportcss)
check('report header carries no extra status ornament','report-active-status' not in report and 'report-v3__top' in report)
check('report PDF button stays stationary','.report-top-download' in reportcss and 'width:176px' in reportcss)
check('active report domain tab uses the ink border (was white on the dark theme) and has a keyboard focus ring','.report-domain-switcher>button:focus-visible{outline:3px solid var(--wp-ink)' in reportcss and '.report-domain-switcher>button.is-active{border-color:var(--wp-ink)' in reportcss)
check('report critical score comparison has no arrow','report-purpose-arrow' not in report and 'Одоогийн оноо ${p.weakScore}. Зорилтот оноо ${p.projectedScore}.' in report)
check('report roadmap is tap-to-complete native button','<button type="button" className={`report-roadmap-card' in report and 'aria-pressed={done}' in report and 'is-complete' in reportcss)
check('report paper is a solid white reading surface (no blur behind text)','.report-three-page{--report-accent-light' in reportcss and 'background:var(--wp-spec) top/100% 14% no-repeat,#fff' in reportcss and 'backdrop-filter' not in reportcss.split('.report-three-page{--report-accent-light',1)[1].split('}',1)[0])
check('report category colour is never a sheet fill','color-mix(in srgb,var(--report-accent) 20%,rgba(14,18,80' not in reportcss and 'mmri-area-tint-legacy' not in reportcss)
check('report locked payment shows price','ТӨЛБӨР ТӨЛӨХ · 300,000₮' in report)
check('report domain icons use accessible ink token',"'--domain-ink':p.ink" in report and '.report-domain-switcher__icon{flex:none' in reportcss)
check('PDF browser fallback isolated from screen', '.report-print-only{display:none}' in reportcss and 'body.mmri-print-report .report-screen-only' in reportcss and 'body.mmri-print-report .report-print-only{display:block!important' in reportcss)
check('PDF browser fallback fixed A4 three-page surface', 'width:210mm!important' in reportcss and 'height:297mm!important' in reportcss and 'page-break-after:always!important' in reportcss and 'pdf-report-page:last-child' in reportcss)

renderer=R/'render_report_pdf.py'
if renderer.exists():
    py=renderer.read_text(encoding='utf-8')
    check('PDF renderer version','MMRI-PDF-1.5-BUSINESS-REPORT' in py)
    check('PDF Noto fonts','NotoSans-Regular.ttf' in py and 'NotoSans-Bold.ttf' in py)
    check('PDF five domain accents',all(x in py.lower() for x in ['ff3d8d','00a6ff','ffd000','7c4dff','ff6a00']))
    check('PDF explicit three-section flow',py.count('PageBreak')>=2)
    check('PDF exact three-page guard','doc.page != 3' in py and 'expected 3 pages' in py)
    check('PDF roadmap compact table','roadmap_summary_rows' in py and 'roadmap_table' in py)
    check('PDF domain frame','roundRect(6.5 * mm' in py and 'setStrokeColor(DOMAIN)' in py)
else:
    fail.append(('PDF renderer present',str(renderer)))


# Step 6/10 - account, billing and priorities hardening.
login=(F/'pages/Login.tsx').read_text(encoding='utf-8')
billing=(F/'pages/Billing.tsx').read_text(encoding='utf-8')
profile=(F/'pages/Profile.tsx').read_text(encoding='utf-8')
accountcss=(F/'pages/account.css').read_text(encoding='utf-8')
billingcss=(F/'pages/billing.css').read_text(encoding='utf-8')
priorities=(F/'pages/Priorities.tsx').read_text(encoding='utf-8')
prioritiescss=(F/'pages/priorities.css').read_text(encoding='utf-8')
plans=(F/'billing/plans.ts').read_text(encoding='utf-8')
check('billing plan copy is five-domain safe','Сонгосон чиглэлийн оношилгоо' in plans and 'Маркетингийн оношилгоо' not in plans and '3 хуудасны мэргэжлийн PDF тайлан' in plans and 'хоёр хуудасны тайлан' not in plans)
check('login shows compact value proof','auth__proof' in login and '5 + 5' in login and '12 сар' in login and 'auth__proof' in (F/'pages/login.css').read_text(encoding='utf-8'))
check('login selected plan shows current price','formatMnt(selectedPlan.priceMnt)' in login and 'auth__plan' in login)
check('billing exposes three-step payment state','billing-domain-flow' in billing and all(x in billing for x in ['Код үүсгэх','Төлбөр хийх','Эрх нээх']) and 'billing-domain-flow' in billingcss)
check('billing modal has explicit close control','billing-success-modal__close' in billing and 'aria-label="Цонх хаах"' in billing and 'billing-success-modal__close' in billingcss)
check('billing error is announced','role="alert" aria-live="assertive"' in billing)
check('billing normalizes invalid stored domain','const area=businessAreaById(requestedArea);const areaId=area.id' in billing)
check('profile completion count is data-driven','{orderedIds.length}/{orderedIds.length} · Бүрэн' in profile and 'Суурь мэдээллийн 20 асуултад' not in profile)
check('profile empty company save is not silent',"setError('Байгууллагын нэрийг оруулна уу.')" in profile and 'if(!session.companyId)return;if(!companyName.trim())' in profile)
check('settings unknown payment domain is not mislabeled marketing',"return null" in settings and "area?.name??'Чиглэл тодорхойгүй'" in settings and "return businessAreaById('marketing')" not in settings and 'businessAreas.some(a=>a.id===x.domainCode)' in settings)
check('settings has no inert text-size control (removed; setting never scaled the page)','Үсгийн хэмжээ' not in settings and 'mmriFontSize' not in settings)
check('settings logout is separated from display controls','technical-settings__account' in settings and 'technical-settings__account' in accountcss and 'Системээс гарах' in settings)
check('priorities avoid score arrows','→' not in priorities and 'Одоо / зорилт' in priorities and 'priority-register-score>span' in prioritiescss)
check('priorities use five-domain neutral fallback',"??'Чиглэл'" in priorities and 'маркетингийн чиглэл' not in priorities.lower())
check('priorities remove strategy-domain residue','Стратеги ба удирдлага' not in priorities and 'стратеги хариуцсан менежер' not in priorities)

# Step 8/10 - responsive + accessibility final pass.
landingcss=(F/'pages/landing.css').read_text(encoding='utf-8')
billingcss=(F/'pages/billing.css').read_text(encoding='utf-8')
supportcss=(F/'pages/support.css').read_text(encoding='utf-8')
app=(F/'App.tsx').read_text(encoding='utf-8')
check('Results accessible module label is domain-aware','aria-label={`${areaName} чиглэлийн ${modules.length} бүрэлдэхүүний үнэлгээ`}' in results and 'Маркетингийн 8 бүрэлдэхүүний үнэлгээ' not in results)
check('Results module rows announce score context','aria-label={`${m.nameMn}. Оноо ${fmt(score)}' in results)
check('Billing success dialog traps full focus set and restores focus','successDialogRef' in billing and 'querySelectorAll<HTMLElement>' in billing and 'successRestoreRef' in billing and 'target?.isConnected' in billing)
check('Report history controls expose selection state','role="group" aria-label="Тайлангийн огноо"' in report and 'aria-pressed={demoHistory===i}' in report and 'aria-pressed={selectedId===h.id}' in report)
check('OS reduced-motion preference is globally honored','@media (prefers-reduced-motion:reduce)' in prefs and 'animation-duration:.001ms!important' in prefs)
check('forced-colors mode has explicit focus and glass fallback','@media (forced-colors:active)' in prefs and 'outline:3px solid Highlight!important' in prefs and '--mmri-glass-bg:Canvas' in prefs)
check('shell has skip link and route focus target','mmri-skip-link' in shell_css and 'id="main-content"' in (F/'components/AppShell.tsx').read_text(encoding='utf-8') and 'data-route-heading' in app)
check('mobile shell uses safe bottom clearance','padding-bottom:var(--mmri-mobile-bottom-clearance)' in shell_css and 'min-height:var(--mmri-bottom-nav-height)' in shell_css)
check('mobile report domain/date controls remain horizontally reachable','scroll-snap-type:x proximity' in reportcss and 'overscroll-behavior-inline:contain' in reportcss and 'min-height:56px' in reportcss)
check('guide modal respects safe areas and contained scrolling','env(safe-area-inset-bottom)' in landingcss and 'overscroll-behavior:contain' in landingcss and 'height:100%' in landingcss)
check('billing modal respects safe areas and coarse-pointer targets','env(safe-area-inset-top)' in billingcss and '@media (pointer:coarse)' in billingcss and 'width:48px;height:48px' in billingcss)
check('support stepper collapses to reachable mobile scroller','scroll-snap-type:x proximity' in supportcss and 'flex:0 0 min(78vw,280px)' in supportcss and '.mmri-support-account-grid{grid-template-columns:1fr}' in supportcss)

# Structural brace integrity for active CSS without external parser dependencies.
# Ignore comments and quoted strings so content values such as "{" do not create
# false failures. Also reject unmatched top-level closing braces.
def css_braces_balanced(text):
    depth=0; i=0; state='normal'; quote=None
    while i < len(text):
        ch=text[i]
        if state=='comment':
            if ch=='*' and i+1 < len(text) and text[i+1]=='/':
                state='normal'; i+=2; continue
            i+=1; continue
        if state=='string':
            if ch=='\\' and i+1 < len(text):
                i+=2; continue
            if ch==quote:
                state='normal'; quote=None
            i+=1; continue
        if ch=='/' and i+1 < len(text) and text[i+1]=='*':
            state='comment'; i+=2; continue
        if ch in ('"',"'"):
            state='string'; quote=ch; i+=1; continue
        if ch=='{':
            depth+=1
        elif ch=='}':
            if depth==0: return False, depth
            depth-=1
        i+=1
    return depth==0, depth

for line in css_imports:
    m=re.search(r"['\"](.+?\.css)['\"]",line)
    if not m: continue
    p=(F/m.group(1).lstrip('./')).resolve()
    if p.exists():
        text=p.read_text(encoding='utf-8')
        ok,depth=css_braces_balanced(text)
        check('CSS structure '+p.name,ok,f"depth={depth}")

print(f'UI POLISH GATE: {len(passed)}/{len(passed)+len(fail)} PASS')
for n,d in passed: print('PASS',n+(f' - {d}' if d else ''))
for n,d in fail: print('FAIL',n+(f' - {d}' if d else ''))
if fail: sys.exit(1)
PY
