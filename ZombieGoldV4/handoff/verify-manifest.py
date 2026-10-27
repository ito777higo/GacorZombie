#!/usr/bin/env python3
"""Verify the immutable source/asset manifest of this checkout (no external paths)."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'handoff/SOURCE_MANIFEST.json').read_text(encoding='utf-8'))
errors=[]
for item in manifest['files']:
    p=(root/item['path']).resolve()
    if not p.is_relative_to(root) or not p.is_file():
        errors.append('missing/unsafe: '+item['path']);continue
    b=p.read_bytes()
    if len(b)!=item['bytes'] or hashlib.sha256(b).hexdigest()!=item['sha256']:
        errors.append('mismatch: '+item['path'])
actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and not any(part in manifest['excluded_directories'] for part in p.relative_to(root).parts) and p.name!='.DS_Store'}
expected={f['path'] for f in manifest['files']}
errors.extend('unexpected: '+x for x in sorted(actual-expected))
result={'pass':not errors,'files':len(expected),'bytes':sum(f['bytes'] for f in manifest['files']),'errors':errors}
print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(bool(errors))
