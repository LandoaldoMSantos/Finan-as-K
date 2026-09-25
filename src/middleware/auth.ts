import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: {
    id: number;
    uid: string;
    email: string;
    createdAt: Date | null;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const email = decodedToken.email || '';
    const uid = decodedToken.uid;

    // Get or create the user in Postgres with retry logic for connection drops
    let dbUserRecord;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        dbUserRecord = await db.select().from(users).where(eq(users.uid, uid)).then(res => res[0]);
        break;
      } catch (dbErr: any) {
        attempts++;
        console.error(`Database select user attempt ${attempts} failed:`, dbErr);
        if (attempts >= maxAttempts) {
          throw dbErr;
        }
        // Delay before retry to allow pool connection to re-establish
        await new Promise(resolve => setTimeout(resolve, attempts * 400));
      }
    }

    if (!dbUserRecord) {
      attempts = 0;
      while (attempts < maxAttempts) {
        try {
          // Upsert using insert ... onConflictDoUpdate
          const result = await db.insert(users)
            .values({
              uid,
              email,
            })
            .onConflictDoUpdate({
              target: users.uid,
              set: {
                email,
              },
            })
            .returning();
          dbUserRecord = result[0];
          break;
        } catch (dbErr: any) {
          attempts++;
          console.error(`Database insert user attempt ${attempts} failed:`, dbErr);
          if (attempts >= maxAttempts) {
            throw dbErr;
          }
          await new Promise(resolve => setTimeout(resolve, attempts * 400));
        }
      }
    }

    req.dbUser = dbUserRecord;
    next();
  } catch (error: any) {
    // Distinguish between database/connection errors (500) and actual unauthorized tokens (401)
    const isFirebaseError = error && typeof error.code === 'string' && error.code.startsWith('auth/');
    const isDbError = error && !isFirebaseError && (
      error.name === 'DrizzleQueryError' || 
      error.code || 
      error.message?.includes('query') || 
      error.message?.includes('EPIPE') || 
      error.message?.includes('socket') || 
      error.message?.includes('connection')
    );

    if (isDbError) {
      console.error('Database connection or query error during requireAuth:', error);
      return res.status(500).json({ error: 'Database synchronization error: ' + error.message });
    }

    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ 
      error: error.message || 'Unauthorized: Invalid token',
      code: error.code || 'auth/invalid-token'
    });
  }
};
