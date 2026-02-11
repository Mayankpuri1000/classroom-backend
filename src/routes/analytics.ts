import { eq, gte, sql } from "drizzle-orm";
import express from "express";
import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects, user } from "../db/schema/index.js";

const router = express.Router();

// GET /api/analytics/overview - Total counts for dashboard cards
router.get("/overview", async (req, res) => {
  try {
    // Get total users
    const [usersCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(user);

    // Get total classes
    const [classesCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(classes);

    // Get total departments
    const [departmentsCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(departments);

    // Get total enrollments
    const [enrollmentsCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(enrollments);

    // Get active classes count
    const [activeClassesCount] = await db
      .select({ count: sql<number> `count(*)` })
      .from(classes)
      .where(eq(classes.status, "active"));

    res.status(200).json({
      data: {
        totalUsers: usersCount?.count ?? 0,
        totalClasses: classesCount?.count ?? 0,
        activeClasses: activeClassesCount?.count ?? 0,
        totalDepartments: departmentsCount?.count ?? 0,
        totalEnrollments: enrollmentsCount?.count ?? 0
      }
    });
  } catch (error) {
    console.error(`GET /analytics/overview error: ${error}`);
    res.status(500).json({ error: 'Failed to get overview analytics' });
  }
});

// GET /api/analytics/enrollment-trends - Enrollment data over time (last 30 days)
router.get("/enrollment-trends", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const enrollmentTrends = await db
      .select({
        date: sql<string> `DATE(${enrollments.createdAt})`,
        count: sql<number> `count(*)`
      })
      .from(enrollments)
      .where(gte(enrollments.createdAt, thirtyDaysAgo))
      .groupBy(sql `DATE(${enrollments.createdAt})`)
      .orderBy(sql `DATE(${enrollments.createdAt})`);

    res.status(200).json({ data: enrollmentTrends });
  } catch (error) {
    console.error(`GET /analytics/enrollment-trends error: ${error}`);
    res.status(500).json({ error: 'Failed to get enrollment trends' });
  }
});

// GET /api/analytics/classes-by-department - Class distribution by department
router.get("/classes-by-department", async (req, res) => {
  try {
    const classByDepartment = await db
      .select({
        departmentName: departments.name,
        classCount: sql<number> `count(${classes.id})`
      })
      .from(departments)
      .leftJoin(subjects, eq(subjects.departmentId, departments.id))
      .leftJoin(classes, eq(classes.subjectId, subjects.id))
      .groupBy(departments.id, departments.name)
      .orderBy(sql `count(${classes.id}) DESC`);

    res.status(200).json({ data: classByDepartment });
  } catch (error) {
    console.error(`GET /analytics/classes-by-department error: ${error}`);
    res.status(500).json({ error: 'Failed to get classes by department' });
  }
});

// GET /api/analytics/capacity-status - Classes capacity utilization
router.get("/capacity-status", async (req, res) => {
  try {
    const capacityStatus = await db
      .select({
        classId: classes.id,
        className: classes.name,
        capacity: classes.capacity,
        enrollmentCount: sql<number> `count(${enrollments.id})`
      })
      .from(classes)
      .leftJoin(enrollments, eq(enrollments.classId, classes.id))
      .groupBy(classes.id, classes.name, classes.capacity);

    // Categorize classes by capacity utilization
    const categorized = {
      available: 0,    // < 70%
      nearFull: 0,     // 70-90%
      almostFull: 0,   // 90-100%
      full: 0          // 100%
    };

    capacityStatus.forEach(item => {
      const utilization = (item.enrollmentCount / item.capacity) * 100;
      if (utilization >= 100) categorized.full++;
      else if (utilization >= 90) categorized.almostFull++;
      else if (utilization >= 70) categorized.nearFull++;
      else categorized.available++;
    });

    res.status(200).json({ 
      data: {
        categories: categorized,
        details: capacityStatus
      }
    });
  } catch (error) {
    console.error(`GET /analytics/capacity-status error: ${error}`);
    res.status(500).json({ error: 'Failed to get capacity status' });
  }
});

// GET /api/analytics/user-distribution - User role breakdown
router.get("/user-distribution", async (req, res) => {
  try {
    const userDistribution = await db
      .select({
        role: user.role,
        count: sql<number> `count(*)`
      })
      .from(user)
      .groupBy(user.role);

    res.status(200).json({ data: userDistribution });
  } catch (error) {
    console.error(`GET /analytics/user-distribution error: ${error}`);
    res.status(500).json({ error: 'Failed to get user distribution' });
  }
});

// GET /api/analytics/recent-activity - Recent activities (enrollments, classes, users)
router.get("/recent-activity", async (req, res) => {
  try {
    const limit = 10;

    // Get recent enrollments
    const recentEnrollments = await db
      .select({
        type: sql<string> `'enrollment'`,
        id: enrollments.id,
        studentName: user.name,
        className: classes.name,
        createdAt: enrollments.createdAt
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .leftJoin(classes, eq(enrollments.classId, classes.id))
      .orderBy(sql `${enrollments.createdAt} DESC`)
      .limit(limit);

    // Get recent classes
    const recentClasses = await db
      .select({
        type: sql<string> `'class'`,
        id: classes.id,
        name: classes.name,
        teacherName: user.name,
        createdAt: classes.createdAt
      })
      .from(classes)
      .leftJoin(user, eq(classes.teacherId, user.id))
      .orderBy(sql `${classes.createdAt} DESC`)
      .limit(limit);

    // Get recent users
    const recentUsers = await db
      .select({
        type: sql<string> `'user'`,
        id: user.id,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      })
      .from(user)
      .orderBy(sql `${user.createdAt} DESC`)
      .limit(limit);

    // Combine and sort all activities
    const allActivities = [
      ...recentEnrollments.map(e => ({ 
        type: 'enrollment', 
        id: e.id, 
        description: `${e.studentName} enrolled in ${e.className}`,
        createdAt: e.createdAt 
      })),
      ...recentClasses.map(c => ({ 
        type: 'class', 
        id: c.id, 
        description: `New class "${c.name}" created by ${c.teacherName}`,
        createdAt: c.createdAt 
      })),
      ...recentUsers.map(u => ({ 
        type: 'user', 
        id: u.id, 
        description: `New ${u.role} "${u.name}" registered`,
        createdAt: u.createdAt 
      }))
    ]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);

    res.status(200).json({ data: allActivities });
  } catch (error) {
    console.error(`GET /analytics/recent-activity error: ${error}`);
    res.status(500).json({ error: 'Failed to get recent activity' });
  }
});

export default router;
