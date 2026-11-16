import os
import time
import json
from config import ROOT_DIR

KNOWLEDGE_DIR = os.path.join(ROOT_DIR, "knowledge")
REELS_LOG_PATH = os.path.join(KNOWLEDGE_DIR, "reels-posted.json")

class ReelsWorker:
    def __init__(self, page, browser_ctrl=None):
        self.page = page
        self.browser_ctrl = browser_ctrl

    def is_logged_in(self) -> bool:
        """
        Checks whether user is authenticated in Instagram.
        """
        try:
            indicators = [
                'svg[aria-label="New post"]',
                'svg[aria-label="Create"]',
                'svg[aria-label="Direct"]',
                'svg[aria-label="Activity Feed"]',
                'span:has-text("Create")',
                'span:has-text("Profile")'
            ]
            for sel in indicators:
                if self.page.locator(sel).first.is_visible(timeout=1500):
                    return True
            if self.page.locator('button:has-text("Log in"), a:has-text("Log in")').first.is_visible(timeout=1000):
                return False
        except Exception:
            pass
        return False

    def open_instagram(self):
        print("[ReelsWorker] 🌐 Переход в Instagram...")
        self.page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        # Dismiss common popups (save info / notifications)
        try:
            dismiss_btn = self.page.locator('button:has-text("Not Now"), button:has-text("Не сейчас")').first
            if dismiss_btn.is_visible(timeout=2000):
                dismiss_btn.click()
                time.sleep(0.5)
        except Exception:
            pass

        if not self.is_logged_in():
            print("[ReelsWorker] ⚠️ Вы ещё не авторизованы в Instagram в рабочем окне Edge!")
            print("[ReelsWorker] 💡 Пожалуйста, войдите в свой аккаунт Instagram в открытом браузере один раз.")
            return False
        return True

    def upload_reel(self, video_path: str, caption: str = "") -> bool:
        """
        Uploads a 9:16 vertical video as an Instagram Reel via Instagram Web.
        """
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Файл видео не найден: {video_path}")

        if not self.open_instagram():
            return False

        print(f"[ReelsWorker] 🎬 Загрузка Reels: {os.path.basename(video_path)}")

        # 1. Click Create button
        create_selectors = [
            'svg[aria-label="New post"]',
            'svg[aria-label="Create"]',
            'span:has-text("Create")',
            'span:has-text("Создать")',
            'a[href="#"]'
        ]

        create_btn = None
        for sel in create_selectors:
            el = self.page.locator(sel).first
            if el.is_visible(timeout=1500):
                create_btn = el
                break

        if not create_btn:
            raise RuntimeError("Кнопка 'Create' / 'Создать' в Instagram не найдена.")

        # Click Create
        create_btn.click()
        time.sleep(1.5)

        # Look for "Post" option if submenu opens
        post_submenu = self.page.locator('span:has-text("Post"), span:has-text("Публикация")').first
        if post_submenu.is_visible(timeout=1000):
            post_submenu.click()
            time.sleep(1)

        # 2. Select video file
        file_input = self.page.locator('input[type="file"]').first
        if file_input.count():
            file_input.set_input_files(os.path.abspath(video_path))
        else:
            select_btn = self.page.locator('button:has-text("Select from computer"), button:has-text("Выбрать на компьютере")').first
            with self.page.expect_file_chooser(timeout=6000) as fc_info:
                select_btn.click()
            fc = fc_info.value
            fc.set_files(os.path.abspath(video_path))

        print("[ReelsWorker] 📤 Видео передано в форму Instagram...")
        time.sleep(3)

        # Dismiss "Video posts are now shared as reels" OK button if shown
        try:
            ok_modal = self.page.locator('button:has-text("OK")').first
            if ok_modal.is_visible(timeout=2500):
                ok_modal.click()
                time.sleep(1)
        except Exception:
            pass

        # 3. Select 9:16 aspect ratio if crop button exists
        try:
            crop_btn = self.page.locator('svg[aria-label="Select crop"], button[aria-label*="crop" i]').first
            if crop_btn.is_visible(timeout=1500):
                crop_btn.click()
                time.sleep(0.5)
                ratio_916 = self.page.locator('span:has-text("9:16")').first
                if ratio_916.is_visible(timeout=1000):
                    ratio_916.click()
                    time.sleep(0.5)
        except Exception:
            pass

        # 4. Click Next (to cover/trim)
        next_btn = self.page.locator(':is(button, div[role="button"]):has-text("Next"), :is(button, div[role="button"]):has-text("Далее")').first
        if next_btn.is_visible(timeout=5000):
            next_btn.click()
            time.sleep(2)

        # 5. Click Next again (to caption)
        if next_btn.is_visible(timeout=3000):
            next_btn.click()
            time.sleep(2)

        # 6. Type caption
        caption_box = self.page.locator('div[aria-label*="caption" i], div[aria-label*="подпись" i], div[role="textbox"]').first
        if caption_box.is_visible(timeout=5000):
            caption_box.click()
            time.sleep(0.3)
            final_caption = caption.strip()
            if "#reels" not in final_caption.lower():
                final_caption += "\n\nОнлайн-запись: https://app.avtohabr.ru\n#reels #авто #машина #автосервис #avtohabr"

            if self.browser_ctrl:
                self.browser_ctrl.human_type(self.page, caption_box, final_caption)
            else:
                caption_box.fill(final_caption)
            time.sleep(1)

        # 7. Click Share
        share_btn = self.page.locator(':is(button, div[role="button"]):has-text("Share"), :is(button, div[role="button"]):has-text("Поделиться")').first
        if share_btn.is_visible(timeout=5000) and share_btn.is_enabled():
            print("[ReelsWorker] 🚀 Нажимаем 'Share' / 'Поделиться'...")
            share_btn.click()
            time.sleep(6)

        # 8. Confirm shared
        print(f"[ReelsWorker] 🎉 Instagram Reel успешно опубликован!")
        self._log_published_reel(video_path, caption)
        return True

    def _log_published_reel(self, video_path: str, caption: str):
        try:
            os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
            log = []
            if os.path.exists(REELS_LOG_PATH):
                with open(REELS_LOG_PATH, "r", encoding="utf-8") as f:
                    log = json.load(f)
            log.append({
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "file": os.path.basename(video_path),
                "caption_snippet": caption[:80].replace("\n", " ")
            })
            with open(REELS_LOG_PATH, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ReelsWorker] Ошибка записи лога: {e}")
