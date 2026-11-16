import os
import re
from config import (
    PROMPTS_SERIOUS, PROMPTS_FUNNY, PROMPTS_VIDEO,
    IMAGES_SERIOUS, AI_IMAGES_SERIOUS,
    IMAGES_FUNNY, AI_IMAGES_FUNNY,
    VIDEOS_DIR, STORIES_DIR
)

def extract_prompt_from_md(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    code_match = re.search(r"```(?:text)?\s*\n(.*?)\n```", content, re.DOTALL)
    if code_match:
        prompt = code_match.group(1).strip()
        if len(prompt) > 20:
            return prompt

    lines = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("**") or line.startswith(">"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()

def get_pending_image_prompts(tone="serious"):
    prompt_dir = PROMPTS_SERIOUS if tone == "serious" else PROMPTS_FUNNY
    target_dir = IMAGES_SERIOUS if tone == "serious" else IMAGES_FUNNY
    backup_dir = AI_IMAGES_SERIOUS if tone == "serious" else AI_IMAGES_FUNNY

    items = []
    if not os.path.exists(prompt_dir):
        return items

    files = sorted(f for f in os.listdir(prompt_dir) if f.endswith(".md"))
    for f in files:
        match = re.match(r"^(\d+)", f)
        item_id = match.group(1) if match else os.path.splitext(f)[0]
        prompt_file = os.path.join(prompt_dir, f)
        target_file = os.path.join(target_dir, f"{item_id}.jpg")
        backup_file = os.path.join(backup_dir, f"{item_id}.jpg")

        exists = (os.path.isfile(target_file) and os.path.getsize(target_file) > 1024) or \
                 (os.path.isfile(backup_file) and os.path.getsize(backup_file) > 1024)
        prompt_text = extract_prompt_from_md(prompt_file)

        items.append({
            "id": item_id,
            "tone": tone,
            "prompt_file": prompt_file,
            "target_file": target_file,
            "backup_file": backup_file,
            "prompt_text": prompt_text,
            "exists": exists
        })
    return items

def get_pending_video_prompts():
    items = []
    if not os.path.exists(PROMPTS_VIDEO):
        return items

    files = sorted(f for f in os.listdir(PROMPTS_VIDEO) if f.endswith(".md"))
    for f in files:
        match = re.match(r"^(\d+)", f)
        item_id = match.group(1) if match else os.path.splitext(f)[0]
        prompt_file = os.path.join(PROMPTS_VIDEO, f)
        target_file = os.path.join(VIDEOS_DIR, f"{item_id}.mp4")
        story_target = os.path.join(STORIES_DIR, item_id, "video.mp4")

        exists = (os.path.isfile(target_file) and os.path.getsize(target_file) > 10240) or \
                 (os.path.isfile(story_target) and os.path.getsize(story_target) > 10240)
        prompt_text = extract_prompt_from_md(prompt_file)

        items.append({
            "id": item_id,
            "prompt_file": prompt_file,
            "target_file": target_file,
            "story_target": story_target,
            "prompt_text": prompt_text,
            "exists": exists
        })
    return items
