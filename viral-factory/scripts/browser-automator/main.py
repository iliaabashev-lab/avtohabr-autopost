import os
import sys

# Ensure UTF-8 output on Windows console
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import time
import argparse
from config import (
    FLOW_URL, AISTUDIO_URL, USER_DATA_DIR, EDGE_PATH, CDP_PORT,
    FLOW_IMAGE_MODEL, SERIOUS_ASPECT_RATIO, FUNNY_ASPECT_RATIO_PRIMARY,
    VIDEO_MODEL, VIDEO_ASPECT_RATIO, VIDEO_QUALITY, VIDEO_DURATION
)
from browser import BrowserController
from prompt_manager import get_pending_image_prompts, get_pending_video_prompts
from flow_worker import FlowWorker
from aistudio_worker import AIStudioWorker

def print_banner():
    print("""
=========================================================
[AI] AVTOHABR CONTENT FACTORY: MICROSOFT EDGE AUTOMATOR
=========================================================
  Браузер:        Microsoft Edge (Anti-Ban Stealth Mode)
  Серьезные фото: 16:9 | Модель: nano banano pro
  Смешные фото:   9:16 / 1:1 | Модель: nano banano pro
  Видео:          9:16 | 1080p | 10s | omni flash 1.1
  Защита квот:    Авто-ожидание сброса лимитов AI Studio
  Профиль:        C:\\Users\\iliaa\\.gemini\\antigravity\\edge_session
=========================================================
""")

def confirm_run(mode_desc, model_desc, ratio_desc, count):
    print("\n---------------------------------------------------------")
    print(f"📋 ПОДТВЕРЖДЕНИЕ ПАРАМЕТРОВ ЗАПУСКА:")
    print(f"  ▶ Режим:   {mode_desc}")
    print(f"  ▶ Модель:  {model_desc}")
    print(f"  ▶ Формат:  {ratio_desc}")
    print(f"  ▶ Очередь: {count} шт.")
    print("---------------------------------------------------------")
    ans = input("Запустить генерацию с этими параметрами? [ENTER - Да / q - Отмена]: ").strip().lower()
    if ans == "q" or ans == "й":
        print("Отменено пользователем.")
        return False
    return True

def cmd_status():
    serious = get_pending_image_prompts("serious")
    funny = get_pending_image_prompts("funny")
    videos = get_pending_video_prompts()

    s_done = sum(1 for x in serious if x["exists"])
    f_done = sum(1 for x in funny if x["exists"])
    v_done = sum(1 for x in videos if x["exists"])

    print("📊 СТАТУС КОНТЕНТА:")
    print(f"  [IMG 16:9]  Серьёзные фото (nano banano pro): Готово {s_done:2d} / {len(serious):2d}  (Осталось: {len(serious)-s_done})")
    print(f"  [IMG 9:16]  Смешные с маскотом (nano banano): Готово {f_done:2d} / {len(funny):2d}  (Осталось: {len(funny)-f_done})")
    print(f"  [VIDEO]     Видео 9:16 10s (omni flash 1.1):  Готово {v_done:2d} / {len(videos):2d}  (Осталось: {len(videos)-v_done})")
    print("=========================================================")

def cmd_launch():
    print("[RUN] Запуск Microsoft Edge в режиме авторизации...")
    print("1. Откроется окно Microsoft Edge.")
    print("2. Войдите в свой Google-аккаунт на вкладках Google Flow и Google AI Studio.")
    print("3. Ваша сессия и подписка сохранятся навсегда в папке edge_session!")
    import subprocess
    cmd = [
        EDGE_PATH,
        f"--remote-debugging-port={CDP_PORT}",
        f"--user-data-dir={USER_DATA_DIR}",
        "--start-maximized",
        FLOW_URL,
        AISTUDIO_URL
    ]
    subprocess.Popen(cmd)
    print("[OK] Microsoft Edge запущен. Авторизуйтесь, после чего запускайте авто-генератор.")

