"""Build the local file-mode game. Only the selected flight region is decoded into memory."""
from pathlib import Path
from tempfile import NamedTemporaryFile
import re,base64,mimetypes,gzip,sys
root=Path(__file__).resolve().parent.parent
dist=root/'game'
output=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'Aerie.html'
html=(dist/'index.html').read_text()
css=(dist/'style.css').read_text()
assert not re.search(r'url\([^)]*\.(?:webp|jpg|png)\)',css), 'Menu photos must use the same asset resolver as the scene.'
html=re.sub(r'<link rel="stylesheet" href="style\.css(?:\?[^"]*)?">',lambda _:'<style>'+css+'</style>',html)
script_src=r'<script src="([^"?]+)(?:\?[^"]*)?"></script>'
attached=set(re.findall(script_src,html))
# The title and favicon load before the asset resolver in a standalone file.
title_images = {'field-engraving.webp': 'image/webp', 'aerie-icon-64.png': 'image/png'}
for name, mime in title_images.items():
    data = base64.b64encode((dist/name).read_bytes()).decode('ascii')
    html = html.replace(f'"{name}"', f'"data:{mime};base64,{data}"')
attached.update(title_images)
def safe(text):return re.sub('</script',r'<\\/script',text,flags=re.I)
def embed(m):
    name=m[1];source=(dist/name).read_text()
    if name=='three.min.js':source+='\n/* '+(dist/'three-LICENSE.txt').read_text()+' */'
    return '<script>'+safe(source)+'</script>'
before,after=html.split('<script src="three.min.js"></script>',1)
after=re.sub(script_src,embed,'<script src="three.min.js"></script>'+after)
resolver="""<script>
(()=>{const cache=new Map();
window.aerieAssetURL=file=>{
  if(cache.has(file))return cache.get(file);
  const el=document.getElementById('offline:'+file);
  if(!el)return file;
  let data=el.textContent;
  if(el.dataset.encoding==='base64'||el.dataset.encoding==='gzip'){
    if(Uint8Array.fromBase64)data=Uint8Array.fromBase64(data);
    else{const str=atob(data);data=new Uint8Array(str.length);for(let i=0;i<str.length;i++)data[i]=str.charCodeAt(i);}
  }
  if(el.dataset.encoding==='gzip')data=window.pako.inflate(data);
  const url=URL.createObjectURL(new Blob([data],{type:el.dataset.mime}));
  cache.set(file,url);el.remove();return url;
};})();
</script>"""
after=after.replace('</script>','</script><script>THREE.DefaultLoadingManager.setURLModifier(window.aerieAssetURL);</script>',1)
with NamedTemporaryFile('w',dir=output.parent,prefix='.Aerie-',delete=False) as f:
    dest=Path(f.name);f.write(before)
    for notice in [root/'LICENSE.md',*sorted((root/'LICENSES').iterdir())]:
        f.write('<script type="text/plain" data-license="'+notice.name+'">'+safe(notice.read_text())+'</script>\n')
    codec=root/'tools/pako'
    f.write('<script>'+safe((codec/'pako_inflate.min.js').read_text())+'\n/* '+(codec/'LICENSE').read_text()+' */</script>')
    for p in sorted(dist.rglob('*')):
        if not p.is_file():continue
        name=p.relative_to(dist).as_posix()
        if name in attached or name in {'style.css','index.html','three-LICENSE.txt'}:continue
        if p.suffix=='.js' and p.stat().st_size>64000:
            content=base64.b64encode(gzip.compress(p.read_bytes(),compresslevel=8,mtime=0)).decode()
            mime='text/javascript';encoding='gzip'
        elif p.suffix=='.json':
            content=base64.b64encode(p.read_bytes()).decode('ascii');mime='application/json';encoding='base64'
        elif p.suffix in {'.js','.txt'}:
            content=safe(p.read_text());mime='text/javascript' if p.suffix=='.js' else 'text/plain;charset=utf-8';encoding='text'
        elif p.suffix in {'.jpg','.jpeg','.png','.webp','.mp3','.m4a','.ogg','.wav','.opus','.bin','.glb','.mesh'}:
            content=base64.b64encode(p.read_bytes()).decode();mime=mimetypes.guess_type(name)[0] or 'application/octet-stream';encoding='base64'
        else:continue
        f.write(f'<script type="application/octet-stream" id="offline:{name}" data-mime="{mime}" data-encoding="{encoding}">{content}</script>\n')
    f.write(resolver);f.write(after)
dest.chmod(0o644);dest.replace(output)
