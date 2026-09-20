"""Run:  python main.py   -> writes member_c_output.json"""
import json, os
from medsupply_member_c.pipeline import run_all

if __name__ == "__main__":
    out = run_all()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "member_c_output.json")
    json.dump(out, open(path, "w"), indent=2)
    print(json.dumps(out["summary"], indent=2)); print("saved ->", path)