def cmd_generate_images(tone="all", ratio=None, limit=None, item_id=None, no_confirm=False):
    tones = ["serious", "funny"] if tone == "all" else [tone]

    # Pre-calculate count
    total_prompts = []
    for t in tones:
        target_ratio = ratio if ratio else (SERIOUS_ASPECT_RATIO if t == "serious" else FUNNY_ASPECT_RATIO_PRIMARY)
        prompts = get_pending_image_prompts(t)
        if item_id:
            prompts = [p for p in prompts if p["id"] == str(item_id).zfill(3)]
        else:
            prompts = [p for p in prompts if not p["exists"]]
        if limit:
            prompts = prompts[:int(limit)]
        for p in prompts:
            total_prompts.append((t, target_ratio, p))

    if not total_prompts:
        print("[FlowWorker] Нет файлов, требующих генерации.")
        return

    target_ratio_desc = ratio if ratio else "По умолчанию (16:9 для серьезных / 9:16 для смешных)"
    if not no_confirm:
        if not confirm_run(f"Фото ({tone})", FLOW_IMAGE_MODEL, target_ratio_desc, len(total_prompts)):
            return

    with BrowserController(headless=False) as browser:
        page = browser.get_or_create_page("flow.google.com", FLOW_URL)
        time.sleep(3)
        worker = FlowWorker(page, browser_ctrl=browser)

        for i, (t, target_ratio, p) in enumerate(total_prompts):
            print(f"\n[{i+1}/{len(total_prompts)}] Обработка #{p['id']} ({t} | {target_ratio} | {FLOW_IMAGE_MODEL})...")
            try:
                worker.generate_image(
                    prompt_text=p["prompt_text"],
                    target_path=p["target_file"],
                    ratio=target_ratio,
                    model_name=FLOW_IMAGE_MODEL,
                    backup_path=p.get("backup_file")
                )
                print(f"[OK] Успешно! Сгенерировано #{p['id']} и размещено по папкам.")
            except Exception as e:
                print(f"[ERR] Ошибка на #{p['id']}: {e}")
                browser.save_debug_screenshot(page, f"err_flow_{p['id']}")
                print("Продолжаем следующий промпт через 7 секунд...")
                time.sleep(7)

def cmd_generate_videos(limit=None, item_id=None, no_confirm=False):
    prompts = get_pending_video_prompts()
    if item_id:
        prompts = [p for p in prompts if p["id"] == str(item_id).zfill(3)]
    else:
        prompts = [p for p in prompts if not p["exists"]]
    if limit:
        prompts = prompts[:int(limit)]

    if not prompts:
        print("[AIStudioWorker] Нет видео, требующих генерации.")
        return

    if not no_confirm:
        if not confirm_run(
            f"Видео (Google AI Studio)",
            VIDEO_MODEL,
            f"{VIDEO_ASPECT_RATIO} | {VIDEO_QUALITY} | {VIDEO_DURATION}s",
            len(prompts)
        ):
            return

    with BrowserController(headless=False) as browser:
        page = browser.get_or_create_page("aistudio.google.com", AISTUDIO_URL)
        time.sleep(3)
        worker = AIStudioWorker(page, browser_ctrl=browser)

        print(f"\n▶ Начинаем генерацию видео ({VIDEO_MODEL} | {VIDEO_ASPECT_RATIO} | {VIDEO_QUALITY} | {VIDEO_DURATION}s): {len(prompts)} шт.")
        print("🛡 Включена автоматическая защита: при исчерпании лимитов скрипт сам ожидает сброса квоты!")

        for i, p in enumerate(prompts):
            print(f"\n[{i+1}/{len(prompts)}] Генерация видео #{p['id']}...")
            try:
                worker.generate_video(
                    prompt_text=p["prompt_text"],
                    target_path=p["target_file"],
                    story_target_path=p.get("story_target")
                )
                print(f"[OK] Успешно сгенерировано видео #{p['id']} и размещено в папки!")
            except Exception as e:
                print(f"[ERR] Ошибка генерации видео #{p['id']}: {e}")
                browser.save_debug_screenshot(page, f"err_video_{p['id']}")
                time.sleep(7)

def main():
    print_banner()
    parser = argparse.ArgumentParser(description="Автоматизатор генерации контента AVTOHABR для Microsoft Edge")
    parser.add_argument("command", choices=["status", "launch", "images", "videos", "test-flow", "test-video"], help="Команда")
    parser.add_argument("--tone", choices=["serious", "funny", "all"], default="all", help="Категория фото")
    parser.add_argument("--ratio", choices=["16:9", "9:16", "1:1"], default=None, help="Соотношение сторон")
    parser.add_argument("--limit", type=int, default=None, help="Количество элементов")
    parser.add_argument("--id", type=str, default=None, help="Конкретный номер ID (например 001)")
    parser.add_argument("--yes", action="store_true", help="Пропустить подтверждение")

    args = parser.parse_args()

    if args.command == "status":
        cmd_status()
    elif args.command == "launch":
        cmd_launch()
    elif args.command == "images":
        cmd_generate_images(tone=args.tone, ratio=args.ratio, limit=args.limit, item_id=args.id, no_confirm=args.yes)
    elif args.command == "videos":
        cmd_generate_videos(limit=args.limit, item_id=args.id, no_confirm=args.yes)
    elif args.command == "test-flow":
        cmd_generate_images(tone="serious", ratio="16:9", limit=1, no_confirm=args.yes)
    elif args.command == "test-video":
        cmd_generate_videos(limit=1, no_confirm=args.yes)

if __name__ == "__main__":
    main()
