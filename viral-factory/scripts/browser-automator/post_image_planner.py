import os
import json
import re
import hashlib
from config import ROOT_DIR

IMAGES_BASE = os.path.join(ROOT_DIR, "images")
KNOWLEDGE_DIR = os.path.join(ROOT_DIR, "knowledge")

# The 3:2 Rhythm: Serious, Serious, Serious, Funny, Funny
RHYTHM_PATTERN = ["serious", "serious", "serious", "funny", "funny"]

# Rich library of automotive topics with regex patterns to avoid false positive substring matches
TOPIC_PATTERNS = {
    "ice_winter": [
        r"гололед\w*", r"гололедиц\w*", r"\bлед\b", r"\bльду\b", r"\bльда\b", r"снег\w*",
        r"зим\w*", r"метел\w*", r"занос\w*", r"шип\w*", r"липучк\w*", r"замерз\w*",
        r"мороз\w*", r"сугроб\w*", r"скользк\w*", r"печк\w*", r"отопител\w*", r"незамерзайк\w*"
    ],
    "rain_aquaplaning": [
        r"аквапланирован\w*", r"дожд\w*", r"ливн\w*", r"\bлуж[аеуыи]?\b", r"\bлужах\b",
        r"мокрый асфальт", r"дворник\w*", r"видимост\w*", r"потоп\w*", r"брызг\w*", r"стеклоочистител\w*"
    ],
    "road_danger": [
        r"опасност\w*", r"\bдтп\b", r"авари\w*", r"дистанци\w*", r"слепая зона", r"обгон\w*",
        r"столкновен\w*", r"встречк\w*", r"пешеход\w*", r"лосиный тест", r"безопасност\w*"
    ],
    "breakdown_roadside": [
        r"эвакуатор\w*", r"буксир\w*", r"прокол\w*", r"запаск\w*", r"домкрат\w*", r"обочин\w*",
        r"заглох\w*", r"аварийн\w*", r"\bзнак\b", r"\bтрасс[аеуы]\b", r"насос\w*", r"компрессор\w*"
    ],
    "battery_frost": [
        r"\bакб\b", r"аккумулятор\w*", r"клемм\w*", r"прикури\w*", r"стартер\w*",
        r"разрядил\w*", r"не заводится", r"вольт\w*", r"генератор\w*", r"провод\w*"
    ],
    "engine_overheat": [
        r"двигател\w*", r"\bмотор\w*", r"закипа\w*", r"перегрев\w*", r"радиатор\w*",
        r"антифриз\w*", r"тосол\w*", r"термостат\w*", r"\bгбц\b", r"\bкипит\b", r"\bпар\b",
        r"датчик температуры", r"вентилятор\w*"
    ],
    "gearbox_transmission": [
        r"коробк\w*", r"\bакпп\b", r"\bмкпп\b", r"трансмисси\w*", r"вариатор\w*",
        r"сцеплен\w*", r"передач\w*", r"рывок\w*", r"пинк\w*", r"дергает\w*"
    ],
    "night_fog": [
        r"туман\w*", r"\bноч[ьюеи]\b", r"фар[аыеу]?", r"дальний свет", r"ближний свет",
        r"ослеплен\w*", r"линз\w*", r"ламп\w*", r"освещен\w*", r"темнот\w*", r"ксенон\w*",
        r"светодиод\w*", r"лед-ламп\w*", r"регулировка луча"
    ],
    "pothole_suspension": [
        r"\bям[аыеу]\b", r"\bямах\b", r"подвеск\w*", r"рычаг\w*", r"амортизатор\w*",
        r"стойк\w*", r"развал\w*", r"сход\w*", r"кочк\w*", r"рессор\w*", r"сайлентблок\w*",
        r"шаров\w*", r"пружин\w*", r"вибраци\w*", r"шиномонтаж\w*"
    ],
    "brakes_emergency": [
        r"тормоз\w*", r"колодк\w*", r"диск\w*", r"суппорт\w*", r"ручник\w*", r"\babs\b",
        r"тормозная жидкость", r"экстренное торможение"
    ],
    "pre_purchase": [
        r"покупк\w*", r"автоподбор\w*", r"толщиномер\w*", r"шпаклевк\w*", r"диагностик\w*",
        r"осмотр\w*", r"вторичк\w*", r"пробег\w*", r"скручен\w*"
    ],
    "road_trip": [
        r"путешестви\w*", r"дальняя дорог\w*", r"багажник\w*", r"серпантин\w*", r"автотуризм\w*",
        r"поездк\w*", r"отпуск\w*"
    ],
    "oil_maintenance": [
        r"\bмасл\w*", r"фильтр\w*", r"уровень масла", r"замена масла", r"маслян\w*",
        r"щуп\w*", r"вязкость\w*", r"синтетик\w*", r"регламент\w*"
    ]
}

