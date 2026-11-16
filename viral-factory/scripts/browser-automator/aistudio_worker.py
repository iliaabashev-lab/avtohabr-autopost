import os
import sys
import re
import time
import random
from playwright.sync_api import Page, TimeoutError
from config import (
    VIDEO_MODEL, VIDEO_ASPECT_RATIO, VIDEO_QUALITY, VIDEO_DURATION,
    VIDEO_COOLDOWN_MIN, VIDEO_COOLDOWN_MAX, INITIAL_QUOTA_WAIT_SECONDS
)
from file_saver import save_video_result

def normalize(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

class AIStudioWorker:
    def __init__(self, page: Page, browser_ctrl=None):
        self.page = page
        self.browser_ctrl = browser_ctrl

    def is_logged_in(self):
        url = self.page.url.lower()
        if "/welcome" in url or "accounts.google.com" in url:
            return False
        return True

    def get_current_model_name(self):
        """Returns the text of the currently active model on the page."""
        selectors = [
            'button[aria-label*="model" i]',
            '[data-testid*="model-selector" i]',
            'div[role="combobox"]',
            'button:has-text("Gemini")',
            'button:has-text("Flash")',
            'button:has-text("Omni")',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=500):
                    txt = el.inner_text().strip()
                    if txt:
                        return txt
            except Exception:
                pass
        return "Не определена"

    def select_model(self, model_name=VIDEO_MODEL):
        """
        Strictly selects target model (omni flash 1.1).
        NEVER accepts generic 'Gemini Flash' as a substitute!
        If exact model is not selected, prompts user in console to pick it on screen.
        """
        print(f"\n[AIStudioWorker] 🔍 Проверка модели (требуется: '{model_name}')...")
        
        # 0. Check URL query params
        url_lower = self.page.url.lower()
        if "omni" in url_lower and ("1.1" in url_lower or "flash" in url_lower):
            print(f"[AIStudioWorker] ✅ Модель '{model_name}' уже выбрана и активна в строке адреса!")
            return True

        norm_target = normalize(model_name)  # 'omniflash11'
        norm_alt = normalize("omni 1.1 flash")  # 'omni11flash'

        current_text = self.get_current_model_name()
        norm_current = normalize(current_text)
        print(f"[AIStudioWorker] На экране сейчас: '{current_text}'")

        # Strict match: must contain both 'omni' and '1.1' or 'flash 1.1'
        if (norm_target in norm_current or norm_alt in norm_current or
            ("omni" in norm_current and "11" in norm_current)):
            print(f"[AIStudioWorker] ✅ Модель '{current_text}' строго соответствует '{model_name}'!")
            return True

        # Try to click model dropdown and find omni flash 1.1
        print(f"[AIStudioWorker] Ищем '{model_name}' в выпадающем списке моделей...")
        dropdown_opened = False
        selectors = [
            'button[aria-label*="model" i]',
            '[data-testid*="model-selector" i]',
            'div[role="combobox"]',
            f'button:has-text("{current_text}")',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=1000):
                    el.click()
                    time.sleep(1)
                    dropdown_opened = True
                    break
            except Exception:
                pass

        if dropdown_opened:
            # Look for exact options
            candidate_selectors = [
                f'[role="option"]:has-text("{model_name}")',
                '[role="option"]:has-text("Omni 1.1 Flash")',
                '[role="option"]:has-text("omni flash 1.1")',
                '[role="option"]:has-text("Omni 1.1")',
            ]
            for c_sel in candidate_selectors:
                try:
                    opt = self.page.locator(c_sel).first
                    if opt.is_visible(timeout=1000):
                        opt.click()
                        time.sleep(1.5)
                        new_model = self.get_current_model_name()
                        print(f"[AIStudioWorker] ✅ Успешно выбрана модель: '{new_model}'!")
                        return True
                except Exception:
                    pass

            # Close dropdown if no match found
            self.page.keyboard.press("Escape")

        # If not matched automatically, DO NOT GUESS OR USE WRONG MODEL!
        print(f"\n[AIStudioWorker] ⚠️ ========================================================")
        print(f"[AIStudioWorker] ВНИМАНИЕ: Автоматически модель '{model_name}' не выбрана!")
        print(f"[AIStudioWorker] Сейчас в окне Microsoft Edge активна: '{current_text}'")
        print(f"[AIStudioWorker] Пожалуйста, выберите в окне Microsoft Edge:")
        print(f"[AIStudioWorker]   1. Модель: {model_name} (или нужную модель для видео)")
        print(f"[AIStudioWorker]   2. Настройки видео: формат 9:16, 1080p, 10 секунд")
        print(f"[AIStudioWorker] ========================================================")
        input("[AIStudioWorker] 🔴 Выставите настройки в Edge и нажмите [ENTER] в этой консоли для продолжения...")
        print("[AIStudioWorker] Принято! Продолжаем работу...")
        return True

    def check_for_quota_limit(self):
        try:
            page_text = self.page.inner_text("body").lower()
            limit_keywords = [
                "quota exceeded", "resource exhausted", "rate limit",
                "too many requests", "try again in", "limit reached",
                "generation limit", "capacity exceeded"
            ]
            for kw in limit_keywords:
                if kw in page_text:
                    match_min = re.search(r"in\s+(\d+)\s*(?:minute|min|мин)", page_text)
                    if match_min:
                        mins = int(match_min.group(1))
                        wait_sec = (mins + 1) * 60
                        print(f"[AIStudioWorker] ⏳ Обнаружено указание времени: {mins} мин.")
                        return True, wait_sec

                    match_sec = re.search(r"in\s+(\d+)\s*(?:second|sec|сек)", page_text)
                    if match_sec:
                        secs = int(match_sec.group(1)) + 10
                        return True, secs

                    return True, INITIAL_QUOTA_WAIT_SECONDS
        except Exception:
            pass
        return False, 0

    def wait_for_quota_reset(self, wait_seconds):
        print(f"\n[AIStudioWorker] ⚠️ ========================================================")
        print(f"[AIStudioWorker] ⏳ ОБНАРУЖЕН ЛИМИТ ГЕНЕРАЦИИ ВИДЕО В GOOGLE AI STUDIO!")
        print(f"[AIStudioWorker] 🛡 Чтобы не рисковать аккаунтом, скрипт приостанавливается.")
        print(f"[AIStudioWorker] Время ожидания: {wait_seconds // 60} мин. {wait_seconds % 60} сек.")
        print(f"[AIStudioWorker] ========================================================\n")

        remaining = wait_seconds
        while remaining > 0:
            mins = remaining // 60
            secs = remaining % 60
            sys.stdout.write(f"\r[AIStudioWorker] ⏳ Ожидание сброса лимита: осталось {mins:02d}:{secs:02d} ... ")
            sys.stdout.flush()
            sleep_step = min(15, remaining)
            time.sleep(sleep_step)
            remaining -= sleep_step

        print("\n[AIStudioWorker] 🔔 Время ожидания истекло! Перезагрузка страницы и повторная попытка...")
        try:
            self.page.reload(wait_until="domcontentloaded")
            time.sleep(5)
        except Exception:
            pass

    def find_prompt_input(self):
        selectors = [
            'textarea',
            'div[role="textbox"]',
            '[aria-label*="Prompt" i]',
            'rich-textarea textarea',
            'div[contenteditable="true"]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=1000):
                    return el
            except Exception:
                continue
        return None

    def find_run_button(self):
        selectors = [
            'button:has-text("Run")',
            'button[aria-label*="Run" i]',
            'button:has-text("Generate")',
            'button[aria-label*="Generate" i]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=1000):
                    return el
            except Exception:
                continue
        return None

    def generate_video(self, prompt_text: str, target_path: str, story_target_path: str = None, timeout_seconds=360):
        start_time = time.time()
        print(f"\n[AIStudioWorker] =========================================")
        print(f"[AIStudioWorker] Генерация видео")
        print(f"[AIStudioWorker] Модель: {VIDEO_MODEL} | Формат: {VIDEO_ASPECT_RATIO} | Качество: {VIDEO_QUALITY} | Хронометраж: {VIDEO_DURATION}s")
        print(f"[AIStudioWorker] Целевой файл: {target_path}")

        if not self.is_logged_in():
            raise RuntimeError(
                "Пользователь не авторизован в Google AI Studio! "
                "Пожалуйста, авторизуйтесь в вашем Microsoft Edge."
            )

        # 1. STRICT MODEL VERIFICATION (never proceed with wrong model)
        self.select_model(VIDEO_MODEL)

        max_quota_retries = 10
        for quota_attempt in range(max_quota_retries):
            is_limited, wait_time = self.check_for_quota_limit()
            if is_limited:
                self.wait_for_quota_reset(wait_time)
                continue

            # 2. Strict Prompt Header with 9:16, 1080p, exactly 10 seconds
            clean_prompt = prompt_text.strip()
            header = f"FORMAT: vertical 9:16, 1080p Full HD, exactly 10 seconds, 24 fps.\n"
            if not "1080p" in clean_prompt.lower():
                clean_prompt = header + clean_prompt

            # 3. Enter Prompt
            input_el = self.find_prompt_input()
            if not input_el:
                raise RuntimeError("Не удалось найти поле ввода промпта в Google AI Studio.")

            if self.browser_ctrl:
                self.browser_ctrl.human_type(self.page, input_el, clean_prompt)
            else:
                input_el.click()
                time.sleep(0.5)
                input_el.fill(clean_prompt)
                time.sleep(0.5)

            # 4. Click Run
            run_btn = self.find_run_button()
            if run_btn and run_btn.is_enabled():
                if self.browser_ctrl:
                    self.browser_ctrl.human_click(self.page, run_btn)
                else:
                    run_btn.click()
            else:
                input_el.press("Control+Enter")

            print("[AIStudioWorker] Генерация запущена. Ожидание рендера...")
            time.sleep(3)

            is_limited, wait_time = self.check_for_quota_limit()
            if is_limited:
                self.wait_for_quota_reset(wait_time)
                continue

            # 5. Wait for video generation to complete
            video_el = None
            quota_hit_during_wait = False

            while time.time() - start_time < timeout_seconds:
                time.sleep(3)

                is_limited, wait_time = self.check_for_quota_limit()
                if is_limited:
                    print("\n[AIStudioWorker] ⚠️ Предупреждение квоты обнаружено во время генерации.")
                    quota_hit_during_wait = True
                    break

                videos = self.page.locator("video")
                if videos.count() > 0:
                    for i in range(videos.count()):
                        v = videos.nth(i)
                        if v.is_visible():
                            src = v.get_attribute("src")
                            if src and len(src) > 5:
                                video_el = v
                                break
                if video_el:
                    break

                elapsed = int(time.time() - start_time)
                if elapsed % 15 == 0:
                    print(f"[AIStudioWorker] Рендеринг видео... прошло {elapsed}с (макс {timeout_seconds}с)")

            if quota_hit_during_wait:
                self.wait_for_quota_reset(wait_time or INITIAL_QUOTA_WAIT_SECONDS)
                continue

            if not video_el:
                is_limited, wait_time = self.check_for_quota_limit()
                if is_limited:
                    self.wait_for_quota_reset(wait_time or INITIAL_QUOTA_WAIT_SECONDS)
                    continue
                raise TimeoutError("Время ожидания генерации видео в Google AI Studio истекло.")

            # 6. Capture download object
            download_obj = None
            try:
                download_btn = self.page.locator('button[aria-label*="Download" i], button:has-text("Download")').first
                if download_btn.is_visible(timeout=1500):
                    with self.page.expect_download(timeout=10000) as download_info:
                        download_btn.click()
                    download_obj = download_info.value
            except Exception:
                pass

            # 7. Save video immediately
            success = save_video_result(
                target_path=target_path,
                backup_path=story_target_path,
                download_obj=download_obj,
                video_element=video_el,
                page=self.page,
                start_time=start_time
            )

            if success and os.path.isfile(target_path) and os.path.getsize(target_path) > 10240:
                print(f"[AIStudioWorker] 🎉 Видео готово и сразу помещено в целевые папки:")
                print(f"  📁 {target_path}")
                if story_target_path:
                    print(f"  📁 {story_target_path}")
                cooldown = random.uniform(VIDEO_COOLDOWN_MIN, VIDEO_COOLDOWN_MAX)
                print(f"[AIStudioWorker] 🛡 Безопасная пауза перед следующим видео: {cooldown:.1f} сек...")
                time.sleep(cooldown)
                return True
            else:
                raise RuntimeError(f"Файл видео не найден или слишком мал: {target_path}")

        raise RuntimeError("Превышено максимальное число повторов ожидания квоты.")
