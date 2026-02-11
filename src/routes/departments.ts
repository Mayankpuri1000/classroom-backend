import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { db } from "../db/index.js";
import { departments, subjects } from "../db/schema/index.js";

const router = express.Router();

// GET /api/departments - List departments with search and pagination
router.get("/", async (req, res) => {
  try {
    const { search, page, limit } = req.query;

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

    if (searchTerm) {
      filterConditions.push(
        or(
          ilike(departments.name, `%${searchTerm}%`),
          ilike(departments.code, `%${searchTerm}%`),
        )
      );
    }

    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number> `count(*)` })
      .from(departments)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const departmentsList = await db
      .select({ ...getTableColumns(departments) })
      .from(departments)
      .where(whereClause)
      .orderBy(desc(departments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: departmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage)
      }
    });

  } catch (error) {
    console.error(`GET /departments error: ${error}`);
    res.status(500).json({ error: 'Failed to get departments' });
  }
});

// GET /api/departments/:id - Get single department
router.get("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department ID" });
    }

    const [department] = await db
      .select({ ...getTableColumns(departments) })
      .from(departments)
      .where(eq(departments.id, departmentId));

    if (!department) {
      return res.status(404).json({ error: "Department not found" });
    }

    res.status(200).json({ data: department });
  } catch (error) {
    console.error(`GET /departments/:id error: ${error}`);
    res.status(500).json({ error: 'Failed to get department' });
  }
});

// POST /api/departments - Create new department
router.post("/", async (req, res) => {
  try {
    const { code, name, description } = req.body;

    // Validate required fields
    if (!code || !name) {
      return res.status(400).json({ error: "Code and name are required" });
    }

    // Check for duplicate code
    const [existing] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.code, code));

    if (existing) {
      return res.status(400).json({ error: "Department code already exists" });
    }

    const [createdDepartment] = await db
      .insert(departments)
      .values({ code, name, description })
      .returning({ id: departments.id });

    if (!createdDepartment) {
      throw new Error("Failed to create department");
    }

    res.status(201).json({ data: createdDepartment });
  } catch (error) {
    console.error(`POST /departments error: ${error}`);
    res.status(500).json({ error: "Failed to create department" });
  }
});

// PATCH /api/departments/:id - Update department
router.patch("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department ID" });
    }

    const { code, name, description } = req.body;

    // Check if department exists
    const [existing] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, departmentId));

    if (!existing) {
      return res.status(404).json({ error: "Department not found" });
    }

    // If updating code, check for duplicates
    if (code) {
      const [duplicate] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.code, code));

      if (duplicate && duplicate.id !== departmentId) {
        return res.status(400).json({ error: "Department code already exists" });
      }
    }

    const updateData: any = {};
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const [updatedDepartment] = await db
      .update(departments)
      .set(updateData)
      .where(eq(departments.id, departmentId))
      .returning({ id: departments.id });

    if (!updatedDepartment) {
      throw new Error("Failed to update department");
    }

    res.status(200).json({ data: updatedDepartment });
  } catch (error) {
    console.error(`PATCH /departments/:id error: ${error}`);
    res.status(500).json({ error: "Failed to update department" });
  }
});

// DELETE /api/departments/:id - Delete department
router.delete("/:id", async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department ID" });
    }

    // Check if department has subjects
    const [subjectCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(subjects)
      .where(eq(subjects.departmentId, departmentId));

    if (subjectCount && subjectCount.count > 0) {
      return res.status(409).json({ 
        error: "Cannot delete department with associated subjects",
        details: `This department has ${subjectCount.count} subject(s). Please delete or reassign them first.`
      });
    }

    const [deletedDepartment] = await db
      .delete(departments)
      .where(eq(departments.id, departmentId))
      .returning({ id: departments.id });

    if (!deletedDepartment) {
      return res.status(404).json({ error: "Department not found" });
    }

    res.status(200).json({ data: deletedDepartment });
  } catch (error) {
    console.error(`DELETE /departments/:id error: ${error}`);
    res.status(500).json({ error: "Failed to delete department" });
  }
});

export default router;
