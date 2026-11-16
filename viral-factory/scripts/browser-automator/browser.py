import os
import sys
import time
import random
import urllib.request
from playwright.sync_api import sync_playwright, BrowserContext, Page
from config import EDGE_PATH, CDP_PORT, CDP_URL, SCREENSHOTS_DEBUG_DIR, MIN_ACTION_DELAY, MAX_ACTION_DELAY, FLOW_URL, AISTUDIO_URL
from launch_edge_real import is_cdp_ready, launch_automator_edge

class BrowserController:
    def __init__(self, headless=False):
        self.headless = headless
        self.playwright = None
        self.context = None
        self.browser = None
        self.is_cdp = True

    def human_delay(self, min_s=MIN_ACTION_DELAY, max_s=MAX_ACTION_DELAY):
        delay = random.uniform(min_s, max_s)
        time.sleep(delay)

    def human_click(self, page: Page, locator):
        """Clicks element inside the background tab without stealing OS mouse focus."""
        try:
            locator.scroll_into_view_if_needed(timeout=3000)
            locator.click(timeout=5000)
            self.human_delay(0.5, 1.2)
        except Exception:
            locator.click()

    def human_type(self, page: Page, locator, text: str):
        """Fills text inside the background tab without stealing OS keyboard focus."""
        try:
            locator.click(timeout=3000)
            time.sleep(0.3)
            locator.fill(text)
            self.human_delay(0.5, 1.5)
        except Exception:
            locator.fill(text)

    def start(self):
        self.playwright = sync_playwright().start()

        # Check if dedicated Automator Edge is running with remote debugging port
        if not is_cdp_ready():
            print("\n-------------------------------------------------------------------------")
            print("🌐 ЗАПУСК РАБОЧЕГО MICROSOFT EDGE ДЛЯ АВТОГЕНЕРАЦИИ:")
            print("  ▶ Открывается отдельное выделенное окно Microsoft Edge.")
            print("  ▶ 🛡 ВАШ ЛИЧНЫЙ БРАУЗЕР (где вы смотрите YouTube) НЕ ЗАКРЫВАЕТСЯ И НЕ ТРОГАЕТСЯ!")
            print("-------------------------------------------------------------------------")
            success = launch_automator_edge()
            if not success:
                raise RuntimeError("Не удалось запустить рабочий Microsoft Edge на порту 9222.")

        print(f"\n[Browser] Подключение к открытому Microsoft Edge через CDP...")
        try:
            self.browser = self.playwright.chromium.connect_over_cdp(CDP_URL)
            self.context = self.browser.contexts[0] if self.browser.contexts else self.browser.new_context()
            self.is_cdp = True
            print("[Browser] ✅ Успешно подключено к браузеру в фоновом режиме!")
            print("[Browser] 🎮 Вы можете спокойно смотреть YouTube — скрипт не переключает вкладки!")
            return self
        except Exception as e:
            raise RuntimeError(f"Ошибка фонового подключения к Microsoft Edge: {e}")

    def get_or_create_page(self, url_pattern, target_url):
        """
        Finds the target background tab WITHOUT calling bring_to_front(),
        so the user's active YouTube tab stays in focus undisturbed!
        """
        pages = self.context.pages
        for p in pages:
            if url_pattern.lower() in p.url.lower():
                print(f"[Browser] 🎯 Найдена фоновая вкладка: \"{p.title()}\"")
                print(f"[Browser] 👁 Фокус остаётся на вашей текущей вкладке (YouTube)!")
                # IMPORTANT: DO NOT call p.bring_to_front()!
                return p

        # If tab not open yet, open it in background
        print(f"[Browser] Вкладка {url_pattern} не найдена, открываем новую вкладку в фоне: {target_url} ...")
        page = self.context.new_page()
        page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
        return page

    def save_debug_screenshot(self, page: Page, name: str):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{timestamp}.png"
        path = os.path.join(SCREENSHOTS_DEBUG_DIR, filename)
        try:
            page.screenshot(path=path)
            print(f"[Browser] 📸 Скриншот отладки сохранен: {path}")
        except Exception as e:
            print(f"[Browser] Ошибка скриншота: {e}")
        return path

    def stop(self):
        print("[Browser] Отключение от фонового управления браузером...")
        # IMPORTANT: DO NOT call self.browser.close() here, as it sends Browser.close CDP command
        # and would terminate the user's Edge window where they are watching YouTube!
        try:
            if self.playwright:
                self.playwright.stop()
        except Exception:
            pass
        print("[Browser] Отключено. Ваш браузер и вкладка с YouTube продолжают работать!")

    def __enter__(self):
        return self.start()

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
