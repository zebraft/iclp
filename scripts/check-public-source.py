#!/usr/bin/env python3
"""Fail closed for known private release data. Prints filenames and categories only."""
from pathlib import Path
import re,sys,json,os,subprocess
root=Path(__file__).resolve().parents[1]
patterns={
 'live-google-file-id':r'https://docs\.google\.com/(?:spreadsheets|document)/d/(?!REPLACE_WITH_)[\w-]{25,}',
 'real-person-email':r'[\w.+-]+@(?:as\.edu\.tw|gmail\.com)',
 'private-checklist-capability':r'[?&#]key=[A-Za-z0-9-]{40,}',
 'private-key-material':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/]{40}',
 'credential-pattern':r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{35,}|AIza[0-9A-Za-z_-]{30,})',
 'workspace-deployment-origin':r'https?://[a-z0-9-]+\.[a-z0-9-]+\.chatgpt\.site',
 'private-project-id':r'appgprj_[a-f0-9]{20,}',
}
patterns.update(json.loads(os.environ.get("PRIVATE_SOURCE_SCAN_PATTERNS_JSON","{}")))
findings=[];scanned=0
if (root/'.git').exists():
 files=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).decode().split('\0')
 candidates=[root/name for name in dict.fromkeys(files) if name]
else:candidates=root.rglob('*')
for path in candidates:
 if path.is_symlink():
  findings.append((str(path.relative_to(root)),'symlink-not-allowed'));continue
 if not path.is_file():continue
 relative=path.relative_to(root)
 if '.git' in relative.parts:continue
 if any(part in {'node_modules','dist','.next','.vinext','.wrangler','.sites-runtime'} for part in relative.parts):
  findings.append((str(relative),'excluded-directory-present'));continue
 if path.suffix in {'.pem','.key','.p12','.pfx','.db','.sqlite','.sqlite3','.log','.har','.trace'} or path.name.startswith(('.env','.dev.vars')):findings.append((str(relative),'runtime-or-secret-file'))
 try:text=path.read_text()
 except UnicodeDecodeError:continue
 scanned+=1
 for label,pattern in patterns.items():
  if re.search(pattern,text):findings.append((str(relative),label))
for path,label in findings:print(f'{path}: {label}')
print(f'Public-source check: {scanned} text files, {len(findings)} findings.')
sys.exit(bool(findings))
