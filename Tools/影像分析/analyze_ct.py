import sys, json
from pathlib import Path
# 2026-10-30 目录迁移：脚本在 Tools/影像分析/，影像在 data/影像/
sys.path.insert(0, str(Path(__file__).parent / 'runtime'))
import pydicom
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2] / 'data' / '影像'
OUT = ROOT / 'ct_analysis'
OUT.mkdir(exist_ok=True)
series = {}
for f in ROOT.rglob('*.dcm'):
    if 'runtime' in f.parts or 'ct_analysis' in f.parts: continue
    ds = pydicom.dcmread(f)
    key = str(ds.SeriesNumber)
    series.setdefault(key, []).append((f, ds))

summary = []
for key, items in sorted(series.items(), key=lambda x:int(x[0])):
    items.sort(key=lambda item:int(getattr(item[1], 'InstanceNumber', 0)))
    ds = items[0][1]
    entry = {'series':key, 'description':str(getattr(ds,'SeriesDescription','')), 'count':len(items),
        'modality':str(ds.Modality), 'date':str(ds.StudyDate),
        'rows':int(ds.Rows), 'cols':int(ds.Columns),
        'thickness':str(getattr(ds,'SliceThickness','')), 'spacing':str(getattr(ds,'PixelSpacing','')),
        'orientation':str(getattr(ds,'ImageOrientationPatient','')),
        'first_position':str(getattr(ds,'ImagePositionPatient','')), 'last_position':str(getattr(items[-1][1],'ImagePositionPatient','')),
        'transfer':str(ds.file_meta.TransferSyntaxUID), 'sop_class':str(ds.SOPClassUID),
        'image_type':str(getattr(ds,'ImageType','')), 'window_center':str(getattr(ds,'WindowCenter','')), 'window_width':str(getattr(ds,'WindowWidth',''))}
    summary.append(entry)
print(json.dumps(summary, indent=2, ensure_ascii=False))
(OUT/'series_summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')

def pixels(ds):
    arr = ds.pixel_array
    if arr.ndim == 3 and arr.shape[-1] in [3,4]:
        return arr.astype(np.uint8)
    arr = arr.astype(np.float32)*float(getattr(ds,'RescaleSlope',1))+float(getattr(ds,'RescaleIntercept',0))
    return arr

def view(ds, width=1800, center=450):
    arr = pixels(ds)
    if arr.ndim==3:
        return Image.fromarray(arr[:,:,:3])
    a = np.clip((arr-(center-width/2))/width*255,0,255).astype(np.uint8)
    if str(getattr(ds,'PhotometricInterpretation',''))=='MONOCHROME1': a=255-a
    return Image.fromarray(a).convert('RGB')

def sheet(key, indices, name, size=256, cols=5, width=1800, center=450):
    items=series[str(key)]
    rows=(len(indices)+cols-1)//cols
    canvas=Image.new('RGB',(cols*size,rows*(size+24)),(20,20,20))
    d=ImageDraw.Draw(canvas)
    for j,idx in enumerate(indices):
        f,ds=items[idx]
        img=view(ds,width,center)
        img.thumbnail((size,size))
        x=(j%cols)*size; y=(j//cols)*(size+24)
        canvas.paste(img,(x+(size-img.width)//2,y+(size-img.height)//2))
        d.text((x+6,y+size+3),f'S{key} / #{ds.InstanceNumber}',fill='white')
    canvas.save(OUT/name)

for key in series:
    n=len(series[key])
    if n<=30:
        sheet(key,list(range(n)),f'series_{key}_all.png',size=320,cols=5)
    else:
        sheet(key,list(range(0,n,10)),f'series_{key}_overview.png',size=300,cols=5)

bone = series.get('201',[])
if bone:
    ds=bone[0][1]
    print('pixel_test',pixels(ds).shape, float(pixels(ds).min()),float(pixels(ds).max()))
    for num in [100,110,120,130,140,150,160,170,180]:
        view(bone[num-1][1],2000,200).save(OUT/f'axial_{num}.png')
    for key, nums in [('10004',[13,16,18]),('10005',[7,12,17,20,23]),('10007',[1,4,7,10,13,16])]:
        for num in nums: view(series[key][num-1][1],2000,200).save(OUT/f's{key}_{num}.png')
    for start in [80,105,130,155,180]:
        cv=Image.new('RGB',(1500,5*324),(15,15,15)); draw=ImageDraw.Draw(cv)
        for j,idx in enumerate(range(start-1,min(start+24,250))):
            im=view(bone[idx][1],2000,200).crop((170,200,380,430)).resize((274,300))
            x=(j%5)*300;y=(j//5)*324;cv.paste(im,(x+13,y))
            draw.text((x+6,y+303),f'S201 / #{idx+1}',fill='white')
        cv.save(OUT/f'axial_detail_{start}.png')
    volume=np.stack([pixels(ds) for f,ds in bone])
    def mpr_sheet(axis, positions, name):
        cv=Image.new('RGB',(1500,((len(positions)+4)//5)*324),(15,15,15));draw=ImageDraw.Draw(cv)
        for j,p in enumerate(positions):
            a=volume[60:205,150:440,p] if axis=='sagittal' else volume[60:205,p,150:410]
            a=np.clip((a+800)/2000*255,0,255).astype(np.uint8)
            im=Image.fromarray(a).convert('RGB')
            im=im.resize((round(a.shape[1]*0.48828125*2),290))
            im.thumbnail((300,300));x=j%5*300;y=j//5*324
            cv.paste(im,(x+(300-im.width)//2,y))
            draw.text((x+6,y+303),f'{axis} voxel {p}',fill='white')
        cv.save(OUT/name)
    mpr_sheet('sagittal',list(range(205,351,5)),'mpr_sagittal.png')
    mpr_sheet('coronal',list(range(235,381,5)),'mpr_coronal.png')
    np.save(OUT/'bone_hu.npy',volume)
