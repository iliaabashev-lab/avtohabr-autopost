import os
import sys

# Ensure UTF-8 output on Windows console
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import time
from config import (
    FLOW_URL, AISTUDIO_URL, EDGE_PATH, CDP_PORT,
    FLOW_IMAGE_MODEL, VIDEO_MODEL, VIDEO_ASPECT_RATIO, VIDEO_QUALITY, VIDEO_DURATION
)
from browser import BrowserController
from post_image_planner import plan_network_images, sync_generated_image
from prompt_manager import get_pending_video_prompts
from flow_worker import FlowWorker
from aistudio_worker import AIStudioWorker
from launch_edge_real import launch_automator_edge, is_cdp_ready

def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def print_header():
    print("""
=========================================================================
          AVTOHABR CONTENT FACTORY: ГЕНЕРАТОР КОНТЕНТА
=========================================================================
  🎮 ФОНОВЫЙ РЕЖИМ: Вы смотрите YouTube — скрипт работает в своём окне!
  🌐 Браузер: Выделенный Microsoft Edge (порт 9222) с вашим VPN
  🎨 Модель фото:  nano banano pro (Google Flow)
  🎬 Модель видео: omni flash 1.1 (Google AI Studio, 10s, 1080p, 9:16)
  🛑 Принудительная остановка: в любой момент нажмите [Ctrl + C]
=========================================================================
""")

def select_network():
    print("\n  Для какой соцсети готовим картинки?")
    print("  1 - Telegram (канал @avtohabr)")
    print("  2 - VK (группа vk.ru/avtohabr)")
    print("  3 - MAX (канал max.ru/channel_avtohabr)")
    print("  4 - Threads")
    print("  5 - Для всех соцсетей сразу (по очереди)")
    print("  0 - Назад в главное меню\n")
    sub = input("Выберите вариант [0-5]: ").strip()
    if sub == "1": return ["telegram"]
    if sub == "2": return ["vk"]
    if sub == "3": return ["max"]
    if sub == "4": return ["threads"]
    if sub == "5": return ["telegram", "vk", "max", "threads"]
    return None

def run_photo_generation(tone="serious", ratio="16:9"):
    networks = select_network()
    if not networks:
        return

    print("\n  Сколько фото сгенерировать для каждой соцсети?")
    limit_input = input("  Введите число (например, 1, 3, 5) или нажмите ENTER для всех: ").strip()
    per_net_limit = None
    if limit_input.isdigit() and int(limit_input) > 0:
        per_net_limit = int(limit_input)

    all_tasks = []
    for net in networks:
        tasks = plan_network_images(network=net, requested_tone=tone, ratio=ratio)
        pending = [t for t in tasks if not t["exists"]]
        if per_net_limit:
            pending = pending[:per_net_limit]
        for t in pending:
            all_tasks.append(t)

    print(f"\n---------------------------------------------------------")
    print(f"📋 ПЛАН ГЕНЕРАЦИИ В ВЫДЕЛЕННОМ GOOGLE FLOW:")
    print(f"  ▶ Тип:       {'Серьёзные фото (16:9, без маскота)' if tone == 'serious' else 'Смешные фото (с маскотом)'}")
    print(f"  ▶ Модель:    {FLOW_IMAGE_MODEL}")
    print(f"  ▶ Формат:    {ratio}")
    print(f"  ▶ Соцсети:   {', '.join(networks).upper()}")
    print(f"  ▶ В очереди: {len(all_tasks)} шт. (лимит на соцсеть: {per_net_limit or 'все'})")
    print(f"  🎮 Вы можете спокойно смотреть YouTube — скрипт работает в отдельном браузере!")
    print(f"  🛑 Принудительно остановить генерацию можно клавишами [Ctrl + C].")
    print(f"---------------------------------------------------------")

    if not all_tasks:
        print("✅ Все картинки для выбранных постов уже готовы!")
        input("\nНажмите Enter, чтобы вернуться в меню...")
        return

    print("Примеры постов в очереди:")
    for i, it in enumerate(all_tasks[:3]):
        print(f"  [{it['network'].upper()}] #{it['id']}: \"{it['text_snippet']}\"")
    if len(all_tasks) > 3:
        print(f"  ... и ещё {len(all_tasks)-3} постов")

    confirm = input("\nЗапустить генерацию? [ENTER - Да / q - Отмена]: ").strip().lower()
    if confirm in ["q", "й"]:
        print("Отменено.")
        time.sleep(1)
        return

    try:
        with BrowserController(headless=False) as browser:
            page = browser.get_or_create_page("flow.google.com", FLOW_URL)
            time.sleep(2)
            worker = FlowWorker(page, browser_ctrl=browser)

            for idx, task in enumerate(all_tasks):
                print(f"\n[{idx+1}/{len(all_tasks)}] 📸 Генерация для {task['network'].upper()} #{task['id']} ({ratio})...")
                print("  💡 Для принудительной остановки нажмите [Ctrl + C] в любое время.")
                try:
                    worker.generate_image(
                        prompt_text=task["prompt_text"],
                        target_path=task["target_file"],
                        ratio=ratio,
                        model_name=FLOW_IMAGE_MODEL,
                        tone=task["tone"]
                    )
                    sync_generated_image(
                        network=task["network"],
                        post_id=task["id"],
                        target_file=task["target_file"],
                        tone=task["tone"]
                    )
                    print(f"[OK] ✅ Готово! Фото сохранено в: {task['target_file']}")
                except KeyboardInterrupt:
                    raise
                except Exception as e:
                    print(f"[ERR] ❌ Ошибка на #{task['id']}: {e}")
                    browser.save_debug_screenshot(page, f"err_{task['network']}_{task['id']}")
                    time.sleep(3)

        print("\n🎉 Все запланированные фото сгенерированы и сохранены!")
    except KeyboardInterrupt:
        print("\n\n🛑 ПРИНУДИТЕЛЬНАЯ ОСТАНОВКА ПОЛЬЗОВАТЕЛЕМ!")
        print("✅ Все сгенерированные до этого момента файлы надёжно сохранены на диске.")
        time.sleep(2)

    input("\nНажмите Enter для возврата в меню...")

