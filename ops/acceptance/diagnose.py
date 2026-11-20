#!/usr/bin/env python3
"""Read-only service capability probes. No credentials, mutations or policy changes."""
import os,socket,json,shutil
from pathlib import Path
r={'uid':os.getuid(),'gid':os.getgid(),'status':{l.split(':')[0]:l.split(':')[1].strip() for l in Path('/proc/self/status').read_text().splitlines() if l.startswith(('NoNewPrivs:','Seccomp:','CapEff:'))},'executables':{n:shutil.which(n) for n in ['docker','psql','postgres','pg_dump','pg_restore','google-chrome','pdfinfo','pdftotext']},'probes':[]}
for name,family,address in [('internet-socket',socket.AF_INET,None),('docker-connect',socket.AF_UNIX,'/var/run/docker.sock'),('localhost-http-connect',socket.AF_INET,('127.0.0.1',4000)),('localhost-postgres-connect',socket.AF_INET,('127.0.0.1',55432))]:
 s=None
 try:
  s=socket.socket(family,socket.SOCK_STREAM);s.settimeout(2)
  if address:s.connect(address)
  r['probes'].append({'name':name,'status':'AVAILABLE','scope':'Socket capability only; no database or HTTP request sent'})
 except OSError as e:r['probes'].append({'name':name,'status':'BLOCKED','errno':e.errno,'reason':str(e)})
 finally:
  if s:s.close()
print(json.dumps(r,indent=2))
