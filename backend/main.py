from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.db import SessionLocal, TransactionRecord
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import Dict
from io import BytesIO
import pandas as pd
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
import joblib
import numpy as np
import tensorflow as tf
import json


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="Credit Card Fraud Detection API",
    description="Hybrid Anomaly Detection API for Credit Card Fraud Detection",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# MODEL DIRECTORY
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"


# =========================================================
# LOAD MODELS
# =========================================================

try:

    isolation_forest = joblib.load(
        MODEL_DIR / "isolation_forest.pkl"
    )

    lof = joblib.load(
        MODEL_DIR / "lof.pkl"
    )

    one_class_svm = joblib.load(
        MODEL_DIR / "one_class_svm.pkl"
    )

    autoencoder = tf.keras.models.load_model(
        MODEL_DIR / "autoencoder.keras"
    )

    scaler = joblib.load(
        MODEL_DIR / "scaler.pkl"
    )

    scaler_autoencoder = joblib.load(
        MODEL_DIR / "scaler_autoencoder.pkl"
    )

    hybrid_scaler = joblib.load(
        MODEL_DIR / "hybrid_scaler.pkl"
    )

    with open(MODEL_DIR / "threshold.json", "r") as f:
        config = json.load(f)

    BEST_THRESHOLD = float(
        config["best_threshold"]
    )

    print("✅ All models loaded successfully")

except Exception as e:

    print("❌ Model loading failed:", e)
    raise


# =========================================================
# INPUT SCHEMA
# =========================================================

class Transaction(BaseModel):

    zTime: float

    V1: float
    V2: float
    V3: float
    V4: float
    V5: float
    V6: float
    V7: float
    V8: float
    V9: float
    V10: float
    V11: float
    V12: float
    V13: float
    V14: float
    V15: float
    V16: float
    V17: float
    V18: float
    V19: float
    V20: float
    V21: float
    V22: float
    V23: float
    V24: float
    V25: float
    V26: float
    V27: float
    V28: float

    Amount: float


# =========================================================
# FEATURE ORDER
# =========================================================

