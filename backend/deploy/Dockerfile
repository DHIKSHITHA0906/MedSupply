# FULL deployment: live ML model inside Lambda (container image, up to 10 GB allowed).
FROM public.ecr.aws/lambda/python:3.12
RUN pip install --no-cache-dir numpy scipy joblib scikit-learn==1.8.0
COPY medsupply_member_c/ ${LAMBDA_TASK_ROOT}/medsupply_member_c/
COPY data/ ${LAMBDA_TASK_ROOT}/data/
COPY model/ ${LAMBDA_TASK_ROOT}/model/
COPY lambda_handler.py ${LAMBDA_TASK_ROOT}/
CMD ["lambda_handler.lambda_handler"]
