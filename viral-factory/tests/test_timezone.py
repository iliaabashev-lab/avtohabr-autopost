"""
Тестирование преобразования Московского времени (Europe/Moscow, UTC+3) на Python.
Проверяет требования раздела 3 мастер-промпта:
1. Внутри системы даты и время хранятся в UTC.
2. В пользовательском расписании используется Europe/Moscow.
3. Все заданные часы публикации трактуются как московские.
4. Часовой пояс сервера не должен влиять на расписание.
5. Не допускается случайное смещение на 1, 2 или 3 часа.
"""

import unittest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

MSK_TZ = ZoneInfo("Europe/Moscow")

def msk_to_utc(date_str: str, hour: int, minute: int = 0) -> datetime:
    """Преобразовать московское время в UTC datetime."""
    dt_msk = datetime.strptime(f"{date_str} {hour:02d}:{minute:02d}:00", "%Y-%m-%d %H:%M:%S")
    dt_msk = dt_msk.replace(tzinfo=MSK_TZ)
    return dt_msk.astimezone(timezone.utc)

def utc_to_msk(dt_utc: datetime) -> datetime:
    """Преобразовать UTC datetime в Московское время."""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    return dt_utc.astimezone(MSK_TZ)

class TestMoscowTimezone(unittest.TestCase):
    def test_msk_to_utc_morning_slot(self):
        # 09:00 MSK должно быть строго 06:00 UTC
        utc_dt = msk_to_utc("2026-11-05", 9, 0)
        self.assertEqual(utc_dt.hour, 6)
        self.assertEqual(utc_dt.minute, 0)
        self.assertEqual(utc_dt.tzinfo, timezone.utc)

    def test_msk_to_utc_day_slot(self):
        # 13:00 MSK должно быть строго 10:00 UTC
        utc_dt = msk_to_utc("2026-11-05", 13, 0)
        self.assertEqual(utc_dt.hour, 10)
        self.assertEqual(utc_dt.minute, 0)

    def test_msk_to_utc_evening_slot(self):
        # 17:00 MSK должно быть строго 14:00 UTC
        utc_dt = msk_to_utc("2026-11-05", 17, 0)
        self.assertEqual(utc_dt.hour, 14)
        self.assertEqual(utc_dt.minute, 0)

    def test_utc_to_msk_conversion(self):
        # 03:00 UTC (запуск viral-factory cron) должно быть 06:00 MSK
        utc_dt = datetime(2026, 11, 5, 3, 0, 0, tzinfo=timezone.utc)
        msk_dt = utc_to_msk(utc_dt)
        self.assertEqual(msk_dt.hour, 6)
        self.assertEqual(msk_dt.minute, 0)
        self.assertEqual(msk_dt.strftime("%Z"), "MSK")

    def test_no_drift(self):
        # Проверяем, что разница всегда ровно 3 часа (10800 секунд)
        dt = datetime(2026, 11, 5, 12, 0, 0, tzinfo=MSK_TZ)
        utc_offset = dt.utcoffset()
        self.assertEqual(utc_offset, timedelta(hours=3))

if __name__ == "__main__":
    unittest.main()
