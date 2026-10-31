from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[2]/'data'/'右脚踝'/'ct_analysis'
canvas=Image.new('RGB',(1320,600),(18,22,28))
d=ImageDraw.Draw(canvas)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',23)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',17)
panels=[('s10004_16.png','外踝及踝关节','序列10004 / 图16'),('s10005_20.png','距骨前上缘及距下关节','序列10005 / 图20'),('axial_detail_155.png','跟骨小高密度灶','序列201 / 图172')]
for k,(file,title,source) in enumerate(panels):
    im=Image.open(root/file)
    if k==2:
        # Select only the original rendered tile for instance 172.
        im=im.crop((600+13,3*324,600+13+274,3*324+300))
    im.thumbnail((408,450))
    x=k*440
    canvas.paste(im,(x+(440-im.width)//2,58+(450-im.height)//2))
    d.text((x+20,16),title,font=font,fill=(238,241,245))
    d.text((x+20,518),source,font=small,fill=(179,193,205))
d.text((20,564),'原始 DICOM 的代表切片；用于定位与解释，不能以单张图像确定疼痛来源。',font=small,fill=(179,193,205))
canvas.save(root/'key_images.png')
