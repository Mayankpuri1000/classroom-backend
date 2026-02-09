import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express"
import { user } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
      const { search, role, page, limit } = req.query;

      const pageParam = Array.isArray(page) ? page[0] : page;
      const pageStr = typeof pageParam === "string" ? pageParam : undefined;

      const limitParam = Array.isArray(limit) ? limit[0] : limit;
      const limitStr = typeof limitParam === "string" ? limitParam : undefined;

      const parsedPage = Number.parseInt(pageStr ?? "1", 10);
      const parsedLimit = Number.parseInt(limitStr ?? "10", 10);

        if (
          Number.isNaN(parsedPage) || parsedPage < 1 ||
          Number.isNaN(parsedLimit) || parsedLimit < 1
        ) {
          return res.status(400).json({ error: "Invalid pagination params" });
        }

        const MAX_LIMIT = 100;
        const currentPage = parsedPage;
        const limitPerPage = Math.min(parsedLimit, MAX_LIMIT);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        const searchTerm = typeof search === "string" ? search : undefined;
        const roleTerm = typeof role === "string" ? role : undefined;

        if(searchTerm) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${searchTerm}%`), 
                    ilike(user.email, `%${searchTerm}%`), 
                )
            )
        }

        if(roleTerm) {
            filterConditions.push(eq(user.role, roleTerm as "student" | "teacher" | "admin"));
        }


        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number> `count(*)` })
            .from(user)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = await db
            .select({...getTableColumns(user)})
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset)

        res.status(200).json({
            data: usersList, 
            pagination: {
                page: currentPage, 
                limit: limitPerPage, 
                total: totalCount, 
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        })

    } catch (error) {
        console.error(`GET /users error: ${error}`);
        res.status(500).json({error: 'Failed to get users'});
    }
})

export default router
