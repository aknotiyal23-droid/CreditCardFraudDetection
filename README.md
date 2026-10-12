# Credit Card Fraud Detection Using Hybrid Anomaly Detection

## 1. Project Overview

This project detects potentially fraudulent credit card transactions
using a hybrid anomaly detection system.

It combines four machine learning models to calculate a risk score
for each transaction.

## 2. Objectives

- Detect unusual transaction patterns.
- Combine multiple anomaly detection algorithms.
- Generate a transaction risk score from 0 to 100.
- Display predictions through a web dashboard.
- Store transaction records in PostgreSQL.
- Support bulk transaction analysis through CSV upload.

## 3. Machine Learning Models

1. Isolation Forest
2. Local Outlier Factor (LOF)
3. One-Class Support Vector Machine
4. Autoencoder

The hybrid score combines the normalized model scores using these weights:

- Isolation Forest: 25%
- LOF: 25%
- One-Class SVM: 20%
- Autoencoder: 30%

## 4. Technology Stack

### Machine Learning
- Python
- Pandas
- NumPy
- Scikit-learn
- TensorFlow

### Backend
- FastAPI
- Uvicorn

### Database
- PostgreSQL
- SQLAlchemy

### Frontend
- React
- Vite
- CSS

## 5. Project Features

- Single transaction risk analysis
- Hybrid anomaly score
- Risk level classification
- Fraud alerts
- Transaction history
- Dashboard statistics
- CSV bulk transaction analysis
- CSV results download
- PostgreSQL transaction storage

## 6. Dataset

The project uses the Credit Card Fraud Detection dataset.

Expected features:
- zTime
- V1 to V28
- Amount

The target column is Class:
- 0 = Normal transaction
- 1 = Fraudulent transaction

## 7. Model Evaluation

Evaluation metrics include:

- Precision
- Recall
- F1-score
- Confusion Matrix
- ROC-AUC
- Average Precision

The evaluation results should be interpreted carefully because
fraudulent transactions are much rarer than normal transactions.

See the reports folder for generated evaluation graphs.

## 8. Project Structure

backend/       - FastAPI backend and database code
frontend/      - React dashboard
data/          - Dataset files
models/        - Saved models and scalers
notebooks/     - Exploratory analysis and evaluation
reports/       - Evaluation graphs
tests/         - Test files

## 9. Run the Backend

Activate your Python virtual environment.

Install dependencies:

pip install -r requirements.txt

Start the backend from the project root:

uvicorn backend.main:app --reload

API documentation:

http://127.0.0.1:8000/docs

## 10. Run the Frontend

Open another terminal:

cd frontend
npm install
npm run dev

Open the local URL printed by Vite.

## 11. Database Configuration

Install PostgreSQL and create the database:

fraud_detection_db

Configure the DATABASE_URL in your local .env file.

Do not commit or share the .env file because it may contain credentials.

## 12. Important Notes

- CSV files must contain all required model feature columns.
- Risk scores are model-generated estimates, not proof of fraud.
- Thresholds should be selected using validation data.
- Final model performance should be reported using an untouched test set.