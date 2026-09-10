import io
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rembg import remove, new_session

# Initialize session once at module level
session = new_session('isnet-general-use')

def gray_world_white_balance(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Simple gray-world white balance, ignoring masked background."""
    b, g, r = cv2.split(img)
    
    # Calculate means only for pixels where alpha > 0
    valid_pixels = mask > 0
    if not np.any(valid_pixels):
        return img
        
    m_b = np.mean(b[valid_pixels])
    m_g = np.mean(g[valid_pixels])
    m_r = np.mean(r[valid_pixels])
    
    mean_gray = (m_b + m_g + m_r) / 3
    
    # Scale channels
    b_new = cv2.multiply(b, mean_gray / (m_b + 1e-5))
    g_new = cv2.multiply(g, mean_gray / (m_g + 1e-5))
    r_new = cv2.multiply(r, mean_gray / (m_r + 1e-5))
    
    out = cv2.merge((b_new, g_new, r_new))
    return np.clip(out, 0, 255).astype(np.uint8)

def enhance_lighting(img_bgr: np.ndarray) -> np.ndarray:
    """Apply CLAHE to L channel in LAB color space."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    
    out_lab = cv2.merge((l, a, b))
    return cv2.cvtColor(out_lab, cv2.COLOR_LAB2BGR)

def sharpen(img_bgr: np.ndarray) -> np.ndarray:
    """Apply mild unsharp mask."""
    blur = cv2.GaussianBlur(img_bgr, (0, 0), 3)
    sharpened = cv2.addWeighted(img_bgr, 1.6, blur, -0.6, 0)
    return sharpened

# The four backdrops the app offers. Marketplace listings want white by
# default; the warm and sage grounds suit craft photography, and charcoal
# makes pale objects (bone, shell, undyed cotton) readable.
BACKDROPS = {
    "white": (255, 255, 255),
    "warm": (245, 237, 225),
    "sage": (223, 232, 222),
    "charcoal": (43, 33, 24),
}


def process_image(input_bytes: bytes, backdrop: str = "white") -> bytes:
    """Full pipeline: rembg -> lighting -> wb -> sharpen -> composition -> shadow."""
    # 1. Background removal
    cutout_bytes = remove(input_bytes, session=session)
    
    # 2. Convert to OpenCV format (RGBA)
    pil_img = Image.open(io.BytesIO(cutout_bytes)).convert("RGBA")
    np_img = np.array(pil_img)
    
    bgr = cv2.cvtColor(np_img, cv2.COLOR_RGBA2BGR)
    alpha = np_img[:, :, 3]
    
    # 3. Lighting Enhancement (CLAHE)
    bgr = enhance_lighting(bgr)
    
    # 4. White Balance (Gray-world) - Disabled by user request
    # bgr = gray_world_white_balance(bgr, alpha)
    
    # 5. Mild Sharpening
    bgr = sharpen(bgr)
    
    # Re-attach alpha (convert to RGBA for Pillow)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    
    processed_pil = Image.fromarray(rgba)
    
    # 6. Marketplace Composition
    # 1600 x 1600 canvas
    # product fills ~84% -> max dimension 1344
    processed_pil.thumbnail((1344, 1344), Image.LANCZOS)
    
    # An unknown name falls back to white rather than failing: a bad backdrop
    # is a cosmetic choice, not a reason to lose her photo.
    colour = BACKDROPS.get(backdrop, BACKDROPS["white"])
    canvas = Image.new("RGBA", (1600, 1600), (*colour, 255))
    
    x = (1600 - processed_pil.width) // 2
    y = (1600 - processed_pil.height) // 2
    
    # 7. Add soft shadow
    shadow = Image.new("RGBA", canvas.size, (*colour, 0))
    draw = ImageDraw.Draw(shadow)
    
    # Ellipse roughly at the bottom of the object
    # Let's make it span 80% of the object's width
    shadow_width = processed_pil.width * 0.8
    shadow_height = processed_pil.height * 0.15
    
    left = x + (processed_pil.width - shadow_width) / 2
    top = y + processed_pil.height - shadow_height / 2
    right = left + shadow_width
    bottom = top + shadow_height
    
    draw.ellipse([left, top, right, bottom], fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    
    # Composite shadow then product onto canvas
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(processed_pil, (x, y))
    
    # Return as JPEG
    canvas = canvas.convert("RGB")
    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=90)
    return out.getvalue()

