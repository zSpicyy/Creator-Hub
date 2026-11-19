import struct,sys,io
from playwright.sync_api import sync_playwright
svg,out=sys.argv[1],sys.argv[2]
sizes=[256,64,48,32,16]
pngs=[]
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':256,'height':256})
    for s in sizes:
        pg.set_viewport_size({'width':s,'height':s})
        open('/tmp/_i.html','w').write(f'<body style="margin:0;background:transparent"><img src="file://{svg}" width={s} height={s} style="display:block">')
        pg.goto('file:///tmp/_i.html')
        pg.wait_for_timeout(150)
        pngs.append(pg.screenshot(omit_background=True,clip={'x':0,'y':0,'width':s,'height':s}))
n=len(sizes)
# Ressourcenbaum
def dirhdr(ne): return struct.pack('<IIHHHH',0,0,0,0,0,ne)
root_sz=16+2*8; t3_sz=16+n*8; t14_sz=16+8; lang_sz=16+8
off_t3=root_sz; off_t14=off_t3+t3_sz
off_lang=off_t14+t14_sz               # n+1 Sprachverzeichnisse
off_data=off_lang+(n+1)*lang_sz       # n+1 Dateneintraege
off_blob=off_data+(n+1)*16
blobs=[];offs=[];cur=off_blob
grp=struct.pack('<HHH',0,1,n)
for i,(s,png) in enumerate(zip(sizes,pngs)):
    grp+=struct.pack('<BBBBHHIH',0 if s>=256 else s,0 if s>=256 else s,0,0,1,32,len(png),i+1)
allb=pngs+[grp]
for bl in allb:
    offs.append(cur);cur+=(len(bl)+3)//4*4
sec=bytearray()
sec+=dirhdr(2)+struct.pack('<II',3,0x80000000|off_t3)+struct.pack('<II',14,0x80000000|off_t14)
sec+=dirhdr(n)
for i in range(n): sec+=struct.pack('<II',i+1,0x80000000|(off_lang+i*lang_sz))
sec+=dirhdr(1)+struct.pack('<II',1,0x80000000|(off_lang+n*lang_sz))
for i in range(n+1): sec+=dirhdr(1)+struct.pack('<II',0x409,off_data+i*16)
relocs=[]
for i,bl in enumerate(allb):
    relocs.append(len(sec))
    sec+=struct.pack('<IIII',offs[i],len(bl),0,0)
for i,bl in enumerate(allb):
    sec+=bl+b'\0'*((-len(bl))%4)
assert len(sec)==cur
ptr=20+40
rel_ptr=ptr+len(sec)
sym_ptr=rel_ptr+len(relocs)*10
f=struct.pack('<HHIIIHH',0x8664,1,0,sym_ptr,1,0,0)
f+=struct.pack('<8sIIIIIIHHI',b'.rsrc',0,0,len(sec),ptr,rel_ptr,0,len(relocs),0,0xC0000040)
f+=bytes(sec)
for r in relocs: f+=struct.pack('<IIH',r,0,3)
f+=struct.pack('<8sIhHBB',b'.rsrc',0,1,0,3,0)+struct.pack('<I',4)
open(out,'wb').write(f)
print('ok',len(f))
