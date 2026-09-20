# Deploying MedSupply Member C on AWS

What runs where:
  S3 -> stores data/, model/, and published results (results/member_c_output.json, results/predictions.json)
  Lambda -> the whole backend (features 4-7 + /predict) behind an HTTPS URL
  Step Functions -> PredictRisk -> RunSimulationPipeline -> results written to S3
  (SageMaker: the model was trained by Member A; here it is served from Lambda. Say this honestly in the writeup.)

Tested by me: handler + routes + S3 read/write (mocked S3) + lite package without scikit-learn + templates lint clean.
NOT tested by me: a real AWS deploy. Expect to fix small permission/region issues.

------------------------------------------------------------------
## PATH 1 - FASTEST (console only, ~15 min, no CLI, no Docker)   <- do this first
------------------------------------------------------------------
Uses medsupply_lite.zip (37 KB). /predict serves Member A's saved scores (source: "precomputed_member_a_output").

1. AWS Console -> Lambda -> Create function -> "Author from scratch"
   Name: medsupply-c | Runtime: Python 3.12 | Create.
2. Code tab -> Upload from -> .zip file -> medsupply_lite.zip -> Save.
3. Runtime settings -> Edit -> Handler = lambda_handler.lambda_handler
4. Configuration -> General -> Edit: Memory 512 MB, Timeout 30 sec.
5. Configuration -> Function URL -> Create: Auth type NONE; tick "Configure CORS":
   allow origin *, allow headers content-type, allow methods GET, POST.
   Copy the URL, e.g. https://abc123.lambda-url.<region>.on.aws
6. Test in a browser or terminal (paths keep the /api prefix):
   curl "<URL>/api/health"
   curl "<URL>/api/scenarios"
   curl "<URL>/api/predict/CARBOPLATIN%20INJECTION"
   curl -X POST "<URL>/api/simulate" -H "Content-Type: application/json" \
        -d '{"drug":"BUPIVACAINE HYDROCHLORIDE INJECTION","allocations":[{"source_id":"HOSP_APEX_HEALTH","units":800}]}'
   -> the simulate call must return "verdict": "REJECTED".

### Add S3 (so "S3 stores data" is true)
7. S3 -> Create bucket (e.g. medsupply-c-<yourname>). Upload the project's data/ folder files under the prefix data/
   (member_a_output.json, member_b_output.json, demand_baseline.json, latest_features.csv).
8. Lambda -> Configuration -> Environment variables: DATA_BUCKET = <bucket name>
9. Lambda -> Configuration -> Permissions -> click the role -> Add permissions -> Attach policies ->
   AmazonS3FullAccess (fine for a hackathon; delete afterwards).
10. Re-test /api/health. Results are written to s3://<bucket>/results/ when the Step Function runs.
    If S3 has no data/ files the function silently uses the copies bundled in the zip.

### Add Step Functions
11. Step Functions -> Create state machine -> Blank -> Code tab. Paste deploy/state_machine.asl.json.
    Replace  ${FunctionArn}  (2 places) with your Lambda ARN (Lambda page, top right).
12. Next -> type Standard -> let the console create the role (it adds lambda:InvokeFunction) -> Create.
13. Start execution (input {}). Expect: PredictRisk -> RunSimulationPipeline -> Done (green).
    Check S3: results/predictions.json and results/member_c_output.json.

------------------------------------------------------------------
## PATH 2 - Same thing with one command (needs AWS CLI + SAM CLI)
------------------------------------------------------------------
    aws configure                                   # once
    ./deploy/build_lite.sh                          # Windows: run in Git Bash or WSL
    sam deploy -t deploy/template-lite.yaml --guided --resolve-s3
       # stack name: medsupply-c | allow IAM role creation: Y | "no auth" warning for the API: Y
    -> Outputs: ApiUrl, BucketName, StateMachineArn
    aws s3 sync data/ s3://<BucketName>/data/       # optional, same as step 7
    curl "<ApiUrl>/health"
    aws stepfunctions start-execution --state-machine-arn <StateMachineArn> --input "{}"
If sam deploy complains about packaging, run:  sam build -t deploy/template-lite.yaml  then  sam deploy --guided
Here the API URL already ends in /api, so call <ApiUrl>/health, <ApiUrl>/scenarios ...

------------------------------------------------------------------
## PATH 3 - FULL: live ML model on AWS (needs Docker running + SAM CLI). Do only if time allows.
------------------------------------------------------------------
    sam build  -t deploy/template-full.yaml
    sam deploy --guided --resolve-image-repos --resolve-s3
Container image pins scikit-learn==1.8.0 (the version inside Member A's .pkl). Memory 2048 MB.
Then GET <ApiUrl>/predict/<drug> returns "source": "live_model". First call after idle is slow (cold start ~10-20 s).
Upload model/ to S3 too only if you want S3 to be the source of truth:  aws s3 sync model/ s3://<bucket>/model/

------------------------------------------------------------------
## Troubleshooting
------------------------------------------------------------------
- 500 / "Runtime.ImportModuleError": handler must be exactly lambda_handler.lambda_handler and the zip must have
  lambda_handler.py at its TOP LEVEL (not inside a folder). Rebuild with deploy/build_lite.sh.
- {"message":"Not Found"} with API Gateway: use /api/... paths; the route is /api/{proxy+}.
- CORS error in Member D's frontend: Function URL / HttpApi CORS must allow origin * and header content-type.
- AccessDenied on S3: attach the S3 policy to the Lambda's role (step 9).
- Timeout on first call: raise Lambda timeout to 30 s and memory to 1024 MB.
- Full image build fails on Windows: use WSL, or stay on Path 1.

## Security / cost
The URL has NO authentication (hackathon demo). Do not put real data behind it. Delete when done:
    sam delete        (Path 2/3)    or delete the Lambda, bucket and state machine in the console (Path 1).
Usage this small is normally within AWS free tier, but check your account.
