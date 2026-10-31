import fs from 'node:fs';
const p='scripts/backend-step15-full-synthetic-e2e.mjs',s=fs.readFileSync(p,'utf8');
const checks=[
 ['five domain bundles',/MMRI_ISMRI/.test(s)&&/MMRI_FINMRI/.test(s)&&/MMRI_HRMRI/.test(s)&&/MMRI_OPMRI/.test(s)&&/MMRI_v3\.0\.4_QBANK/.test(s)],
 ['manual payment boundary exercised',/ManualPaymentAdapter/.test(s)&&/never self-confirms/.test(s)],
 ['question answers create evidence',/evidenceFromAnswer/.test(s)&&/answerRecords/.test(s)],
 ['scoring snapshot used',/calculateRuntimeSnapshot/.test(s)],
 ['diagnosis built',/buildDiagnosisResultV13/.test(s)],
 ['strategy and frozen plan built',/runStrategyPipeline/.test(s)&&/buildFrozenStrategyPlan/.test(s)],
 ['report payload built',/buildFrozenReportPayload/.test(s)],
 ['AI fallback validated',/deterministicFallbackNarrative/.test(s)&&/validateNarrativeDraft/.test(s)],
 ['PDF artifact generated',/buildReportPdfSource/.test(s)&&/render_report_pdf\.py/.test(s)],
 ['storage reload verified',/stored payload reload hash/.test(s)&&/stored PDF verifies/.test(s)],
 ['answer reversal compared',/reversed answers change report/.test(s)],
 ['report hash chain checked',/complete report hash chain/.test(s)]
];
const failed=checks.filter(([,ok])=>!ok);console.log(JSON.stringify({suite:'Backend Step 15 static acceptance',status:failed.length?'FAIL':'PASS',passed:checks.length-failed.length,total:checks.length,failed:failed.map(([name])=>name)},null,2));if(failed.length)process.exit(1);
