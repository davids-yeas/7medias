import json,glob,re,os
S=os.path.dirname(os.path.abspath(__file__))+'/'
ROOT=os.path.dirname(os.path.abspath(__file__))+'/../fefco/'
SER={'0300':'Boîtes télescopiques','0400':'Boîtes et plateaux','0500':'Boîtes coulissantes','0600':'Caisses rigides','0700':'Caisses prêtes à coller','0800':'Retail et e-commerce','0900':'Aménagements intérieurs'}
rows=[]
for f in sorted(glob.glob(S+'*.json')): rows+= [r for r in json.load(open(f)) if r.get('code')]
rows=[r for r in rows if re.match(r'^\d{4}(\.\d)?$',r['code'])]
# dedupe: keep the one with representable/spec if dup
by={}
for r in rows:
  c=r['code']
  if c not in by or (r.get('representable') and not by[c].get('representable')): by[c]=r
styles=open(ROOT+'styles.js').read()
existing=set(re.findall(r"^    '(\d{4}(?:\.\d)?)': ",styles,re.M))
out=[]
for c,r in sorted(by.items()):
  if not r.get('representable') or c in existing or not r.get('spec'): continue
  s=c[:2]+'00'
  desc=(r.get('titre_fr','')+'. Relevé page '+str(r['page'])+' du PDF.')
  if r.get('simplifie'): desc+=' Contour simplifié : '+r['simplifie'].rstrip('.')+'.'
  out.append('    '+json.dumps([c, s+' · '+SER.get(s,''), r['mode'], r['titre_fr'], desc, None, r['spec']],ensure_ascii=False)+',')
a=styles.index('  const FROM_PDF = [\n')+len('  const FROM_PDF = [\n'); b=styles.index('  ];',a)
styles=styles[:a]+'\n'.join(out)+'\n'+styles[b:]
open(ROOT+'styles.js','w').write(styles)
# catalog
cat=open(ROOT+'catalog.js').read()
have=set(re.findall(r'(\d{4}(?:\.\d)?):',cat))
for s in ['0300','0400','0500','0600','0700','0800','0900']:
  add=[f"{c}:{by[c]['mode']}" for c in sorted(by) if c[:2]+'00'==s and c not in have]
  if not add: continue
  m=re.search(r"    '%s': '([^']*)',\n"%s,cat)
  if m:
    codes=sorted(m.group(1).split()+add,key=lambda t:t.split(':')[0])
    cat=cat.replace(m.group(0),"    '%s': '%s',\n"%(s,' '.join(codes)))
  else:
    cat=cat.replace("  };\n  const list","    '%s': '%s',\n  };\n  const list"%(s,' '.join(add)),1)
  if "'%s':"%s not in cat.split('const RAW')[0]:
    cat=cat.replace("  };\n  const RAW","    '%s': '%s',\n  };\n  const RAW"%(s,SER[s]),1)
open(ROOT+'catalog.js','w').write(cat)
print(len(out),'plans ajoutés')
