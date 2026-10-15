import { useEffect, useState } from "react";
import "./App.css";

// Local development uses the local API; deployments can override this value
// with VITE_API_URL in their build environment.
const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// Show a useful message when the local API has not been started yet.
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
    throw new Error(`Cannot reach ${API_URL}. Start the backend in a second terminal, then try again.`);
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
  const [dashboardSearch, setDashboardSearch] = useState("");
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
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none"><path d="M16 3.5 26 7v8.2c0 6.3-4 10.8-10 13.3-6-2.5-10-7-10-13.3V7l10-3.5Z" stroke="currentColor" strokeWidth="1.8"/><path d="m11.5 15.8 3 3 6-6.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="brand-copy">
            <strong>Sentinel<span>AI</span></strong>
            <small>FRAUD INTELLIGENCE</small>
          </div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Dashboard sections">
          <a className="side-link active" href="#overview"><span>▦</span> Overview</a>
          <a className="side-link" href="#analyze"><span>⌕</span> Analyze transaction</a>
          <a className="side-link" href="#bulk"><span>⇧</span> Bulk CSV analysis</a>
          <a className="side-link" href="#alerts"><span>◉</span> Fraud alerts</a>
          <a className="side-link" href="#history"><span>◷</span> Transaction history</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-dot"></div>
          <div><strong>Secure connection</strong><small>Local model API · port 8000</small></div>
        </div>
      </aside>

      <main className="main-content">
        <div className="reference-toolbar">
          <label className="global-search" htmlFor="dashboard-search">
            <span aria-hidden="true">⌕</span>
            <input
              id="dashboard-search"
              type="search"
              placeholder="Search transactions, alerts, or features..."
              value={dashboardSearch}
              onChange={(event) => setDashboardSearch(event.target.value)}
            />
          </label>
          <div className="toolbar-right">
            <span className="system-pill"><span className="secure-dot"></span> System Online</span>
            <button className="toolbar-icon" type="button" onClick={loadDashboardData} aria-label="Refresh dashboard">↻</button>
            <span className="toolbar-date">{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
        <header className="topbar">
          <div className="topbar-copy">
            <div className="eyebrow"><span className="eyebrow-mark"></span> RISK OPERATIONS <span className="eyebrow-divider">/</span> OVERVIEW</div>
            <h1>Fraud intelligence <span>dashboard</span></h1>
            <p className="muted">A clear view of transaction risk, model signals, and emerging fraud activity.</p>
          </div>
          <div className="topbar-actions">
            <span className="system-pill"><span className="secure-dot"></span> SYSTEM ONLINE</span>
            <button className="button button-ghost" onClick={loadDashboardData}><span className="refresh-icon">↻</span> Refresh data</button>
          </div>
        </header>

        <section className="hero-banner">
          <div className="hero-copy">
            <span className="hero-kicker">SENTINELAI · FRAUD INTELLIGENCE</span>
            <h2>Detect Fraud. <span>Secure Tomorrow.</span></h2>
            <p>AI-powered credit card fraud detection using hybrid machine learning.</p>
            <div className="hero-tags">
              <span>✓ Real-time analysis</span><span>✦ Multiple ML models</span><span>✓ Risk assessment</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one"></div><div className="hero-orbit orbit-two"></div>
            <div className="hero-card"><span>▰▰</span><b>•••• &nbsp; •••• &nbsp; 3456</b><small>SECURE TRANSACTION</small></div>
            <div className="hero-shield">⬡<strong>✓</strong></div>
          </div>
          <div className="hero-promise"><strong>Smart<br/>Secure<br/>Reliable</strong><small>Fraud detection<br/>for a safer world</small></div>
        </section>

        <section id="overview" className="status-strip">
          <span className="status-symbol">✦</span>
          <div className="status-copy"><strong>All systems operational</strong><span>Hybrid detection engine is ready to analyze transaction activity.</span></div>
          <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">API documentation <span>↗</span></a>
        </section>

        {dashboardError && <div className="notice notice-warning">{dashboardError}</div>}

        <section className="stats-grid">
          <StatCard label="Total transactions" value={stats.total_transactions} icon="▤" tone="blue" />
          <StatCard label="Fraud detected" value={stats.fraud_detected} icon="⌁" tone="red" />
          <StatCard label="Normal transactions" value={stats.normal_transactions} icon="✓" tone="green" />
          <StatCard label="High-risk transactions" value={stats.high_risk_transactions} icon="⚠" tone="amber" />
          <StatCard label="Average risk score" value={Number(stats.average_risk_score || 0).toFixed(2)} icon="↗" tone="purple" />
        </section>

        <section className="panel metrics-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MODEL EVALUATION</span>
              <h2>Model performance</h2>
            <p className="muted">Validation performance from the saved model evaluation.</p>
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

        <section className="insights-grid">
          <section className="panel insight-panel">
            <div className="section-heading"><div><span className="section-kicker">LIVE DATA</span><h2>Transaction distribution</h2></div><span className="live-badge">DATABASE</span></div>
            <div className="distribution-layout">
              <div className="donut-chart" style={{ "--fraud-share": `${stats.total_transactions ? (Number(stats.fraud_detected || 0) / Number(stats.total_transactions || 1)) * 100 : 0}%`, "--normal-share": `${stats.total_transactions ? (Number(stats.normal_transactions || 0) / Number(stats.total_transactions || 1)) * 100 : 0}%` }}>
                <div><strong>{Number(stats.total_transactions || 0).toLocaleString("en-IN")}</strong><span>Total</span></div>
              </div>
              <div className="distribution-legend">
                <div><i className="legend-dot fraud-dot"></i><span>Fraud detected</span><strong>{Number(stats.fraud_detected || 0).toLocaleString("en-IN")}</strong></div>
                <div><i className="legend-dot normal-dot"></i><span>Normal</span><strong>{Number(stats.normal_transactions || 0).toLocaleString("en-IN")}</strong></div>
                <div><i className="legend-dot risk-dot"></i><span>High risk</span><strong>{Number(stats.high_risk_transactions || 0).toLocaleString("en-IN")}</strong></div>
              </div>
            </div>
            <p className="tiny-note">Visualized from the current API statistics.</p>
          </section>
          <section className="panel insight-panel">
            <div className="section-heading"><div><span className="section-kicker">RECENT ACTIVITY</span><h2>Risk score overview</h2></div><span className="live-badge">HISTORY</span></div>
            {history.length ? <div className="risk-bars">
              {history.slice(0, 7).slice().reverse().map((item, index) => {
                const score = Math.min(100, Math.max(0, Number(item.risk_score || 0)));
                return <div className="risk-bar-column" key={item.id ?? item.row_number ?? index} title={`Risk score ${score.toFixed(2)}`}>
                  <span className="risk-bar-value">{score.toFixed(0)}</span><div className="risk-bar-track"><i style={{ height: `${Math.max(4, score)}%` }} /></div><small>{item.id ? `#${item.id}` : `R${item.row_number ?? index + 1}`}</small>
                </div>;
              })}
            </div> : <EmptyState text="Analyze a transaction to populate the risk overview." />}
            <p className="tiny-note">Recent saved risk scores; this is not a time-series forecast.</p>
          </section>
          <section className="panel insight-panel performance-insight">
            <div className="section-heading"><div><span className="section-kicker">MODEL EVALUATION</span><h2>Model performance</h2></div><span className="live-badge">SAVED METRICS</span></div>
            <div className="ring-grid">
              <MetricRing label="Precision" value={modelMetrics ? Number(modelMetrics.precision || 0) * 100 : null} />
              <MetricRing label="Recall" value={modelMetrics ? Number(modelMetrics.recall || 0) * 100 : null} />
              <MetricRing label="F1 score" value={modelMetrics ? Number(modelMetrics.f1_score || 0) * 100 : null} />
            </div>
            <p className="tiny-note">Uses saved model evaluation values when available.</p>
          </section>
        </section>

        <section className="content-grid">
          <section id="analyze" className="panel analyze-panel">
            <div className="section-heading">
              <div><span className="section-kicker">01 <i /> QUICK CHECK</span><h2>Analyze a transaction</h2></div>
              <span className="panel-icon">⌕</span>
            </div>
            <p className="muted">Run a quick risk check using the hybrid anomaly detection models.</p>
            <label htmlFor="amount">Transaction amount (₹)</label>
            <div className="amount-input">
              <span>₹</span>
              <input id="amount" type="number" min="0" step="0.01" placeholder="e.g. 2499.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <button className="button button-primary full-width" onClick={predictTransaction} disabled={loading}>
              {loading ? <><span className="spinner"></span> Analyzing…</> : "Run fraud analysis →"}
            </button>
            <p className="tiny-note"><span className="note-mark">i</span> Quick check uses sample transaction features with your amount. Upload a CSV for full transaction data.</p>
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
          <section className="panel result-panel" aria-live="polite">
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
              <div><span className="section-kicker">03 <i /> BATCH PROCESSING</span><h2>Bulk CSV analysis</h2><p className="muted">Analyze multiple transactions in one upload.</p></div>
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
            <div><span className="section-kicker">04 <i /> PRIORITY QUEUE</span><h2>Fraud alerts</h2><p className="muted">Transactions flagged by the backend.</p></div>
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
            <div><span className="section-kicker">05 <i /> AUDIT TRAIL</span><h2>Transaction history</h2><p className="muted">Recent analysis records saved to the local database.</p></div>
            <button className="button button-ghost" onClick={loadDashboardData}>↻ Refresh</button>
          </div>
          {history.length === 0 ? <EmptyState text="No transactions found. Analyze a transaction or upload a CSV first." /> : <DataTable rows={history.filter((item) => !dashboardSearch.trim() || [item.id, item.amount, item.risk_score, item.risk_level, item.prediction, item.explanation].some((value) => String(value ?? "").toLowerCase().includes(dashboardSearch.trim().toLowerCase())))} getRiskClass={getRiskClass} money={money} />}
        </section>

        <footer className="footer"><div className="brand-mark small-mark">盾</div><span>SentinelAI · Credit Card Fraud Detection</span><span className="footer-right">Hybrid anomaly detection · Academic project</span></footer>
      </main>
    </div>
  );
}

function MetricRing({ label, value }) {
  const safeValue = value === null ? 0 : Math.min(100, Math.max(0, value));
  return <div className="metric-ring-wrap">
    <div className="metric-ring" style={{ "--ring-value": `${safeValue * 3.6}deg` }}>
      <div><strong>{value === null ? "—" : `${safeValue.toFixed(0)}%`}</strong></div>
    </div>
    <span>{label}</span>
  </div>;
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
