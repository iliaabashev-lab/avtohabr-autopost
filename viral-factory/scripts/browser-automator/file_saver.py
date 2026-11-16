import os
import time
import shutil
import base64
from config import DOWNLOADS_DIR

def check_and_move_from_downloads(target_path, ext_tuple, start_time=None):
    """
    Checks if a newly downloaded file landed in C:\\Users\\iliaa\\Downloads
    and moves it to the target destination.
    """
    if not os.path.exists(DOWNLOADS_DIR):
        return False

    cutoff = start_time if start_time else (time.time() - 120)
    candidates = []
    try:
        for f in os.listdir(DOWNLOADS_DIR):
            ext = os.path.splitext(f)[1].lower()
            if ext in ext_tuple:
                fp = os.path.join(DOWNLOADS_DIR, f)
                try:
                    mtime = os.path.getmtime(fp)
                    size = os.path.getsize(fp)
                    if mtime >= cutoff and size > 2048:
                        candidates.append((mtime, fp))
                except Exception:
                    pass
    except Exception:
        pass

    if candidates:
        candidates.sort(reverse=True)
        newest_fp = candidates[0][1]
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        shutil.move(newest_fp, target_path)
        print(f"[FileSaver] 📦 Перехвачен файл из Загрузок и помещён в: {target_path}")
        return True
    return False

def save_image_result(target_path, backup_path=None, download_obj=None, img_element=None, page=None, start_time=None):
    """
    Robust multi-strategy saver for generated images.
    """
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    saved = False

    # 1. Download event
    if download_obj:
        try:
            download_obj.save_as(target_path)
            if os.path.isfile(target_path) and os.path.getsize(target_path) > 2048:
                saved = True
                print(f"[FileSaver] ✅ Скачано через Download event в: {target_path}")
        except Exception as e:
            print(f"[FileSaver] Download event failed: {e}")

    # 2. Check Downloads folder
    if not saved and start_time:
        saved = check_and_move_from_downloads(target_path, (".jpg", ".jpeg", ".png", ".webp"), start_time)

    # 3. Direct JS extract (base64 or blob)
    if not saved and img_element and page:
        try:
            src = img_element.get_attribute("src")
            if src and src.startswith("data:image"):
                _, b64 = src.split(",", 1)
                with open(target_path, "wb") as f:
                    f.write(base64.b64decode(b64))
                saved = True
                print(f"[FileSaver] ✅ Извлечено из base64 в: {target_path}")
            elif src:
                js_fetch = """async (src) => {
                    const r = await fetch(src);
                    const b = await r.blob();
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(b);
                    });
                }"""
                data_url = page.evaluate(js_fetch, src)
                if data_url and "," in data_url:
                    _, b64 = data_url.split(",", 1)
                    with open(target_path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    saved = True
                    print(f"[FileSaver] ✅ Извлечено из JS blob в: {target_path}")
        except Exception as e:
            print(f"[FileSaver] JS extract warning: {e}")

    # 4. Element screenshot fallback
    if not saved and img_element:
        try:
            img_element.screenshot(path=target_path)
            saved = True
            print(f"[FileSaver] ✅ Сохранён снимок элемента в: {target_path}")
        except Exception as e:
            print(f"[FileSaver] Screenshot fallback warning: {e}")

    # Copy to backup destination if provided
    if saved and backup_path and os.path.isfile(target_path):
        try:
            os.makedirs(os.path.dirname(backup_path), exist_ok=True)
            shutil.copy2(target_path, backup_path)
            print(f"[FileSaver] 📋 Дублировано в резервную папку: {backup_path}")
        except Exception:
            pass

    return saved and os.path.isfile(target_path) and os.path.getsize(target_path) > 2048

def save_video_result(target_path, backup_path=None, download_obj=None, video_element=None, page=None, start_time=None):
    """
    Robust multi-strategy saver for generated videos.
    """
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    saved = False

    # 1. Download event
    if download_obj:
        try:
            download_obj.save_as(target_path)
            if os.path.isfile(target_path) and os.path.getsize(target_path) > 10240:
                saved = True
                print(f"[FileSaver] ✅ Видео скачано через Download event в: {target_path}")
        except Exception as e:
            print(f"[FileSaver] Video download event failed: {e}")

    # 2. Check Downloads folder
    if not saved and start_time:
        saved = check_and_move_from_downloads(target_path, (".mp4", ".mov", ".webm"), start_time)

    # 3. Direct JS extract blob
    if not saved and video_element and page:
        try:
            src = video_element.get_attribute("src")
            if src:
                js_fetch = """async (src) => {
                    const r = await fetch(src);
                    const b = await r.blob();
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(b);
                    });
                }"""
                data_url = page.evaluate(js_fetch, src)
                if data_url and "," in data_url:
                    _, b64 = data_url.split(",", 1)
                    with open(target_path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    saved = True
                    print(f"[FileSaver] ✅ Видео извлечено из JS blob в: {target_path}")
        except Exception as e:
            print(f"[FileSaver] Video JS extract warning: {e}")

    # Copy to backup destination (e.g. stories/NNN/video.mp4 or ai-videos/NNN.mp4)
    if saved and backup_path and os.path.isfile(target_path):
        try:
            os.makedirs(os.path.dirname(backup_path), exist_ok=True)
            shutil.copy2(target_path, backup_path)
            print(f"[FileSaver] 📋 Видео продублировано в папку: {backup_path}")
        except Exception:
            pass

    return saved and os.path.isfile(target_path) and os.path.getsize(target_path) > 10240
