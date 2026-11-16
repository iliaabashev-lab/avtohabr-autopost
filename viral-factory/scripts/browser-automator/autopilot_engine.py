import os
import sys
import time
import json
from datetime import datetime, timezone, timedelta
from config import ROOT_DIR, FLOW_URL, AISTUDIO_URL, FLOW_IMAGE_MODEL
from browser import BrowserController
from threads_worker import ThreadsWorker
from reels_worker import ReelsWorker
from shorts_worker import ShortsWorker
from vk_clips_worker import VkClipsWorker
from aistudio_worker import AIStudioWorker
from prompt_manager import get_pending_video_prompts
from post_image_planner import plan_network_images

KNOWLEDGE_DIR = os.path.join(ROOT_DIR, "knowledge")
STORIES_DIR = os.path.join(ROOT_DIR, "stories")
AI_VIDEOS_DIR = os.path.join(ROOT_DIR, "..", "ai-videos")
if not os.path.exists(AI_VIDEOS_DIR):
    AI_VIDEOS_DIR = os.path.join(ROOT_DIR, "ai-videos")

STATE_FILE = os.path.join(KNOWLEDGE_DIR, "autopilot-state.json")

# Moscow Timezone (UTC+3)
MSK_TZ = timezone(timedelta(hours=3))

def get_msk_now():
    return datetime.now(MSK_TZ)

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"history": {}}

def save_state(state):
    os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Autopilot] Ошибка сохранения состояния: {e}")

def is_slot_completed(date_str: str, slot_id: str) -> bool:
    state = load_state()
    done_slots = state.get("history", {}).get(date_str, [])
    return slot_id in done_slots

def mark_slot_completed(date_str: str, slot_id: str):
    state = load_state()
    if "history" not in state:
        state["history"] = {}
    if date_str not in state["history"]:
        state["history"][date_str] = []
    if slot_id not in state["history"][date_str]:
        state["history"][date_str].append(slot_id)
    save_state(state)
    print(f"[Autopilot] 📌 Слот '{slot_id}' за {date_str} отмечен как выполненный.")

def get_next_available_video():
    """
    Finds the next story video that is ready to be published.
    Returns: (video_path, title, caption)
    """
    # 1. Search ai-videos
    if os.path.exists(AI_VIDEOS_DIR):
        files = sorted([f for f in os.listdir(AI_VIDEOS_DIR) if f.endswith(('.mp4', '.mov'))])
        for vf in files:
            v_path = os.path.join(AI_VIDEOS_DIR, vf)
            story_id = os.path.splitext(vf)[0]
            # Try to get metadata from stories/NNN/story.json
            story_json_path = os.path.join(STORIES_DIR, story_id, "story.json")
            title = f"AVTOHABR: История машинки #{story_id}"
            caption = "Запись в автосервис онлайн без звонков: https://app.avtohabr.ru"
            if os.path.exists(story_json_path):
                try:
                    with open(story_json_path, "r", encoding="utf-8") as f:
                        s_data = json.load(f)
                    title = s_data.get("title", title)
                    caption = s_data.get("caption") or s_data.get("narration") or caption
                except Exception:
                    pass
            return v_path, title, caption

    # 2. Search stories/NNN/video.mp4
    if os.path.exists(STORIES_DIR):
        for s_folder in sorted(os.listdir(STORIES_DIR)):
            folder_path = os.path.join(STORIES_DIR, s_folder)
            v_path = os.path.join(folder_path, "video.mp4")
            if os.path.isfile(v_path) and os.path.getsize(v_path) > 100000:
                story_json_path = os.path.join(folder_path, "story.json")
                title = f"AVTOHABR: История #{s_folder}"
                caption = "Онлайн-запись: https://app.avtohabr.ru"
                if os.path.exists(story_json_path):
                    try:
                        with open(story_json_path, "r", encoding="utf-8") as f:
                            s_data = json.load(f)
                        title = s_data.get("title", title)
                        caption = s_data.get("caption") or s_data.get("narration") or caption
                    except Exception:
                        pass
                return v_path, title, caption

    return None, None, None

def get_threads_post_for_slot(slot_index: int):
    """
    Gets post content and image for one of the 4 daily Threads slots.
    """
    threads_tasks = plan_network_images(network="threads", ratio="1:1")
    if not threads_tasks:
        return None, None
    idx = slot_index % len(threads_tasks)
    task = threads_tasks[idx]
    image_file = task["target_file"] if (os.path.isfile(task["target_file"]) and os.path.getsize(task["target_file"]) > 50000) else None
    
    # Read full text from post-bank
    bank_path = os.path.join(KNOWLEDGE_DIR, "post-bank.json")
    text = task.get("text_snippet", "")
    if os.path.exists(bank_path):
        try:
            with open(bank_path, "r", encoding="utf-8") as f:
                pb = json.load(f)
            clean_id = task["id"]
            if clean_id.startswith("threads_"):
                clean_id = clean_id[len("threads_"):]
            for p in pb:
                if str(p.get("id")) == str(clean_id):
                    text = p.get("text", text)
                    break
        except Exception:
            pass

    return text, image_file

