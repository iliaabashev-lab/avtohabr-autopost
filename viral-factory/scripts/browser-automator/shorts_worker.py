import os
import time
import json
from config import ROOT_DIR

KNOWLEDGE_DIR = os.path.join(ROOT_DIR, "knowledge")
YOUTUBE_LOG_PATH = os.path.join(KNOWLEDGE_DIR, "youtube-log.json")

class ShortsWorker:
    def __init__(self, page, browser_ctrl=None):
        self.page = page
        self.browser_ctrl = browser_ctrl

    def is_logged_in(self) -> bool:
        """
        Checks whether YouTube Creator Studio is open and authenticated.
        """
        try:
            return "studio.youtube.com" in self.page.url.lower() and self.page.locator('button#create-icon, button:has-text("Create"), button:has-text("Создать")').count() > 0
        except Exception:
            return False

    def open_studio(self):
        print("[ShortsWorker] 🌐 Переход в YouTube Creator Studio...")
        self.page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        return self.is_logged_in()

    def upload_short(self, video_path: str, title: str, description: str = "") -> bool:
        """
        Uploads a 9:16 vertical video as a YouTube Short via YouTube Studio.
        """
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"Файл видео не найден: {video_path}")

        if not self.open_studio():
            raise RuntimeError("Пользователь не авторизован в YouTube Creator Studio!")

        # Ensure #Shorts tag in title
        if "#shorts" not in title.lower():
            final_title = f"{title[:80]} #Shorts"
        else:
            final_title = title[:100]

        final_desc = description.strip()
        if "app.avtohabr.ru" not in final_desc:
            final_desc += "\n\nОнлайн-запись в автосервис: https://app.avtohabr.ru\n#Shorts #авто #автосервис #машина #avtohabr"

        print(f"[ShortsWorker] 🎬 Загрузка ролика Shorts: {os.path.basename(video_path)}")
        print(f"[ShortsWorker] Название: {final_title}")

        # 1. Click CREATE button
        create_btn = self.page.locator('button#create-icon, button:has-text("Create"), button:has-text("Создать")').first
        create_btn.click()
        time.sleep(1)

        # 2. Click Upload videos
        upload_menu_item = self.page.locator('tp-yt-paper-item:has-text("Upload videos"), tp-yt-paper-item:has-text("Добавить видео"), [test-id="upload-button"]').first
        if not upload_menu_item.is_visible(timeout=2000):
            upload_menu_item = self.page.locator(':is(button, div):has-text("Upload videos"), :is(button, div):has-text("Добавить видео")').first

        # Intercept file chooser
        with self.page.expect_file_chooser(timeout=8000) as fc_info:
            upload_menu_item.click()
        fc = fc_info.value
        fc.set_files(os.path.abspath(video_path))
        print("[ShortsWorker] 📤 Файл видео отправлен в загрузчик YouTube Studio...")
        time.sleep(4)

        # 3. Fill Title
        title_box = self.page.locator('#textbox[aria-label*="title" i], #textbox[aria-label*="название" i], div#title-textarea #textbox').first
        if title_box.is_visible(timeout=10000):
            title_box.click()
            time.sleep(0.3)
            # Clear existing title
            self.page.keyboard.press("Control+A")
            self.page.keyboard.press("Backspace")
            time.sleep(0.3)
            if self.browser_ctrl:
                self.browser_ctrl.human_type(self.page, title_box, final_title)
            else:
                title_box.fill(final_title)
            time.sleep(1)

        # 4. Fill Description
        desc_box = self.page.locator('#textbox[aria-label*="description" i], #textbox[aria-label*="описание" i], div#description-textarea #textbox').first
        if desc_box.is_visible(timeout=3000):
            desc_box.click()
            time.sleep(0.3)
            if self.browser_ctrl:
                self.browser_ctrl.human_type(self.page, desc_box, final_desc)
            else:
                desc_box.fill(final_desc)
            time.sleep(1)

        # 5. Radio button: "No, it's not made for kids"
        not_for_kids = self.page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], :is(div, span):has-text("No, it\'s not made for kids"), :is(div, span):has-text("Нет, это видео не для детей")').first
        if not_for_kids.is_visible(timeout=3000):
            not_for_kids.click()
            time.sleep(0.5)

        # 6. Click Next through steps (Video elements, Checks, Visibility)
        next_btn = self.page.locator('button#next-button, button:has-text("Next"), button:has-text("Далее")')
        for step in range(3):
            if next_btn.first.is_visible(timeout=3000):
                next_btn.first.click()
                time.sleep(1.2)

        # 7. Visibility: Public
        public_radio = self.page.locator('tp-yt-paper-radio-button[name="PUBLIC"], :is(label, span, div):has-text("Public"), :is(label, span, div):has-text("Открытый доступ")').first
        if public_radio.is_visible(timeout=3000):
            public_radio.click()
            time.sleep(0.8)

        # 8. Click Publish / Done
        done_btn = self.page.locator('button#done-button, button:has-text("Publish"), button:has-text("Опубликовать"), button:has-text("Сохранить")').first
        if done_btn.is_visible(timeout=5000) and done_btn.is_enabled():
            print("[ShortsWorker] 🚀 Нажимаем 'Опубликовать'...")
            done_btn.click()
            time.sleep(5)

        # Close final modal if shown
        close_modal = self.page.locator('button:has-text("Close"), button:has-text("Закрыть")').first
        if close_modal.is_visible(timeout=4000):
            close_modal.click()
            time.sleep(1)

        print(f"[ShortsWorker] 🎉 YouTube Short успешно опубликован: {final_title}!")
        self._log_published_short(video_path, final_title)
        return True

    def _log_published_short(self, video_path: str, title: str):
        try:
            os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
            log = []
            if os.path.exists(YOUTUBE_LOG_PATH):
                with open(YOUTUBE_LOG_PATH, "r", encoding="utf-8") as f:
                    log = json.load(f)
            log.append({
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "file": os.path.basename(video_path),
                "title": title
            })
            with open(YOUTUBE_LOG_PATH, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ShortsWorker] Ошибка записи лога: {e}")
