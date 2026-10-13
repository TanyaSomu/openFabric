-- SQLite schema for user permissions
CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny'))
);

-- Optimize lookup by user_id and action
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_action
ON user_permissions(user_id, action);

-- Seed sample permissions if not already present
INSERT OR IGNORE INTO user_permissions (id, user_id, action, resource, effect) VALUES
(1, 'user123', 'read', 'transactions', 'allow'),
(2, 'user123', 'write', 'transactions', 'allow'),
(3, 'user123', 'delete', 'transactions', 'deny'),
(4, 'user123', 'read', 'accounts', 'allow'),
(5, 'user456', 'read', 'wallets/*', 'allow'),
(6, 'user456', 'write', 'wallets/wallet-789', 'allow'),
(7, 'user456', 'read', 'wallets/wallet-789/transactions', 'allow'),
(8, 'user789', 'write', 'wallets/*/transactions/*', 'allow'),
(9, 'admin789', 'read', '*', 'allow'),
(10, 'admin789', 'write', '*', 'allow'),
(11, 'admin789', 'delete', '*', 'allow');
