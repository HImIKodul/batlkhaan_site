import 'dotenv/config';
import { prisma } from '../dist/db.js';

const DEMO_EMAIL = 'demo@mmri.mn';
const DEMO_COMPANY_NAME = 'Өрнөх Маркет ХХК';
const DEMO_TAG = 'MMRI_DEMO_COMPANY_V2_FAST';
const DEMO_INVOICE_PREFIXES = ['DEMO-MMRI-', 'DEMO-SHOWCASE-'];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const profileObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

async function main() {
  const env = String(process.env.MMRI_ENVIRONMENT ?? '').toLowerCase();
  assert(['integration','development','test'].includes(env), `Refusing demo cleanup in MMRI_ENVIRONMENT=${env || '<unset>'}`);

  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: {
      id: true, email: true,
      memberships: { select: { companyId: true, company: { select: { name: true, profile: true } } } },
      assessmentsCreated: { select: { id: true, companyId: true } },
      billingInvoicesCreated: { select: { id: true, companyId: true, senderInvoiceNo: true } },
      pilotStudiesCreated: { select: { id: true } },
      calibrationProposalsCreated: { select: { id: true } },
      calibrationReviews: { select: { id: true } },
      calibrationReleasesActivated: { select: { id: true } }
    }
  });

  const demoCompanies = await prisma.company.findMany({
    where: { profile: { path: ['demoTag'], equals: DEMO_TAG } },
    select: {
      id: true, name: true, profile: true,
      memberships: { select: { user: { select: { id: true, email: true } } } },
      assessments: { select: { id: true, status: true, profile: true, pilotLink: { select: { id: true } } } },
      billingInvoices: { select: { id: true, senderInvoiceNo: true, provider: true, providerMetadata: true, createdByUserId: true } },
      entitlements: { select: { id: true, sourceInvoiceId: true } },
      pilotEnrollments: { select: { id: true } }
    }
  });

  if (!demoUser && demoCompanies.length === 0) {
    const lingeringInvoices = await prisma.billingInvoice.count({
      where: { OR: DEMO_INVOICE_PREFIXES.map(prefix => ({ senderInvoiceNo: { startsWith: prefix } })) }
    });
    assert(lingeringInvoices === 0, `Demo identity is gone but ${lingeringInvoices} demo-prefixed invoice(s) remain`);
    console.log(JSON.stringify({ status: 'PASS', deleted: false, note: 'Exact demo dataset is already absent.' }, null, 2));
    return;
  }

  assert(demoCompanies.length === 1, `Expected exactly one tagged demo company, found ${demoCompanies.length}`);
  const company = demoCompanies[0];
  const companyProfile = profileObject(company.profile);
  assert(company.name === DEMO_COMPANY_NAME, `Tagged demo company name mismatch: ${company.name}`);
  assert(companyProfile.demo === true && companyProfile.demoTag === DEMO_TAG, 'Tagged company does not have the exact demo profile markers');
  assert(demoUser, `Tagged demo company exists but ${DEMO_EMAIL} user is missing`);

  assert(company.memberships.length === 1, `Demo company has ${company.memberships.length} memberships; expected exactly 1`);
  assert(company.memberships[0].user.email === DEMO_EMAIL, `Unexpected membership on demo company: ${company.memberships[0].user.email}`);
  assert(company.pilotEnrollments.length === 0, `Demo company has ${company.pilotEnrollments.length} pilot enrollment(s); refusing cleanup`);

  for (const assessment of company.assessments) {
    const p = profileObject(assessment.profile);
    assert(p.demoSeed === DEMO_TAG, `${assessment.id}: assessment is not tagged by the exact demo seed; refusing cleanup`);
    assert(!assessment.pilotLink, `${assessment.id}: formal pilot link exists; refusing cleanup`);
  }

  for (const invoice of company.billingInvoices) {
    assert(DEMO_INVOICE_PREFIXES.some(prefix => invoice.senderInvoiceNo.startsWith(prefix)), `${invoice.id}: unexpected invoice ${invoice.senderInvoiceNo}; refusing cleanup`);
    const metadata = profileObject(invoice.providerMetadata);
    assert(metadata.demo === true || invoice.senderInvoiceNo.startsWith('DEMO-MMRI-'), `${invoice.id}: invoice lacks demo marker; refusing cleanup`);
    assert(invoice.createdByUserId === demoUser.id, `${invoice.id}: demo invoice was created by another user; refusing cleanup`);
  }

  const allowedCompanyIds = new Set([company.id]);
  assert(demoUser.memberships.every(x => allowedCompanyIds.has(x.companyId)), `${DEMO_EMAIL}: belongs to a non-demo company; refusing user deletion`);
  assert(demoUser.assessmentsCreated.every(x => allowedCompanyIds.has(x.companyId)), `${DEMO_EMAIL}: created an assessment outside the demo company; refusing cleanup`);
  assert(demoUser.billingInvoicesCreated.every(x => allowedCompanyIds.has(x.companyId) && DEMO_INVOICE_PREFIXES.some(prefix => x.senderInvoiceNo.startsWith(prefix))), `${DEMO_EMAIL}: created a non-demo invoice; refusing cleanup`);
  assert(demoUser.pilotStudiesCreated.length === 0, `${DEMO_EMAIL}: created pilot study records; refusing cleanup`);
  assert(demoUser.calibrationProposalsCreated.length === 0, `${DEMO_EMAIL}: created calibration proposals; refusing cleanup`);
  assert(demoUser.calibrationReviews.length === 0, `${DEMO_EMAIL}: has calibration reviews; refusing cleanup`);
  assert(demoUser.calibrationReleasesActivated.length === 0, `${DEMO_EMAIL}: activated calibration releases; refusing cleanup`);

  const before = {
    companyId: company.id,
    companyName: company.name,
    userId: demoUser.id,
    email: demoUser.email,
    assessments: company.assessments.length,
    invoices: company.billingInvoices.length,
    entitlements: company.entitlements.length
  };
  console.log('DEMO CLEANUP PRE-FLIGHT PASS');
  console.log(JSON.stringify(before, null, 2));

  await prisma.$transaction(async tx => {
    // Assessments own the generated diagnosis/strategy/report/PDF-model lineage.
    // Their child records cascade from the assessment relation.
    await tx.assessment.deleteMany({ where: { companyId: company.id } });

    // Entitlements restrict their source invoices, so remove them before invoices.
    await tx.companyEntitlement.deleteMany({ where: { companyId: company.id } });
    await tx.billingInvoice.deleteMany({ where: { companyId: company.id } });
    await tx.companyMembership.deleteMany({ where: { companyId: company.id } });
    await tx.company.delete({ where: { id: company.id } });

    // Auth audit events are SET NULL on user deletion; refresh sessions cascade.
    await tx.user.delete({ where: { id: demoUser.id } });
  }, { maxWait: 10000, timeout: 30000 });

  const [userAfter, companyAfter, invoiceAfter, assessmentAfter] = await Promise.all([
    prisma.user.count({ where: { email: DEMO_EMAIL } }),
    prisma.company.count({ where: { profile: { path: ['demoTag'], equals: DEMO_TAG } } }),
    prisma.billingInvoice.count({ where: { OR: DEMO_INVOICE_PREFIXES.map(prefix => ({ senderInvoiceNo: { startsWith: prefix } })) } }),
    prisma.assessment.count({ where: { profile: { path: ['demoSeed'], equals: DEMO_TAG } } })
  ]);

  assert(userAfter === 0, `Demo user remains: ${userAfter}`);
  assert(companyAfter === 0, `Demo company remains: ${companyAfter}`);
  assert(invoiceAfter === 0, `Demo invoice(s) remain: ${invoiceAfter}`);
  assert(assessmentAfter === 0, `Demo assessment(s) remain: ${assessmentAfter}`);

  console.log(JSON.stringify({ status: 'PASS', deleted: true, removed: before, verification: { demoUsers: userAfter, demoCompanies: companyAfter, demoInvoices: invoiceAfter, demoAssessments: assessmentAfter } }, null, 2));
}

main().catch(error => {
  console.error('TASK 9 EXACT DEMO CLEANUP FAILED');
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
