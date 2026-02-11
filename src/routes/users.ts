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
});

// GET /api/users/:id - Get single user
router.get("/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        const [userDetails] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(eq(user.id, userId));

        if (!userDetails) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: userDetails });
    } catch (error) {
        console.error(`GET /users/:id error: ${error}`);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// PATCH /api/users/:id - Update user
router.patch("/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, role, image, imageCldPubId } = req.body;

        // Check if user exists
        const [existing] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId));

        if (!existing) {
            return res.status(404).json({ error: "User not found" });
        }

        // If updating email, check for duplicates
        if (email) {
            const [duplicate] = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.email, email));

            if (duplicate && duplicate.id !== userId) {
                return res.status(400).json({ error: "Email already exists" });
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (image !== undefined) updateData.image = image;
        if (imageCldPubId !== undefined) updateData.imageCldPubId = imageCldPubId;

        const [updatedUser] = await db
            .update(user)
            .set(updateData)
            .where(eq(user.id, userId))
            .returning({ id: user.id });

        if (!updatedUser) {
            throw new Error("Failed to update user");
        }

        res.status(200).json({ data: updatedUser });
    } catch (error) {
        console.error(`PATCH /users/:id error: ${error}`);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// DELETE /api/users/:id - Delete user
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        // Check if user is a teacher of any active classes
        const { classes } = await import("../db/schema/index.js");
        const [classCount] = await db
            .select({ count: sql<number> `count(*)` })
            .from(classes)
            .where(and(eq(classes.teacherId, userId), eq(classes.status, "active")));

        if (classCount && classCount.count > 0) {
            return res.status(409).json({ 
                error: "Cannot delete user who is teaching active classes",
                details: `This user is teaching ${classCount.count} active class(es). Please reassign them first.`
            });
        }

        const [deletedUser] = await db
            .delete(user)
            .where(eq(user.id, userId))
            .returning({ id: user.id });

        if (!deletedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: deletedUser });
    } catch (error) {
        console.error(`DELETE /users/:id error: ${error}`);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

export default router