SERIOUS_SCENARIOS = {
    "ice_winter": (
        "dramatic cinematic shot of a modern car carefully driving on a treacherous winding mountain road covered in black ice and packed snow during twilight, "
        "close-up on studded winter tire with deep aggressive treads gripping frozen glistening asphalt, glowing warm LED headlights piercing through falling snowflakes, "
        "authentic winter driving reality, cold crisp atmosphere"
    ),
    "rain_aquaplaning": (
        "high-speed dynamic tracking shot of a vehicle hitting a deep puddle on a rain-soaked highway at dusk, "
        "dramatic explosive water spray and mist erupting from beneath the performance rain tires, razor-sharp water droplets, reflections of brake lights and city streetlamps on wet asphalt"
    ),
    "road_danger": (
        "tense first-person driver cockpit view at high speed: hands firmly gripping the steering wheel, emergency brake alert flashing on the modern digital dashboard HUD, "
        "bright red taillights of traffic ahead glowing through the windshield in heavy twilight rain, realistic situational awareness and road safety"
    ),
    "breakdown_roadside": (
        "realistic automotive roadside scenario at golden hour sunset: modern car parked safely on wide highway shoulder with hazard lights blinking, "
        "orange reflective warning triangle standing on asphalt in foreground, hydraulic floor jack placed under the chassis for spare tire wheel change, scenic open highway vista"
    ),
    "battery_frost": (
        "macro close-up on heavy-duty copper jumper cable clamps attached to vehicle battery terminals on a freezing frosty morning, "
        "delicate ice frost crystals sparkling on the cold steel engine bay and hood edges, digital battery analyzer displaying voltage readings"
    ),
    "engine_overheat": (
        "cinematic roadside shot of a car hood slightly propped open with soft cooling vapor steam wafting into the golden evening sunlight on a highway shoulder, "
        "mechanic in dark-blue work gloves carefully inspecting radiator hose and coolant overflow reservoir with a modern laser thermometer"
    ),
    "gearbox_transmission": (
        "cinematic automotive mechanical detail: precision cutaway of a modern dual-clutch transmission with gleaming planetary gears, "
        "synchronizer rings, and clutch pack bathed in amber transmission fluid under clean workshop spotlight"
    ),
    "night_fog": (
        "atmospheric cinematic night driving scene: sleek car headlights casting intense golden and white beams through dense mystical river fog on a winding forest asphalt highway, "
        "illuminating crisp lane markings and reflective road signs, moody shallow depth of field"
    ),
    "pothole_suspension": (
        "low-angle slow-motion style capture of high-performance automotive suspension in action: heavy-duty alloy control arm, titanium spring, and shock absorber compressing "
        "as wheel encounters a rough asphalt pothole, sharp mechanical focus with motion blur on background"
    ),
    "brakes_emergency": (
        "close-up on drilled and slotted carbon-ceramic brake disc and bright red multi-piston caliper on a modern performance vehicle, "
        "subtle heat shimmer rising from the rotor, precision engineered mechanical components, authentic automotive detail"
    ),
    "pre_purchase": (
        "professional automotive inspection: expert technician using a high-precision digital paint thickness gauge against a vehicle quarter panel under bright inspection studio lamps, "
        "checking factory paint consistency and body panel gaps with meticulous attention"
    ),
    "road_trip": (
        "inspiring automotive travel lifestyle: expedition-ready SUV equipped with aerodynamic roof rack and camping gear parked at a scenic panoramic mountain pass overlook at sunrise, "
        "warm morning sun flares reflecting off the metallic vehicle body, breathtaking alpine highway vista"
    ),
    "oil_maintenance": (
        "pristine specialized car service workshop: amber-golden synthetic motor oil being smoothly poured from a clean bottle into modern engine block, "
        "gleaming chrome engine components, immaculate professional mechanic bay with soft cinematic lighting"
    ),
    "general": (
        "modern high-tech car service center, certified master technician performing comprehensive computer diagnostics with tablet scanner connected to dashboard, "
        "clean workshop bay, authentic tools, natural warm cinematic lighting"
    )
}

