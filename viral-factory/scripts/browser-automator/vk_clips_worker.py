import os
import sys
import time
import json
import subprocess
from config import ROOT_DIR

KNOWLEDGE_DIR = os.path.join(ROOT_DIR, "knowledge")
VK_VIDEO_LOG = os.path.join(KNOWLEDGE_DIR, "vk-video-log.json")

class VkClipsWorker:
    def __init__(self, page=None, browser_ctrl=None):
        self.page = page
        self.browser_ctrl = browser_ctrl

    def upload_clip(self, video_path: str, title: str, description: str = "") -> bool:
        """
        Uploads vertical video to VK Clips.
        Prefers official API via scripts/vk-video.mjs, with browser fallback.
        """
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Файл видео не найден: {video_path}")

        print(f"[VkClipsWorker] 🎬 Публикация в VK Клипы: {os.path.basename(video_path)}")

        # 1. Check if VK tokens exist in environment
        vk_token = os.environ.get("VK_TOKEN")
        vk_user_token = os.environ.get("VK_USER_TOKEN")

        if vk_token and vk_user_token:
            print("[VkClipsWorker] 🔑 Обнаружены VK токены, запуск через официальное VK API...")
            try:
                # Prepare temporary job descriptor
                job_data = [{
                    "id": os.path.splitext(os.path.basename(video_path))[0],
                    "title": title[:100],
                    "caption": description[:400]
                }]
                temp_jobs_file = os.path.join(ROOT_DIR, "knowledge", "temp_story_jobs.json")
                with open(temp_jobs_file, "w", encoding="utf-8") as f:
                    json.dump(job_data, f, ensure_ascii=False)

                res = subprocess.run(
                    ["node", "scripts/vk-video.mjs", os.path.dirname(video_path), temp_jobs_file],
                    cwd=ROOT_DIR,
                    capture_output=True,
                    text=True,
                    encoding="utf-8"
                )
                if res.returncode == 0:
                    print("[VkClipsWorker] ✅ Ролик успешно добавлен в VK отложенные записи сообщества!")
                    self._log(video_path, title, "api")
                    return True
                else:
                    print(f"[VkClipsWorker] VK API вернул ошибку: {res.stderr.strip()}")
            except Exception as e:
                print(f"[VkClipsWorker] Ошибка при вызове VK API: {e}")

        # 2. Browser fallback via Edge
        if self.page:
            print("[VkClipsWorker] 🌐 Переход на страницу VK Клипы в браузере...")
            try:
                self.page.goto("https://vk.com/clips", wait_until="domcontentloaded", timeout=30000)
                time.sleep(3)
                
                # Check for upload button
                upload_btn = self.page.locator(':is(button, a, span):has-text("Опубликовать клип"), :is(button, a, span):has-text("Загрузить")').first
                if upload_btn.is_visible(timeout=3000):
                    with self.page.expect_file_chooser(timeout=6000) as fc_info:
                        upload_btn.click()
                    fc = fc_info.value
                    fc.set_files(os.path.abspath(video_path))
                    print("[VkClipsWorker] 📤 Видео отправлено в веб-загрузчик VK Клипов...")
                    time.sleep(5)
                    self._log(video_path, title, "browser")
                    return True
            except Exception as e:
                print(f"[VkClipsWorker] Предупреждение браузерного автопостинга VK: {e}")

        self._log(video_path, title, "skipped")
        return False

    def _log(self, video_path: str, title: str, method: str):
        try:
            os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
            log = []
            if os.path.exists(VK_VIDEO_LOG):
                with open(VK_VIDEO_LOG, "r", encoding="utf-8") as f:
                    log = json.load(f)
            log.append({
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "file": os.path.basename(video_path),
                "title": title,
                "method": method
            })
            with open(VK_VIDEO_LOG, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