def publish_video_everywhere(video_path: str, title: str, caption: str):
    """
    Publishes a single vertical video across YouTube Shorts, Instagram Reels, and VK Clips.
    """
    print(f"\n[Autopilot] =========================================")
    print(f"[Autopilot] 🚀 СИНХРОННАЯ ПУБЛИКАЦИЯ РОЛИКА ВО ВСЕ СЕТИ")
    print(f"[Autopilot] Файл: {video_path}")
    print(f"[Autopilot] Название: {title}")
    print(f"[Autopilot] =========================================")

    results = {}

    with BrowserController(headless=False) as browser:
        # 1. YouTube Shorts
        try:
            yt_page = browser.get_or_create_page("studio.youtube.com", "https://studio.youtube.com/")
            shorts_worker = ShortsWorker(yt_page, browser_ctrl=browser)
            results["youtube_shorts"] = shorts_worker.upload_short(video_path, title, caption)
        except Exception as e:
            print(f"[Autopilot] ❌ Ошибка YouTube Shorts: {e}")
            results["youtube_shorts"] = False

        time.sleep(3)

        # 2. Instagram Reels
        try:
            ig_page = browser.get_or_create_page("instagram.com", "https://www.instagram.com/")
            reels_worker = ReelsWorker(ig_page, browser_ctrl=browser)
            results["instagram_reels"] = reels_worker.upload_reel(video_path, f"{title}\n\n{caption}")
        except Exception as e:
            print(f"[Autopilot] ❌ Ошибка Instagram Reels: {e}")
            results["instagram_reels"] = False

        time.sleep(3)

        # 3. VK Клипы
        try:
            vk_page = browser.get_or_create_page("vk.com", "https://vk.com/clips")
            vk_worker = VkClipsWorker(vk_page, browser_ctrl=browser)
            results["vk_clips"] = vk_worker.upload_clip(video_path, title, caption)
        except Exception as e:
            print(f"[Autopilot] ❌ Ошибка VK Клипы: {e}")
            results["vk_clips"] = False

    print("\n[Autopilot] 📊 Итоги публикации видео:")
    for net, ok in results.items():
        print(f"  ▶ {net}: {'✅ УСПЕШНО' if ok else '⚠️ ТРЕБУЕТ ВНИМАНИЯ'}")
    return any(results.values())

def publish_threads_post(slot_index: int):
    """
    Publishes a Threads post.
    """
    text, image_path = get_threads_post_for_slot(slot_index)
    if not text:
        print("[Autopilot] ⚠️ Нет текста для поста Threads.")
        return False

    print(f"\n[Autopilot] 🧵 ПУБЛИКАЦИЯ В THREADS (Слот #{slot_index+1}/4)")
    print(f"  Текст: {text[:70].replace(chr(10), ' ')}...")
    if image_path:
        print(f"  Фото: {os.path.basename(image_path)}")

    with BrowserController(headless=False) as browser:
        page = browser.get_or_create_page("threads.com", "https://www.threads.com/")
        worker = ThreadsWorker(page, browser_ctrl=browser)
        return worker.post(text, image_path)

def ensure_daily_videos_generated():
    """
    Checks if 2 videos exist for today. If not, launches AIStudioWorker to render them.
    """
    pending = [p for p in get_pending_video_prompts() if not p["exists"]]
    ready_count = len(get_pending_video_prompts()) - len(pending)
    print(f"[Autopilot] 🎬 Проверка готовых видеороликов: {ready_count} готово, {len(pending)} ожидает.")
    
    if len(pending) > 0 and ready_count < 2:
        to_generate = pending[:2]
        print(f"[Autopilot] ⚙️ Автоматическая генерация {len(to_generate)} видео в Google AI Studio...")
        with BrowserController(headless=False) as browser:
            page = browser.get_or_create_page("aistudio.google.com", AISTUDIO_URL)
            worker = AIStudioWorker(page, browser_ctrl=browser)
            for task in to_generate:
                try:
                    worker.generate_video(task["prompt_text"], task["target_file"], task.get("story_target"))
                except Exception as e:
                    print(f"[Autopilot] Ошибка рендеринга видео #{task['id']}: {e}")

