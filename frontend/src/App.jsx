import { useEffect, useState } from "react";
import "./App.css";

// Deployed Render API
const API_URL = "https://credit-card-fraud-api-7gp8.onrender.com";

// Render free instances can take time to wake up; show useful network errors.
async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      mode: "cors",
      credentials: "omit",
      signal: options.signal || AbortSignal.timeout(90000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("The API took too long to respond. Wait 30–60 seconds and try again.");
    }
    throw new Error("The browser could not reach the API. Check the Render deployment and CORS settings, then refresh this page.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string"
      ? data.detail
      : data.detail ? JSON.stringify(data.detail) : `API returned ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

function App() {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [stats, setStats] = useState({
    total_transactions: 0,
    fraud_detected: 0,
    normal_transactions: 0,
    high_risk_transactions: 0,
    average_risk_score: 0,
  });

  const [csvFile, setCsvFile] = useState(null);
  const [csvResult, setCsvResult] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState("");

  const loadDashboardData = async () => {
    try {
      setDashboardError("");
      const [historyData, statsData, alertsData] = await Promise.all([
        apiFetch("/history"),
        apiFetch("/stats"),
        apiFetch("/alerts"),
      ]);

      setHistory(historyData.transactions || []);
      setStats((previous) => ({ ...previous, ...statsData }));
      setAlerts(alertsData.alerts || []);

      // Load saved model evaluation metrics separately so a metrics error
      // does not prevent the rest of the dashboard from loading.
      try {
        const metricsData = await apiFetch("/model-metrics");
        setModelMetrics(metricsData.metrics || metricsData);
        setMetricsError("");
      } catch (metricsFetchError) {
        console.error("Model metrics loading error:", metricsFetchError);
        setMetricsError("Model metrics are unavailable on the deployed API. Deploy the updated backend to Render, then refresh.");
      }
    } catch (error) {
      console.error("Dashboard loading error:", error);
      setDashboardError(
        "Dashboard data could not be loaded. The API may be waking up; try Refresh in a few seconds."
      );
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const predictTransaction = async () => {
    if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      window.alert("Please enter a valid transaction amount.");
      return;
    }

    setLoading(true);
    setResult(null);

    // The current backend expects the transaction features used by the model.
    // Only Amount is entered here; remaining features are illustrative defaults.
    const transaction = {
      zTime: 151328,
      V1: 2.2887, V2: -1.2961, V3: -1.6174, V4: -1.5921,
      V5: -0.7502, V6: -0.8120, V7: -0.6525, V8: -0.2908,
      V9: -0.1, V10: -0.2, V11: 0.3, V12: -0.4,
      V13: 0.1, V14: -0.3, V15: 0.2, V16: -0.1,
      V17: 0.05, V18: -0.05, V19: 0.1, V20: -0.1,
      V21: 0.05, V22: -0.05, V23: 0.1, V24: -0.1,
      V25: 0.05, V26: -0.05, V27: 0.1, V28: -0.1,
      Amount: Number(amount),
    };

    try {
      const data = await apiFetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transaction),
      });
      setResult(data);
      await loadDashboardData();
    } catch (error) {
      console.error("Prediction error:", error);
      window.alert(`Prediction failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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
      const data = await apiFetch("/predict-csv", {
        method: "POST",
        body: formData,
      });
      setCsvResult(data);
      await loadDashboardData();
    } catch (error) {
      console.error("CSV upload error:", error);
      setCsvError(error.message || "CSV analysis failed. Please try again.");
    } finally {
      setCsvLoading(false);
    }
  };

  const downloadCSVResults = () => {
    if (!csvResult?.results?.length) return;
    const columns = ["row_number", "amount", "risk_score", "risk_level", "prediction", "explanation"];
    const escapeCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      columns.join(","),
      ...csvResult.results.map((item) => columns.map((column) => escapeCSV(item[column])).join(",")),
    ];
    const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fraud_detection_results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getRiskClass = (level) => {
    const value = String(level || "LOW").toUpperCase();
    if (value === "HIGH") return "high";
    if (value === "MEDIUM") return "medium";
    return "low";
  };

  const formatScore = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(4) : "—";
  };

  const money = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">盾</div>
        <div className="brand-copy">
          <strong>Sentinel<span>AI</span></strong>
          <small>FRAUD INTELLIGENCE</small>
        </div>
        <div className="side-label">WORKSPACE</div>
        <a className="side-link active" href="#overview"><span>▦</span> Overview</a>
        <a className="side-link" href="#analyze"><span>⌕</span> Analyze transaction</a>
        <a className="side-link" href="#bulk"><span>⇧</span> Bulk CSV analysis</a>
        <a className="side-link" href="#alerts"><span>◉</span> Fraud alerts</a>
        <a className="side-link" href="#history"><span>◷</span> Transaction history</a>
        <div className="sidebar-bottom">
          <div className="secure-dot"></div>
          <div><strong>API connection</strong><small>Render deployment</small></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">RISK OPERATIONS / OVERVIEW</div>
            <h1>Fraud Intelligence Dashboard</h1>
            <p className="muted">Monitor transaction anomalies and investigate suspicious activity.</p>
          </div>
          <button className="button button-ghost" onClick={loadDashboardData}>↻ Refresh data</button>
        </header>

        <section id="overview" className="status-strip">
          <span className="status-pulse"></span>
          <span><strong>Monitoring workspace</strong> · Live API connection is checked when data is requested.</span>
          <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">Open API docs ↗</a>
        </section>

        {dashboardError && <div className="notice notice-warning">{dashboardError}</div>}

        <section className="stats-grid">
          <StatCard label="Total transactions" value={stats.total_transactions} icon="▤" tone="blue" />
          <StatCard label="Fraud detected" value={stats.fraud_detected} icon="⌁" tone="red" />
          <StatCard label="Normal transactions" value={stats.normal_transactions} icon="✓" tone="green" />
          <StatCard label="High-risk transactions" value={stats.high_risk_transactions} icon="⚠" tone="amber" />
        </section>

        <section className="panel metrics-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MODEL EVALUATION</span>
              <h2>Model performance</h2>
              <p className="muted">Saved validation metrics from the evaluation report.</p>
            </div>
            <span className="live-badge">VALIDATION</span>
          </div>
          {metricsError && <div className="notice notice-warning">{metricsError}</div>}
          {modelMetrics ? (
            <div className="csv-summary-grid">
              <MiniStat label="Precision" value={`${(Number(modelMetrics.precision || 0) * 100).toFixed(2)}%`} />
              <MiniStat label="Recall" value={`${(Number(modelMetrics.recall || 0) * 100).toFixed(2)}%`} />
              <MiniStat label="F1-score" value={`${(Number(modelMetrics.f1_score || 0) * 100).toFixed(2)}%`} />
              <MiniStat label="Validation rows" value={Number(modelMetrics.validation_rows || 0).toLocaleString("en-IN")} />
              <MiniStat label="Actual fraud cases" value={Number(modelMetrics.actual_fraud_cases || 0).toLocaleString("en-IN")} />
              <MiniStat label="Best threshold" value={Number(modelMetrics.best_threshold || 0).toFixed(4)} />
            </div>
          ) : (
            !metricsError && <EmptyState text="Loading saved model evaluation metrics…" />
          )}
          <p className="tiny-note">These are saved evaluation results, not a guarantee of real-world fraud detection performance.</p>
        </section>

        <section className="content-grid">
          <section id="analyze" className="panel analyze-panel">
            <div className="section-heading">
              <div><span className="section-kicker">01 / QUICK CHECK</span><h2>Analyze a transaction</h2></div>
              <span className="panel-icon">⌕</span>
            </div>
            <p className="muted">Enter an amount to run a prediction using the backend's current sample feature values.</p>
            <label htmlFor="amount">Transaction amount (₹)</label>
            <div className="amount-input">
              <span>₹</span>
              <input id="amount" type="number" min="0" step="0.01" placeholder="e.g. 2499.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <button className="button button-primary full-width" onClick={predictTransaction} disabled={loading}>
              {loading ? <><span className="spinner"></span> Analyzing…</> : "Run fraud analysis →"}
            </button>
            <p className="tiny-note">Note: this quick check varies the amount only. Use CSV analysis for transaction feature data.</p>
          </section>

          <section className="panel model-panel">
            <div className="section-heading">
              <div><span className="section-kicker">02 / DETECTION ENGINE</span><h2>Hybrid model stack</h2></div>
              <span className="live-badge">4 MODELS</span>
            </div>
            <ModelRow name="Isolation Forest" detail="Outlier detection" color="blue" />
            <ModelRow name="Local Outlier Factor" detail="Local density anomaly" color="purple" />
            <ModelRow name="One-Class SVM" detail="Boundary-based detection" color="green" />
            <ModelRow name="Autoencoder" detail="Reconstruction error" color="amber" />
            <div className="model-footnote">Model scores appear after a successful prediction.</div>
          </section>
        </section>

        {result && (
          <section className="panel result-panel">
            <div className="section-heading">
              <div><span className="section-kicker">ANALYSIS OUTPUT</span><h2>Transaction assessment</h2></div>
              <span className={`risk-pill ${getRiskClass(result.risk_level)}`}>{result.risk_level || "UNKNOWN"} RISK</span>
            </div>
            <div className="result-overview">
              <div className="score-block"><span>Risk score</span><strong>{Number(result.risk_score || 0).toFixed(1)}<small>/100</small></strong><div className="score-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(result.risk_score || 0)))}%` }} /></div></div>
              <div className="prediction-block"><span>Prediction</span><strong>{result.prediction || "Unknown"}</strong><p>{result.explanation || "No explanation was returned by the API."}</p></div>
            </div>
            <div className="model-score-grid">
              <ScoreBox label="Isolation Forest" value={result.model_scores?.["Isolation Forest"]} />
              <ScoreBox label="LOF" value={result.model_scores?.LOF} />
              <ScoreBox label="One-Class SVM" value={result.model_scores?.["One-Class SVM"]} />
              <ScoreBox label="Autoencoder" value={result.model_scores?.Autoencoder} />
            </div>
          </section>
        )}

        <section id="bulk" className="panel bulk-panel">
          <div className="section-heading">
            <div><span className="section-kicker">03 / BATCH PROCESSING</span><h2>Bulk CSV analysis</h2><p className="muted">Analyze multiple transactions in one upload.</p></div>
            <span className="panel-icon">⇧</span>
          </div>
          <div className="upload-box">
            <div className="upload-symbol">↑</div>
            <div className="upload-text"><strong>Choose a transaction CSV</strong><small>Required columns: zTime, V1–V28, Amount · Max 10,000 rows</small></div>
            <input type="file" accept=".csv,text/csv" onChange={(event) => { setCsvFile(event.target.files?.[0] || null); setCsvResult(null); setCsvError(""); }} />
          </div>
          {csvFile && <p className="file-selected">Selected: {csvFile.name}</p>}
          {csvError && <div className="notice notice-error">{csvError}</div>}
          <div className="bulk-actions">
            <button className="button button-primary" onClick={uploadCSV} disabled={csvLoading || !csvFile}>{csvLoading ? "Analyzing CSV…" : "Analyze CSV →"}</button>
            {csvResult && <button className="button button-ghost" onClick={downloadCSVResults}>↓ Download results</button>}
          </div>
          {csvResult && (
            <>
              <div className="csv-summary-grid">
                <MiniStat label="Rows analyzed" value={csvResult.total_transactions} />
                <MiniStat label="Fraud detected" value={csvResult.fraud_detected} />
                <MiniStat label="Normal" value={csvResult.normal_transactions} />
                <MiniStat label="High risk" value={csvResult.high_risk_transactions} />
              </div>
              <DataTable rows={csvResult.results || []} getRiskClass={getRiskClass} money={money} />
            </>
          )}
        </section>

        <section id="alerts" className="panel">
          <div className="section-heading">
            <div><span className="section-kicker">04 / PRIORITY QUEUE</span><h2>Fraud alerts</h2><p className="muted">Transactions flagged by the backend.</p></div>
            <span className="count-badge">{alerts.length} alerts</span>
          </div>
          {alerts.length === 0 ? <EmptyState text="No fraud alerts returned by the API yet." /> : (
            <div className="alert-grid">
              {alerts.map((item) => <article className="alert-item" key={item.id}>
                <div className="alert-top"><strong>Transaction #{item.id}</strong><span className={`risk-pill ${getRiskClass(item.risk_level)}`}>{item.risk_level || "UNKNOWN"}</span></div>
                <div className="alert-amount">{money(item.amount)}</div>
                <p>{item.prediction || "Unknown prediction"} · Risk score {Number(item.risk_score || 0).toFixed(1)}/100</p>
                <small>{item.explanation || "No explanation available."}</small>
              </article>)}
            </div>
          )}
        </section>

        <section id="history" className="panel history-panel">
          <div className="section-heading">
            <div><span className="section-kicker">05 / AUDIT TRAIL</span><h2>Transaction history</h2><p className="muted">Latest records stored in PostgreSQL.</p></div>
            <button className="button button-ghost" onClick={loadDashboardData}>↻ Refresh</button>
          </div>
          {history.length === 0 ? <EmptyState text="No transactions found. Analyze a transaction or upload a CSV first." /> : <DataTable rows={history} getRiskClass={getRiskClass} money={money} />}
        </section>

        <footer className="footer"><div className="brand-mark small-mark">盾</div><span>SentinelAI · Credit Card Fraud Detection</span><span className="footer-right">Hybrid anomaly detection · Academic project</span></footer>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, tone }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{Number(value || 0).toLocaleString("en-IN")}</div><div className="stat-bottom"><span className={`tiny-dot ${tone}`}></span> Database summary</div></article>;
}
function ModelRow({ name, detail, color }) {
  return <div className="model-row"><span className={`model-dot ${color}`}></span><div className="model-copy"><strong>{name}</strong><small>{detail}</small></div><span className="model-check">✓</span></div>;
}
function ScoreBox({ label, value }) {
  return <div className="score-box"><span>{label}</span><strong>{value === undefined || value === null ? "—" : Number(value).toFixed(4)}</strong></div>;
}
function MiniStat({ label, value }) {
  const displayValue = typeof value === "string"
    ? value
    : Number(value || 0).toLocaleString("en-IN");
  return <div className="mini-stat"><span>{label}</span><strong>{displayValue}</strong></div>;
}
function EmptyState({ text }) {
  return <div className="empty-state"><span>⌁</span><p>{text}</p></div>;
}
function DataTable({ rows, getRiskClass, money }) {
  if (!rows.length) return <EmptyState text="No results to display." />;
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>ID / Row</th><th>Amount</th><th>Risk score</th><th>Risk level</th><th>Prediction</th><th>Explanation</th></tr></thead><tbody>{rows.map((item, index) => <tr key={item.id ?? item.row_number ?? index}><td>#{item.id ?? item.row_number ?? index + 1}</td><td>{money(item.amount)}</td><td>{Number(item.risk_score || 0).toFixed(2)}</td><td><span className={`risk-pill ${getRiskClass(item.risk_level)}`}>{item.risk_level || "UNKNOWN"}</span></td><td>{item.prediction || "Unknown"}</td><td className="explanation">{item.explanation || "—"}</td></tr>)}</tbody></table></div>;
}

export default App;
