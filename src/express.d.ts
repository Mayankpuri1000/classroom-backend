declare global {
    namespace Express {
        interface Request {
            user?: {
                role?: "student" | "teacher" | "admin"
            }
        }
    }
}

export {}