FUNNY_SCENARIOS = {
    "ice_winter": (
        "the cute car mascot wearing tiny cartoon ice skates on all four wheels, comically tip-toeing across a shiny frozen cartoon ice lake, "
        "wide alarmed eyes on windshield, wrapped in a giant cozy knitted wool scarf with pompoms"
    ),
    "rain_aquaplaning": (
        "the cute car mascot wearing bright yellow cartoon rubber rainboots on wheels and a tiny yellow sou'wester hat on roof, "
        "joyfully splashing through a huge comic rain puddle with water droplets flying everywhere, holding a small umbrella"
    ),
    "road_danger": (
        "the cute car mascot comically slamming on its cartoon brakes, front tires screeching with comic cloud puffs, "
        "exaggerated wide shocked cartoon eyes bugging out of the windshield glass, funny dramatic gasp expression"
    ),
    "breakdown_roadside": (
        "the cute car mascot sitting on a highway shoulder looking comically flat-tired like a deflated pancake, "
        "holding an orange cartoon warning triangle with a tiny wheel, making an adorable sad puppy-dog face on windshield"
    ),
    "battery_frost": (
        "the cute car mascot shivering comically inside a huge transparent ice cube or covered in snow, "
        "holding cartoon jumper cables with a sleepy yawning expression on windshield, breathing little cartoon steam puffs"
    ),
    "engine_overheat": (
        "the cute car mascot with bright red blushing overheating cheeks, tongue hanging out of the front grille like a tired dog, "
        "holding a big glass of iced lemonade and an ice pack on its roof, comic steam whistling from radiator"
    ),
    "gearbox_transmission": (
        "the cute car mascot comically wrestling with a giant cartoon gear shifter lever, "
        "funny puzzled expression on windshield, cartoon gear cogs popping out playfully like bubbles"
    ),
    "night_fog": (
        "the cute car mascot wearing huge funny night-vision goggles or thick round magnifying spectacles on windshield, "
        "tiptoeing into a cartoon wall of fog holding a tiny old-fashioned lantern on its roof"
    ),
    "pothole_suspension": (
        "the cute car mascot bouncing high into the air on giant comical cartoon spring legs over a series of road bumps, "
        "joyful screaming roller-coaster expression with huge happy eyes on windshield"
    ),
    "brakes_emergency": (
        "the cute car mascot proudly flexing tiny cartoon muscles like a superhero, pointing with a shiny wheel at its brand new gleaming cartoon brakes, "
        "wearing a tiny superhero cape that flutters in the wind"
    ),
    "pre_purchase": (
        "the cute car mascot dressed as Sherlock Holmes with a tweed deerstalker cap, holding a giant cartoon magnifying glass "
        "and inspecting its own shiny front fender for scratches with intense comic focus"
    ),
    "road_trip": (
        "the cute car mascot comically overloaded for vacation: huge cartoon luggage, an inflatable pink flamingo, and beach umbrella strapped to roof rack, "
        "wearing cool tinted sunglasses on windshield and grinning excitedly"
    ),
    "oil_maintenance": (
        "the cute car mascot at a luxury day-spa: cucumber slices placed over its windshield headlights, wearing a fluffy cartoon bath towel on roof, "
        "happily sipping fresh golden motor oil from a coconut with a striped straw"
    ),
    "general": (
        "the cute car mascot holding a smartphone with tiny wheel, booking a service slot with a proud sparkling smile on front grille"
    )
}

