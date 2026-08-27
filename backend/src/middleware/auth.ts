import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db';

export interface AuthUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;

    // Checked live (not just baked into the JWT) so a freeze takes effect immediately,
    // even for tokens issued before the account was frozen.
    const result = await pool.query('SELECT role, is_frozen FROM users WHERE id = $1', [decoded.id]);
    const account = result.rows[0];
    if (!account) return res.status(401).json({ error: 'Account no longer exists' });
    if (account.is_frozen) return res.status(403).json({ error: 'This account has been frozen. Contact support.' });

    req.user = { ...decoded, role: account.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
