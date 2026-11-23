/* Plain-Mongolian customer terms for NEWLY generated 12-month plan text. Same rules as frontend/src/data/plainTerms.ts (parity enforced by a test): the web page applies them
   to every payload it displays, the PDF does not, so a plan is stored already in the plain form and reads the same in both. Never applied to stored or frozen data. */
const EXACT: Array<[string, string]> = [
  ["Үүлэн үйлчилгээ ба программын үйлчилгээний багцын засаглал", "Үүлэн болон программын үйлчилгээний удирдлага"],
  ["Бага кодтой эсвэл кодгүй хөгжүүлэлт", "Код бичихгүйгээр эсвэл бага кодоор программ бүтээх"],
  ["Капитал хуваарилалтын удирдлага", "Хөрөнгийн хуваарилалт, зарцуулалтын удирдлага"],
  ["Хөрөнгө оруулалтын багц ба эрэмбэлэлт", "Хөрөнгө оруулалтын сонголт ба тэргүүлэх дараалал"],
  ["Хөрөнгө оруулалтын үндэслэлийн стандарт", "Хөрөнгө оруулалтыг үндэслэх нийтлэг шалгуур"],
  ["Хөрөнгө оруулалтын өгөөж, нөхөгдөх хугацааны эдийн засгийн үнэлгээ", "Хөрөнгө оруулалтын ашиг, нөхөгдөх хугацааг тооцоолох"],
  ["Капиталын өртөг ба доод шаардлагатай өгөөж", "Хөрөнгийн өртөг ба хамгийн багадаа авах ёстой ашиг"],
];
const GOVERNANCE: Array<[RegExp, string]> = [
  [/засаглалаас/g, "удирдлагаас"], [/засаглалтай/g, "удирдлагатай"], [/засаглалын/g, "удирдлагын"], [/засаглалыг/g, "удирдлагыг"], [/засаглалд/g, "удирдлагад"], [/засаглал/g, "удирдлага"],
  [/Засаглалаас/g, "Удирдлагаас"], [/Засаглалын/g, "Удирдлагын"], [/Засаглал/g, "Удирдлага"],
];
/** Applied until stable: one exact rule matches text that the governance rule produces. */
export function plainMn(value: string): string {
  let s = String(value ?? "");
  for (let i = 0; i < 3; i++) { const before = s; for (const [a, b] of EXACT) s = s.split(a).join(b); for (const [r, b] of GOVERNANCE) s = s.replace(r, b); if (s === before) break; }
  return s;
}
