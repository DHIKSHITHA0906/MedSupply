"""S3 helpers. Inactive unless DATA_BUCKET is set, so local runs need no AWS."""
import json, os

def bucket():
    return os.environ.get("DATA_BUCKET")

def _s3():
    import boto3
    return boto3.client("s3")

def sync_inputs():
    """Cold start: pull data/ (and model/ if present) from S3 into /tmp and point the code at it."""
    b = bucket()
    if not b:
        return None
    root = "/tmp/medsupply"
    if os.path.exists(os.path.join(root, ".synced")):
        return root
    s3 = _s3()
    got = {"data": 0, "model": 0}
    for prefix, sub in (("data/", "data"), ("model/", "model")):
        pages = s3.get_paginator("list_objects_v2").paginate(Bucket=b, Prefix=prefix)
        for page in pages:
            for obj in page.get("Contents", []):
                if obj["Key"].endswith("/"):
                    continue
                dest = os.path.join(root, sub, os.path.basename(obj["Key"]))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                s3.download_file(b, obj["Key"], dest)
                got[sub] += 1
    # Only redirect to /tmp if S3 really had the files; otherwise keep the copies bundled in the package.
    if got["data"] >= 4:
        os.environ["MEDSUPPLY_DATA_DIR"] = os.path.join(root, "data")
    if got["model"] >= 1:
        os.environ["MEDSUPPLY_MODEL_PATH"] = os.path.join(root, "model", "integrated_risk_model.pkl")
    open(os.path.join(root, ".synced"), "w").close()
    return root

def put_json(key, obj):
    b = bucket()
    if not b:
        return None
    _s3().put_object(Bucket=b, Key=key, Body=json.dumps(obj).encode(), ContentType="application/json")
    return f"s3://{b}/{key}"

def get_json(key):
    b = bucket()
    if not b:
        return None
    return json.loads(_s3().get_object(Bucket=b, Key=key)["Body"].read())
