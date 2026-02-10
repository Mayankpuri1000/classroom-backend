import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { db } from "../db/index.js";
import { classes, subjects, user } from "../db/schema/index.js";


const router = express.Router();

router.get("/", async (req, res) => {
    try {
      const { search, subject, teacher, page, limit } = req.query;

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
        const subjectTerm = typeof subject === "string" ? subject : undefined;
        const teacherTerm = typeof teacher === "string" ? teacher : undefined;

        if(searchTerm) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${searchTerm}%`), 
                    ilike(classes.inviteCode, `%${searchTerm}%`), 
                )
            )
        }

        if(subjectTerm) {
            filterConditions.push(ilike(subjects.name, `%${subjectTerm}%`));
        }

        if(teacherTerm) {
            filterConditions.push(ilike(user.name, `%${teacherTerm}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number> `count(*)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const classesList = await db
            .select({
                ...getTableColumns(classes), 
                subject: {...getTableColumns(subjects)}, 
                teacher: {...getTableColumns(user)}
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset)

        res.status(200).json({
            data: classesList, 
            pagination: {
                page: currentPage, 
                limit: limitPerPage, 
                total: totalCount, 
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        })

    } catch (error) {
        console.error(`GET /classes error: ${error}`);
        res.status(500).json({error: 'Failed to get classes'});
    }
})


router.post("/", async (req, res) => {
    try {
        const [createdClass] = await db
        .insert(classes)
        .values({...req.body, inviteCode: Math.random().toString(36).substring(2, 8), schedules: []})
        .returning({id: classes.id});

        if(!createdClass) throw new Error("Failed to create class");

        res.status(201).json(createdClass);
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Failed to create class"});
    }
})

export default router