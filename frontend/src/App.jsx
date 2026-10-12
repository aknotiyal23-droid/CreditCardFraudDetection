import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // PostgreSQL data
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dashboardError, setDashboardError] = useState("");
  const [stats, setStats] = useState({
    total_transactions: 0,
    fraud_detected: 0,
    normal_transactions: 0,
    high_risk_transactions: 0,
    average_risk_score: 0
  });

  // Bulk CSV analysis
  const [csvFile, setCsvFile] = useState(null);
  const [csvResult, setCsvResult] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState("");

  // ================================
  // LOAD DATABASE DATA
  // ================================
  const loadDashboardData = async () => {
    try {
      setDashboardError("");

      const [historyResponse, statsResponse, alertsResponse] = await Promise.all([
        fetch(`${API_URL}/history`),
        fetch(`${API_URL}/stats`),
        fetch(`${API_URL}/alerts`)
      ]);

      if (!historyResponse.ok || !statsResponse.ok || !alertsResponse.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const historyData = await historyResponse.json();
      const statsData = await statsResponse.json();
      const alertsData = await alertsResponse.json();

      setHistory(historyData.transactions || []);
      setStats(statsData);
      setAlerts(alertsData.alerts || []);
    } catch (error) {
      console.error("Dashboard loading error:", error);
      setDashboardError(
        "Could not load dashboard data. Check that the backend is running."
      );
    }
  };

  // Load database data when page opens
  useEffect(() => {
    loadDashboardData();
  }, []);

  // ================================
  // PREDICT TRANSACTION
  // ================================
  const predictTransaction = async () => {
    if (!amount || Number(amount) < 0) {
      alert("Please enter a valid transaction amount.");
      return;
    }

    setLoading(true);

    const transaction = {
      zTime: 151328,
      V1: 2.2887,
      V2: -1.2961,
      V3: -1.6174,
      V4: -1.5921,
      V5: -0.7502,
      V6: -0.8120,
      V7: -0.6525,
      V8: -0.2908,
      V9: -0.1000,
      V10: -0.2000,
      V11: 0.3000,
      V12: -0.4000,
      V13: 0.1000,
      V14: -0.3000,
      V15: 0.2000,
      V16: -0.1000,
      V17: 0.0500,
      V18: -0.0500,
      V19: 0.1000,
      V20: -0.1000,
      V21: 0.0500,
      V22: -0.0500,
      V23: 0.1000,
      V24: -0.1000,
      V25: 0.0500,
      V26: -0.0500,
      V27: 0.1000,
      V28: -0.1000,
      Amount: Number(amount)
    };

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(transaction)
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();

      setResult(data);

      // Refresh real PostgreSQL data
      await loadDashboardData();

    } catch (error) {
      console.error("Prediction error:", error);
      alert("Backend error: Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  // ================================
  // BULK CSV ANALYSIS
  // ================================
  const uploadCSV = async () => {
    if (!csvFile) {
      setCsvError("Please select a CSV file first.");
      return;
    }

    if (!csvFile.name.toLowerCase().endsWith(".csv")) {
      setCsvError("Please choose a .csv file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", csvFile);

    setCsvLoading(true);
    setCsvError("");
    setCsvResult(null);

    try {
      const response = await fetch(`${API_URL}/predict-csv`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail || "CSV analysis failed");
        throw new Error(detail);
      }

      setCsvResult(data);
      await loadDashboardData();
    } catch (error) {
      console.error("CSV upload error:", error);
      setCsvError(error.message || "CSV analysis failed. Check the backend.");
    } finally {
      setCsvLoading(false);
    }
  };

  const downloadCSVResults = () => {
    if (!csvResult?.results?.length) return;

    const columns = [
      "row_number",
      "amount",
      "risk_score",
      "risk_level",
      "prediction",
      "explanation",
    ];

    const escapeCSV = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = [
      columns.join(","),
      ...csvResult.results.map((item) =>
        columns.map((column) => escapeCSV(item[column])).join(",")
      ),
    ];

    const blob = new Blob(["\\uFEFF", rows.join("\\r\\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fraud_detection_results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // ================================
  // RISK CLASS
  // ================================
  const getRiskClass = (level) => {
    if (!level) return "low";

    const value = level.toUpperCase();

    if (value === "HIGH") return "high";
    if (value === "MEDIUM") return "medium";

    return "low";
  };

  // ================================
  // FORMAT SCORE
  // ================================
  const formatScore = (value) => {
    if (value === undefined || value === null) {
      return "0.0000";
    }

    return Number(value).toFixed(4);
  };

  return (
    <div className="app">

      {/* ================= HEADER ================= */}
      <header className="header">

        <div>
          <h1>Credit Card Fraud Detection</h1>
          <p>Hybrid Anomaly Detection System</p>
        </div>

        <div className="api-status">
          ● API Online
        </div>

      </header>


      <main>

        {/* ================= DASHBOARD STATS ================= */}
        <section className="stats-grid">

          <div className="stat-card">
            <h3>Total Transactions</h3>
            <div className="stat-number">
              {stats.total_transactions}
            </div>
          </div>

          <div className="stat-card">
            <h3>Fraud Detected</h3>
            <div className="stat-number">
              {stats.fraud_detected}
            </div>
          </div>

          <div className="stat-card">
            <h3>Normal Transactions</h3>
            <div className="stat-number">
              {stats.normal_transactions}
            </div>
          </div>

          <div className="stat-card">
            <h3>High Risk</h3>
            <div className="stat-number">
              {stats.high_risk_transactions}
            </div>
          </div>

          <div className="stat-card">
            <h3>Average Risk</h3>
            <div className="stat-number">
              {Number(stats.average_risk_score || 0).toFixed(2)}
            </div>
          </div>

        </section>


        {/* ================= BULK CSV ANALYSIS ================= */}
        <section className="transaction-card bulk-csv-card">
          <h2>📂 Bulk Fraud Detection</h2>
          <p className="subtitle">
            Upload a CSV file to analyze multiple transactions in one batch.
          </p>

          <div className="form-group">
            <label htmlFor="csv-upload">Select transaction CSV</label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setCsvFile(event.target.files?.[0] || null);
                setCsvResult(null);
                setCsvError("");
              }}
            />
            <small>
              Required columns: zTime, V1–V28, Amount. Maximum 10,000 rows per upload.
            </small>
          </div>

          <button
            className="analyze-btn"
            onClick={uploadCSV}
            disabled={csvLoading || !csvFile}
          >
            {csvLoading ? "Analyzing CSV..." : "🚀 Analyze CSV"}
          </button>

          {csvError && (
            <p className="csv-error" role="alert">
              {csvError}
            </p>
          )}

          {csvResult && (
            <div className="csv-results">
              <div className="history-header csv-result-heading">
                <div>
                  <h3>Batch Analysis Results</h3>
                  <p className="subtitle">{csvResult.filename || csvFile?.name}</p>
                </div>
                <button
                  className="refresh-btn"
                  onClick={downloadCSVResults}
                  disabled={!csvResult.results?.length}
                >
                  ⬇ Download Results CSV
                </button>
              </div>

              <div className="csv-summary-grid">
                <div className="stat-card">
                  <h3>Total</h3>
                  <div className="stat-number">{csvResult.total_transactions}</div>
                </div>
                <div className="stat-card">
                  <h3>Fraud Detected</h3>
                  <div className="stat-number">{csvResult.fraud_detected}</div>
                </div>
                <div className="stat-card">
                  <h3>Normal</h3>
                  <div className="stat-number">{csvResult.normal_transactions}</div>
                </div>
                <div className="stat-card">
                  <h3>High Risk</h3>
                  <div className="stat-number">{csvResult.high_risk_transactions}</div>
                </div>
              </div>

              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>CSV Row</th>
                      <th>Amount</th>
                      <th>Risk Score</th>
                      <th>Risk Level</th>
                      <th>Prediction</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(csvResult.results || []).map((item) => (
                      <tr key={item.row_number}>
                        <td>{item.row_number}</td>
                        <td>₹{Number(item.amount || 0).toFixed(2)}</td>
                        <td>{Number(item.risk_score || 0).toFixed(2)}</td>
                        <td>
                          <span className={`risk-level ${getRiskClass(item.risk_level)}`}>
                            {item.risk_level || "UNKNOWN"}
                          </span>
                        </td>
                        <td>{item.prediction || "Unknown"}</td>
                        <td className="explanation-cell">
                          {item.explanation || "No explanation available."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ================= TRANSACTION INPUT ================= */}
        <section className="transaction-card">

          <h2>Transaction Analysis</h2>

          <p className="subtitle">
            Enter transaction details to analyze fraud risk.
          </p>

          <div className="form-group">

            <label>Transaction Amount</label>

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

          </div>

          <button
            className="analyze-btn"
            onClick={predictTransaction}
            disabled={loading}
          >
            {loading
              ? "Analyzing..."
              : "🔍 Analyze Transaction"}
          </button>

        </section>


        {/* ================= RESULT ================= */}
        {result && (
          <>

            <section className="result-grid">

              {/* RISK ASSESSMENT */}
              <div className="card risk-card">

                <h2>Risk Assessment</h2>

                <div className="risk-score">
                  {Number(result.risk_score || 0).toFixed(2)}
                  <span>/100</span>
                </div>

                <div
                  className={`risk-level ${getRiskClass(
                    result.risk_level
                  )}`}
                >
                  {result.risk_level || "LOW"}
                </div>

                <div className="prediction">
                  {result.prediction || "Normal"}
                </div>

                <p className="explanation">
                  {result.explanation ||
                    "No additional explanation available."}
                </p>

              </div>


              {/* MODEL ANALYSIS */}
              <div className="card">

                <h2>Model Analysis</h2>

                <div className="model-list">

                  <div className="model">
                    <span className="model-name">
                      Isolation Forest
                    </span>

                    <span className="model-score">
                      {formatScore(
                        result.model_scores?.["Isolation Forest"]
                      )}
                    </span>
                  </div>


                  <div className="model">
                    <span className="model-name">
                      LOF
                    </span>

                    <span className="model-score">
                      {formatScore(
                        result.model_scores?.LOF
                      )}
                    </span>
                  </div>


                  <div className="model">
                    <span className="model-name">
                      One-Class SVM
                    </span>

                    <span className="model-score">
                      {formatScore(
                        result.model_scores?.["One-Class SVM"]
                      )}
                    </span>
                  </div>


                  <div className="model">
                    <span className="model-name">
                      Autoencoder
                    </span>

                    <span className="model-score">
                      {formatScore(
                        result.model_scores?.Autoencoder
                      )}
                    </span>
                  </div>

                </div>

              </div>

            </section>


            {/* ================= SYSTEM INFORMATION ================= */}
            <section className="info-grid">

              <div className="info-card">
                <h3>Hybrid Engine</h3>

                <p>
                  Combines Isolation Forest, LOF,
                  One-Class SVM and Autoencoder.
                </p>
              </div>


              <div className="info-card">
                <h3>Risk Score</h3>

                <p>
                  Anomaly risk is represented on a
                  0–100 scale for easier interpretation.
                </p>
              </div>


              <div className="info-card">
                <h3>Detection</h3>

                <p>
                  Multiple anomaly detection models
                  analyze the transaction simultaneously.
                </p>
              </div>

            </section>

          </>
        )}


        {/* ================= FRAUD ALERTS ================= */}
        <section className="card alerts-section">
          <div className="history-header">
            <div>
              <h2>🚨 Fraud Alerts</h2>
              <p className="subtitle">
                Transactions flagged as fraud or high risk by the backend
              </p>
            </div>
            <span className="alerts-count">{alerts.length} alert(s)</span>
          </div>

          {dashboardError && (
            <p className="dashboard-error" role="alert">
              {dashboardError}
            </p>
          )}

          {alerts.length === 0 ? (
            <p className="empty-history">
              No fraud or high-risk alerts currently returned by the API.
            </p>
          ) : (
            <div className="alerts-list">
              {alerts.map((alert) => (
                <article className="alert-card" key={alert.id}>
                  <div className="alert-card-header">
                    <strong>Transaction #{alert.id}</strong>
                    <span className={`risk-level ${getRiskClass(alert.risk_level)}`}>
                      {alert.risk_level || "UNKNOWN"}
                    </span>
                  </div>
                  <p><strong>Prediction:</strong> {alert.prediction || "Unknown"}</p>
                  <p><strong>Amount:</strong> ₹{Number(alert.amount || 0).toFixed(2)}</p>
                  <p><strong>Risk score:</strong> {Number(alert.risk_score || 0).toFixed(2)} / 100</p>
                  <p className="alert-explanation">
                    {alert.explanation || "No explanation available."}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ================= TRANSACTION HISTORY ================= */}
        <section className="card history-card">

          <div className="history-header">

            <div>
              <h2>Transaction History</h2>

              <p className="subtitle">
                Latest transactions stored in PostgreSQL
              </p>
            </div>

            <button
              className="refresh-btn"
              onClick={loadDashboardData}
            >
              🔄 Refresh
            </button>

          </div>


          {history.length === 0 ? (

            <p className="empty-history">
              No transactions found.
            </p>

          ) : (

            <div className="history-table-wrapper">

              <table className="history-table">

                <thead>

                  <tr>
                    <th>ID</th>
                    <th>Amount</th>
                    <th>Risk Score</th>
                    <th>Risk Level</th>
                    <th>Prediction</th>
                    <th>Explanation</th>
                  </tr>

                </thead>


                <tbody>

                  {history.map((item) => (

                    <tr key={item.id}>

                      <td>
                        #{item.id}
                      </td>

                      <td>
                        ₹{Number(item.amount || 0).toFixed(2)}
                      </td>

                      <td>
                        {Number(item.risk_score || 0).toFixed(2)}
                      </td>

                      <td>

                        <span
                          className={`risk-level ${getRiskClass(
                            item.risk_level
                          )}`}
                        >
                          {item.risk_level}
                        </span>

                      </td>

                      <td>
                        {item.prediction}
                      </td>

                      <td className="explanation-cell">
                        {item.explanation}
                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </section>
  

      </main>


      {/* ================= FOOTER ================= */}
      <footer>
        Credit Card Fraud Detection • Hybrid Anomaly Engine
      </footer>

    </div>
  );
}

export default App;