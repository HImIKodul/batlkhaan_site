import { prisma } from "./db.js";

async function scalar(sql:string){const rows:any[]=await prisma.$queryRawUnsafe(sql);return Number(rows?.[0]?.count??0);}
const checks:Record<string,number>={};
checks.orphanArtifacts=await scalar(`SELECT COUNT(*) AS count FROM report_artifacts a LEFT JOIN report_snapshots r ON r.id=a."reportSnapshotId" WHERE r.id IS NULL`);
checks.nonPublishedArtifacts=await scalar(`SELECT COUNT(*) AS count FROM report_artifacts a JOIN report_snapshots r ON r.id=a."reportSnapshotId" WHERE r."publishedAt" IS NULL OR r."narrativeHash" IS NULL`);
checks.badKinds=await scalar(`SELECT COUNT(*) AS count FROM report_artifacts WHERE kind<>'PDF' OR "mimeType"<>'application/pdf'`);
checks.badSizes=await scalar(`SELECT COUNT(*) AS count FROM report_artifacts WHERE "sizeBytes"<=0 OR "sizeBytes">52428800`);
checks.badHashes=await scalar(`SELECT COUNT(*) AS count FROM report_artifacts WHERE char_length("sourceHash")<>64 OR char_length("contentHash")<>64`);
const failures=Object.entries(checks).filter(([,v])=>v!==0);console.log(JSON.stringify({status:failures.length?"FAIL":"PASS",checks},null,2));await prisma.$disconnect();if(failures.length)process.exit(1);
