#!/usr/bin/env python3
"""Create navigation links only; never claim that a link is holdings evidence."""
import argparse,json
from pathlib import Path
from urllib.parse import urlencode
p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('output_prefix',type=Path);p.add_argument('--batch-size',type=int,default=10);a=p.parse_args()
rows=json.loads(a.input.read_text());seen=set()
if not 1<=a.batch_size<=10:p.error('--batch-size must be between 1 and 10')
for row in rows:
 if not isinstance(row,dict) or not row.get('id') or not isinstance(row.get('title'),str) or not row['title'].strip() or row['id'] in seen:p.error('Every row needs a unique id and a nonempty title')
 seen.add(row['id'])
batches=[]
for start in range(0,len(rows),a.batch_size):
 chunk=rows[start:start+a.batch_size];query=' OR '.join('ti:("'+r['title'].replace('"',' ')+'")' for r in chunk)
 batches.append({'batch':len(batches)+1,'ids':[r['id'] for r in chunk],'url':'https://aslib.on.worldcat.org/search?'+urlencode({'queryString':query}),'verified':False})
a.output_prefix.parent.mkdir(parents=True,exist_ok=True)
a.output_prefix.with_suffix('.json').write_text(json.dumps(batches,ensure_ascii=False,indent=2)+'\n')
a.output_prefix.with_suffix('.txt').write_text('\n'.join(b['url'] for b in batches)+'\n')
