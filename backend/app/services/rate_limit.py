from datetime import datetime, timedelta

# ===== CONFIG =====
MAX_DAILY_CALLS = 10
MAX_PER_MINUTE = 3

# ===== STATE =====
calls_today = 0
minute_calls = 0
minute_window_start = datetime.utcnow()
day_window_start = datetime.utcnow()


def check_rate_limit(service_name: str):
    global calls_today, minute_calls
    global minute_window_start, day_window_start

    now = datetime.utcnow()

    # Reset daily window
    if now - day_window_start > timedelta(days=1):
        calls_today = 0
        day_window_start = now

    # Reset minute window
    if now - minute_window_start > timedelta(minutes=1):
        minute_calls = 0
        minute_window_start = now

    # Check limits
    if calls_today >= MAX_DAILY_CALLS:
        raise RuntimeError(
            f"Daily AI limit reached for {service_name}. Try again tomorrow."
        )

    if minute_calls >= MAX_PER_MINUTE:
        raise RuntimeError(f"Rate limit hit for {service_name}. Slow down.")

    # Increment counters
    calls_today += 1
    minute_calls += 1
