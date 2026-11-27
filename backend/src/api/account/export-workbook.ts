import { buildXlsx, type XlsxSheet } from "./xlsx.js";

/* Customer data export as Excel. It is built ONLY from the objects returned by DataLifecycleService.exportAccount/exportCompany, which already apply the
   permission rules and select explicit fields (no password hashes, tokens, provider secrets, QR payloads or administrator records). Nothing is queried here. */
const DOMAIN: Record<string, string> = { marketing: "Маркетинг", it: "Мэдээллийн технологи", finance: "Санхүү", people: "Хүний нөөц", operations: "Үйлдвэрлэл ба үйл ажиллагаа" };
const ASSESSMENT: Record<string, string> = { PROFILE_PENDING: "Суурь мэдээлэл дутуу", IN_PROGRESS: "Явагдаж байна", PAUSED: "Түр зогссон", READY_FOR_COMPLETION: "Дуусгахад бэлэн", PROCESSING: "Боловсруулж байна", COMPLETED: "Дууссан", COMPLETED_WITH_REVIEW: "Дууссан (хяналттай)", EXHAUSTED: "Асуулт дууссан", CANCELLED: "Цуцлагдсан" };
const INVOICE: Record<string, string> = { CREATED: "Үүсгэсэн", PENDING: "Хүлээгдэж байна", PAID: "Төлөгдсөн", CANCELLED: "Цуцлагдсан", FAILED: "Амжилтгүй", REFUNDED: "Буцаагдсан" };
const PLAN: Record<string, string> = { RETAKE: "Дахин оношилгоо", INITIAL: "Анхны оношилгоо", DIAGNOSIS: "Оношилгоо" };
const ROLE: Record<string, string> = { OWNER: "Эзэмшигч", ADMIN: "Админ", ASSESSOR: "Үнэлгээ хийгч", CONSULTANT: "Зөвлөх", VIEWER: "Үзэгч" };
const d = (v: unknown) => (v ? new Date(v as any) : null);
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const label = (m: Record<string, string>, k: unknown) => (k == null ? "" : m[String(k)] ?? String(k));
const money = (v: unknown) => n(v);

export function companyWorkbook(account: any, company: any): Buffer {
  const sheets: XlsxSheet[] = [];
  const a = account.account ?? {}; const c = company.company ?? {};
  sheets.push({ name: "Бүртгэл", columns: [{ header: "Талбар", width: 30 }, { header: "Утга", width: 48 }], rows: [
    ["Экспортолсон огноо", d(company.exportedAt)], ["Имэйл", a.email ?? ""], ["Нэр", a.displayName ?? ""], ["Бүртгүүлсэн огноо", d(a.createdAt)], ["Сүүлд нэвтэрсэн", d(a.lastLoginAt)] ] });
  const profile = (c.profile ?? {}) as any;
  sheets.push({ name: "Байгууллага", columns: [{ header: "Талбар", width: 30 }, { header: "Утга", width: 48 }], rows: [
    ["Байгууллагын нэр", c.name ?? ""], ["Салбар", c.industry ?? ""], ["Бизнесийн загвар", c.businessModel ?? ""], ["Ажилтны тоо", n(c.employeeCount)], ["Үйл ажиллагааны нас (жил)", n(c.companyAgeYears)],
    ["Зах зээл", c.marketType ?? ""], ["Улс", c.country ?? ""], ["Бүртгэсэн огноо", d(c.createdAt)],
    ["Суурь асуулгын хариулт (тоо)", Array.isArray(profile.basicInfoAnswersV2) ? profile.basicInfoAnswersV2.length : null] ] });
  const assessments: any[] = company.assessments ?? [];
  sheets.push({ name: "Оношилгоо", columns: [{ header: "Оношилгооны ID", width: 28 }, { header: "Чиглэл", width: 30 }, { header: "Төлөв", width: 22 }, { header: "Эхэлсэн", width: 18 }, { header: "Дууссан", width: 18 }, { header: "Нийт оноо", width: 12 }, { header: "Итгэлцэл", width: 12 }, { header: "Хамрах хүрээ", width: 14 }, { header: "Үр дүн", width: 30 }],
    rows: assessments.map(x => [x.id, label(DOMAIN, x.domainCode), label(ASSESSMENT, x.status), d(x.startedAt ?? x.createdAt), d(x.completedAt), n(x.overallOfficialScore ?? x.overallPartialScore), n(x.overallConfidence), n(x.coverage), x.derivedContent === "WITHHELD_PENDING_REVIEW" ? "Хяналтын шатанд (нийтлэгдээгүй)" : "Нээлттэй"]) });
  const answers: any[][] = [];
  for (const x of assessments) for (const ans of x.answers ?? []) answers.push([x.id, label(DOMAIN, x.domainCode), ans.questionId, n(ans.optionIndex), ans.status ?? "", d(ans.createdAt)]);
  sheets.push({ name: "Хариултууд", columns: [{ header: "Оношилгооны ID", width: 28 }, { header: "Чиглэл", width: 30 }, { header: "Асуултын ID", width: 28 }, { header: "Сонгосон хариулт (дугаар)", width: 24 }, { header: "Төлөв", width: 16 }, { header: "Огноо", width: 18 }], rows: answers });
  sheets.push({ name: "Төлбөр", columns: [{ header: "Нэхэмжлэлийн ID", width: 28 }, { header: "Чиглэл", width: 30 }, { header: "Төрөл", width: 20 }, { header: "Дүн (₮)", width: 14 }, { header: "Төлөв", width: 18 }, { header: "Үүссэн", width: 18 }, { header: "Төлөгдсөн", width: 18 }],
    rows: (company.payments ?? []).map((p: any) => [p.id, label(DOMAIN, p.domainCode), label(PLAN, p.planCode), money(p.amountMnt), label(INVOICE, p.status), d(p.createdAt), d(p.paidAt)]) });
  sheets.push({ name: "Эрх", columns: [{ header: "Чиглэл", width: 30 }, { header: "Төрөл", width: 20 }, { header: "Төлөв", width: 16 }, { header: "Эхлэх", width: 18 }, { header: "Дуусах", width: 18 }, { header: "Оношилгооны эрх", width: 16 }, { header: "Ашигласан", width: 12 }],
    rows: (company.entitlements ?? []).map((e: any) => [label(DOMAIN, e.domainCode), label(PLAN, e.planCode), e.status ?? "", d(e.startsAt), d(e.endsAt), n(e.assessmentLimit), n(e.assessmentsUsed)]) });
  sheets.push({ name: "Гишүүд", columns: [{ header: "Имэйл", width: 36 }, { header: "Нэр", width: 24 }, { header: "Үүрэг", width: 18 }, { header: "Нэгдсэн огноо", width: 18 }],
    rows: (company.members ?? []).map((m: any) => [m.email, m.displayName ?? "", label(ROLE, m.role), d(m.since)]) });
  return buildXlsx(sheets);
}
