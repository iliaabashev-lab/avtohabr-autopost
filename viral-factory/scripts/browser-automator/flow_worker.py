import os
import sys
import re
import time
import random
from playwright.sync_api import Page, TimeoutError
from config import (
    FLOW_IMAGE_MODEL, SERIOUS_ASPECT_RATIO, FUNNY_ASPECT_RATIO_PRIMARY,
    IMAGE_COOLDOWN_MIN, IMAGE_COOLDOWN_MAX, AI_IMAGES_SERIOUS, AI_IMAGES_FUNNY
)
from file_saver import save_image_result

def normalize(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

class FlowWorker:
    def __init__(self, page: Page, browser_ctrl=None):
        self.page = page
        self.browser_ctrl = browser_ctrl

    def is_logged_in(self):
        url = self.page.url.lower()
        if "flow.google.com/about" in url or "accounts.google.com" in url or "/welcome" in url:
            return False
        return True

    def get_current_model_name(self):
        selectors = [
            'button[aria-label*="model" i]',
            'div[role="combobox"]',
            '[data-testid*="model" i]',
            'button:has-text("Model")',
            'button:has-text("Imagen")',
            'button:has-text("nano")',
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

    def select_model(self, model_name=FLOW_IMAGE_MODEL):
        print(f"\n[FlowWorker] 🔍 Проверка модели (требуется: '{model_name}')...")
        
        # If user has an active project open, settings are already configured by user
        if "/project/" in self.page.url.lower():
            print(f"[FlowWorker] ✅ Проект Google Flow уже открыт и настроен пользователем!")
            return True

        norm_target = normalize(model_name)  # 'nanobananopro'
        current_text = self.get_current_model_name()
        norm_current = normalize(current_text)
        print(f"[FlowWorker] На экране сейчас: '{current_text}'")

        if "nanobanano" in norm_current or norm_target in norm_current:
            print(f"[FlowWorker] ✅ Модель '{current_text}' строго соответствует '{model_name}'!")
            return True

        # Try to open dropdown and find exact model
        print(f"[FlowWorker] Ищем '{model_name}' в интерфейсе Google Flow...")
        dropdown_opened = False
        selectors = [
            'button[aria-label*="model" i]',
            'div[role="combobox"]',
            '[data-testid*="model" i]',
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
            candidate_selectors = [
                f'[role="option"]:has-text("{model_name}")',
                f'button:has-text("{model_name}")',
                '[role="option"]:has-text("nano banano")',
                '[role="option"]:has-text("Nano Banano Pro")',
            ]
            for c_sel in candidate_selectors:
                try:
                    opt = self.page.locator(c_sel).first
                    if opt.is_visible(timeout=1000):
                        opt.click()
                        time.sleep(1.5)
                        new_model = self.get_current_model_name()
                        print(f"[FlowWorker] ✅ Успешно выбрана модель: '{new_model}'!")
                        return True
                except Exception:
                    pass
            self.page.keyboard.press("Escape")

        # If not selected automatically, ask user on screen
        print(f"\n[FlowWorker] ⚠️ ========================================================")
        print(f"[FlowWorker] ВНИМАНИЕ: Автоматически модель '{model_name}' не выбрана!")
        print(f"[FlowWorker] Сейчас на экране: '{current_text}'")
        print(f"[FlowWorker] Пожалуйста, выберите модель '{model_name}' в окне Microsoft Edge.")
        print(f"[FlowWorker] ========================================================")
        input("[FlowWorker] 🔴 Выставите модель в Edge и нажмите [ENTER] в этой консоли для продолжения...")
        print("[FlowWorker] Принято! Продолжаем...")
        return True

    def set_aspect_ratio(self, ratio="16:9"):
        print(f"[FlowWorker] Установка формата кадра: {ratio}...")
        selectors = [
            f'button:has-text("{ratio}")',
            f'[aria-label*="{ratio}" i]',
            f'[data-aspect-ratio="{ratio}"]',
        ]
        if ratio == "16:9":
            selectors.extend(['button:has-text("Landscape")', 'button:has-text("Widescreen")', 'button:has-text("16:9")'])
        elif ratio == "9:16":
            selectors.extend(['button:has-text("Portrait")', 'button:has-text("Vertical")', 'button:has-text("9:16")'])
        elif ratio == "1:1":
            selectors.extend(['button:has-text("Square")', 'button:has-text("1:1")'])

        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=1000):
                    el.click()
                    time.sleep(0.8)
                    print(f"[FlowWorker] ✅ Формат {ratio} успешно выбран!")
                    return True
            except Exception:
                continue
        print(f"[FlowWorker] Кнопка формата {ratio} не найдена в текущем виде, формат задан в тексте промпта.")
        return False

    def find_prompt_input(self):
        selectors = [
            'div.ProseMirror',
            'div[contenteditable="true"]',
            'div[role="textbox"]',
            'textarea',
            'input[type="text"][placeholder*="describe" i]',
            'input[type="text"][placeholder*="prompt" i]',
            '[aria-label*="prompt" i]',
            '[aria-label*="describe" i]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=1000):
                    return el
            except Exception:
                continue
        return None

    def find_generate_button(self):
        selectors = [
            'button.generate-icon-button',
            'button[aria-label*="Start generation" i]',
            'button[aria-label*="generation" i]',
            'button:has-text("arrow_forward")',
            'button:has-text("Generate")',
            'button:has-text("Create")',
            'button:has-text("Submit")',
            'button[aria-label*="Generate" i]',
            'button[aria-label*="Create" i]',
            'button[type="submit"]',
        ]
        for sel in selectors:
            try:
                el = self.page.locator(sel).first
                if el.is_visible(timeout=1000):
                    return el
            except Exception:
                continue
        return None

    def attach_mascot_reference(self):
        """
        Attaches mascot_reference.jpg as an ingredient in Google Flow prompt box for funny photos.
        """
        try:
            ing_bar = self.page.locator('.prompt-ingredient-bar, [class*="has-ingredient-bar"]').first
            if ing_bar.is_visible(timeout=500):
                print("[FlowWorker] 🎭 Референс маскота уже прикреплён в поле промпта.")
                return True

            add_btn = self.page.locator('button[aria-label*="Add ingredients to the prompt box" i]').first
            if add_btn.is_visible(timeout=1500):
                add_btn.click()
                time.sleep(0.6)
                ref_item = self.page.locator('.cdk-overlay-container :is(button, [role="menuitem"], mat-list-item):has-text("mascot_reference")').first
                if ref_item.is_visible(timeout=2000):
                    ref_item.click()
                    time.sleep(0.6)
                    print("[FlowWorker] 🎭 Референс маскота успешно прикреплён к промпту!")
                    return True
                else:
                    self.page.keyboard.press("Escape")
        except Exception as e:
            print(f"[FlowWorker] Предупреждение при прикреплении референса: {e}")
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
        return False

    def clear_ingredient(self):
        """
        Removes any attached ingredient from the prompt box for serious documentary photos.
        """
        try:
            close_btn = self.page.locator('.prompt-top-row button:has-text("close"), .prompt-ingredient-bar button, button[aria-label*="Remove ingredient" i]').first
            if close_btn.is_visible(timeout=600):
                close_btn.click()
                time.sleep(0.4)
                print("[FlowWorker] 🧹 Ингредиент убран для создания серьёзного фото без персонажа.")
        except Exception:
            pass

    def adapt_prompt_for_ratio(self, prompt_text: str, ratio: str):
        clean = prompt_text.strip()
        if ratio == "16:9":
            if clean.startswith("Square 1:1,"):
                clean = "Widescreen 16:9, " + clean[len("Square 1:1,"):].strip()
            elif not clean.lower().startswith("16:9") and not "widescreen" in clean[:30].lower():
                clean = "Widescreen 16:9, " + clean
        elif ratio == "9:16":
            if clean.startswith("Square 1:1,"):
                clean = "Vertical 9:16, " + clean[len("Square 1:1,"):].strip()
            elif not clean.lower().startswith("9:16") and not "vertical" in clean[:30].lower():
                clean = "Vertical 9:16, " + clean
        elif ratio == "1:1":
            if not clean.lower().startswith("square 1:1"):
                clean = "Square 1:1, " + clean
        return clean

    def generate_image(self, prompt_text: str, target_path: str, ratio="16:9", model_name=FLOW_IMAGE_MODEL, backup_path=None, timeout_seconds=90, tone="serious"):
        start_time = time.time()
        print(f"\n[FlowWorker] =========================================")
        print(f"[FlowWorker] Генерация фото")
        print(f"[FlowWorker] Модель: {model_name} | Формат: {ratio}")
        print(f"[FlowWorker] Назначение: {target_path}")

        if not self.is_logged_in():
            raise RuntimeError(
                "Пользователь не авторизован в Google Flow! "
                "Пожалуйста, авторизуйтесь в вашем Microsoft Edge со своей подпиской."
            )

        # 1. STRICT MODEL VERIFICATION
        self.select_model(model_name)

        # 2. Select Ratio in UI
        self.set_aspect_ratio(ratio)

        # 3. Adapt prompt text to match ratio
        final_prompt = self.adapt_prompt_for_ratio(prompt_text, ratio)

        # 3.1 Прикрепление референса персонажа для смешных фото / очистка для серьёзных
        if tone == "funny" or "mascot" in final_prompt.lower():
            self.attach_mascot_reference()
        else:
            self.clear_ingredient()
        print(f"[FlowWorker] Промпт: {final_prompt[:130]}...")

        # 4. Fill input
        input_el = self.find_prompt_input()
        if not input_el:
            raise RuntimeError("Поле ввода промпта в Google Flow не найдено.")

        if self.browser_ctrl:
            self.browser_ctrl.human_type(self.page, input_el, final_prompt)
        else:
            input_el.click()
            time.sleep(0.5)
            input_el.fill(final_prompt)
            time.sleep(0.5)

        # 5. Count images to detect completion
        initial_img_count = self.page.locator("img").count()
        initial_user_tiles = self.page.locator('img[alt*="Tile displaying a user\'s image"]').count()

        # 6. Click generate button
        gen_btn = self.find_generate_button()
        if gen_btn and gen_btn.is_enabled():
            if self.browser_ctrl:
                self.browser_ctrl.human_click(self.page, gen_btn)
            else:
                gen_btn.click()
        else:
            input_el.press("Control+Enter")
            time.sleep(0.3)
            input_el.press("Enter")

        print("[FlowWorker] Генерация запущена. Ожидание изображения...")

        # 7. Wait for generation to finish
        new_image_found = False
        target_img_el = None

        while time.time() - start_time < timeout_seconds:
            time.sleep(2)
            
            # Check if Google Flow auto-opened the full-screen view (/edit/)
            if "/edit/" in self.page.url.lower() or self.page.locator('button:has-text("Done")').count() > 0:
                print("[FlowWorker] 🎯 Обнаружено открытие готового фото в полноэкранном просмотре!")
                new_image_found = True
                break

            spinners = self.page.locator('[role="progressbar"], .spinner, [aria-label*="loading" i]').count()
            user_tiles = self.page.locator('img[alt*="Tile displaying a user\'s image"]')
            current_user_count = user_tiles.count()

            if current_user_count > initial_user_tiles:
                target_img_el = user_tiles.last
                new_image_found = True
                break

            current_imgs = self.page.locator("img")
            count = current_imgs.count()

            if spinners == 0 and count > initial_img_count:
                for i in range(count - 1, -1, -1):
                    img = current_imgs.nth(i)
                    if img.is_visible():
                        box = img.bounding_box()
                        if box and box["width"] > 150 and box["height"] > 150:
                            target_img_el = img
                            new_image_found = True
                            break

            if new_image_found:
                break

            elapsed = int(time.time() - start_time)
            if elapsed % 10 == 0:
                print(f"[FlowWorker] Генерация в процессе... прошло {elapsed}с")

        if not target_img_el and not ("/edit/" in self.page.url.lower()):
            for img in self.page.locator("img").all():
                if img.is_visible():
                    box = img.bounding_box()
                    if box and box["width"] > 250 and box["height"] > 200:
                        target_img_el = img
                        break

        # 8. Check for download button (1K Original size or download icon)
        download_obj = None
        is_edit_view = "/edit/" in self.page.url.lower() or self.page.locator('button:has-text("Done")').count() > 0

        # Если фото на холсте и модальное окно ещё не открыто — открываем его кликом по плитке
        if not is_edit_view and target_img_el:
            print("[FlowWorker] 🔍 Кликаем по готовой плитке на холсте, чтобы открыть режим 1K скачивания...")
            try:
                target_img_el.click()
                time.sleep(1.5)
                is_edit_view = "/edit/" in self.page.url.lower() or self.page.locator('button:has-text("Done")').count() > 0
            except Exception as e:
                print(f"[FlowWorker] Предупреждение при открытии плитки: {e}")

        # Candidates to click 1K Original Size
        candidates_1k = [
            'span.label:has-text("1K")',
            ':is(button, span, div):has-text("1K")',
            'span.caption:has-text("Original size")',
            'text="1K"',
            'text="Original size"',
            '[aria-label*="1K" i]'
        ]

        btn_1k = None
        for c_sel in candidates_1k:
            try:
                el = self.page.locator(c_sel).first
                if el.is_visible(timeout=500):
                    btn_1k = el
                    break
            except Exception:
                pass

        # If 1K popup menu is not yet open, click download icon first
        if not btn_1k:
            dl_icon = self.page.locator('button[aria-label*="Download" i], button:has-text("Download"), button:has-text("file_download")').first
            if dl_icon.is_visible(timeout=1500):
                try:
                    dl_icon.click()
                    time.sleep(0.6)
                except Exception:
                    pass

            for c_sel in candidates_1k:
                try:
                    el = self.page.locator(c_sel).first
                    if el.is_visible(timeout=1000):
                        btn_1k = el
                        break
                except Exception:
                    pass

        if btn_1k:
            print("[FlowWorker] 📥 Кликаем '1K Original size' для скачивания оригинального файла...")
            try:
                with self.page.expect_download(timeout=10000) as download_info:
                    btn_1k.click()
                download_obj = download_info.value
                print(f"[FlowWorker] ✅ Файл успешно перехвачен: {download_obj.suggested_filename}")
            except Exception as e:
                print(f"[FlowWorker] Предупреждение при ожидании скачивания 1K: {e}")

        # 9. Save image immediately to target folder
        success = save_image_result(
            target_path=target_path,
            backup_path=backup_path,
            download_obj=download_obj,
            img_element=target_img_el,
            page=self.page,
            start_time=start_time
        )

        # 10. Close full-screen view (Click Done or Escape) to return to project canvas
        if is_edit_view or "/edit/" in self.page.url.lower():
            print("[FlowWorker] 🔄 Закрываем просмотр фото (Done), возвращаемся в проект к полю ввода...")
            try:
                done_btn = self.page.locator('button:has-text("Done")').first
                if done_btn.is_visible(timeout=1500):
                    done_btn.click()
                    time.sleep(1)
                else:
                    self.page.keyboard.press("Escape")
                    time.sleep(0.5)
            except Exception:
                self.page.keyboard.press("Escape")

        if success and os.path.isfile(target_path) and os.path.getsize(target_path) > 2048:
            print(f"[FlowWorker] 🎉 Фото готово и сразу помещено в: {target_path}")
            cooldown = random.uniform(IMAGE_COOLDOWN_MIN, IMAGE_COOLDOWN_MAX)
            print(f"[FlowWorker] 🛡 Безопасная пауза перед следующим фото: {cooldown:.1f} сек...")
            time.sleep(cooldown)
            return True
        else:
            raise RuntimeError(f"Не удалось сохранить фото в целевую папку: {target_path}")