def run_autopilot_tick():
    """
    Runs one check cycle against current Moscow Time.
    """
    msk = get_msk_now()
    date_str = msk.strftime("%Y-%m-%d")
    hour = msk.hour
    minute = msk.minute

    # Schedule Rules:
    # 1. 10:00 - 10:30 -> threads_10
    if 10 <= hour < 11 and not is_slot_completed(date_str, "threads_10"):
        print(f"\n⏰ [10:00 МСК] Время утреннего поста Threads!")
        if publish_threads_post(slot_index=0):
            mark_slot_completed(date_str, "threads_10")

    # 2. 11:00 - 12:00 -> generate videos if needed
    if 11 <= hour < 12 and not is_slot_completed(date_str, "gen_videos_11"):
        print(f"\n⏰ [11:00 МСК] Проверка и предгенерация дневных роликов...")
        ensure_daily_videos_generated()
        mark_slot_completed(date_str, "gen_videos_11")

    # 3. 13:00 - 14:00 (Обед) -> video_lunch (Shorts, Reels, VK) & threads_13
    if 13 <= hour < 14 and not is_slot_completed(date_str, "video_lunch"):
        print(f"\n⏰ [13:00 МСК - ОБЕД] Время публикации Видео #1 во все соцсети!")
        v_path, title, caption = get_next_available_video()
        if v_path:
            if publish_video_everywhere(v_path, title, caption):
                mark_slot_completed(date_str, "video_lunch")
        else:
            print("[Autopilot] ⚠️ Нет готового видеофайла для обеденного слота.")

    if 13 <= hour < 14 and not is_slot_completed(date_str, "threads_13"):
        if publish_threads_post(slot_index=1):
            mark_slot_completed(date_str, "threads_13")

    # 4. 16:00 - 17:00 -> threads_16
    if 16 <= hour < 17 and not is_slot_completed(date_str, "threads_16"):
        print(f"\n⏰ [16:00 МСК] Время дневного интерактива Threads!")
        if publish_threads_post(slot_index=2):
            mark_slot_completed(date_str, "threads_16")

    # 5. 19:00 - 20:00 (Вечер) -> video_evening (Shorts, Reels, VK) & threads_19
    if 19 <= hour < 20 and not is_slot_completed(date_str, "video_evening"):
        print(f"\n⏰ [19:00 МСК - ВЕЧЕР] Время публикации Видео #2 во все соцсети!")
        v_path, title, caption = get_next_available_video()
        if v_path:
            if publish_video_everywhere(v_path, title, caption):
                mark_slot_completed(date_str, "video_evening")
        else:
            print("[Autopilot] ⚠️ Нет готового видеофайла для вечернего слота.")

    if 19 <= hour < 20 and not is_slot_completed(date_str, "threads_19"):
        if publish_threads_post(slot_index=3):
            mark_slot_completed(date_str, "threads_19")

def run_daemon_loop():
    print("""
=========================================================================
          AVTOHABR FACTORY: АВТОПИЛОТ ПУБЛИКАЦИЙ
=========================================================================
  ▶ Расписание (по Московскому времени):
     - 10:00 МСК:  Threads #1 (утренний совет)
     - 11:00 МСК:  Автогенерация 2 видео в AI Studio (при необходимости)
     - 13:00 МСК:  🎬 ВИДЕО #1 (Shorts + Reels + VK Клипы) + Threads #2
     - 16:00 МСК:  Threads #3 (разбор поломки / интерактив)
     - 19:00 МСК:  🎬 ВИДЕО #2 (Shorts + Reels + VK Клипы) + Threads #4
  -----------------------------------------------------------------------
  🎮 Работает в отдельном браузере — вы можете спокойно смотреть YouTube!
  🛑 Принудительно остановить можно в любой момент клавишами [Ctrl + C].
=========================================================================
""")
    while True:
        try:
            msk = get_msk_now()
            print(f"\r[Autopilot] ⏰ Время МСК: {msk.strftime('%Y-%m-%d %H:%M:%S')} | Ожидание следующего слота...", end="", flush=True)
            run_autopilot_tick()
            time.sleep(60)
        except KeyboardInterrupt:
            print("\n\n🛑 Автопилот приостановлен пользователем.")
            break
        except Exception as e:
            print(f"\n[Autopilot] Ошибка цикла: {e}")
            time.sleep(30)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--post-now-video":
        v_path, title, caption = get_next_available_video()
        if v_path:
            publish_video_everywhere(v_path, title, caption)
        else:
            print("Нет доступных видео для публикации.")
    elif len(sys.argv) > 1 and sys.argv[1] == "--post-now-threads":
        publish_threads_post(slot_index=0)
    else:
        run_daemon_loop()
