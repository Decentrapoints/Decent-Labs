"""Render a layout proof using the release artwork and resolved WALTER geometry.
This is an asset/layout proof, not a screenshot of REAPER's native renderer.
"""
import io
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw, ImageFont
import build
from test_theme import positions


def font(size, bold=False):
    choices=[Path('C:/Windows/Fonts')/('seguisb.ttf' if bold else 'segoeui.ttf'),
             Path('/usr/share/fonts/truetype/dejavu')/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')]
    for path in choices:
        if path.exists():return ImageFont.truetype(str(path),size)
    return ImageFont.load_default(size=size)


def render(section, variant, w, h, title='Rhythm / left', selected=False):
    im=Image.new('RGBA',(w,h),(*build.C['selected' if selected else 'panel'],255))
    draw=ImageDraw.Draw(im);draw.line((0,h-1,w,h-1),fill=build.C['line'])
    if selected:draw.line((1,1,1,h-2),fill=build.C['accent'],width=3)
    rects=positions(section,1,variant,w,h)
    text={'label':title,'trackidx':'01','volume.label':'−6.0 dB','pan.label':'Center',
          'width.label':'100%','recinput':'Input 1 / DI','value':'0.00 dB','bpm.edit':'92.0',
          'bpm.tap':'TAP','curtimesig':'4 / 4','rate':'1.000','sel':'1.1.00 — 9.1.00','status':'001.1.00 / 00:00.000'}
    prefix='mcp' if 'mcp' in section else 'track'
    buttons={'mute':prefix+'_mute_off','solo':prefix+'_solo_off','recarm':'track_recarm_on' if variant=='Recording' else 'track_recarm_off',
             'fx':prefix+'_fx_norm','io':prefix+'_io','env':prefix+'_env','recmon':prefix+'_monitor_on',
             'phase':prefix+'_phase_norm','recmode':prefix+'_recmode_in','folder':'track_folder_off','foldercomp':'track_fcomp_off',
             'mono':'mcp_mono','arm':'envcp_arm_off','bypass':'envcp_bypass_off','hide':'envcp_hide','learn':'envcp_learn','mod':'envcp_parammod',
             'rew':'transport_home','stop':'transport_stop','play':'transport_play','pause':'transport_pause','rec':'transport_record',
             'repeat':'transport_repeat_on','fwd':'transport_end'}
    for key,rect in rects.items():
        x,y,rw,rh=[round(v) for v in rect]
        if key in buttons:
            data=archive.read('DLS_Satsu/'+buttons[key]+'.png');sprite=Image.open(io.BytesIO(data)).convert('RGBA')
            sprite=sprite.crop((0,0,sprite.width//3,sprite.height)).resize((rw,rh),Image.Resampling.LANCZOS)
            im.alpha_composite(sprite,(x,y))
        elif key in text:
            if key in ['recinput','status','bpm.edit']:
                draw.rounded_rectangle((x,y,x+rw-1,y+rh-1),radius=5,fill=build.C['base'])
            face=font(13 if key!='status' else 18,key in ['label','bpm.edit'])
            label=text[key];box=draw.textbbox((0,0),label,font=face)
            # Label clipping matches the bounds of the real control.
            clip=Image.new('RGBA',(rw,rh));cd=ImageDraw.Draw(clip)
            tx=4 if key in ['label','recinput'] else max(2,(rw-(box[2]-box[0]))//2)
            cd.text((tx,(rh-(box[3]-box[1]))//2-box[1]),label,font=face,fill=build.C['text' if key=='label' else 'muted'])
            im.alpha_composite(clip,(x,y))
        elif key in ['volume','pan','width','fader','rate.fader']:
            vertical=key=='volume' and 'mcp' in section
            stem='mcp_vol' if vertical else 'tcp_pan' if key=='pan' else 'tcp_vol'
            bg=Image.open(io.BytesIO(archive.read('DLS_Satsu/'+stem+'bg.png'))).convert('RGBA').resize((rw,rh))
            im.alpha_composite(bg,(x,y))
            if key=='pan' and 'tcp' in section:
                draw.ellipse((x+rw//2-7,y+rh//2-7,x+rw//2+7,y+rh//2+7),fill=build.C['raised'],outline=build.C['line'])
                draw.line((x+rw//2,y+rh//2-6,x+rw//2,y+rh//2+1),fill=build.C['accent'],width=2)
            else:
                thumb=Image.open(io.BytesIO(archive.read('DLS_Satsu/'+stem+'thumb.png'))).convert('RGBA')
                im.alpha_composite(thumb,(x+(rw-thumb.width)//2,y+int(rh*.45)) if vertical else (x+int(rw*.58),y+(rh-thumb.height)//2))
        elif key=='meter':
            draw.rectangle((x,y,x+rw-1,y+rh-1),fill=build.C['base'])
            for chan in [0,1]:
                half=rw//2;cx=x+chan*half
                for v in range(int(rh*(.62 if chan==0 else .55))):
                    draw.line((cx+1,y+rh-3-v,cx+half-2,y+rh-3-v),fill=build.mix(build.C['green'],build.C['accent'],v/max(rh,1)))
        elif key=='extmixer.position' or key=='fxparm':
            draw.rectangle((x,y,x+rw-1,y+rh-1),fill=build.C['base'])
            for index,label in enumerate(['ReaEQ','ReaComp','Room / send']):
                if index*22+22>rh:break
                draw.text((x+5,y+index*22+3),label,font=font(11),fill=build.C['muted'])
                draw.line((x,y+index*22+21,x+rw,y+index*22+21),fill=build.C['line'])
    return im


if __name__=='__main__':
    out=build.ROOT.parent.parent/'test-results'/'reaper-theme-proof.png';out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(build.ROOT/'dist'/'DLS Satsu.ReaperThemeZip') as archive:
        sheet=Image.new('RGBA',(1600,1120),(*build.C['base'],255));d=ImageDraw.Draw(sheet)
        d.text((40,28),'DLS / SATSU',font=font(14,True),fill=build.C['accent'])
        d.text((40,58),'A quieter space for your next session.',font=font(30,True),fill=build.C['text'])
        d.text((40,108),'NATIVE REAPER THEME  /  ORIGINAL ARTWORK  /  100 · 150 · 200%',font=font(12),fill=build.C['muted'])
        left=40;y=162
        for variant,height,label in [('Studio',108,'STUDIO'),('Compact',64,'COMPACT'),('Recording',168,'RECORDING')]:
            d.text((left,y),label,font=font(11,True),fill=build.C['muted']);y+=24
            sheet.alpha_composite(render('tcp',variant,430,height,selected=variant=='Recording'),(left,y));y+=height+30
        d.text((40,656),'ENVELOPE / AUTOMATION',font=font(11,True),fill=build.C['muted'])
        sheet.alpha_composite(render('envcp','Studio',430,64,'Volume'),(40,680))
        d.text((520,162),'MIXER / STUDIO + COMPACT + INSPECTOR + MASTER',font=font(11,True),fill=build.C['muted'])
        x=520
        for section,variant,width,title in [('mcp','Studio',124,'Rhythm L'),('mcp','Studio',124,'Rhythm R'),('mcp','Compact',92,'Bass'),('mcp','Inspector',232,'Lead guitar'),('master.mcp','Studio',156,'MASTER')]:
            sheet.alpha_composite(render(section,variant,width,560,title,selected=title=='Lead guitar'),(x,190));x+=width+12
        d.text((40,800),'TRANSPORT / TEMPO + SIGNATURE + PRACTICE RATE',font=font(11,True),fill=build.C['muted'])
        sheet.alpha_composite(render('trans','Studio',1520,64),(40,824))
        d.text((40,936),'Designed to keep the music in front.',font=font(23,True),fill=build.C['text'])
        d.text((40,974),'Lavender selection · mint meters · rose recording · native controls and routing',font=font(15),fill=build.C['muted'])
        d.text((40,1048),'LAYOUT PROOF — rendered from the shipped artwork and WALTER geometry; not a native REAPER screenshot.',font=font(12),fill=build.C['muted'])
        sheet.convert('RGB').save(out)
        print(out)
