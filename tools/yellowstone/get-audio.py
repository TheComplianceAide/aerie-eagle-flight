import concurrent.futures, json, os
from pathlib import Path
import re, subprocess, urllib.request
source, out=map(Path,os.sys.argv[1:])
out.mkdir(parents=True,exist_ok=True)
clips={
 'faithful':('sounds-oldfaithful','-00150325',0,92),
 'hill-runoff':('sounds-soundscapes','GeyserHillStreamOff',0,62),
 'hill-birds':('sounds-soundscapes','NearSulphide',7,104),
 'pine-wind':('sounds-soundscapes','LowerGeyserBasinWind',0,108),
 'castle':('sounds-castlegeyser','CastleGeyser',0,65),
 'grand':('sounds-grandgeyser','GrandMix',0,104),
 'beehive':('sounds-beehivegeyser','BeehiveMix',0,80),
 'blacksand':('sounds-blacksandpool','ImplodingBubbles',0,84),
 'cliff':('sounds-cliffgeyser','ThermalPoolNearCliffside',0,65),
 'anemone':('sounds-anemone-geysers','DrainingSony',0,65),
 'sawmill':('sounds-sawmillgeyser','SawmillGeyser2',0,58),
 'fountain':('sounds-fountainpaintpots','FountainPaintPot',0,72),
 'dipper':('sounds-dipper','DipperandGeeseFirehole',0,75),
 'raven':('sounds-raven','RavenBlackSand',0,50),
 'bison':('sounds-bison','YELLMM8K2005914',0,35),
 'elk':('sounds-elk','-ElkBugle1',0,30),
 'river':('sounds-dipper','DipperandGeeseFirehole',0,75),
 'midway':('vl_grandprismatic','MGBasin00547MTS1_480x270',0,95),
}
general=json.loads((source/'audio-urls.json').read_text())
def get(item):
 name,(page,match,start,length)=item
 try:
  urls=general.get(page) or sorted(set(re.findall(r'https?://[^\s"\x27<>]+\.(?:mp3|mp4)',(source/(page+'.html')).read_text())))
  url=next(x for x in urls if match in x)
  dest=out/(name+'.m4a')
  infile=source/('recording-'+name+'.'+url.rsplit('.',1)[1])
  if not infile.exists():
   with urllib.request.urlopen(url,timeout=45) as r:infile.write_bytes(r.read())
  audio_filter={
      'river':'highpass=f=112,lowpass=f=890,volume=17dB,alimiter=limit=0.74',
      'midway':'highpass=f=75,volume=13dB,alimiter=limit=0.79',
  }.get(name,'highpass=f=38')
  cmd=[os.environ['FF'],'-hide_banner','-nostdin','-loglevel','error','-y','-i',str(infile),'-map','0:a:0','-ss',str(start),'-t',str(length),'-af',audio_filter,'-ac','2','-ar','44100','-c:a','aac','-b:a','112k','-movflags','+faststart',str(dest)]
  subprocess.run(cmd,check=True)
  print(name,dest.stat().st_size,flush=True)
  return name,{'page':f'https://www.nps.gov/yell/learn/photosmultimedia/{page}.htm','recording':url}
 except Exception as ex:print(name,type(ex).__name__,ex,flush=True);return name,None
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: result=dict(pool.map(get,clips.items()))
(out/'recordings.json').write_text(json.dumps({k:v for k,v in result.items() if v},indent=2)+'\n')
