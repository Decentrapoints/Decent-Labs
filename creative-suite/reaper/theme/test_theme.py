"""Release integrity and native control geometry tests. Run with unittest."""
import hashlib
import io
import json
import re
import unittest
import zipfile
from pathlib import Path

from PIL import Image
import build


def positions(section,scale,variant,w,h):
    """Resolve the generated WALTER subset using documented edge attachments."""
    values={}
    for line in build.panel(section,scale,variant):
        _, key, expr=line.split(" ",2) if line.startswith("set ") else (None,None,None)
        if key is None:continue
        tokens=re.findall(r"\[[^]]*\]|\S+",expr)
        def evaluate(index):
            token=tokens[index]
            if token.startswith("["):return token,index+1
            condition=re.fullmatch(r"([wh])>=(\d+)",token)
            if not condition:raise ValueError(token)
            first,end=evaluate(index+1);second,end=evaluate(end)
            return (first if (w if condition[1]=="w" else h)>=int(condition[2]) else second),end
        expression,end=evaluate(0)
        if end!=len(tokens):raise ValueError(expr)
        nums=[float(v) for v in expression.strip("[]").split()]
        values[key]=nums+[0]*(8-len(nums))
    base=values[section+".size"]
    result={}
    for key,value in values.items():
        short=key[len(section)+1:]
        if ("." in short and short not in ["volume.label","pan.label","width.label","bpm.edit","bpm.tap","rate.fader","extmixer.position"]) or short in ["size","margin"]:continue
        x,y,bw,bh,ls,ts,rs,bs=value
        if not bw or not bh:continue
        dw,dh=w-base[0],h-base[1]
        result[short]=(x+dw*ls,y+dh*ts,bw+dw*(rs-ls),bh+dh*(bs-ts))
    return result


class ThemeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive=zipfile.ZipFile(build.ROOT/"dist"/(build.NAME+".ReaperThemeZip"))
        cls.manifest=json.loads(cls.archive.read(build.FOLDER+"/manifest.json"))

    @classmethod
    def tearDownClass(cls):cls.archive.close()

    def test_archive_integrity_and_self_contained_theme(self):
        self.assertIsNone(self.archive.testzip())
        names=self.archive.namelist();self.assertEqual(len(names),len(set(names)))
        self.assertFalse(any(n.startswith("/") or ".." in Path(n).parts for n in names))
        ini=self.archive.read("DLS Satsu.ReaperTheme").decode()
        self.assertIn("ui_img=DLS_Satsu",ini)
        self.assertEqual(self.archive.read("DLS_Satsu/rtconfig.txt"),(build.ROOT/"rtconfig.txt").read_bytes())
        for path,item in self.manifest["assets"].items():
            data=self.archive.read(path)
            self.assertEqual(hashlib.sha256(data).hexdigest(),item["sha256"])
            with Image.open(io.BytesIO(data)) as image:
                self.assertEqual(list(image.size),item["size"]);image.verify()

    def test_state_atlases_and_dpi_sets(self):
        required=["track_mute_off","track_mute_on","track_solo_off","track_solo_on","track_recarm_off","track_recarm_on",
                  "track_monitor_off","track_monitor_on","track_monitor_auto","track_fx_norm","track_io","track_env",
                  "transport_play","transport_play_on","transport_record","transport_record_on","mcp_vu","tcp_vu","mcp_master_vu",
                  "tcp_volthumb","mcp_volthumb","envcp_fader","tcp_bg","mcp_bg","scrollbar"]
        for scale in [1,1.5,2]:
            prefix=build.FOLDER+"/"+(str(round(scale*100))+"/" if scale!=1 else "")
            for name in required:self.assertIn(prefix+name+".png",self.manifest["assets"])
            for name in ["track_mute_off","transport_play","track_recarm_on"]:
                im=Image.open(io.BytesIO(self.archive.read(prefix+name+".png"))).convert("RGBA")
                self.assertEqual(im.width%3,0)
                cell=im.width//3
                self.assertNotEqual(im.crop((0,0,cell,im.height)).tobytes(),im.crop((cell,0,cell*2,im.height)).tobytes())
            im=Image.open(io.BytesIO(self.archive.read(prefix+"mcp_fxlist_norm.png")))
            self.assertEqual(im.height,round(66*scale))
            self.assertEqual(self.manifest["assets"][prefix+"scrollbar.png"]["size"],[round(204*scale),round(238*scale)])

    def test_controls_fit_without_overlapping_at_supported_sizes(self):
        for scale in [1,1.5,2]:
            for variant in ["Studio","Compact","Recording"]:
                for w in [280,380,560]:
                    for h in [32,64,108,168,260]:
                        self.check_geometry("tcp",scale,variant,w*scale,h*scale)
            for variant,width in [("Studio",124),("Compact",92),("Inspector",232)]:
                for height in [320,400,480,720]:self.check_geometry("mcp",scale,variant,width*scale,height*scale)
            for height in [320,480,720]:self.check_geometry("master.mcp",scale,"Studio",156*scale,height*scale)
            for w in [580,718,760,922,1100,1400]:self.check_geometry("trans",scale,"Studio",w*scale,64*scale)
            for w in [280,380,560]:
                for h in [32,64,100]:self.check_geometry("envcp",scale,"Studio",w*scale,h*scale)

    def check_geometry(self,section,scale,variant,w,h):
        rects=positions(section,scale,variant,w,h)
        for key,(x,y,rw,rh) in rects.items():
            with self.subTest(section=section,variant=variant,scale=scale,w=w,h=h,key=key):
                self.assertGreaterEqual(x,-.51);self.assertGreaterEqual(y,-.51)
                self.assertGreater(rw,0);self.assertGreater(rh,0)
                self.assertLessEqual(x+rw,w+.51);self.assertLessEqual(y+rh,h+.51)
        ignored={"extmixer.mode"}
        for a,first in rects.items():
            for b,second in rects.items():
                if b<=a or a in ignored or b in ignored:continue
                x,y,rw,rh=first;xx,yy,ww,hh=second
                overlap=min(x+rw,xx+ww)-max(x,xx)>.51 and min(y+rh,yy+hh)-max(y,yy)>.51
                self.assertFalse(overlap,f"{section}/{variant}/{scale}/{w}x{h}: {a} overlaps {b}")

    def test_layouts_fonts_and_accessible_state_colors(self):
        script=self.archive.read("DLS_Satsu/rtconfig.txt").decode()
        for variant in ["Studio","Compact","Recording","Inspector"]:
            for dpi in [""," 150%"," 200%"]:self.assertIn(f'Layout "Satsu {variant}{dpi}"',script)
        for idx in range(1,16):self.assertIn(f"user_font{idx}=",build.theme())
        for fg,bg in [("text","panel"),("muted","base"),("accent","selected")]:
            def lum(rgb):
                vals=[v/255 for v in rgb];return sum((v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)*k for v,k in zip(vals,[.2126,.7152,.0722]))
            light,dark=sorted([lum(build.C[fg]),lum(build.C[bg])],reverse=True)
            self.assertGreater((light+.05)/(dark+.05),4.5)


if __name__=="__main__":unittest.main()
