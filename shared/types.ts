/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export type InsertUser = Partial<User> & { openId: string };

export * from "./_core/errors";
