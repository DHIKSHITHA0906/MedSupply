"""Feature #7 - Decision deadline = predicted stockout - procurement - transport - intervention time."""
from datetime import datetime, timedelta, timezone
from . import config as C

def stockout_days(scn):
    """Conservative: the earlier of Member A's risk window and the requester's own days-of-cover."""
    r = scn["requester"]
    cover = r["stock"] / r["daily_forecast"] if r["daily_forecast"] else 999
    return round(min(scn["member_a"]["risk_window_days"], cover), 2)

def compute_deadline(stockout, lead_days, now=None):
    now = now or datetime.now(timezone.utc)
    intervention = C.INTERVENTION_DAYS
    required = lead_days + intervention          # lead_days already includes transport
    slack = round(stockout - required, 2)
    if slack < 0:
        status = "OVERDUE"
    elif slack <= 1:
        status = "ACT_NOW"
    elif slack <= 3:
        status = "URGENT"
    else:
        status = "OK"
    return {
        "predicted_stockout_days": stockout,
        "required_lead_days": lead_days,
        "intervention_days": intervention,
        "latest_action_in_days": slack,
        "status": status,
        "latest_action_at": (now + timedelta(days=max(slack, 0))).isoformat(),
        "predicted_stockout_at": (now + timedelta(days=stockout)).isoformat(),
        "formula": "latest_action = stockout - (lead + transport) - intervention",
    }
