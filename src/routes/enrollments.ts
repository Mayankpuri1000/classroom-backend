import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import express from "express";
import { db } from "../db/index.js";
import { enrollments, classes, user } from "../db/schema/index.js";

const router = express.Router();

// GET /api/enrollments - List enrollments with filters
router.get("/", async (req, res) => {
  try {
    const { classId, studentId, page, limit } = req.query;

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

    // Filter by classId
    const classIdParam = typeof classId === "string" ? Number(classId) : undefined;
    if (classIdParam && Number.isFinite(classIdParam)) {
      filterConditions.push(eq(enrollments.classId, classIdParam));
    }

    // Filter by studentId
    const studentIdParam = typeof studentId === "string" ? studentId : undefined;
    if (studentIdParam) {
      filterConditions.push(eq(enrollments.studentId, studentIdParam));
    }

    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number> `count(*)` })
      .from(enrollments)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const enrollmentsList = await db
      .select({
        ...getTableColumns(enrollments),
        student: { ...getTableColumns(user) },
        class: { ...getTableColumns(classes) }
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .leftJoin(classes, eq(enrollments.classId, classes.id))
      .where(whereClause)
      .orderBy(desc(enrollments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: enrollmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage)
      }
    });

  } catch (error) {
    console.error(`GET /enrollments error: ${error}`);
    res.status(500).json({ error: 'Failed to get enrollments' });
  }
});

// GET /api/enrollments/:id - Get single enrollment
router.get("/:id", async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);

    if (!Number.isFinite(enrollmentId)) {
      return res.status(400).json({ error: "Invalid enrollment ID" });
    }

    const [enrollment] = await db
      .select({
        ...getTableColumns(enrollments),
        student: { ...getTableColumns(user) },
        class: { ...getTableColumns(classes) }
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .leftJoin(classes, eq(enrollments.classId, classes.id))
      .where(eq(enrollments.id, enrollmentId));

    if (!enrollment) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    res.status(200).json({ data: enrollment });
  } catch (error) {
    console.error(`GET /enrollments/:id error: ${error}`);
    res.status(500).json({ error: 'Failed to get enrollment' });
  }
});

// POST /api/enrollments - Create enrollment
router.post("/", async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    // Validate required fields
    if (!studentId || !classId) {
      return res.status(400).json({ error: "StudentId and classId are required" });
    }

    // Check if class exists and get capacity info
    const [classInfo] = await db
      .select({
        id: classes.id,
        capacity: classes.capacity,
        status: classes.status
      })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!classInfo) {
      return res.status(400).json({ error: "Invalid class ID" });
    }

    // Check if class is active
    if (classInfo.status !== "active") {
      return res.status(400).json({ error: "Cannot enroll in inactive class" });
    }

    // Check current enrollment count
    const [enrollmentCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));

    if (enrollmentCount && enrollmentCount.count >= classInfo.capacity) {
      return res.status(400).json({ 
        error: "Class is at full capacity",
        details: `This class has reached its capacity of ${classInfo.capacity} students.`
      });
    }

    // Check if student exists
    const [student] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, studentId));

    if (!student) {
      return res.status(400).json({ error: "Invalid student ID" });
    }

    // Check for duplicate enrollment (unique constraint will catch this, but better to check first)
    const [existing] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.classId, classId)));

    if (existing) {
      return res.status(400).json({ error: "Student is already enrolled in this class" });
    }

    const [createdEnrollment] = await db
      .insert(enrollments)
      .values({ studentId, classId })
      .returning({ id: enrollments.id });

    if (!createdEnrollment) {
      throw new Error("Failed to create enrollment");
    }

    res.status(201).json({ data: createdEnrollment });
  } catch (error) {
    console.error(`POST /enrollments error: ${error}`);
    res.status(500).json({ error: "Failed to create enrollment" });
  }
});

// DELETE /api/enrollments/:id - Remove enrollment
router.delete("/:id", async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);

    if (!Number.isFinite(enrollmentId)) {
      return res.status(400).json({ error: "Invalid enrollment ID" });
    }

    const [deletedEnrollment] = await db
      .delete(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .returning({ id: enrollments.id });

    if (!deletedEnrollment) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    res.status(200).json({ data: deletedEnrollment });
  } catch (error) {
    console.error(`DELETE /enrollments/:id error: ${error}`);
    res.status(500).json({ error: "Failed to delete enrollment" });
  }
});

export default router;
