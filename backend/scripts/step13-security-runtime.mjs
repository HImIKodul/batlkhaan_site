const roles=['OWNER','ADMIN','ASSESSOR','CONSULTANT','VIEWER'];
const sets={
  diagnostic:new Set(['OWNER','ADMIN','ASSESSOR']),
  review:new Set(['OWNER','ADMIN','CONSULTANT']),
  contentWrite:new Set(['OWNER','ADMIN','ASSESSOR','CONSULTANT']),
  reportRead:new Set(['OWNER','ADMIN','CONSULTANT','VIEWER']),
  companyAdmin:new Set(['OWNER','ADMIN'])
};
const checks=[];const check=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});
for(const r of roles){
  check(`diagnostic:${r}`,sets.diagnostic.has(r)===['OWNER','ADMIN','ASSESSOR'].includes(r));
  check(`review:${r}`,sets.review.has(r)===['OWNER','ADMIN','CONSULTANT'].includes(r));
  check(`viewer-write-denial:${r}`,r!=='VIEWER'||(!sets.diagnostic.has(r)&&!sets.review.has(r)&&!sets.contentWrite.has(r)));
}
check('assessor_cannot_review',!sets.review.has('ASSESSOR'));
check('consultant_cannot_answer',!sets.diagnostic.has('CONSULTANT'));
check('viewer_report_only',sets.reportRead.has('VIEWER')&&!sets.review.has('VIEWER'));
check('owner_admin_company_admin',sets.companyAdmin.has('OWNER')&&sets.companyAdmin.has('ADMIN'));
check('assessor_not_company_admin',!sets.companyAdmin.has('ASSESSOR'));
check('consultant_not_company_admin',!sets.companyAdmin.has('CONSULTANT'));
check('viewer_not_company_admin',!sets.companyAdmin.has('VIEWER'));

function trustedOrigin(environment,origin,allowed){if(environment==='production'&&!origin)return false;return !origin||allowed.has(origin)}
const allowed=new Set(['https://app.example.mn']);
check('prod_missing_origin_rejected',trustedOrigin('production',undefined,allowed)===false);
check('prod_allowed_origin',trustedOrigin('production','https://app.example.mn',allowed)===true);
check('prod_foreign_origin_rejected',trustedOrigin('production','https://evil.example',allowed)===false);
check('dev_cli_origin_optional',trustedOrigin('development',undefined,allowed)===true);

function ownerTransition(existing,next,count){return !(existing==='OWNER'&&next!=='OWNER'&&count<=1)}
check('last_owner_demotion_rejected',ownerTransition('OWNER','ADMIN',1)===false);
check('owner_demotion_with_second_owner_allowed',ownerTransition('OWNER','ADMIN',2)===true);
check('non_owner_role_change_allowed',ownerTransition('ADMIN','VIEWER',1)===true);

// Model atomic refresh rotation: exactly one caller may flip revoked=false -> true.
let revoked=false;
const rotate=()=>{if(revoked)return false;revoked=true;return true};
check('refresh_first_rotation_wins',rotate()===true);
check('refresh_second_rotation_detects_replay',rotate()===false);

// Viewer path must never imply publication/generation authority.
function reportAction(role,published){if(role==='VIEWER')return published?'READ_PUBLISHED':'DENY';return ['OWNER','ADMIN','CONSULTANT'].includes(role)?'GENERATE_OR_READ':'DENY'}
check('viewer_reads_published',reportAction('VIEWER',true)==='READ_PUBLISHED');
check('viewer_cannot_generate_missing',reportAction('VIEWER',false)==='DENY');
check('assessor_cannot_generate_report',reportAction('ASSESSOR',false)==='DENY');
check('consultant_can_generate_report',reportAction('CONSULTANT',false)==='GENERATE_OR_READ');

// Pilot enrollment requires intersection of study coordinator and company admin.
const canEnroll=(creator,companyRole)=>creator&&sets.companyAdmin.has(companyRole);
check('pilot_creator_owner_can_enroll',canEnroll(true,'OWNER')===true);
check('pilot_noncreator_owner_denied',canEnroll(false,'OWNER')===false);
check('pilot_creator_assessor_denied',canEnroll(true,'ASSESSOR')===false);

const failed=checks.filter(x=>x.status==='FAIL');
console.log(JSON.stringify({suite:'Step 13 dependency-free security policy runtime',passed:checks.length-failed.length,total:checks.length,failed:failed.map(x=>x.name)},null,2));
if(failed.length)process.exit(1);
