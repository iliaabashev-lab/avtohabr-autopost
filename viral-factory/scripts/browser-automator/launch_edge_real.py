import subprocess
import time
import urllib.request
import os

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
AUTOMATOR_PROFILE_DIR = r"C:\Users\iliaa\.gemini\antigravity\edge_automator_profile"
CDP_PORT = 9222
CDP_URL = f"http://127.0.0.1:{CDP_PORT}"

FLOW_URL = "https://flow.google.com"
AISTUDIO_URL = "https://aistudio.google.com/prompts/new_chat"

def is_cdp_ready():
    try:
        req = urllib.request.Request(f"{CDP_URL}/json/version", headers={"User-Agent": "EdgeAutomator"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False

def launch_automator_edge(urls=None):
    """
    Launches a dedicated Microsoft Edge instance for automation alongside the user's personal Edge.
    Does NOT touch, close, or restart the user's personal browser!
    """
    if is_cdp_ready():
        print("[Browser] ✅ Рабочий браузер для автогенерации уже запущен и готов к работе!")
        return True

    print("\n[Browser] 🌐 Запуск выделенного рабочего браузера Microsoft Edge...")
    print("[Browser] 🛡 Ваш личный браузер (где вы смотрите YouTube) НЕ ЗАКРЫВАЕТСЯ и не затрагивается!")
    
    os.makedirs(AUTOMATOR_PROFILE_DIR, exist_ok=True)
    
    target_urls = urls if urls else [FLOW_URL, AISTUDIO_URL]
    urls_str = " ".join(f'"{u}"' for u in target_urls)

    args_str = (
        f'--remote-debugging-port={CDP_PORT} '
        f'--remote-allow-origins=* '
        f'"--user-data-dir={AUTOMATOR_PROFILE_DIR}" '
        f'--no-first-run '
        f'--no-default-browser-check '
        f'{urls_str}'
    )
    full_cmd = f'"{EDGE_PATH}" {args_str}'
    ps_cmd = f'Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{ CommandLine = \'{full_cmd}\' }}'

    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        subprocess.Popen([EDGE_PATH, f"--remote-debugging-port={CDP_PORT}", "--remote-allow-origins=*", f"--user-data-dir={AUTOMATOR_PROFILE_DIR}", "--no-first-run", "--no-default-browser-check"] + target_urls)

    for i in range(15):
        time.sleep(1)
        if is_cdp_ready():
            print("\n[Browser] ✅ Выделенный браузер успешно запущен на порту 9222!")
            return True
        sys_dots = "." * (i + 1)
        print(f"\r[Browser] Ожидание запуска рабочего Edge{sys_dots}", end="", flush=True)

    print("\n[Browser] Предупреждение: порт 9222 не ответил за 15 секунд.")
    return False

# Backward compatibility alias
def restart_edge_with_real_profile(urls=None):
    return launch_automator_edge(urls)

if __name__ == "__main__":
    if is_cdp_ready():
        print("Automator Edge is already ready on port 9222!")
    else:
        launch_automator_edge()
