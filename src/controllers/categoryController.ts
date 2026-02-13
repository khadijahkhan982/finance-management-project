import express, { Request, Response, NextFunction } from "express";
import { Category } from "../entities/Category";
import { HttpStatusCode } from "../utils/enums";
import { APIError } from "../errors/api-error";
import { create_json_response, handleError } from "../utils/helper";

const create_category = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { name, type } = req.body;

  if (!name || !type) {
    throw new APIError(
      "BadRequestError",
      HttpStatusCode.BAD_REQUEST,
      true,
      "Name and type required",
      "Name and type required",
    );
  }

  try {
    const existing = await Category.findOneBy({ name, type });

    if (existing) {
      throw new APIError(
        "BadRequestError",
        HttpStatusCode.BAD_REQUEST,
        true,
        "Category already exists",
        "Category already exists",
      );
    }
    const category = Category.create({ name, type });
    await category.save();

    console.log("Category created successfully:", category.id);
    res.locals.category = category;

    return res
      ?.status(HttpStatusCode.CREATED)
      ?.json(
        create_json_response({ data: category }, true, "Category created"),
      );
  } catch (error: any) {
    return handleError(error, res, "create-category");
  }
};

const update_category = async (req: Request, res: Response) => {
  const { category_id, name, type } = req.body;
  const cId = Number(category_id);

  if (!cId || isNaN(cId)) {
    throw new APIError(
      "BadRequestError",
      HttpStatusCode.BAD_REQUEST,
      true,
      "Valid category_id is required in the request body.",
    );
  }
  try {
    const category = await Category.findOneBy({ id: cId });

    if (!category) {
      throw new APIError(
        "NotFoundError",
        HttpStatusCode.NOT_FOUND,
        true,
        "Category not found",
      );
    }
    if (name) category.name = name;
    if (type) category.type = type;

    await category.save();

    return res
      .status(HttpStatusCode.OK)
      .json(
        create_json_response(
          { category },
          true,
          "Category updated successfully",
        ),
      );
  } catch (err: any) {
    return handleError(err, res, "update-category");
  }
};

const get_category = async (req: Request, res: Response) => {
  const categoryId = Number(req.params.category_Id);

  if (isNaN(categoryId)) {
    throw new APIError(
      "BadRequestError",
      HttpStatusCode.BAD_REQUEST,
      true,
      "Invalid category ID",
      "Invalid category ID",
    );
  }

  try {
    const category = await Category.findOneBy({ id: categoryId });

    if (!category) {
      throw new APIError(
        "BadRequestError",
        HttpStatusCode.NOT_FOUND,
        true,
        "Category not found",
        "Category not found",
      );
    }

    return res
      .status(HttpStatusCode.OK)
      .json(
        create_json_response(
          { category },
          true,
          "Category retrieved successfully",
        ),
      );
  } catch (err: any) {
    return handleError(err, res, "get category");
  }
};

const get_all_categories = async (
  req: express.Request,
  res: express.Response,
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
    return res.status(HttpStatusCode.OK).json(
      create_json_response(
        {
          current_page_count: categories.length,
          categories,
          meta: {
            total_items: total,
            total_pages: Math.ceil(total / pageLimit),
            current_page: pageNum,
            per_page: pageLimit,
          },
        },
        true,
        "All categories retrieved successfully",
      ),
    );
  } catch (error: any) {
    return handleError(error, res, "all categories");
  }
};

const delete_category = async (req: Request, res: Response) => {
  const categoryId = Number(req.params.category_Id);

  if (isNaN(categoryId)) {
    throw new APIError(
      "BadRequestError",
      HttpStatusCode.BAD_REQUEST,
      true,
      "Invalid category ID",
      "Invalid category ID",
    );
  }

  try {
    const category = await Category.findOneBy({ id: categoryId });

    if (!category) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ message: "Category not found" });
    }
    await category.remove();

    return res
      .status(HttpStatusCode.OK)
      .json(create_json_response({}, true, "Category deleted successfully"));
  } catch (err: any) {
    return handleError(err, res, "delete");
  }
};

export {
  create_category,
  update_category,
  get_category,
  get_all_categories,
  delete_category,
};
