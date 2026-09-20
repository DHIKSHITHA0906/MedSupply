"""All tunable constants in one place (hardcoded weights are intentional & disclosed in the output JSON)."""
HORIZON_DAYS = 14            # planning + simulation horizon
HOSP_SAFETY_DAYS = 3         # safety stock at hospitals (days of demand)
WH_SAFETY_DAYS = 4           # safety stock at warehouses
INTERVENTION_DAYS = 1        # approval / pharmacist review / handling
RISK_THRESHOLD = 0.80        # ripple: drug "newly at risk" if it crosses this
SUPPLIER_STRESS_UTIL = 0.97  # supplier utilisation above this = stressed
MIN_RISK_FOR_SCENARIO = 0.50 # generate scenarios for drugs at/above this risk
RIPPLE_STRENGTH = 0.20       # max risk bump on sibling drugs of a squeezed supplier
LOW_EXPIRY_DAYS = 45         # lots expiring sooner than this count as wastage risk
SEED = 42

# Feature #6: weighted score (lower = better). Weights sum to 1.
WEIGHTS_DEFAULT = {"cost": 0.30, "network_risk": 0.35, "lead_time": 0.20, "expiry_waste": 0.15}
# When slack to the deadline is <= 2 days, speed matters more (still sums to 1)
WEIGHTS_URGENT  = {"cost": 0.20, "network_risk": 0.30, "lead_time": 0.35, "expiry_waste": 0.15}
URGENT_SLACK_DAYS = 2

FIXED_COST = {"Hospital": 250, "Warehouse": 400, "Supplier": 600}       # INR per source used
TRANSPORT_PER_UNIT = {"Hospital": 0.6, "Warehouse": 0.8, "Supplier": 1.5}  # INR per unit
