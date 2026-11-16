import os
import sys
import time
import subprocess
import ctypes
from config import DOWNLOADS_DIR, IMAGE_COOLDOWN_MIN, IMAGE_COOLDOWN_MAX, VIDEO_COOLDOWN_MIN, VIDEO_COOLDOWN_MAX
from file_saver import check_and_move_from_downloads

user32 = ctypes.windll.user32

VK_CONTROL = 0x11
VK_RETURN = 0x0D
VK_BACK = 0x08
VK_A = 0x41
VK_V = 0x56

def set_clipboard_text(text: str):
    """Sets Unicode text to Windows clipboard via PowerShell."""
    ps_cmd = "$t = [Console]::In.ReadToEnd(); Set-Clipboard -Value $t"
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        input=text.encode("utf-8"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

def press_keys(modifiers, key):
    for mod in modifiers:
        user32.keybd_event(mod, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(key, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(key, 0, 2, 0)
    time.sleep(0.05)
    for mod in reversed(modifiers):
        user32.keybd_event(mod, 0, 2, 0)
    time.sleep(0.1)

def clear_and_paste(text: str):
    """Selects all in current input field and pastes new prompt."""
    set_clipboard_text(text)
    # Ctrl+A
    press_keys([VK_CONTROL], VK_A)
    time.sleep(0.1)
    # Backspace
    user32.keybd_event(VK_BACK, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(VK_BACK, 0, 2, 0)
    time.sleep(0.1)
    # Ctrl+V
    press_keys([VK_CONTROL], VK_V)
    time.sleep(0.2)

def hit_enter():
    user32.keybd_event(VK_RETURN, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(VK_RETURN, 0, 2, 0)

def hit_ctrl_enter():
    press_keys([VK_CONTROL], VK_RETURN)

def countdown_focus(seconds=4, prompt_field="Google Flow"):
    print(f"\n👉 Переключитесь в открытое окно Microsoft Edge ({prompt_field})!")
    print(f"👉 Кликните в поле ввода промпта, чтобы курсор мигал в нём.")
    for i in range(seconds, 0, -1):
        sys.stdout.write(f"\rСтарт через {i} сек... ")
        sys.stdout.flush()
        time.sleep(1)
    print("\n🚀 Поехали!\n")

def run_direct_photos(tasks, ratio="16:9"):
    """
    Direct automation in user's open Google Flow tab without restarting Edge.
    """
    print("""
=========================================================================
⚡ ПРЯМАЯ ГЕНЕРАЦИЯ ФОТО В ОТКРЫТОЙ ВКЛАДКЕ GOOGLE FLOW
=========================================================================
  - Никаких перезапусков браузера (ваш VPN и вкладка остаются активными)
  - Вы уже выбрали модель 'nano banano pro' и формат в окне Edge
  - Скрипт сам вставляет промпт, запускает генерацию и забирает готовый файл
=========================================================================
""")
    countdown_focus(seconds=5, prompt_field="Google Flow")

    for idx, task in enumerate(tasks):
        print(f"\n[{idx+1}/{len(tasks)}] 📸 Пост: {task['network'].upper()} #{task['id']}")
        print(f"Промпт: {task['prompt_text'][:120]}...")
        start_time = time.time()

        # 1. Clear input & paste prompt
        clear_and_paste(task["prompt_text"])
        time.sleep(0.5)

        # 2. Trigger generation
        hit_enter()
        print("▶ Генерация запущена в вашем окне. Ожидание результата...")

        # 3. Watch for download file
        saved = False
        timeout = 90
        while time.time() - start_time < timeout:
            time.sleep(2)
            # Check Downloads folder
            saved = check_and_move_from_downloads(
                target_path=task["target_file"],
                ext_tuple=(".jpg", ".jpeg", ".png", ".webp"),
                start_time=start_time
            )
            if saved:
                break
            elapsed = int(time.time() - start_time)
            if elapsed % 10 == 0:
                sys.stdout.write(f"\rОжидание файла... ({elapsed}с) ")
                sys.stdout.flush()

        if saved:
            print(f"\n[OK] ✅ Фото готово и сразу перемещено в:")
            print(f"   📁 {task['target_file']}")
        else:
            print(f"\n[Внимание] Если картинка сгенерировалась, нажмите кнопку 'Скачать' в браузере.")
            print("Скрипт проверяет папку Загрузок ещё 20 секунд...")
            for _ in range(10):
                time.sleep(2)
                if check_and_move_from_downloads(task["target_file"], (".jpg", ".jpeg", ".png", ".webp"), start_time):
                    saved = True
                    print(f"[OK] ✅ Перехвачено и сохранено в: {task['target_file']}")
                    break

        if idx < len(tasks) - 1:
            print("Пауза 8 секунд перед следующим постом...")
            time.sleep(8)

    print("\n🎉 Все задачи по фото выполнены!")

def run_direct_videos(tasks):
    """
    Direct automation in user's open Google AI Studio tab without restarting Edge.
    """
    print("""
=========================================================================
⚡ ПРЯМАЯ ГЕНЕРАЦИЯ ВИДЕО В ОТКРЫТОЙ ВКЛАДКЕ GOOGLE AI STUDIO
=========================================================================
  - Никаких перезапусков браузера (ваш VPN и вкладка остаются активными)
  - Модель 'omni flash 1.1' и настройки уже выбраны вами в Edge
  - Скрипт сам вставляет промпт, жмёт Run и забирает готовый видеоролик
=========================================================================
""")
    countdown_focus(seconds=5, prompt_field="Google AI Studio")

    for idx, task in enumerate(tasks):
        print(f"\n[{idx+1}/{len(tasks)}] 🎬 Видео #{task['id']}")
        start_time = time.time()

        # 1. Clear input & paste prompt
        clear_and_paste(task["prompt_text"])
        time.sleep(0.5)

        # 2. Run via Ctrl+Enter in AI Studio
        hit_ctrl_enter()
        print("▶ Рендеринг видео запущен в вашем окне AI Studio...")

        # 3. Watch for download file
        saved = False
        timeout = 360  # 6 minutes max
        while time.time() - start_time < timeout:
            time.sleep(3)
            saved = check_and_move_from_downloads(
                target_path=task["target_file"],
                ext_tuple=(".mp4", ".mov", ".webm"),
                start_time=start_time
            )
            if saved:
                break
            elapsed = int(time.time() - start_time)
            if elapsed % 15 == 0:
                mins = elapsed // 60
                secs = elapsed % 60
                sys.stdout.write(f"\rРендеринг видео в окне... ({mins:02d}:{secs:02d}) ")
                sys.stdout.flush()

        if saved:
            print(f"\n[OK] ✅ Видео готово и сразу перемещено в:")
            print(f"   📁 {task['target_file']}")
            if task.get("story_target"):
                import shutil
                os.makedirs(os.path.dirname(task["story_target"]), exist_ok=True)
                shutil.copy2(task["target_file"], task["story_target"])
                print(f"   📁 {task['story_target']}")
        else:
            print(f"\n[Внимание] Если ролик готов, нажмите кнопку 'Download' в окне AI Studio.")
            print("Скрипт проверяет Загрузки ещё 30 секунд...")
            for _ in range(15):
                time.sleep(2)
                if check_and_move_from_downloads(task["target_file"], (".mp4", ".mov", ".webm"), start_time):
                    saved = True
                    print(f"[OK] ✅ Видео перехвачено и сохранено в: {task['target_file']}")
                    break

        if idx < len(tasks) - 1:
            print("Пауза 15 секунд перед следующим видео...")
            time.sleep(15)

    print("\n🎉 Все видеоролики выполнены!")
