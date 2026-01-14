import express, {Request, Response, NextFunction} from "express";
import { Category } from "../entities/Category";
import { AppDataSource } from "../index";

const router = express.Router();

const create_category = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { name, type } = req.body;
  
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();

  
    const sql = `INSERT INTO "category" (name, type) VALUES ($1, $2) RETURNING *`;
    const result = await queryRunner.query(sql, [name, type]);

    const newCategory = result[0]; // Postgres returns an array of rows
    console.log("Category created via Query Runner:", newCategory);

    res.locals.category = newCategory;
    return next();

  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const update_category = async (req: express.Request, res: express.Response) => {
  const categoryId = Number(req.params.category_Id);
  
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }

  const { name, type } = req.body;
  const updates: any = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (name) {
    updates.push(`name = $${paramIndex++}`);
    params.push(name);
  }
  if (type) {
    updates.push(`type = $${paramIndex++}`);
    params.push(type);
  }

  if (updates.length === 0) {
    return res.status(400).send({ message: "No valid fields to update." });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();

    // 1. Check if category exists
    const checkSql = `SELECT id FROM "category" WHERE id = $1`;
    const existing = await queryRunner.query(checkSql, [categoryId]);

    if (existing.length === 0) {
      return res.status(404).send({ message: "Category not found" });
    }

    // 2. Execute the Update
    // Adding the ID to the end of the params array for the WHERE clause
    params.push(categoryId);
    const updateSql = `
      UPDATE "category" 
      SET ${updates.join(", ")} 
      WHERE id = $${paramIndex} 
      RETURNING *`;

    const result = await queryRunner.query(updateSql, params);

    return res.status(200).send({ 
      message: "Category updated successfully", 
      category: result[0] 
    });

  } catch (err) {
    console.error("QueryRunner Update Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    // 3. Always release the connection
    await queryRunner.release();
  }
};
const get_category = async (req: Request, res: Response) => {
  const categoryId = Number(req.params.category_Id);
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    const sql = `SELECT id, name, type FROM "category" WHERE id = $1 LIMIT 1`;
    const result = await queryRunner.query(sql, [categoryId]);
    if (result.length === 0) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.status(200).send(result[0]);

  } catch (err) {
    console.error("QueryRunner Fetch Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const get_all_categories = async (
  req: express.Request,
  res: express.Response
) => {
  const { type, page = 1, limit = 2 } = req.query;

  const pageNum = Number(page);
  const pageLimit = Number(limit);
  const skip = (pageNum - 1) * pageLimit;

  try {
    let whereConditions: any = {};

    if (type) {
      whereConditions.type = type;
    }
    const [categories, total] = await Category.findAndCount({
      where: whereConditions,
      select: ["id", "name", "type"],
      order: { name: "ASC" },
      take: pageLimit,
      skip: skip,
    });
    return res.status(200).send({
      current_page_count: categories.length,
      categories,
      meta: {
        total_items: total,
        total_pages: Math.ceil(total / pageLimit),
        current_page: pageNum,
        per_page: pageLimit,
      },
    });
  } catch (error) {
    console.error("Error in get_all_categories:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};



const delete_category = async (req: Request, res: Response) => {
  const categoryId = Number(req.params.category_Id);
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    const checkSql = `SELECT id FROM "category" WHERE id = $1`;
    const existing = await queryRunner.query(checkSql, [categoryId]);

    if (existing.length === 0) {
      return res.status(404).send({ message: "Category not found" });
    }
    const deleteSql = `DELETE FROM "category" WHERE id = $1`;
    await queryRunner.query(deleteSql, [categoryId]);

    return res.status(200).send({ message: "Category deleted successfully" });

  } catch (err) {
    console.error("QueryRunner Delete Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

export {
  create_category,
  update_category,
  get_category,
  get_all_categories,
  delete_category,
};