def run_video_generation():
    prompts = get_pending_video_prompts()
    pending = [p for p in prompts if not p["exists"]]

    print(f"\n---------------------------------------------------------")
    print(f"📋 ГЕНЕРАЦИЯ ВИДЕО В ВЫДЕЛЕННОМ GOOGLE AI STUDIO:")
    print(f"  ▶ Модель:       {VIDEO_MODEL}")
    print(f"  ▶ Формат:       {VIDEO_ASPECT_RATIO} | {VIDEO_QUALITY} Full HD | {VIDEO_DURATION} секунд")
    print(f"  ▶ Назначение:   YouTube Shorts, Instagram Reels, VK Клипы")
    print(f"  ▶ Доступно:     {len(pending)} из {len(prompts)} роликов")
    print(f"  🎮 Вы можете смотреть YouTube — генерация идёт в рабочем окне AI Studio!")
    print(f"  🛡 Защита:      При исчерпании лимитов скрипт сам ожидает сброса квоты")
    print(f"  🛑 Принудительно остановить генерацию можно клавишами [Ctrl + C].")
    print(f"---------------------------------------------------------")

    if not pending:
        print("✅ Все 68 видеороликов уже готовы!")
        input("\nНажмите Enter, чтобы вернуться в меню...")
        return

    limit_input = input(f"Сколько видео сгенерировать сейчас? [Число / ENTER для всех {len(pending)}]: ").strip()
    if limit_input.isdigit() and int(limit_input) > 0:
        pending = pending[:int(limit_input)]

    confirm = input(f"\nЗапустить генерацию {len(pending)} видео? [ENTER - Да / q - Отмена]: ").strip().lower()
    if confirm in ["q", "й"]:
        print("Отменено.")
        time.sleep(1)
        return

    try:
        with BrowserController(headless=False) as browser:
            page = browser.get_or_create_page("aistudio.google.com", AISTUDIO_URL)
            time.sleep(2)
            worker = AIStudioWorker(page, browser_ctrl=browser)

            for idx, task in enumerate(pending):
                print(f"\n[{idx+1}/{len(pending)}] 🎬 Рендеринг видео #{task['id']} (10s, 1080p, 9:16)...")
                print("  💡 Для принудительной остановки нажмите [Ctrl + C] в любое время.")
                try:
                    worker.generate_video(
                        prompt_text=task["prompt_text"],
                        target_path=task["target_file"],
                        story_target_path=task.get("story_target")
                    )
                    print(f"[OK] ✅ Ролик #{task['id']} готов и сохранён в:")
                    print(f"   📁 {task['target_file']}")
                    if task.get("story_target"):
                        print(f"   📁 {task['story_target']}")
                except KeyboardInterrupt:
                    raise
                except Exception as e:
                    print(f"[ERR] ❌ Ошибка генерации видео #{task['id']}: {e}")
                    browser.save_debug_screenshot(page, f"err_video_{task['id']}")
                    time.sleep(5)

        print("\n🎉 Генерация видео завершена!")
    except KeyboardInterrupt:
        print("\n\n🛑 ПРИНУДИТЕЛЬНАЯ ОСТАНОВКА ПОЛЬЗОВАТЕЛЕМ!")
        print("✅ Все сгенерированные видео сохранены на диске.")
        time.sleep(2)

    input("\nНажмите Enter для возврата в меню...")

def main_menu():
    while True:
        clear_screen()
        print_header()
        print("  ЧТО ДЕЛАЕМ СЕЙЧАС?\n")
        print("  1 - Серьёзные фото (16:9, без маскота, фото сервиса/деталей)")
        print("  2 - Смешные фото 9:16 (вертикальные, с маскотом)")
        print("  3 - Смешные фото 1:1 (квадратные, с маскотом)")
        print("  4 - Видео (Shorts / Reels / VK Клипы: 9:16, 10s, 1080p)")
        print("  5 - 🚀 АВТОПИЛОТ (Полный автомат: Shorts, Reels, VK, Threads по расписанию)")
        print("")
        print("  0 - Выход\n")
        choice = input("Выберите действие [0-5]: ").strip()

        if choice == "1":
            run_photo_generation(tone="serious", ratio="16:9")
        elif choice == "2":
            run_photo_generation(tone="funny", ratio="9:16")
        elif choice == "3":
            run_photo_generation(tone="funny", ratio="1:1")
        elif choice == "4":
            run_video_generation()
        elif choice == "5":
            from autopilot_engine import run_daemon_loop
            run_daemon_loop()
        elif choice == "0":
            print("\nВыход из программы. До встречи!")
            break
        else:
            print("Неверный ввод, выберите цифру от 0 до 4.")
            time.sleep(1)

if __name__ == "__main__":
    main_menu()
