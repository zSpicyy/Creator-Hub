import json,sys,re
sys.path.insert(0,'.')
from en import EN
EN={k.strip():v.strip() for k,v in EN.items()}
js='// Automatisch erzeugt aus kit/i18n (en.py, patterns.js, engine.js). Nicht von Hand ändern.\n(()=>{\nconst EN='+json.dumps(EN,ensure_ascii=False,separators=(',',':'))+';\n'+open('patterns.js').read()+open('engine.js').read()+'})();\n'
open('../assets/i18n.js','w').write(js)
print(len(EN),'Einträge')
