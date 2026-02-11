import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express"
import { departments, subjects } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
      const { search, department, page, limit } = req.query;

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
        const departmentTerm = typeof department === "string" ? department : undefined;

        if(searchTerm) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${searchTerm}%`), 
                    ilike(subjects.code, `%${searchTerm}%`), 
                )
            )
        }

        if(departmentTerm) {
            filterConditions.push(ilike(departments.name, `%${departmentTerm}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number> `count(*)` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const subjectsList = await db
            .select({...getTableColumns(subjects), department: {...getTableColumns(departments)}})
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)
            .orderBy(desc(subjects.createdAt))
            .limit(limitPerPage)
            .offset(offset)

        res.status(200).json({
            data: subjectsList, 
            pagination: {
                page: currentPage, 
                limit: limitPerPage, 
                total: totalCount, 
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        })

    } catch (error) {
        console.error(`GET /subjects error: ${error}`);
        res.status(500).json({error: 'Failed to get subjects'});
    }
})

// GET /api/subjects/:id - Get single subject
router.get("/:id", async (req, res) => {
    try {
        const subjectId = Number(req.params.id);

        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        const [subject] = await db
            .select({ ...getTableColumns(subjects), department: { ...getTableColumns(departments) } })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(subjects.id, subjectId));

        if (!subject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        res.status(200).json({ data: subject });
    } catch (error) {
        console.error(`GET /subjects/:id error: ${error}`);
        res.status(500).json({ error: 'Failed to get subject' });
    }
});

// POST /api/subjects - Create new subject
router.post("/", async (req, res) => {
    try {
        const { code, name, description, departmentId } = req.body;

        // Validate required fields
        if (!code || !name || !departmentId) {
            return res.status(400).json({ error: "Code, name, and departmentId are required" });
        }

        // Check for duplicate code
        const [existing] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.code, code));

        if (existing) {
            return res.status(400).json({ error: "Subject code already exists" });
        }

        // Verify department exists
        const [dept] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, departmentId));

        if (!dept) {
            return res.status(400).json({ error: "Invalid department ID" });
        }

        const [createdSubject] = await db
            .insert(subjects)
            .values({ code, name, description, departmentId })
            .returning({ id: subjects.id });

        if (!createdSubject) {
            throw new Error("Failed to create subject");
        }

        res.status(201).json({ data: createdSubject });
    } catch (error) {
        console.error(`POST /subjects error: ${error}`);
        res.status(500).json({ error: "Failed to create subject" });
    }
});

// PATCH /api/subjects/:id - Update subject
router.patch("/:id", async (req, res) => {
    try {
        const subjectId = Number(req.params.id);

        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        const { code, name, description, departmentId } = req.body;

        // Check if subject exists
        const [existing] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.id, subjectId));

        if (!existing) {
            return res.status(404).json({ error: "Subject not found" });
        }

        // If updating code, check for duplicates
        if (code) {
            const [duplicate] = await db
                .select({ id: subjects.id })
                .from(subjects)
                .where(eq(subjects.code, code));

            if (duplicate && duplicate.id !== subjectId) {
                return res.status(400).json({ error: "Subject code already exists" });
            }
        }

        // If updating department, verify it exists
        if (departmentId) {
            const [dept] = await db
                .select({ id: departments.id })
                .from(departments)
                .where(eq(departments.id, departmentId));

            if (!dept) {
                return res.status(400).json({ error: "Invalid department ID" });
            }
        }

        const updateData: any = {};
        if (code !== undefined) updateData.code = code;
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (departmentId !== undefined) updateData.departmentId = departmentId;

        const [updatedSubject] = await db
            .update(subjects)
            .set(updateData)
            .where(eq(subjects.id, subjectId))
            .returning({ id: subjects.id });

        if (!updatedSubject) {
            throw new Error("Failed to update subject");
        }

        res.status(200).json({ data: updatedSubject });
    } catch (error) {
        console.error(`PATCH /subjects/:id error: ${error}`);
        res.status(500).json({ error: "Failed to update subject" });
    }
});

// DELETE /api/subjects/:id - Delete subject
router.delete("/:id", async (req, res) => {
    try {
        const subjectId = Number(req.params.id);

        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        // Check if subject has classes (would cascade delete due to schema)
        const { classes } = await import("../db/schema/index.js");
        const [classCount] = await db
            .select({ count: sql<number> `count(*)` })
            .from(classes)
            .where(eq(classes.subjectId, subjectId));

        if (classCount && classCount.count > 0) {
            return res.status(409).json({ 
                error: "Cannot delete subject with associated classes",
                details: `This subject has ${classCount.count} class(es). Please delete or reassign them first.`
            });
        }

        const [deletedSubject] = await db
            .delete(subjects)
            .where(eq(subjects.id, subjectId))
            .returning({ id: subjects.id });

        if (!deletedSubject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        res.status(200).json({ data: deletedSubject });
    } catch (error) {
        console.error(`DELETE /subjects/:id error: ${error}`);
        res.status(500).json({ error: "Failed to delete subject" });
    }
});

export default router