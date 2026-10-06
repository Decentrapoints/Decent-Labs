"""Build the original DLS Satsu REAPER theme. Python 3.11+ / Pillow 12.3.0.

Every image is drawn here; no Cockos or third-party theme artwork is copied.
The shipped archive is ready to use without Python. ZIP metadata is fixed.
--check verifies generated sources, decoded artwork, and release checksums;
PNG/ZIP compressed bytes may vary between platform compression libraries.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import zipfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
NAME = "DLS Satsu"
FOLDER = "DLS_Satsu"
C = {
    "base": (17, 18, 22), "panel": (25, 26, 32), "raised": (34, 35, 43),
    "line": (48, 48, 58), "muted": (171, 166, 185), "text": (238, 237, 243),
    "accent": (186, 167, 237), "selected": (43, 37, 57), "green": (143, 210, 171),
    "red": (239, 139, 157), "amber": (227, 190, 126), "paper": (242, 235, 220),
}
PINK = (255, 0, 255, 255)


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


class Canvas:
    """Small supersampled vector drawing surface, independent of system fonts."""
    def __init__(self, w, h, scale=1, fill=(0, 0, 0, 0)):
        self.w, self.h, self.scale = w, h, scale
        self.k = 4 * scale
        self.im = Image.new("RGBA", (round(w*self.k), round(h*self.k)), fill)
        self.d = ImageDraw.Draw(self.im)

    def box(self, xy):
        return tuple(round(v*self.k) for v in xy)

    def rect(self, xy, fill, radius=0, outline=None, width=1):
        self.d.rounded_rectangle(self.box(xy), radius=round(radius*self.k),
                                 fill=fill, outline=outline, width=max(1, round(width*self.k)))

    def line(self, points, color, width=1):
        self.d.line([self.box(p) for p in points], fill=color,
                    width=max(1, round(width*self.k)), joint="curve")

    def ellipse(self, xy, fill=None, outline=None, width=1):
        self.d.ellipse(self.box(xy), fill=fill, outline=outline, width=max(1, round(width*self.k)))

    def polygon(self, points, fill):
        self.d.polygon([self.box(p) for p in points], fill=fill)

    def image(self):
        return self.im.resize((round(self.w*self.scale), round(self.h*self.scale)), Image.Resampling.LANCZOS)


# Original 3x5 lettering for tiny functional button labels. Native labels use
# REAPER's theme font, not baked artwork. Each letter is a row bitmask.
LETTERS = {
    "A": [2,5,7,5,5], "B": [6,5,6,5,6], "C": [3,4,4,4,3],
    "D": [6,5,5,5,6], "E": [7,4,6,4,7], "F": [7,4,6,4,4],
    "G": [3,4,5,5,3], "H": [5,5,7,5,5], "I": [7,2,2,2,7],
    "J": [1,1,1,5,2], "K": [5,5,6,5,5], "L": [4,4,4,4,7],
    "M": [5,7,7,5,5], "N": [5,7,7,7,5], "O": [2,5,5,5,2],
    "P": [6,5,6,4,4], "Q": [2,5,5,3,1], "R": [6,5,6,5,5],
    "S": [3,4,2,1,6], "T": [7,2,2,2,2], "U": [5,5,5,5,7],
    "V": [5,5,5,5,2], "W": [5,5,7,7,5], "X": [5,5,2,5,5],
    "Y": [5,5,2,2,2], "Z": [7,1,2,4,7], " ": [0]*5,
}


def letters(c, label, x, y, color, size=1):
    for i, char in enumerate(label):
        for row, mask in enumerate(LETTERS[char]):
            for col in range(3):
                if mask & (4 >> col):
                    c.rect((x+(i*4+col)*size, y+row*size,
                            x+(i*4+col+1)*size-.12, y+(row+1)*size-.12), color)


def icon(c, name, x, y, color):
    # 18x18 drawing box.
    def line(p, width=1.5): c.line([(x+a,y+b) for a,b in p], color, width)
    def poly(p): c.polygon([(x+a,y+b) for a,b in p], color)
    if name == "play": poly([(5,3),(15,9),(5,15)])
    elif name == "stop": c.rect((x+4,y+4,x+14,y+14), color, 2)
    elif name == "pause":
        c.rect((x+4,y+3,x+7,y+15), color, 1); c.rect((x+11,y+3,x+14,y+15), color, 1)
    elif name == "record": c.ellipse((x+4,y+4,x+14,y+14), fill=color)
    elif name in ("rew", "fwd"):
        pts = [(12,4),(5,9),(12,14)] if name == "rew" else [(6,4),(13,9),(6,14)]
        poly(pts); line([(3,4),(3,14)] if name == "rew" else [(15,4),(15,14)])
    elif name == "repeat":
        line([(4,12),(2,12),(2,5),(14,5)]); poly([(12,2),(17,5),(12,8)])
        line([(14,7),(16,7),(16,14),(4,14)]); poly([(6,11),(1,14),(6,17)])
    elif name == "monitor":
        poly([(2,7),(5,7),(9,3),(9,15),(5,11),(2,11)])
        line([(12,5),(14,7),(14,11),(12,13)])
    elif name == "phase":
        c.ellipse((x+4,y+4,x+14,y+14), outline=color, width=1.4); line([(3,15),(15,3)])
    elif name == "folder":
        line([(2,5),(7,5),(9,7),(16,7),(16,14),(2,14),(2,5)])
    elif name == "chevron": line([(5,7),(9,11),(13,7)])
    elif name == "up": line([(5,11),(9,7),(13,11)])
    elif name == "save":
        line([(3,3),(13,3),(15,5),(15,15),(3,15),(3,3)]); line([(6,3),(6,7),(12,7),(12,3)])
        c.rect((x+6,y+10,x+12,y+15), None, outline=color)
    elif name == "new":
        line([(4,2),(11,2),(14,5),(14,16),(4,16),(4,2)]); line([(9,7),(9,13)]); line([(6,10),(12,10)])
    elif name == "open":
        line([(2,14),(2,5),(7,5),(9,7),(16,7)]); line([(2,14),(5,9),(17,9),(14,14),(2,14)])
    elif name in ("undo", "redo"):
        line([(4,6),(12,6),(15,9),(15,13)] if name=="undo" else [(14,6),(6,6),(3,9),(3,13)])
        poly([(6,3),(2,6),(6,9)] if name=="undo" else [(12,3),(16,6),(12,9)])
    elif name == "grid":
        for a in (4,9,14): line([(a,3),(a,15)],1); line([(3,a),(15,a)],1)
    elif name == "snap":
        line([(3,3),(3,11),(6,14),(12,14),(15,11),(15,3)],2)
        line([(3,7),(6,7)],2); line([(12,7),(15,7)],2)
    elif name == "crossfade": line([(2,4),(16,14)],1.5); line([(2,14),(16,4)],1.5)
    elif name == "lock":
        c.rect((x+4,y+8,x+14,y+15), None, 2, color,1.5)
        line([(6,8),(6,4),(9,2),(12,4),(12,8)])
    elif name == "note":
        line([(7,13),(7,4),(14,2),(14,11)]); c.ellipse((x+3,y+11,x+7,y+15), fill=color)
        c.ellipse((x+10,y+9,x+14,y+13), fill=color)
    elif name == "env": line([(2,13),(6,5),(11,11),(16,3)]); c.ellipse((x+4,y+3,x+8,y+7),fill=color)
    elif name == "ripple":
        for a in (3,8,13): line([(a,4),(a,14)],2)
    elif name == "routing":
        line([(3,3),(3,9),(14,9),(14,15)]); line([(9,9),(9,3)])
        for a,b in [(3,3),(9,3),(14,15)]: c.ellipse((x+a-2,y+b-2,x+a+2,y+b+2),fill=color)
    elif name == "learn": line([(3,14),(7,5),(11,12),(15,3)])
    elif name == "mono":
        c.ellipse((x+3,y+5,x+11,y+13),outline=color,width=1.5); c.ellipse((x+7,y+5,x+15,y+13),outline=color,width=1.5)
    else:
        label = name.upper()
        letters(c,label,x+(18-(len(label)*4-1)*1.25)/2,y+6,color,1.25)


def button(name, scale=1, active=False, tone="accent", w=26, h=26, vertical=False):
    c = Canvas(w if vertical else w*3, h*3 if vertical else h, scale)
    for state in range(3):
        x, y = (0,state*h) if vertical else (state*w,0)
        bg = C["raised"] if not active else mix(C[tone],C["panel"],.78)
        border = C["line"] if not active else mix(C[tone],C["panel"],.45)
        if state==1: bg=mix(bg,C[tone],.14);border=mix(border,C[tone],.35)
        if state==2: bg=mix(bg,C["base"],.3)
        c.rect((x+1,y+1,x+w-1,y+h-1),bg,5,border,.7)
        icon(c,name,x+(w-18)/2,y+(h-18)/2,C[tone] if active else (C["text"] if state==1 else C["muted"]))
    return c.image()


def background(w,h,scale=1,selected=False,kind="panel"):
    # One pixel metadata border; preserve the outline and stripe when stretched.
    c = Canvas(w,h,scale,(*C["selected" if selected else kind],255))
    c.line([(0,h-1),(w,h-1)], C["line"],1)
    if selected: c.line([(1,1),(1,h-2)],C["accent"],2)
    im = c.image()
    framed=Image.new("RGBA",(im.width+2,im.height+2));framed.paste(im,(1,1))
    d=ImageDraw.Draw(framed)
    for p in [((0,0),(round(5*scale),0)),((0,0),(0,round(5*scale))),
              ((framed.width-1,framed.height-1),(framed.width-1-round(5*scale),framed.height-1)),
              ((framed.width-1,framed.height-1),(framed.width-1,framed.height-1-round(5*scale)))]:
        d.line(p,fill=PINK,width=1)
    return framed


def fader(scale, vertical=False, thumb=False):
    w,h = ((28,14) if thumb else (28,180)) if vertical else ((14,24) if thumb else (180,24))
    c=Canvas(w,h,scale)
    if thumb:
        c.rect((1,1,w-1,h-1),C["accent"],3,mix(C["accent"],C["text"],.2),.7)
        if vertical: c.line([(5,h/2),(w-5,h/2)],C["selected"],1.4)
        else: c.line([(w/2,5),(w/2,h-5)],C["selected"],1.4)
    else:
        # Opaque hit area covers the entire lane; groove stays subdued.
        c.rect((0,0,w,h),C["panel"],0)
        if vertical:
            c.rect((w/2-2,2,w/2+2,h-2),C["base"],2)
            for y in range(6,h-4,14): c.line([(4,y),(8,y)],C["line"],1); c.line([(w-8,y),(w-4,y)],C["line"],1)
        else: c.rect((3,h/2-2,w-3,h/2+2),C["base"],2)
    return c.image()


def meter(scale,vertical=False,master=False):
    slices = 8 if master or not vertical else 4
    w,h=(8*slices,160) if vertical else (160,8*slices)
    c=Canvas(w,h,scale,(*C["base"],255))
    for idx in range(slices):
        lit = idx >= slices//2 if vertical else idx%4>=2
        for p in range(128):
            fraction=(127-p)/127 if vertical else p/127
            color=mix(C["green"],C["accent"],fraction)
            if fraction>.85:color=mix(C["accent"],C["amber"],(fraction-.85)/.15)
            if not lit:color=mix(C["base"],color,.12)
            if vertical: c.line([(idx*8+1,p+32),(idx*8+6,p+32)],color,1)
            else: c.line([(p,idx*8+1),(p,idx*8+6)],color,1)
        if vertical:c.rect((idx*8+1,1,idx*8+6,30),C["red"] if lit else C["raised"],1)
        else:c.rect((130,idx*8+1,159,idx*8+6),C["red"] if lit else C["raised"],1)
    return c.image()


def knob(scale):
    c=Canvas(28,28*65,scale)
    for i in range(65):
        y=i*28
        c.ellipse((2,y+2,26,y+26),fill=C["raised"],outline=C["line"],width=1)
        angle=math.radians(135+i*270/64)
        c.line([(14,y+14),(14+9*math.cos(angle),y+14+9*math.sin(angle))],C["accent"],2)
    return c.image()


def scrollbar(scale):
    # Fixed REAPER scrollbar atlas coordinates at each image DPI.
    im=Image.new("RGBA",(204,238),(*C["base"],255));d=ImageDraw.Draw(im)
    for xy in [(0,0,203,16),(0,17,203,33),(170,37,186,237),(187,37,203,237)]:d.rectangle(xy,fill=C["panel"])
    for idx,tone in enumerate(["line","muted","accent"]):
        d.rounded_rectangle((2,39+idx*17,165,51+idx*17),radius=5,fill=C[tone])
        d.rounded_rectangle((2+idx*17,93,14+idx*17,236),radius=5,fill=C[tone])
    for row,ic in enumerate(["up","chevron","fwd","rew","play","stop"]):
        for state in range(3):
            cell=Canvas(17,17);icon(cell,ic,-.5,-.5,C["muted"] if state==0 else C["accent"])
            im.alpha_composite(cell.image(),(116+17*state,121+20*row))
    for xy in [(0,35,5,35),(198,35,203,35),(168,37,168,42),(168,232,168,237),
               (0,89,5,89),(80,89,86,89),(162,89,167,89),(52,91,52,96),(52,160,52,167),(52,232,52,237)]:d.line(xy,fill=PINK)
    return im.resize((round(204*scale),round(238*scale)),Image.Resampling.NEAREST)


def assets(scale):
    images={}
    for name in ["tcp","tcp_folder","tcp_main","mcp","mcp_main","envcp"]:
        w,h=(120,180) if name.startswith("mcp") else (320,100)
        images[name+"_bg"]=background(w,h,scale)
        images[name+"_bgsel"]=background(w,h,scale,True)
    for name in ["tcp_namebg","tcp_idxbg","mcp_namebg","mcp_idxbg","mcp_main_namebg","tcp_main_namebg",
                 "toolbar_bg","transport_bg","transport_status_bg","transport_bpm_bg","transport_edit_bg",
                 "mcp_fxlist_bg","mcp_sendlist_bg","mcp_fxparm_bg","mcp_extmixbg","tcp_fxlist_bg","tcp_sendlist_bg",
                 "tcp_recinput","mcp_recinput","tcp_vol_label","tcp_pan_label","tcp_wid_label"]:
        images[name]=background(64,28,scale,kind="base" if "list" in name or "transport" in name else "panel")
    for name in ["item_bg","item_bg_sel"]:images[name]=background(80,40,scale,name.endswith("sel"),kind="raised")
    for prefix in ["track","mcp","gen"]:
        for name,ic,tone in [("mute","m","red"),("solo","s","amber"),("phase","phase","accent"),
                             ("monitor","monitor","green"),("recarm","record","red")]:
            for state in ["off","on"]:images[f"{prefix}_{name}_{state}"]=button(ic,scale,state=="on",tone)
        images[f"{prefix}_phase_norm"]=button("phase",scale)
        images[f"{prefix}_phase_inv"]=button("phase",scale,True)
        images[f"{prefix}_monitor_auto"]=button("monitor",scale,True,"amber")
        images[f"{prefix}_mono"]=button("mono",scale)
        images[f"{prefix}_stereo"]=button("mono",scale,True)
        for suffix in ["", "_dis","_s","_r","_s_r","_s_dis","_r_dis","_s_r_dis"]:
            images[f"{prefix}_io{suffix}"]=button("routing",scale,bool(suffix and "dis" not in suffix))
        for state in ["empty","norm","dis"]:images[f"{prefix}_fx_{state}"]=button("fx",scale,state=="norm")
        for mode,label in [("","auto"),("_read","read"),("_touch","tch"),("_write","wrt"),("_latch","ltch"),("_preview","prev")]:
            images[f"{prefix}_env{mode}"]=button(label,scale,bool(mode),"red" if mode=="_write" else "accent",w=42)
        for state in ["in","out","off"]:images[f"{prefix}_recmode_{state}"]=button("in" if state=="in" else "out" if state=="out" else "off",scale,w=34)
    for name in ["auto","auto_on","auto_norec","norec"]:images["track_recarm_"+name]=button("record",scale,name=="auto_on","red")
    for suffix in ["on","off","last"]:images["track_folder_"+suffix]=button("folder",scale,suffix=="on")
    for suffix in ["off","small","tiny"]:images["track_fcomp_"+suffix]=button("chevron" if suffix=="off" else "up",scale)
    for mode in ["trim","read","touch","write","latch","preview","off","bypass"]:
        images["global_"+mode]=button(mode[:4],scale,mode!="trim","red" if mode=="write" else "accent",w=46)
    for stem,ic,tone in [("play","play","green"),("pause","pause","amber"),("record","record","red"),
                          ("stop","stop","accent"),("home","rew","accent"),("end","fwd","accent"),
                          ("previous","rew","accent"),("next","fwd","accent"),("repeat_off","repeat","accent"),
                          ("repeat_on","repeat","accent"),("tap","tap","accent"),("timebase_beat","note","accent"),
                          ("timebase_time","grid","accent")]:
        images["transport_"+stem]=button(ic,scale,stem=="repeat_on",tone,w=32,h=32)
        if stem in ["play","pause","record"]:images["transport_"+stem+"_on"]=button(ic,scale,True,tone,w=32,h=32)
    for variant in ["item","loop"]:
        for state in ["","_on"]:images["transport_record_"+variant+state]=button("record",scale,bool(state),"red",w=32,h=32)
    for stem,ic in [("new","new"),("open","open"),("save","save"),("undo","undo"),("redo","redo")]:images["toolbar_"+stem]=button(ic,scale,w=30,h=30)
    for stem,ic in [("grid","grid"),("snap","snap"),("xfade","crossfade"),("lock","lock"),
                    ("ripple","ripple"),("env","env"),("autoxfade","crossfade")]:
        for state in ["off","on"]:images[f"toolbar_{stem}_{state}"]=button(ic,scale,state=="on",w=30,h=30)
    images["toolbar_ripple_one"]=button("ripple",scale,True,w=30,h=30)
    images["toolbar_ripple_all"]=button("ripple",scale,True,"amber",w=30,h=30)
    for name,ic in [("arm","record"),("bypass","fx"),("hide","chevron"),("learn","learn"),("parammod","env")]:
        for state in ["off","on"]:images[f"envcp_{name}_{state}"]=button(ic,scale,state=="on","red" if name=="arm" else "accent")
        images["envcp_"+name]=button(ic,scale)
    for stem in ["mute","lock","fx","env","note","group","props","pooled"]:
        for state in ["off","on"]:images[f"item_{stem}_{state}"]=button(stem if stem in ["lock","fx","env","note"] else "m" if stem=="mute" else "routing",scale,state=="on",w=18,h=18)
    for context in ["tcp","mcp","gen"]:
        for stem in ["vol","pan","width"]:
            vertical=context=="mcp" and stem=="vol"
            images[f"{context}_{stem}bg"]=fader(scale,vertical)
            images[f"{context}_{stem}thumb"]=fader(scale,vertical,True)
            images[f"{context}_{stem}_knob_stack"]=knob(scale)
    images["envcp_faderbg"]=fader(scale);images["envcp_fader"]=fader(scale,False,True)
    images["transport_playspeedbg"]=fader(scale);images["transport_playspeedthumb"]=fader(scale,False,True)
    images["tcp_vu"]=meter(scale);images["mcp_vu"]=meter(scale,True);images["mcp_master_vu"]=meter(scale,True,True)
    images["scrollbar"]=scrollbar(scale)
    for context in ["mcp","mcp_master"]:
        for section in ["fxlist","sendlist","fxparm"]:
            for state in ["norm","byp","off","empty","mute"]:
                # Three vertically arranged states are part of REAPER's atlas contract.
                im=Image.new("RGBA",(round(110*scale),round(22*3*scale)))
                for idx in range(3):
                    color=C["base"] if state=="empty" else C["panel"] if idx==0 else C["raised"] if idx==1 else C["selected"]
                    cell=Canvas(110,22,scale,(*color,255));cell.line([(0,21),(110,21)],C["line"],.5)
                    im.alpha_composite(cell.image(),(0,round(idx*22*scale)))
                images[f"{context}_{section}_{state}"]=im
    return images


def vector(values, scale, attachment=False):
    out=[round(v*scale) if not attachment or i<4 else v for i,v in enumerate(values)]
    return "["+" ".join(str(v) for v in out)+"]"


def panel(section, scale=1, variant="Studio"):
    """Generate direct, auditable WALTER. Attachments keep bottom/right edges stable."""
    lines=[f"clear {section}.*"]
    def setting(key,val):lines.append(f"set {section}.{key} {val}")
    def box(key,v,when=None):
        expr=vector(v,scale,True)
        if when:
            for condition in reversed(when.format(s=scale).split()):expr=f"{condition} {expr} [0]"
        setting(key,expr)
    def color(key,c):setting(key,vector([*C[c],255],1))
    def label(key,align=0,font=1):
        color(key+".color","text")
        setting(key+".font",f"[{font if scale==1 else font+5 if scale==1.5 else font+10}]")
        setting(key+".margin",vector([4,0,4,0],scale)[:-1]+f" {align}]")
    if section in ["tcp","master.tcp"]:
        master=section.startswith("master")
        baseline=64 if variant=="Compact" else 168 if variant=="Recording" else 108
        setting("size",vector([380,baseline,280,32],scale))
        def header(key,v):
            short=v[:];short[1]=4;short[3]=min(24,v[3])
            setting(key,f"h>={round(40*scale)} {vector(v,scale,True)} {vector(short,scale,True)}")
        header("trackidx",[10,9,22,24]);label("trackidx",.5)
        header("label",[40,9,218,26,0,0,1,0]);label("label",0,2)
        if not master:header("recarm",[266,9,26,26,1,0,1,0])
        header("mute",[298,9,26,26,1,0,1,0]);header("solo",[330,9,26,26,1,0,1,0])
        # Compact rows still expose arm/mute/solo, gain, pan and live meters.
        box("volume",[40,43,144,18,0,0,1,0],f"h>={round(62*scale)}")
        setting("volume.fadermode","[-1]")
        box("volume.label",[190,43,54,18,1,0,1,0],f"h>={round(62*scale)}");label("volume.label",1)
        box("pan",[253,43,36,18,1,0,1,0],f"h>={round(62*scale)}");setting("pan.fadermode","[1]")
        box("meter",[362,8,10,baseline-16,1,0,1,1],f"h>={round(32*scale)}")
        row=f"h>={round(94*scale)}"
        box("fx",[40,70,34,24],row);box("io",[80,70,34,24],row)
        box("env",[120,70,46,24],row);box("phase",[172,70,26,24],row)
        if not master:
            box("recmon",[204,70,26,24],row);box("recmode",[236,70,34,24],row+f" w>={round(300*scale)}")
            box("folder",[10,70,24,24],row);box("foldercomp",[10,40,24,24],f"h>={round(64*scale)}")
            box("recinput",[40,102,170,24,0,0,1,0],f"h>={round(130*scale)}");label("recinput")
            box("pan.label",[278,70,78,24,1,0,1,0],row+f" w>={round(380*scale)}");label("pan.label",1)
            box("width",[218,102,62,24,1,0,1,0],f"h>={round(130*scale)}");setting("width.fadermode","[-1]")
            box("width.label",[286,102,70,24,1,0,1,0],f"h>={round(130*scale)}");label("width.label",1)
            box("fxparm",[40,136,316,baseline-148,0,0,1,1],f"h>={round(166*scale)}")
            setting("fxparm.font",f"[{1 if scale==1 else 6 if scale==1.5 else 11} {round(22*scale)}]")
        else:
            header("mono",[266,9,26,26,1,0,1,0]);box("pan.label",[204,70,152,24,0,0,1,0],row);label("pan.label",1)
    elif section in ["mcp","master.mcp"]:
        master=section.startswith("master")
        width=156 if master else 232 if variant=="Inspector" else 92 if variant=="Compact" else 124
        controls=124 if variant=="Inspector" else width
        upper=0 if variant=="Inspector" else .3
        height=480
        setting("size",vector([width,height,width,320],scale))
        box("label",[10,10,width-20,26]);label("label",.5,2)
        # Extended mixer lists are native REAPER FX/sends, not painted labels.
        setting("extmixer.mode","[1]")
        box("extmixer.position",[10,44,width-20,68,0,0,0,.3],f"h>={round(400*scale)}")
        for key in ["fxlist","sendlist","fxparm"]:
            setting(key+".font",f"[{1 if scale==1 else 6 if scale==1.5 else 11} {round(22*scale)}]")
            setting(key+".margin",vector([4,0,4,0],scale)[:-1]+" 0 0 0 0]")
        # The fader and meters stretch above the anchored bottom controls.
        box("volume",[14,166,28,190,0,upper,0,1]);setting("volume.fadermode","[-1]")
        box("meter",[controls-44,166,28,190,0,upper,0,1]);setting("meter.vu.div","[2 1]")
        box("volume.label",[8,362,controls-16,20,0,1,0,1]);label("volume.label",.5)
        box("pan",[10,388,controls-20,18,0,1,0,1]);setting("pan.fadermode","[-1]")
        box("pan.label",[10,410,controls-20,18,0,1,0,1]);label("pan.label",.5)
        bw=22 if variant=="Compact" else 26
        box("mute",[10,436,bw,26,0,1,0,1]);box("solo",[controls-10-bw,436,bw,26,0,1,0,1])
        if master:box("mono",[(controls-bw)/2,436,bw,26,0,1,0,1])
        else:box("recarm",[(controls-bw)/2,436,bw,26,0,1,0,1])
        # Top-row routes remain accessible when extended mixer is hidden.
        box("fx",[10,118,bw,26,0,upper,0,upper]);box("io",[controls-10-bw,118,bw,26,0,upper,0,upper])
        box("env",[(controls-42)/2,148,42,18,0,upper,0,upper])
        if not master:
            box("recmon",[(controls-bw)/2,118,bw,26,0,upper,0,upper])
            # Input / phase stay in expanded native context menus; Inspector
            # exposes direct controls alongside the full insert/send sidebar.
            if variant=="Inspector":
                box("recinput",[10,44,controls-20,24]);label("recinput")
                box("recmode",[10,76,34,24]);box("phase",[controls-36,76,26,24])
                box("extmixer.position",[134,44,width-144,418,0,0,0,1])
        box("trackidx",[controls-30,466,20,12,0,1,0,1]);label("trackidx",1)
    elif section=="envcp":
        setting("size",vector([380,64,280,32],scale))
        box("label",[40,8,228,22,0,0,1,0]);label("label")
        box("arm",[276,7,24,24,1,0,1,0]);box("bypass",[306,7,24,24,1,0,1,0]);box("hide",[336,7,24,24,1,0,1,0])
        box("fader",[40,36,182,20,0,0,1,0],f"h>={round(58*scale)}");setting("fader.fadermode","[-1]")
        box("value",[230,36,72,20,1,0,1,0],f"h>={round(58*scale)}");label("value",1)
        box("learn",[308,36,24,24,1,0,1,0],f"h>={round(62*scale)}")
        box("mod",[338,36,24,24,1,0,1,0],f"h>={round(62*scale)}")
    elif section=="trans":
        setting("size",vector([1100,64],scale));setting("size.dockedheight",vector([64],scale))
        setting("size.minmax",vector([580,64,0,64],scale))
        for key,x in [("rew",14),("stop",52),("play",90),("pause",128),("rec",166),("repeat",210),("fwd",248)]:box(key,[x,16,32,32])
        box("status",[296,10,252,44]);color("status.color","text");setting("status.margin",vector([10,0,10,0],scale))
        box("bpm.edit",[568,16,66,32],f"w>={round(718*scale)}");label("bpm.edit",.5,2)
        box("bpm.tap",[640,16,32,32],f"w>={round(718*scale)}");label("bpm.tap",.5)
        box("curtimesig",[686,16,54,32],f"w>={round(760*scale)}");label("curtimesig",.5)
        box("rate",[766,18,70,28],f"w>={round(922*scale)}");label("rate",.5)
        box("rate.fader",[842,20,72,24],f"w>={round(922*scale)}");setting("rate.fader.fadermode","[-1]")
        box("sel",[932,10,158,44,0,0,1,0],f"w>={round(1090*scale)}");label("sel",1)
    for key in (["volume.color","pan.color","width.color"] if section in ["tcp","mcp"] else
                ["volume.color","pan.color"] if section.startswith("master.") else
                ["fader.color"] if section=="envcp" else []):color(key,"accent")
    if "tcp" in section or "mcp" in section:
        setting("meter.readout.color",vector([*C["muted"],255,*C["red"],255],1))
        setting("meter.inputlabel.color",vector([*C["text"],255],1))
        for pos in ["lit.top","lit.bottom","unlit.top","unlit.bottom"]:color("meter.scale.color."+pos,"muted")
    return lines


def walter():
    lines=["; DLS Satsu / original WALTER and artwork / MIT", "version 7", "use_pngs 1", "use_overlays 0", "warnings all",
           "tinttcp 298", "peaksedges 0", "tcp_folderindent 14", "tcp_heights 4 32 64 108", "tcp_master_minheight 64",
           "envcp_min_height 32", "mcp_min_height 320", "tcp_showborders 0", "mcp_showborders 0", "transport_showborders 0",
           "misc_dpi_translate 126 150", "misc_dpi_translate 174 200", "tcp_vol_zeroline FFEDA7BA", "mcp_vol_zeroline FFEDA7BA"]
    for section in ["tcp","master.tcp","mcp","master.mcp","envcp","trans"]:
        lines += [f"; -- {section} --"]+panel(section)
    variants={"Studio":["tcp","master.tcp","mcp","master.mcp","envcp","trans"],
              "Compact":["tcp","mcp"],"Recording":["tcp"],"Inspector":["mcp"]}
    for variant,sections in variants.items():
        for scale in [1,1.5,2]:
            name=f"Satsu {variant}"+(f" {round(scale*100)}%" if scale!=1 else "")
            lines += [f'Layout "{name}"'+(f' "{round(scale*100)}"' if scale!=1 else "")]
            for section in sections:lines += panel(section,scale,variant)
            lines += ["EndLayout"]
        lines += [f'layout_dpi_translate "Satsu {variant}" 1.26 "Satsu {variant} 150%"',
                  f'layout_dpi_translate "Satsu {variant}" 1.74 "Satsu {variant} 200%"']
    lines += ['layout_dpi_translate "" 1.26 "Satsu Studio 150%"', 'layout_dpi_translate "" 1.74 "Satsu Studio 200%"']
    return "\n".join(lines)+"\n"


def logfont(height,weight=400):
    # Windows LOGFONTA, with REAPER's trailing additive checksum.
    data=struct.pack("<5i8B32s",-height,0,0,0,weight,0,0,0,1,0,0,0,34,b"Segoe UI")
    return (data+bytes([sum(data)&255])).hex().upper()


def theme():
    colors={}
    def group(tone,keys):
        for key in keys.split():colors[key]=C[tone]
    group("base","col_main_bg col_main_bg2 col_main_textshadow col_main_3dhl col_main_3dsh col_tracklistbg col_arrangebg col_tl_bg col_trans_bg col_transport_editbk genlist_bg midi_leftbg midi_rulerbg midi_trackbg_outer1 midi_trackbg_outer2 region_lane_bg marker_lane_bg ts_lane_bg midi_pkey2 mcp_fxlist_bg")
    group("panel","col_mixerbg col_main_editbk col_tr1_bg col_tr2_bg midi_trackbg1 midi_inline_trackbg1 midi_pkey3 midi_trackbg2 midi_inline_trackbg2 midieditorlist_bg col_buttonbg col_vuintcol col_vuind1")
    group("raised","col_mi_bg col_mi_bg2 midi_ccbut midi_ofsn midi_itemctl midi_gridh col_tl_bgsel2 col_toolbar_frame midioct midioct_inline")
    group("line","col_tr1_divline col_tr2_divline col_envlane1_divline col_envlane2_divline col_gridlines col_gridlines2 col_gridlines3 midi_grid1 midi_grid2 midi_grid3 midi_gridhc genlist_grid midieditorlist_grid arrange_vgrid")
    group("selected","col_seltrack col_seltrack2 selcol_tr1_bg selcol_tr2_bg genlist_selbg genlist_seliabg midieditorlist_selbg midieditorlist_seliabg midi_selpitch1 midi_selpitch2 midi_selbg col_tl_bgsel")
    group("text","col_main_text col_tcp_text col_tcp_textsel col_mi_label col_mi_label_sel col_mi_label_float_sel col_tr1_peaks col_tr2_peaks genlist_fg genlist_selfg genlist_seliafg col_toolbar_text_on col_trans_fg col_tl_fg midi_rulerfg midi_ccbut_text midi_ccbut_arrow midi_notefg midi_pkey1 midieditorlist_fg midieditorlist_selfg midieditorlist_seliafg mcp_fx_normal mcp_sends_normal mcp_fxparm_normal score_fg")
    group("muted","col_main_text2 col_main_resize2 col_toolbar_text col_tl_fg2 col_mi_label_float region_lane_text marker_lane_text ts_lane_text io_text col_offlinetext col_vuind2 mcp_fx_offlined mcp_fxparm_offlined mcp_sends_levels")
    group("accent","col_cursor col_cursor2 region col_tsigmark col_tr1_itembgsel col_tr2_itembgsel col_peaksedgesel col_peaksedgesel2 midi_editcurs midi_notebg midi_ofsnsel midi_endpt col_vutop col_vumidi col_routinghl1 genlist_hilite genlist_hilite_sel guideline_color selitem_dot selitem_tag activetake_tag score_sel score_loop")
    group("green","playcursor_color col_vubot col_vumid col_vuind3 col_routingact col_peaksfade col_peaksfade2")
    group("red","col_vuclip marker midi_notemute midi_notemute_sel col_fadearm col_fadearm2 col_fadearm3 mute_overlay_col")
    group("amber","mcp_fx_bypassed mcp_fxparm_bypassed mcp_sends_muted take_marker toolbararmed_color playrate_edited col_vuind4")
    group("paper","score_bg score_timesel")
    colors["score_fg"]=C["base"]
    # Selected clips and MIDI notes use a light lavender surface. Keep their
    # labels/peaks dark; floating labels outside clips stay light on the canvas.
    for key in ["col_mi_label_sel","col_tr1_ps2","col_tr2_ps2","col_peaksedgesel","col_peaksedgesel2","midi_notefg"]:
        colors[key]=C["base"]
    for lane,tone in [("vol","accent"),("pan","green"),("width","muted"),("mute","red"),("sendvol","accent"),("sendpan","green"),("sendmute","red"),("pitch","amber"),("playrate","accent"),("fx1","accent"),("fx2","green"),("fx3","amber"),("fx4","red")]:colors["col_env"+lane]=C[tone]
    lines=["[color theme]"]
    for key,rgb in sorted(colors.items()):lines.append(f"{key}={rgb[0]+(rgb[1]<<8)+(rgb[2]<<16)}")
    lines += ["col_nodarkmodemiscwnd=0","col_vudoint=0","itembg_drawmode=196608","timesel_drawmode=135424",
              "col_gridlines1dm=196608","col_gridlines2dm=196608","col_gridlines3dm=196608", "midi_griddm1=196608","midi_griddm2=196608","midi_griddm3=196608",
              "playcursor_drawmode=163840","midi_selbg_drawmode=135169", "[REAPER]",f"ui_img={FOLDER}","ui_img_auto=0"]
    for i,height in enumerate([12,13,13,14,15,18,20,20,21,23,24,26,26,28,30],1):lines.append(f"user_font{i}={logfont(height,500 if i%5==2 else 400)}")
    for key in ["tl_font","mi_font","trans_font"]:lines.append(f"{key}={logfont(13)}")
    return "\n".join(lines)+"\n"


def build():
    entries={f"{NAME}.ReaperTheme":theme().encode(),f"{FOLDER}/rtconfig.txt":walter().encode()}
    manifest={"name":NAME,"version":"1.0.0","license":"MIT","reaper":"7+","assets":{}}
    for scale in [1,1.5,2]:
        prefix=FOLDER+"/"+(f"{round(scale*100)}/" if scale!=1 else "")
        for name,im in sorted(assets(scale).items()):
            output=io.BytesIO();im.save(output,format="PNG",compress_level=9)
            path=prefix+name+".png";entries[path]=output.getvalue()
            manifest["assets"][path]={"size":list(im.size),"sha256":hashlib.sha256(entries[path]).hexdigest()}
    entries[FOLDER+"/manifest.json"]=(json.dumps(manifest,indent=2,sort_keys=True)+"\n").encode()
    entries[FOLDER+"/LICENSE.txt"]=(ROOT/"LICENSE.txt").read_bytes()
    output=io.BytesIO()
    with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path,data in sorted(entries.items()):
            info=zipfile.ZipInfo(path,(2026,10,6,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
            archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    return output.getvalue(),entries


def main():
    parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true");args=parser.parse_args()
    data,entries=build();target=ROOT/"dist"/(NAME+".ReaperThemeZip")
    if args.check:
        if not target.exists():raise SystemExit("Theme archive is missing. Run python reaper/theme/build.py")
        with zipfile.ZipFile(target) as shipped:
            if set(shipped.namelist())!=set(entries):raise SystemExit("Theme archive file list is stale.")
            if shipped.testzip():raise SystemExit("Theme archive has a corrupt entry.")
            manifest_path=FOLDER+"/manifest.json"
            manifest=json.loads(shipped.read(manifest_path))
            generated_manifest=json.loads(entries[manifest_path])
            if set(manifest["assets"])!=set(generated_manifest["assets"]):raise SystemExit("Theme manifest asset list is stale.")
            for path,expected in entries.items():
                actual=shipped.read(path)
                info=shipped.getinfo(path)
                if info.date_time!=(2026,10,6,0,0,0) or info.create_system!=3:raise SystemExit("Theme ZIP metadata is stale: "+path)
                if path.endswith('.png'):
                    with Image.open(io.BytesIO(actual)) as a, Image.open(io.BytesIO(expected)) as b:
                        if a.size!=b.size or a.convert('RGBA').tobytes()!=b.convert('RGBA').tobytes():raise SystemExit("Theme artwork is stale: "+path)
                    entry=manifest["assets"][path]
                    if entry["sha256"]!=hashlib.sha256(actual).hexdigest() or entry["size"]!=generated_manifest["assets"][path]["size"]:raise SystemExit("Theme asset checksum/size mismatch: "+path)
                elif path==manifest_path:
                    for key in ["name","version","license","reaper"]:
                        if manifest[key]!=generated_manifest[key]:raise SystemExit("Theme manifest metadata is stale: "+key)
                elif actual!=expected:raise SystemExit("Theme source is stale: "+path)
        if (ROOT/"rtconfig.txt").read_bytes()!=entries[FOLDER+"/rtconfig.txt"]:raise SystemExit("Generated WALTER is stale.")
        if (ROOT/(NAME+".ReaperTheme")).read_bytes()!=entries[NAME+".ReaperTheme"]:raise SystemExit("Generated theme colors are stale.")
        print(f"Theme sources, pixels and checksums verified: {len(entries)} files / SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}")
    else:
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        (ROOT/"rtconfig.txt").write_bytes(entries[FOLDER+"/rtconfig.txt"])
        (ROOT/(NAME+".ReaperTheme")).write_bytes(entries[NAME+".ReaperTheme"])
        print(f"Built {target.name}: {len(entries)} files, {len(data):,} bytes")


if __name__=="__main__":main()
