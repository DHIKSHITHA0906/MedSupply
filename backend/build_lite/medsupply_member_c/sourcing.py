"""Feature #4 - Network-aware safe sourcing + candidate plan generation."""

def classify_sources(scn):
    """Return (safe, excluded) with human-readable reasons."""
    safe, excluded = [], []
    for s in scn["sources"]:
        if s["safe_transferable"] > 0:
            safe.append(s)
        else:
            if s["type"] == "Supplier":
                why = "supplier already running near capacity (would become a bottleneck)"
            else:
                hold = s["safety_stock"] + s["daily_forecast"] * 14
                why = (f"stock {s['stock']} - safety {s['safety_stock']} - forecast demand "
                       f"{int(s['daily_forecast']*14)} = {int(s['stock']-hold)} (nothing safe to give)")
            excluded.append({"id": s["id"], "name": s["name"], "type": s["type"], "reason": why})
    return safe, excluded

def _landed(s):
    return s["unit_cost"] + s["transport_cost_per_unit"]

def _raw_cap(s):
    return s["available_units"] if s["type"] == "Supplier" else s["stock"]

def _fill(order, need, cap):
    alloc, rem = {}, need
    for s in order:
        take = min(cap(s), rem)
        if take > 0:
            alloc[s["id"]] = int(take); rem -= take
        if rem <= 0:
            break
    return alloc

def generate_candidates(scn):
    need = scn["need_units"]
    allsrc = scn["sources"]
    safe, _ = classify_sources(scn)
    cap_safe = lambda s: s["safe_transferable"]
    plans = []

    def add(key, label, mode, alloc):
        if alloc:
            plans.append({"strategy": key, "label": label, "mode": mode, "alloc": alloc})

    # Baselines that ignore safety (this is what a naive tool would do)
    add("naive_cheapest", "Cheapest-first (unfiltered baseline)", "baseline",
        _fill(sorted(allsrc, key=_landed), need, _raw_cap))
    add("naive_fastest", "Fastest-first (unfiltered baseline)", "baseline",
        _fill(sorted(allsrc, key=lambda s: (s["lead_days"], _landed(s))), need, _raw_cap))
    add("naive_largest", "Largest-stock-first (unfiltered baseline)", "baseline",
        _fill(sorted(allsrc, key=lambda s: -_raw_cap(s)), need, _raw_cap))

    # Safe-source plans
    add("safe_cheapest", "Safe sources, cheapest-first", "safe",
        _fill(sorted(safe, key=_landed), need, cap_safe))
    add("safe_fastest", "Safe sources, fastest-first", "safe",
        _fill(sorted(safe, key=lambda s: (s["lead_days"], _landed(s))), need, cap_safe))
    add("safe_headroom", "Safe sources, most headroom first", "safe",
        _fill(sorted(safe, key=lambda s: -s["safe_transferable"]), need, cap_safe))
    internal = [s for s in safe if s["type"] != "Supplier"]
    add("safe_internal", "Internal only (hospitals + warehouses)", "safe",
        _fill(sorted(internal, key=_landed), need, cap_safe))
    tot = sum(s["safe_transferable"] for s in safe)
    if tot >= need and len(safe) > 1:
        alloc = {s["id"]: int(need * s["safe_transferable"] / tot) for s in safe}
        drift = need - sum(alloc.values())
        if drift and alloc:
            k = max(alloc, key=lambda i: next(x["safe_transferable"] for x in safe if x["id"] == i))
            alloc[k] += drift
        alloc = {k: v for k, v in alloc.items() if v > 0}
        add("safe_balanced", "Safe sources, spread proportionally", "safe", alloc)

    # A baseline that happens to stay inside every source's safe limit IS a safe plan - label it so.
    safe_amt = {s["id"]: s["safe_transferable"] for s in allsrc}
    for p in plans:
        if p["mode"] == "baseline" and all(u <= safe_amt[i] for i, u in p["alloc"].items()):
            p["mode"] = "safe"
            p["strategy"] = p["strategy"].replace("naive_", "safe_")
            p["label"] = p["label"].replace("(unfiltered baseline)", "(all within safe limits)")

    seen, uniq = set(), []
    for p in plans:
        sig = tuple(sorted(p["alloc"].items()))
        if sig not in seen:
            seen.add(sig); uniq.append(p)
    for i, p in enumerate(uniq, 1):
        p["plan_id"] = f"P{i}"
    return uniq
