import React from "react";

export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(135deg,#1b75ff,#8a2be2)"
    }}>
      <div style={{
        color: "white",
        textAlign: "center",
        padding: "2rem",
        borderRadius: "1rem",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        backdropFilter: "blur(4px)",
        maxWidth: 720
      }}>
        <h1 style={{margin: 0, fontSize: "2rem"}}>Fat Hacks 2025 – Gold Coast</h1>
        <p style={{opacity: 0.9, marginTop: "0.75rem"}}>
          Deployment smoke test: your app is live. We’ll plug in the full planner next.
        </p>
      </div>
    </div>
  );
}
