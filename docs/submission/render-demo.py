import json, subprocess
from pathlib import Path

root=Path(__file__).resolve().parents[2]
media=root/'output/playwright/submission'
timeline=json.loads((root/'docs/submission/timeline.json').read_text(encoding='utf-8'))
tokens=(root/'packages/overlay/src/tokens.css').read_text()
def token(name):
    import re
    return re.search(r'--'+name+r':\s*(#[0-9a-fA-F]+)',tokens)[1]
background=token('background');muted=token('muted')
def run(args):
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','warning',*args],cwd=root,check=True)

def render(name,file,start,input_seconds,duration,label):
    output=media/(name+'.mp4')
    if output.exists():
        return output
    speed=input_seconds/duration
    filt=(f'trim=duration={input_seconds:.5f},setpts=(PTS-STARTPTS)/{speed:.8f},fps=30,'
          f'scale=1712:963:flags=lanczos,pad=1920:1080:104:0:color={background},setsar=1,'
          f"drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='{label}':x=104:y=974:fontsize=20:fontcolor={muted},format=yuv420p")
    run(['-ss',str(start),'-i',str(media/file),'-an','-vf',filt,'-t',str(duration),'-c:v','libx264','-preset','fast','-crf','20','-threads','4',str(output)])
    return output

segments=timeline['segments'];renders=[];edit=[]
specs=[
 ('archive.webm',6.5,None,'Browser archive - instant demo'),
 ('live-complete.webm',0,None,'Live Codex - actual recorded run'),
 ('live-complete.webm',15,39,'Live Codex - wait accelerated 1.8x'),
 ('cards.webm',1,None,'Exact generated mod excerpt - actual verification results'),
 ('live-complete.webm',52,None,'Live Codex - patch applied without a reload'),
 None,
 ('archive.webm',5,None,'Browser demo - preverified archive, no live generation'),
 ('cards.webm',26,None,'Play online - run locally for new AI-generated rules'),
]
for i,scene in enumerate(segments):
    duration=scene['duration'];spec=specs[i]
    if i==5:
        a=render('06a','archive.webm',16,8.5,8.5,'Archive run - a fourth patch expires the oldest')
        b=render('06b','watchdog.webm',69,duration-8.5,duration-8.5,'Live watchdog test - automatic revert after 70 seconds')
        listing=media/'watchdog.ffconcat'
        listing.write_text(f"file '{a.as_posix()}'\nfile '{b.as_posix()}'\n")
        output=media/(scene['id']+'.mp4')
        run(['-f','concat','-safe','0','-i',str(listing),'-c','copy',str(output)])
        edit.append({'scene':scene['id'],'sources':[{'file':'archive.webm','in':16,'duration':8.5},{'file':'watchdog.webm','in':69,'duration':duration-8.5}]})
    else:
        file,start,input_seconds,label=spec
        output=render(scene['id'],file,start,input_seconds or duration,duration,label)
        edit.append({'scene':scene['id'],'file':file,'in':start,'sourceSeconds':input_seconds or duration,'duration':duration,'label':label})
    renders.append(output)
    print('Rendered',scene['id'],flush=True)

listing=media/'picture.ffconcat'
listing.write_text(''.join(f"file '{p.as_posix()}'\n" for p in renders))
run(['-f','concat','-safe','0','-i',str(listing),'-c','copy',str(media/'picture.mp4')])
filters=("[1:a]aresample=48000,loudnorm=I=-16:TP=-2:LRA=7[voice];"
         "[2:a]aresample=48000,volume=0.28[bed];"
         "[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.891:level=false[a];"
         "[0:v]subtitles=docs/submission/captions.srt:force_style='FontName=Segoe UI,FontSize=9,Outline=0,Shadow=0,MarginV=4,PrimaryColour=&H00E5EEF3,Alignment=2'[v]")
target=media/'Patch_Notes_Live_Demo_v1_1080p.mp4'
run(['-i',str(media/'picture.mp4'),'-i',str(media/'narration.wav'),'-i',str(media/'bed.wav'),'-filter_complex',filters,'-map','[v]','-map','[a]','-t',str(timeline['durationSeconds']),'-c:v','libx264','-preset','fast','-crf','20','-threads','4','-c:a','aac','-b:a','192k','-movflags','+faststart',str(target)])
(root/'docs/submission/edit.json').write_text(json.dumps({'resolution':'1920x1080','fps':30,'segments':edit,'audio':'Deepgram Aura 2 Apollo; original synthesized music bed; no stock music','captionSource':'Deepgram transcription of the actual synthesized narration, manually reviewed'},indent=2)+'\n')
print(str(target),flush=True)
