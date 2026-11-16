import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Browser settings: Microsoft Edge Dedicated Automator Profile
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
AUTOMATOR_PROFILE_DIR = r"C:\Users\iliaa\.gemini\antigravity\edge_automator_profile"
USER_DATA_DIR = AUTOMATOR_PROFILE_DIR
DOWNLOADS_DIR = os.path.expandvars(r"%USERPROFILE%\Downloads")
CDP_PORT = 9222
CDP_URL = f"http://127.0.0.1:{CDP_PORT}"

# URLs
FLOW_URL = "https://flow.google.com"
AISTUDIO_URL = "https://aistudio.google.com/prompts/new_chat"

# Generation criteria specified by user
FLOW_IMAGE_MODEL = "nano banano pro"

# Serious photos criteria:
SERIOUS_ASPECT_RATIO = "16:9"

# Funny photos criteria:
FUNNY_ASPECT_RATIO_PRIMARY = "9:16"
FUNNY_ASPECT_RATIO_SECONDARY = "1:1"

# Video criteria:
VIDEO_MODEL = "omni flash 1.1"
VIDEO_ASPECT_RATIO = "9:16"
VIDEO_QUALITY = "1080p"
VIDEO_DURATION = "10"  # 10 seconds

# Safety & Anti-Ban delays (in seconds)
MIN_ACTION_DELAY = 1.5
MAX_ACTION_DELAY = 4.0
IMAGE_COOLDOWN_MIN = 12
IMAGE_COOLDOWN_MAX = 25
VIDEO_COOLDOWN_MIN = 20
VIDEO_COOLDOWN_MAX = 40

# Quota Backoff for Video
INITIAL_QUOTA_WAIT_SECONDS = 300  # 5 minutes default wait on quota hit

# Target Directories for Immediate Placement
IMAGES_SERIOUS = os.path.join(ROOT_DIR, "images", "serious")
AI_IMAGES_SERIOUS = os.path.join(ROOT_DIR, "..", "ai-images", "serious")

IMAGES_FUNNY = os.path.join(ROOT_DIR, "images", "funny")
AI_IMAGES_FUNNY = os.path.join(ROOT_DIR, "..", "ai-images", "funny")

STORIES_DIR = os.path.join(ROOT_DIR, "stories")
VIDEOS_DIR = os.path.join(ROOT_DIR, "..", "ai-videos")

PROMPTS_SERIOUS = os.path.join(ROOT_DIR, "prompts", "photo_prompts", "serious")
PROMPTS_FUNNY = os.path.join(ROOT_DIR, "prompts", "photo_prompts", "funny")
PROMPTS_VIDEO = os.path.join(ROOT_DIR, "prompts", "video_prompts")

AUTOMATION_LOG = os.path.join(ROOT_DIR, "knowledge", "automation-log.json")
SCREENSHOTS_DEBUG_DIR = os.path.join(ROOT_DIR, "scripts", "browser-automator", "debug")

for d in [
    IMAGES_SERIOUS, AI_IMAGES_SERIOUS,
    IMAGES_FUNNY, AI_IMAGES_FUNNY,
    STORIES_DIR, VIDEOS_DIR,
    SCREENSHOTS_DEBUG_DIR
]:
    os.makedirs(d, exist_ok=True)
