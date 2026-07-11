import { Request, Response, NextFunction } from 'express';
import { User } from '../types';
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const generateToken: (userId: string) => string;
//# sourceMappingURL=auth.d.ts.map