GENERAL_ROTATION_KEYS = list(TOPIC_PATTERNS.keys())

def detect_topic(text, post_id=""):
    text_clean = text.lower().replace("ё", "е")
    scores = {}
    for topic, patterns in TOPIC_PATTERNS.items():
        score = 0
        for pat in patterns:
            matches = re.findall(pat, text_clean)
            score += len(matches)
        if score > 0:
            scores[topic] = score
    
    if scores:
        return max(scores, key=scores.get)

    if post_id:
        idx = int(hashlib.md5(str(post_id).encode()).hexdigest(), 16) % len(GENERAL_ROTATION_KEYS)
        return GENERAL_ROTATION_KEYS[idx]
    return "general"

def generate_serious_prompt(post_text, ratio="16:9", post_id=""):
    topic = detect_topic(post_text, post_id)
    scenario = SERIOUS_SCENARIOS.get(topic, SERIOUS_SCENARIOS["general"])

    prefix = "Widescreen 16:9, " if ratio == "16:9" else f"Aspect ratio {ratio}, "
    return (
        f"{prefix}photorealistic cinematic automotive documentary photography: {scenario}. "
        f"Authentic natural lighting, rich textures, shallow depth of field, 8k resolution, realistic color grading, "
        f"strictly NO mascot, NO cartoon, NO text, NO watermarks, NO CGI artifacts."
    )

def generate_funny_prompt(post_text, ratio="9:16", post_id=""):
    topic = detect_topic(post_text, post_id)
    scenario = FUNNY_SCENARIOS.get(topic, FUNNY_SCENARIOS["general"])

    format_prefix = "Vertical 9:16, " if ratio == "9:16" else ("Square 1:1, " if ratio == "1:1" else f"Format {ratio}, ")
    return (
        f"{format_prefix}3D cartoon Pixar-style character render: the cute white car mascot "
        f"(character consistency matching attached official reference image: vintage compact rounded white European microcar with glossy white body, "
        f"giant expressive Pixar cartoon eyes situated strictly on the front windshield glass with bright blue irises and cute animated eyelids, "
        f"normal circular automotive glass headlights on front fenders below windshield, expressive cartoon mouth on the lower front grille/bumper). "
        f"Comical scene: {scenario}. Clean vibrant high-tech environment, warm studio lighting, soft ambient occlusion, "
        f"strict character identity matching reference mascot, clean composition, NO text, NO watermarks."
    )

