import express from "express";
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

const update_category = async (req: any, res: any, next: any) => {
  const categoryId = Number(req.params.category_Id);
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }
  try {
    const category = await Category.getRepository().findOneBy({
      id: categoryId,
    });
    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    }
    const { name, type } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (type) updates.type = type;
    if (Object.keys(updates).length === 0) {
      return res.status(400).send({ message: "No valid fields to update." });
    }
    await Category.getRepository().update({ id: categoryId }, updates);
    return res.status(200).send({ message: "Category updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

const get_category = async (req: any, res: any, next: any) => {
  const categoryId = Number(req.params.category_Id);
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }

  try {
    const existing_category = await Category.getRepository().findOne({
      select: ["id", "name", "type"],
      where: { id: categoryId },
    });
    if (!existing_category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.status(200).send(existing_category);
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

const get_all_categories = async (req: express.Request, res: express.Response) => {
  const { type, page = 1, limit = 2 } = req.query;

  const pageNum = Number(page);
  const pageLimit = Number(limit);
  const skip = (pageNum - 1) * pageLimit;

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();

    let query = `SELECT id, name, type FROM category`;
    let countQuery = `SELECT COUNT(*) as total FROM category`;
    let params: any[] = [];

    if (type) {
      query += ` WHERE type = $1`;
      countQuery += ` WHERE type = $1`;
      params.push(type);
    }

    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const categories = await queryRunner.query(query, [...params, pageLimit, skip]);
    const countResult = await queryRunner.query(countQuery, params);
    const total = parseInt(countResult[0].total);

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
  } finally {
    await queryRunner.release();
  }
};

const delete_category = async (req: any, res: any, next: any) => {
  const categoryId = Number(req.params.category_Id);
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }
  try {
    const category = await Category.getRepository().findOneBy({
      id: categoryId,
    });
    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    }
    await Category.getRepository().delete({ id: categoryId });
    return res.status(200).send({ message: "Category deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

export {
  create_category,
  update_category,
  get_category,
  get_all_categories,
  delete_category,
};
