// 图片压缩：对齐旧 js/app.modal.js:581 shrinkImage（长边压到 1500px，jpeg 0.75）。
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function shrinkImage(file: File): Promise<string> {
  const raw = await readAsDataURL(file);
  if (!/^data:image\//.test(raw)) throw new Error('type');
  const img = await loadImg(raw);
  const scale = Math.min(1, 1500 / Math.max(img.width, img.height));
  if (scale === 1 && raw.length < 420000) return raw;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * scale));
  cv.height = Math.max(1, Math.round(img.height * scale));
  const ctx = cv.getContext('2d');
  if (!ctx) return raw;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  let out = cv.toDataURL('image/jpeg', 0.75);
  if (out.length > 900000) out = cv.toDataURL('image/jpeg', 0.6);
  return out;
}
