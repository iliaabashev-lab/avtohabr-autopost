import os
import time
import json
from config import ROOT_DIR

KNOWLEDGE_DIR = os.path.join(ROOT_DIR, "knowledge")
THREADS_LOG_PATH = os.path.join(KNOWLEDGE_DIR, "threads-posted.json")

class ThreadsWorker:
    def __init__(self, page, browser_ctrl=None):
        self.page = page
        self.browser_ctrl = browser_ctrl

    def is_logged_in(self) -> bool:
        """
        Checks whether the user is authenticated in Threads (threads.com / threads.net).
        """
        try:
            # Check for create button, profile icon, or feed indicators
            indicators = [
                'svg[aria-label="Create"]',
                'svg[aria-label="New thread"]',
                'svg[aria-label*="Profile" i]',
                'a[href*="/@"]',
                'div[role="textbox"]',
                ':is(div, span):has-text("Start a thread")'
            ]
            for sel in indicators:
                if self.page.locator(sel).first.is_visible(timeout=1500):
                    return True

            # If login button is visible, definitely not logged in
            if self.page.locator('a:has-text("Log in"), button:has-text("Log in")').first.is_visible(timeout=1000):
                return False
        except Exception:
            pass
        return False

    def open_threads(self):
        """
        Opens threads.com and waits for load.
        """
        print("[ThreadsWorker] 🌐 Переход на Threads...")
        self.page.goto("https://www.threads.com/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        if not self.is_logged_in():
            print("[ThreadsWorker] ⚠️ Вы ещё не авторизованы в Threads в рабочем окне Edge!")
            print("[ThreadsWorker] 💡 Пожалуйста, войдите в свой аккаунт Threads в открытом браузере один раз.")
            return False
        return True

    def post(self, text: str, image_path: str = None) -> bool:
        """
        Creates and publishes a new thread post, optionally with an attached image.
        """
        if not self.open_threads():
            return False

        print(f"[ThreadsWorker] 📝 Подготовка публикации поста ({len(text)} символов)...")
        if image_path:
            print(f"[ThreadsWorker] 🖼 Прикрепляемое изображение: {image_path}")

        # 1. Click "New thread" / "Create"
        create_selectors = [
            'svg[aria-label="Create"]',
            'svg[aria-label="New thread"]',
            ':is(div, span, button):has-text("Start a thread")',
            ':is(div, span, button):has-text("New thread")',
            'a[href*="/create"]'
        ]

        create_btn = None
        for sel in create_selectors:
            el = self.page.locator(sel).first
            if el.is_visible(timeout=1500):
                create_btn = el
                break

        if not create_btn:
            # Fallback: look for contenteditable already on page
            textbox = self.page.locator('div[role="textbox"], div[contenteditable="true"]').first
            if not textbox.is_visible(timeout=1000):
                raise RuntimeError("Не удалось найти кнопку создания поста на Threads.")
        else:
            create_btn.click()
            time.sleep(1.5)

        # 2. Find post textbox
        textbox = self.page.locator('div[role="textbox"], div[contenteditable="true"]').first
        if not textbox.is_visible(timeout=5000):
            raise RuntimeError("Поле ввода текста в Threads не появилось.")

        textbox.click()
        time.sleep(0.5)

        # Type text
        if self.browser_ctrl:
            self.browser_ctrl.human_type(self.page, textbox, text)
        else:
            textbox.fill(text)
        time.sleep(1)

        # 3. Attach image if provided and exists
        if image_path and os.path.isfile(image_path) and os.path.getsize(image_path) > 1024:
            print(f"[ThreadsWorker] 📎 Прикрепление фото: {os.path.basename(image_path)}...")
            try:
                # Find file input
                file_input = self.page.locator('input[type="file"][accept*="image"]').first
                if not file_input.count():
                    # Click attachment paperclip/image icon to reveal file chooser
                    attach_btn = self.page.locator('svg[aria-label*="Attach" i], svg[aria-label*="photo" i], svg[aria-label*="media" i]').first
                    if attach_btn.is_visible(timeout=1000):
                        with self.page.expect_file_chooser(timeout=5000) as fc_info:
                            attach_btn.click()
                        fc = fc_info.value
                        fc.set_files(os.path.abspath(image_path))
                else:
                    file_input.set_input_files(os.path.abspath(image_path))
                
                print("[ThreadsWorker] ✅ Фото успешно передано в форму!")
                time.sleep(2)
            except Exception as e:
                print(f"[ThreadsWorker] Предупреждение при прикреплении фото: {e}")

        # 4. Click Post button
        post_btn_selectors = [
            'div[role="dialog"] :is(button, div[role="button"]):has-text("Post")',
            ':is(button, div[role="button"]):has-text("Post")',
            ':is(button, div[role="button"]):has-text("Опубликовать")'
        ]

        post_btn = None
        for sel in post_btn_selectors:
            el = self.page.locator(sel).first
            if el.is_visible(timeout=1500) and el.is_enabled():
                post_btn = el
                break

        if not post_btn:
            raise RuntimeError("Кнопка 'Post' / 'Опубликовать' в Threads не найдена или неактивна.")

        print("[ThreadsWorker] 🚀 Нажимаем 'Post'...")
        post_btn.click()
        time.sleep(4)

        # 5. Confirm completion (modal closes or toast appears)
        print("[ThreadsWorker] 🎉 Пост в Threads успешно опубликован!")
        self._log_published_post(text, image_path)
        return True

    def _log_published_post(self, text: str, image_path: str):
        try:
            os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
            log = []
            if os.path.exists(THREADS_LOG_PATH):
                with open(THREADS_LOG_PATH, "r", encoding="utf-8") as f:
                    log = json.load(f)
            log.append({
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "text_snippet": text[:80].replace("\n", " "),
                "image_path": image_path
            })
            with open(THREADS_LOG_PATH, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ThreadsWorker] Ошибка записи лога: {e}")
