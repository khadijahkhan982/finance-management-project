import express, {Request, Response, NextFunction} from "express";
import { Category } from "../entities/Category";
import { AppDataSource } from "../index";

const create_category = async (req: Request, res: Response, next: NextFunction) => {
  const { name, type } = req.body;

  if (!name || !type) {
    return res.status(400).json({ message: "Name and type are required." });
  }

  try {
    const existing = await Category.findOneBy({ name, type });

    if (existing) {
      return res.status(400).json({ message: "Category already exists." });
    }
    const category = Category.create({ name, type });
    await category.save();

    console.log("Category created successfully:", category.id);
        res.locals.category = category;

    return res.status(201).json({ 
      success: true, 
      message: "Category created", 
      data: category 
    });

  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  } 
};

const update_category = async (req: Request, res: Response) => {
  const categoryId = Number(req.params.category_Id);
  
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }

  const { name, type } = req.body;

  try {
    const category = await Category.findOneBy({ id: categoryId });

    if (!category) {
      return res.status(404).send({ message: "Category not found" });
    }
    if (name) category.name = name;
    if (type) category.type = type;
    await category.save();

    return res.status(200).send({ 
      message: "Category updated successfully", 
      category 
    });

  } catch (err) {
    console.error("Update Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  }
};





const get_category = async (req: Request, res: Response) => {
  const categoryId = Number(req.params.category_Id);
  
  if (isNaN(categoryId)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }

  try {
    const category = await Category.findOneBy({ id: categoryId });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.status(200).send(category);

  } catch (err) {
    console.error("Fetch Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
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

  try {
    const category = await Category.findOneBy({ id: categoryId });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    await category.remove();

    return res.status(200).send({ message: "Category deleted successfully" });

  } catch (err) {
    console.error("Delete Error:", err);

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
