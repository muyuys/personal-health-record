import sys,json
from pathlib import Path
# 2026-10-30 目录迁移：脚本在 Tools/影像分析/，影像在 data/影像/
BASE=Path(__file__).resolve().parents[2]/'data'/'影像'
SRC=BASE/'检查'
sys.path.insert(0,str(Path(__file__).parent/'runtime'))
import pydicom
import numpy as np
from PIL import Image,ImageDraw
OUT=BASE/'longitudinal_analysis'
OUT.mkdir(exist_ok=True)
groups={}
for folder in SRC.iterdir():
    if not folder.is_dir() or not folder.name.startswith('尤'):continue
    for f in folder.rglob('*.dcm'):
        ds=pydicom.dcmread(f,stop_before_pixels=True)
        if not hasattr(ds,'SeriesInstanceUID'):continue
        groups.setdefault(str(ds.SeriesInstanceUID),[]).append((f,ds))
summary=[]
for uid,items in groups.items():
    items.sort(key=lambda item:int(getattr(item[1],'InstanceNumber',0)))
    ds=items[0][1];date=str(ds.StudyDate);num=int(ds.SeriesNumber)
    row={'date':date,'series':num,'description':str(getattr(ds,'SeriesDescription','')),
        'count':len(items),'modality':str(ds.Modality),'rows':int(getattr(ds,'Rows',0)),
        'cols':int(getattr(ds,'Columns',0)),'frames':int(getattr(ds,'NumberOfFrames',1)),
        'thickness':str(getattr(ds,'SliceThickness','')),'spacing':str(getattr(ds,'PixelSpacing','')),
        'orientation':str(getattr(ds,'ImageOrientationPatient','')),
        'first_position':str(getattr(ds,'ImagePositionPatient','')),'last_position':str(getattr(items[-1][1],'ImagePositionPatient','')),
        'window_center':str(getattr(ds,'WindowCenter','')),'window_width':str(getattr(ds,'WindowWidth','')),
        'transfer':str(ds.file_meta.TransferSyntaxUID),'type':str(getattr(ds,'ImageType','')),
        'TE':str(getattr(ds,'EchoTime','')),'TR':str(getattr(ds,'RepetitionTime',''))}
    summary.append(row)
summary.sort(key=lambda r:(r['date'],r['series']))
(OUT/'series_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
for r in summary:print(f"{r['date']} S{r['series']} {r['description']} n={r['count']} dim={r['rows']}x{r['cols']} frame={r['frames']} thk={r['thickness']} ori={r['orientation']}")

def display(ds,lo=None,hi=None):
    a=ds.pixel_array
    if a.ndim==3 and a.shape[-1] in (3,4):return Image.fromarray(a[:,:,:3].astype(np.uint8))
    if a.ndim!=2:raise ValueError(f'Unsupported shape {a.shape}')
    a=a.astype(np.float32)*float(getattr(ds,'RescaleSlope',1))+float(getattr(ds,'RescaleIntercept',0))
    if ds.Modality=='CT':lo,hi=-800,1200
    elif lo is None:lo,hi=np.percentile(a,[1,99.5])
    a=np.clip((a-lo)/max(hi-lo,1)*255,0,255).astype(np.uint8)
    if str(ds.PhotometricInterpretation)=='MONOCHROME1':a=255-a
    return Image.fromarray(a).convert('RGB')

if '--render' in sys.argv:
    for uid,items in groups.items():
        ds=items[0][1];date=str(ds.StudyDate);num=int(ds.SeriesNumber)
        if date=='20260819':continue
        selected=list(range(len(items)))
        if ds.Modality=='CT':
            if num not in (3,350,450):continue
            selected=list(range(0,len(items),max(1,len(items)//30)))
        arrays=[]
        for idx in selected:
            f,_=items[idx];full=pydicom.dcmread(f)
            arrays.append((full,full.pixel_array))
        lo=hi=None
        if ds.Modality=='MR':
            vals=np.concatenate([a.reshape(-1) for full,a in arrays])
            lo,hi=np.percentile(vals,[1,99.5])
        for start in range(0,len(selected),25):
            chosen=arrays[start:start+25];cv=Image.new('RGB',(1500,((len(chosen)+4)//5)*324),(12,12,12));d=ImageDraw.Draw(cv)
            for j,(full,a) in enumerate(chosen):
                try:im=display(full,lo,hi)
                except ValueError as e:print(e);continue
                im.thumbnail((300,300));x=j%5*300;y=j//5*324;cv.paste(im,(x+(300-im.width)//2,y+(300-im.height)//2))
                d.text((x+5,y+302),f'{date} S{num} #{getattr(full,"InstanceNumber",0)}',fill='white')
                if full.Modality=='MR':im.save(OUT/f'{date}_s{num}_i{int(full.InstanceNumber):03d}.png')
            cv.save(OUT/f'{date}_s{num}_sheet{start//25+1}.png')
