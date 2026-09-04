export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  authProvider: string;
  isDemo: boolean;
  knowledgeLevel: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export {};
