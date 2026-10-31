import sys
from pathlib import Path
# 2026-10-30 目录迁移：脚本在 Tools/影像分析/，影像在 data/影像/
BASE=Path(__file__).resolve().parents[2]/'data'/'影像'
SRC=BASE/'检查'
sys.path.insert(0,str(Path(__file__).parent/'runtime'))
import pydicom
import numpy as np
from PIL import Image,ImageDraw
OUT=BASE/'longitudinal_analysis'
for date,num,starts in [('20251227',3,[125,150,175]),('20260819',201,[140,165])]:
    folder=next(p for p in SRC.iterdir() if p.is_dir() and p.name.endswith(date))
    sdir=next(p for p in folder.iterdir() if p.is_dir() and p.name.startswith(f'[{num}]'))
    pairs=[]
    for f in sdir.glob('*.dcm'):
        ds=pydicom.dcmread(f,stop_before_pixels=True);pairs.append((int(ds.InstanceNumber),f))
    pairs.sort();lookup=dict(pairs)
    for start in starts:
        cv=Image.new('RGB',(1500,1620),(12,12,12));draw=ImageDraw.Draw(cv)
        for j,i in enumerate(range(start,start+25)):
            ds=pydicom.dcmread(lookup[i]);a=ds.pixel_array.astype(np.float32)*float(getattr(ds,'RescaleSlope',1))+float(getattr(ds,'RescaleIntercept',0))
            im=Image.fromarray(np.clip((a+800)/2000*255,0,255).astype(np.uint8)).convert('RGB')
            # Keep the entire foot region, excluding most of the surrounding air.
            im=im.crop((140,150,390,440));im.thumbnail((300,300))
            x=j%5*300;y=j//5*324;cv.paste(im,(x+(300-im.width)//2,y))
            draw.text((x+5,y+303),f'{date} S{num} #{i}',fill='white')
            im.save(OUT/f'{date}_ct_{i}.png')
        cv.save(OUT/f'{date}_ct_focus_{start}.png')
