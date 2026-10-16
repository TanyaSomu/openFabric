import React from 'react';

export const ProjectSummary: React.FC = () => {
  const cards = [
    {
      label: 'Authentication',
      title: 'OAuth2 / JWT Verification',
      desc: 'Cryptographic asymmetric verification (RS256/ES256) checking expiration, issuer, audience, and subject identity.',
    },
    {
      label: 'Authorization',
      title: 'Hierarchical PDP Engine',
      desc: 'Deterministic precedence: specific rules beat general rules, child beats parent, and DENY beats ALLOW at equal specificity.',
    },
    {
      label: 'Database',
      title: 'SQLite (better-sqlite3)',
      desc: 'Embedded zero-latency persistence with WAL mode, parameterized queries, and 11 permission seed records.',
    },
    {
      label: 'API Endpoint',
      title: 'POST /authorize',
      desc: 'Canonical path normalization, traversal blocking, strict Zod body schema, and sanitized error responses.',
    },
  ];

  return (
    <section className="summary-grid" aria-label="Architecture and Implementation Summary">
      {cards.map((card) => (
        <article key={card.label} className="summary-card">
          <div className="summary-label">{card.label}</div>
          <h2 className="summary-title">{card.title}</h2>
          <p className="summary-desc">{card.desc}</p>
        </article>
      ))}
    </section>
  );
};