def get_posts_for_network(network="telegram"):
    posts = []
    if network == "telegram":
        q_path = os.path.join(KNOWLEDGE_DIR, "tg-queue.json")
        if os.path.exists(q_path):
            with open(q_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for item in data:
                posts.append({
                    "id": item.get("post_id"),
                    "network": "telegram",
                    "text": item.get("text", ""),
                    "tone": item.get("tone", "serious"),
                    "scheduled_at": item.get("scheduled_at")
                })
    elif network == "vk":
        bank_path = os.path.join(KNOWLEDGE_DIR, "post-bank.json")
        if os.path.exists(bank_path):
            with open(bank_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for idx, item in enumerate(data[:15]):
                posts.append({
                    "id": f"vk_{item.get('id', idx+1)}",
                    "network": "vk",
                    "text": item.get("text", ""),
                    "tone": RHYTHM_PATTERN[idx % len(RHYTHM_PATTERN)],
                    "scheduled_at": None
                })
    elif network == "max":
        bank_path = os.path.join(KNOWLEDGE_DIR, "post-bank.json")
        if os.path.exists(bank_path):
            with open(bank_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for idx, item in enumerate(data[15:30]):
                posts.append({
                    "id": f"max_{item.get('id', idx+1)}",
                    "network": "max",
                    "text": item.get("text", ""),
                    "tone": RHYTHM_PATTERN[idx % len(RHYTHM_PATTERN)],
                    "scheduled_at": None
                })
    elif network == "threads":
        bank_path = os.path.join(KNOWLEDGE_DIR, "post-bank.json")
        if os.path.exists(bank_path):
            with open(bank_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for idx, item in enumerate(data[:10]):
                posts.append({
                    "id": f"threads_{item.get('id', idx+1)}",
                    "network": "threads",
                    "text": item.get("text", ""),
                    "tone": RHYTHM_PATTERN[idx % len(RHYTHM_PATTERN)],
                    "scheduled_at": None
                })
    return posts

def plan_network_images(network="telegram", requested_tone=None, ratio="16:9"):
    raw_posts = get_posts_for_network(network)
    planned = []

    for idx, p in enumerate(raw_posts):
        post_tone = requested_tone if requested_tone else p.get("tone", RHYTHM_PATTERN[idx % 5])
        
        target_dir = os.path.join(IMAGES_BASE, network, post_tone)
        os.makedirs(target_dir, exist_ok=True)
        target_file = os.path.join(target_dir, f"{p['id']}.jpg")

        exists = os.path.isfile(target_file) and os.path.getsize(target_file) > 50000

        if post_tone == "serious":
            prompt_text = generate_serious_prompt(p["text"], ratio=ratio, post_id=p["id"])
        else:
            prompt_text = generate_funny_prompt(p["text"], ratio=ratio, post_id=p["id"])

        planned.append({
            "id": p["id"],
            "network": network,
            "tone": post_tone,
            "ratio": ratio,
            "text_snippet": p["text"][:80].replace("\n", " "),
            "target_file": target_file,
            "prompt_text": prompt_text,
            "exists": exists
        })

    return planned

def sync_generated_image(network: str, post_id: str, target_file: str, tone: str):
    """
    Synchronizes newly saved image paths into post queues (tg-queue.json, post-bank.json)
    so autoposting scripts immediately know and publish the right image.
    """
    if not (os.path.isfile(target_file) and os.path.getsize(target_file) > 50000):
        return

    abs_target = os.path.abspath(target_file)
    filename = os.path.basename(abs_target)

    # 1. Telegram Queue synchronization
    if network == "telegram":
        q_path = os.path.join(KNOWLEDGE_DIR, "tg-queue.json")
        if os.path.exists(q_path):
            try:
                with open(q_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                updated = False
                for item in data:
                    if item.get("post_id") == post_id:
                        item["image_path"] = abs_target
                        item["image_id"] = filename
                        updated = True
                        break
                if updated:
                    with open(q_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"[Sync] ✅ tg-queue.json обновлён: пост {post_id} привязан к {filename}")
            except Exception as e:
                print(f"[Sync] Предупреждение при обновлении tg-queue.json: {e}")

    # 2. Post Bank synchronization (VK, MAX, Threads)
    bank_path = os.path.join(KNOWLEDGE_DIR, "post-bank.json")
    if os.path.exists(bank_path):
        try:
            with open(bank_path, "r", encoding="utf-8") as f:
                pb = json.load(f)
            clean_id = post_id
            for prefix in ["vk_", "max_", "threads_"]:
                if clean_id.startswith(prefix):
                    clean_id = clean_id[len(prefix):]
                    break
            updated = False
            for p in pb:
                if str(p.get("id")) == str(clean_id):
                    p["image_path"] = abs_target
                    p["image_tone"] = tone
                    updated = True
                    break
            if updated:
                with open(bank_path, "w", encoding="utf-8") as f:
                    json.dump(pb, f, ensure_ascii=False, indent=2)
                print(f"[Sync] ✅ post-bank.json обновлён: пост {clean_id} привязан к {filename}")
        except Exception as e:
            print(f"[Sync] Предупреждение при обновлении post-bank.json: {e}")
