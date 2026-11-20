#!/usr/bin/env python3
"""Read-only reconciliation of the 325 checkpoint entries. Never edits the design tree."""
import argparse,hashlib,json,os,difflib,tarfile,collections
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--out',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];prior=json.loads(Path(a.checkpoint).read_text());design=Path(prior['workspace']);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
assert out.is_relative_to(root/'CODEX_PROGRESS') and design!=root
skip={'.git','node_modules','dist','dist-engine','dist-strategy','__pycache__'}
def protected(path):
 n=Path(path).name.lower()
 return (n.startswith('.env') and not ('example' in n)) or n in ['.qa-credentials.local','recent_change_summary.txt','outbox.jsonl'] or ('credentials' in n and Path(n).suffix not in ['.ts','.tsx','.mjs','.py','.md']) or n.endswith(('.dump','.backup','.db'))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
# Index active file content to identify relocated documents without guessing from names.
index=collections.defaultdict(list)
for top in [root/'docs',root/'backend'/'docs',root/'backend'/'methodology']:
 for parent,dirs,files in os.walk(top):
  dirs[:]=[d for d in dirs if d not in skip]
  for n in files:
   f=Path(parent)/n
   if f.is_file() and not f.is_symlink() and not protected(f.relative_to(root)):index[sha(f)].append(str(f.relative_to(root)))
expanded={};entries=[];preserve=set();diffdir=out/'design-diffs';diffdir.mkdir(exist_ok=True)
def inspect(rel):
 if rel in expanded:return expanded[rel]
 f=design/rel;current=root/rel;rec={'path':rel}
 if protected(rel):rec.update(disposition='PROTECTED_RETAIN_IN_PLACE',reason='Local configuration, personal or credential data excluded from archive/diffs')
 elif f.is_symlink():rec.update(disposition='SYMLINK_RETAIN_IN_PLACE',target=os.readlink(f))
 elif not f.is_file():rec.update(disposition='MISSING_OR_DELETED_RETAIN_STATE')
 else:
  digest=sha(f);rec.update(designSha256=digest,bytes=f.stat().st_size)
  if current.is_file() and not current.is_symlink() and sha(current)==digest:rec.update(disposition='IDENTICAL_REDUNDANT_COPY',activePath=rel)
  elif digest in index:rec.update(disposition='RELOCATED_EQUIVALENT',activePaths=index[digest])
  else:
   rec.update(disposition='DIFFERENT_PRESERVE_VARIANT' if current.is_file() else 'UNIQUE_PRESERVE',reason='Preserve distinct content; canonical active implementation is not overwritten')
   preserve.add(rel)
   if current.is_file():
    rec['activeSha256']=sha(current)
    if f.stat().st_size<1500000 and current.stat().st_size<1500000:
     try:
      before=current.read_text();after=f.read_text();diff=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='active/'+rel,tofile='design/'+rel,n=2))
      dest=diffdir/(hashlib.sha256(rel.encode()).hexdigest()[:16]+'.diff');dest.write_text(diff);rec.update(diff=str(dest.relative_to(root)),addedLines=sum(x.startswith('+') and not x.startswith('+++') for x in diff.splitlines()),removedLines=sum(x.startswith('-') and not x.startswith('---') for x in diff.splitlines()))
     except UnicodeError:rec['binary']=True
 expanded[rel]=rec;return rec
for old in prior['files']:
 rel=old['path'];f=design/rel
 if f.is_dir() and not f.is_symlink():
  children=[]
  for parent,dirs,files in os.walk(f):
   dirs[:]=[d for d in dirs if d not in skip]
   for n in files:children.append(inspect(str((Path(parent)/n).relative_to(design))))
  rec={'path':rel,'checkpointClassification':old['classification'],'disposition':'DIRECTORY_RECONCILED','children':len(children),'summary':dict(collections.Counter(x['disposition'] for x in children))}
 else:
  rec=dict(inspect(rel));rec['checkpointClassification']=old['classification']
 entries.append(rec)
assert len(entries)==325
archive=out/'design-unique-recovery.tgz'
with tarfile.open(archive,'w:gz',compresslevel=1) as tar:
 for rel in sorted(preserve):tar.add(design/rel,arcname=rel,recursive=False)
os.chmod(archive,0o600)
report={'entries':len(entries),'designWorkspace':str(design),'canonicalWorkspace':str(root),'readOnlyDesignTree':True,'deletions':[],'summary':dict(collections.Counter(x['disposition'] for x in entries)),'expandedSummary':dict(collections.Counter(x['disposition'] for x in expanded.values())),'preservedVariants':len(preserve),'recoveryArchive':str(archive.relative_to(root)),'recoverySha256':sha(archive),'items':entries,'expandedFiles':list(expanded.values())}
(out/'design-reconciliation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['items','expandedFiles']},indent=2))