FEATURE_COLUMNS = [
    "zTime",

    "V1",
    "V2",
    "V3",
    "V4",
    "V5",
    "V6",
    "V7",
    "V8",
    "V9",
    "V10",
    "V11",
    "V12",
    "V13",
    "V14",
    "V15",
    "V16",
    "V17",
    "V18",
    "V19",
    "V20",
    "V21",
    "V22",
    "V23",
    "V24",
    "V25",
    "V26",
    "V27",
    "V28",

    "Amount"
]


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():

    return {
        "message": "Credit Card Fraud Detection API is running",
        "status": "success"
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health_check():

    return {
        "status": "healthy",
        "models_loaded": True,
        "model_type": "Hybrid Anomaly Detection"
    }


# =========================================================
# RISK LEVEL
# =========================================================

def get_risk_level(score):

    if score < 30:
        return "LOW"

    elif score < 70:
        return "MEDIUM"

    else:
        return "HIGH"


# =========================================================
# EXPLANATION
# =========================================================

def get_explanation(model_scores):

    strongest_model = max(
        model_scores,
        key=model_scores.get
    )

    high_models = sum(
        score >= 0.70
        for score in model_scores.values()
    )

    if high_models >= 3:

        return (
            f"Multiple anomaly models detected "
            f"unusual behavior ({high_models}/4 models)"
        )

    elif high_models == 2:

        return (
            f"Two anomaly models detected unusual behavior; "
            f"strongest signal: {strongest_model}"
        )

    else:

        return (
            f"Strongest anomaly signal detected by "
            f"{strongest_model}"
        )


# =========================================================
# PREDICTION API
# =========================================================

@app.post("/predict")
def predict_transaction(transaction: Transaction):

    try:

        # ---------------------------------------------
        # Convert input to dictionary
        # ---------------------------------------------

        transaction_data = transaction.model_dump()

        # ---------------------------------------------
        # Create feature array
        # ---------------------------------------------

        X = np.array([
            transaction_data[column]
            for column in FEATURE_COLUMNS
        ]).reshape(1, -1)


        # ---------------------------------------------
        # Standard scaling
        # ---------------------------------------------

        X_scaled = scaler.transform(X)


        # ---------------------------------------------
        # Autoencoder scaling
        # ---------------------------------------------

        X_ae_scaled = scaler_autoencoder.transform(X)


        # =================================================
        # ISOLATION FOREST
        # =================================================

        if_prediction = isolation_forest.predict(
            X_scaled
        )[0]

        if_score = -isolation_forest.score_samples(
            X_scaled
        )[0]


        # =================================================
        # LOF
        # =================================================

        lof_prediction = lof.predict(
            X_scaled
        )[0]

        lof_score = -lof.decision_function(
            X_scaled
        )[0]


        # =================================================
        # ONE CLASS SVM
        # =================================================

        svm_prediction = one_class_svm.predict(
            X_scaled
        )[0]

        svm_score = -one_class_svm.decision_function(
            X_scaled
        )[0]


        # =================================================
        # AUTOENCODER
        # =================================================

        reconstructed = autoencoder.predict(
            X_ae_scaled,
            verbose=0
        )

        ae_score = float(
            np.mean(
                np.square(
                    X_ae_scaled - reconstructed
                ),
                axis=1
            )[0]
        )


        # =================================================
        # HYBRID SCALING
        # =================================================

        raw_scores = np.array([
            [
                if_score,
                lof_score,
                svm_score,
                ae_score
            ]
        ])

        scaled_scores = hybrid_scaler.transform(
            raw_scores
        )[0]


        # =================================================
        # HYBRID SCORE
        # =================================================

        hybrid_score = (

            0.25 * scaled_scores[0]

            + 0.25 * scaled_scores[1]

            + 0.20 * scaled_scores[2]

            + 0.30 * scaled_scores[3]
        )


        # =================================================
        # RISK SCORE 0-100
        # =================================================

        risk_score = float(
            np.clip(
                hybrid_score * 100,
                0,
                100
            )
        )


        # =================================================
        # RISK LEVEL
        # =================================================

        risk_level = get_risk_level(
            risk_score
        )


        # =================================================
        # FRAUD / NORMAL
        # =================================================

        prediction = (

            "Fraud"
            if risk_score >= BEST_THRESHOLD
            else "Normal"
        )


        # =================================================
        # MODEL SCORES
        # =================================================

        model_scores = {

            "Isolation Forest":
                float(scaled_scores[0]),

            "LOF":
                float(scaled_scores[1]),

            "One-Class SVM":
                float(scaled_scores[2]),

            "Autoencoder":
                float(scaled_scores[3])
        }


        # =================================================
        # EXPLANATION
        # =================================================

        explanation = get_explanation(
            model_scores
        )


        # =================================================
        # RESPONSE
        # =================================================

        # =========================================================
        # SAVE PREDICTION TO POSTGRESQL
        # =========================================================

        db = SessionLocal()

        try:
            record = TransactionRecord(
                amount=transaction.Amount,
                risk_score=risk_score,
                risk_level=risk_level,
                prediction=prediction,
                isolation_forest=model_scores.get("Isolation Forest", 0),
                lof=model_scores.get("LOF", 0),
                one_class_svm=model_scores.get("One-Class SVM", 0),
                autoencoder=model_scores.get("Autoencoder", 0),
                explanation=explanation
            )

            db.add(record)
            db.commit()

        except Exception as db_error:
            db.rollback()
            print("⚠️ PostgreSQL save failed:", db_error)

        finally:
            db.close()


        return {

            "prediction": prediction,

            "risk_score": round(
                risk_score,
                2
            ),

            "risk_level": risk_level,

            "threshold": round(
                BEST_THRESHOLD,
                2
            ),

            "model_scores": {
                key: round(
                    value,
                    4
                )

                for key, value
                in model_scores.items()
            },

            "explanation": explanation
            
        }


    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
    # =========================================================
# BULK CSV ANALYSIS
# =========================================================

@app.post("/predict-csv")
async def predict_csv(file: UploadFile = File(...)):
    """
    Analyze multiple transactions from a CSV file.
    Required columns: zTime, V1...V28, Amount.
    Each row is evaluated by the same hybrid model used by /predict.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")

        df = pd.read_csv(BytesIO(content))
        missing = [column for column in FEATURE_COLUMNS if column not in df.columns]
        if missing:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "CSV is missing required model feature columns.",
                    "missing_columns": missing,
                    "required_columns": FEATURE_COLUMNS
                }
            )

        if df.empty:
            raise HTTPException(status_code=400, detail="The CSV contains no transactions.")

        # Limit batch size to keep the API responsive and memory use predictable.
        if len(df) > 10000:
            raise HTTPException(
                status_code=400,
                detail="Maximum 10,000 transactions per upload. Split the file into smaller CSVs."
            )

        features = df[FEATURE_COLUMNS].apply(pd.to_numeric, errors="coerce")
        if features.isnull().any().any():
            bad_columns = features.columns[features.isnull().any()].tolist()
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Required feature columns contain missing or non-numeric values.",
                    "columns": bad_columns
                }
            )

        X = features.to_numpy(dtype=float)
        if not np.isfinite(X).all():
            raise HTTPException(status_code=400, detail="CSV contains infinite or invalid numeric values.")

        X_scaled = scaler.transform(X)
        X_ae_scaled = scaler_autoencoder.transform(X)

        if_predictions = isolation_forest.predict(X_scaled)
        if_scores = -isolation_forest.score_samples(X_scaled)

        lof_predictions = lof.predict(X_scaled)
        lof_scores = -lof.decision_function(X_scaled)

        svm_predictions = one_class_svm.predict(X_scaled)
        svm_scores = -one_class_svm.decision_function(X_scaled)

        reconstructed = autoencoder.predict(X_ae_scaled, verbose=0)
        ae_scores = np.mean(np.square(X_ae_scaled - reconstructed), axis=1)

        raw_scores = np.column_stack([if_scores, lof_scores, svm_scores, ae_scores])
        scaled_scores = hybrid_scaler.transform(raw_scores)

        hybrid_scores = (
            0.25 * scaled_scores[:, 0]
            + 0.25 * scaled_scores[:, 1]
            + 0.20 * scaled_scores[:, 2]
            + 0.30 * scaled_scores[:, 3]
        )
        risk_scores = np.clip(hybrid_scores * 100, 0, 100)

        results = []
        for index, row in enumerate(X):
            model_scores = {
                "Isolation Forest": float(scaled_scores[index, 0]),
                "LOF": float(scaled_scores[index, 1]),
                "One-Class SVM": float(scaled_scores[index, 2]),
                "Autoencoder": float(scaled_scores[index, 3]),
            }
            risk_score = float(risk_scores[index])
            risk_level = get_risk_level(risk_score)
            prediction = "Fraud" if risk_score >= BEST_THRESHOLD else "Normal"
            explanation = get_explanation(model_scores)

            results.append({
                "row_number": index + 1,
                "amount": float(row[FEATURE_COLUMNS.index("Amount")]),
                "risk_score": round(risk_score, 2),
                "risk_level": risk_level,
                "prediction": prediction,
                "explanation": explanation,
                "model_scores": {key: round(value, 4) for key, value in model_scores.items()},
            })

        # Persist each prediction using the same DB table as the single-transaction endpoint.
        db = SessionLocal()
        try:
            records = [
                TransactionRecord(
                    amount=item["amount"],
                    risk_score=item["risk_score"],
                    risk_level=item["risk_level"],
                    prediction=item["prediction"],
                    isolation_forest=item["model_scores"]["Isolation Forest"],
                    lof=item["model_scores"]["LOF"],
                    one_class_svm=item["model_scores"]["One-Class SVM"],
                    autoencoder=item["model_scores"]["Autoencoder"],
                    explanation=item["explanation"],
                )
                for item in results
            ]
            db.add_all(records)
            db.commit()
        except Exception as db_error:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Predictions were calculated but could not be saved to PostgreSQL: {db_error}"
            )
        finally:
            db.close()

        fraud_count = sum(item["prediction"] == "Fraud" for item in results)
        high_risk_count = sum(item["risk_level"] == "HIGH" for item in results)
        return {
            "filename": file.filename,
            "total_transactions": len(results),
            "fraud_detected": fraud_count,
            "normal_transactions": len(results) - fraud_count,
            "high_risk_transactions": high_risk_count,
            "results": results,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CSV analysis failed: {exc}")
    finally:
        await file.close()


# =========================================================
# TRANSACTION HISTORY
# =========================================================

@app.get("/history")
def get_history():
    db = SessionLocal()

    try:
        records = (
            db.query(TransactionRecord)
            .order_by(TransactionRecord.id.desc())
            .limit(100)
            .all()
        )

        return {
            "total": len(records),
            "transactions": [
                {
                    "id": record.id,
                    "amount": record.amount,
                    "risk_score": record.risk_score,
                    "risk_level": record.risk_level,
                    "prediction": record.prediction,
                    "isolation_forest": record.isolation_forest,
                    "lof": record.lof,
                    "one_class_svm": record.one_class_svm,
                    "autoencoder": record.autoencoder,
                    "explanation": record.explanation,
                    "created_at": record.created_at
                }
                for record in records
            ]
        }

    finally:
        db.close()
        # =========================================================
# DASHBOARD STATISTICS
# =========================================================

@app.get("/stats")
def get_stats():
    db = SessionLocal()

    try:
        records = db.query(TransactionRecord).all()

        total = len(records)
        fraud_count = sum(
            1 for r in records if r.prediction.lower() == "fraud"
        )
        normal_count = total - fraud_count
        high_risk_count = sum(
            1 for r in records if r.risk_level.upper() == "HIGH"
        )

        average_risk_score = (
            sum(r.risk_score for r in records) / total
            if total > 0 else 0
        )

        return {
            "total_transactions": total,
            "fraud_detected": fraud_count,
            "normal_transactions": normal_count,
            "high_risk_transactions": high_risk_count,
            "average_risk_score": round(average_risk_score, 2)
        }

    finally:
        db.close()
        # =========================================================
# FRAUD ALERTS
# =========================================================

@app.get("/alerts")
def get_alerts():
    db = SessionLocal()

    try:
        alerts = (
            db.query(TransactionRecord)
            .filter(
                (TransactionRecord.prediction == "Fraud") |
                (TransactionRecord.risk_level == "HIGH")
            )
            .order_by(TransactionRecord.id.desc())
            .limit(50)
            .all()
        )

        return {
            "total_alerts": len(alerts),
            "alerts": [
                {
                    "id": record.id,
                    "amount": record.amount,
                    "risk_score": record.risk_score,
                    "risk_level": record.risk_level,
                    "prediction": record.prediction,
                    "explanation": record.explanation,
                    "created_at": record.created_at
                }
                for record in alerts
            ]
        }

    finally:
        db.close()