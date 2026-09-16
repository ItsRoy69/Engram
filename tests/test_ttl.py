"""
Engram — TTL / Auto-Forget Test
Run from project root: python tests/test_ttl.py
"""
import sys
import time
sys.path.append("backend")

from ttl import get_expiry, set_ttl, is_expired, get_ttl_seconds
import uuid


def test_classification():
    print("  Testing TTL classification...")


    temp_cases = [
        "Deadline is next Friday",
        "Call the client today",
        "Reminder to send the report this week",
        "Appointment with dentist tomorrow at 3pm",
        "This expires in 2 weeks",
    ]
    for text in temp_cases:
        expiry = get_expiry(text)
        assert expiry is not None, f"Should be temporary: '{text}'"
        print(f"  ⏰ '{text[:50]}' → expires {expiry.strftime('%Y-%m-%d')}")


    perm_cases = [
        "Team agreed API should always use camelCase",
        "Company policy is remote-first",
        "John leads the backend team",

        "I currently work at Google",
        "She currently lives in Berlin",
        "Our weekly meeting convention is always on Tuesdays",
        "User works at Anthropic",
        "User lives in Kolkata",
        "User was born in 1995",
        "User generally prefers dark mode",
    ]
    for text in perm_cases:
        expiry = get_expiry(text)
        assert expiry is None, f"Should be permanent: '{text}' (got expiry={expiry})"
        print(f"  📌 '{text[:55]}' → permanent")

    print("  ✅ Classification correct")


def test_hint_priority():
    print("\n  Testing extractor hint takes priority over regex...")


    expiry = get_expiry("John is out of office", is_temporary_hint=True)
    assert expiry is not None, "Hint=True should force temporary"
    print("  ✅ Hint=True forces expiry (no time words needed)")


    expiry = get_expiry("Our standup meeting is tomorrow as always", is_temporary_hint=False)
    assert expiry is None, "Hint=False must override time-anchor patterns"
    print("  ✅ Hint=False overrides time-anchor patterns")


    expiry = get_expiry("Deadline is next Friday", is_temporary_hint=None)
    assert expiry is not None, "Hint=None + time-anchor → temporary"
    print("  ✅ Hint=None falls through to pattern matching")


def test_redis_ttl():
    print("\n  Testing Redis TTL set + expiry...")
    memory_id = str(uuid.uuid4())

    from datetime import datetime, timedelta, timezone
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=5)
    set_ttl(memory_id, expires_at)

    time.sleep(0.5) 

    remaining = get_ttl_seconds(memory_id)
    assert remaining is not None and remaining > 0, "Should have TTL set"
    assert not is_expired(memory_id), "Should not be expired yet"
    print(f"  ✅ TTL set — {remaining}s remaining")

    print("  Waiting 7 seconds for expiry...")
    time.sleep(7)

    assert is_expired(memory_id), "Should be expired after 7 seconds"
    print("  ✅ Memory auto-expired from Redis")


def test_past_expiry_skipped():
    print("\n  Testing set_ttl skips already-past expiry times...")
    memory_id = str(uuid.uuid4())
    from datetime import datetime, timedelta, timezone

    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=10)
    set_ttl(memory_id, past)

    remaining = get_ttl_seconds(memory_id)
    assert remaining is None, "Past expiry should not be written to Redis"
    print("  ✅ Past expiry silently skipped")


if __name__ == "__main__":
    print("\n🧠 Engram — TTL / Auto-Forget Test\n")
    try:
        test_classification()
        test_hint_priority()
        test_redis_ttl()
        test_past_expiry_skipped()
        print()
        print("✅ TTL working.\n")
    except Exception as e:
        print(f"\n❌ Failed: {e}\n")
        sys.exit(1)
