import express, {Request, Response} from "express";
import { Between } from "typeorm";
import { MoreThanOrEqual } from "typeorm";
import { User } from "../entities/User";
import { Asset } from "../entities/Asset";
import { logger } from "../utils/logger";
import { decrypt_Token } from "../utils/authHelpers";
import { AppDataSource } from "../index";
import { query } from "winston";


const create_asset = async (req: express.Request, res: express.Response) => {
  const { name, og_cost } = req.body;
    const authHeader = req.headers.authorization;

   const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : "";
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId || !token) {
    return res
      .status(401)
      .send({ message: "Authentication required (Token missing)." });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  try {
        await queryRunner.connect();
        const userResult = await queryRunner.query(
          'SELECT id, token FROM "user" WHERE id = $1',
          [authenticatedUserId]
        );
        const user = userResult[0];

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }
    const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== String(token).trim()) {
      return res.status(401).send({
        message: "Invalid token (Database mismatch). Access denied.",
      });
    }
    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res
        .status(401)
        .send({ message: "Your session/token has expired." });
    }
    const original_cost = Number(og_cost);
    const current_cost = Number(og_cost);
    const insertSql = `INSERT INTO "asset" (name, original_cost, current_cost, user_id) VALUES ($1, $2, $3, $4) RETURNING *`;
    const assetResult = await queryRunner.query(insertSql, [
      name,
      original_cost,
      current_cost,
      authenticatedUserId
    ]);
   
    return res.status(201).send({
      message: "Asset created successfully",
     asset: assetResult[0]
    });
  } catch (error) {
    console.error("Error in create_asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });

  }finally{
    await queryRunner.release();
  }
};

const update_asset = async (req: express.Request, res: express.Response) => {
  const assetId = Number(req.params.assetId || req.params.id);
  const { name } = req.body;

 const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : "";
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  try {
        await queryRunner.connect();
        const userResult = await queryRunner.query(
          'SELECT id, token FROM "user" WHERE id = $1',
          [authenticatedUserId]
        );
        const user = userResult[0];
       const storedToken = user.token ? String(user.token).trim() : null;

    if (!storedToken || storedToken !== String(token).trim()) {
      return res.status(401).send({
        message: "Invalid token (Database mismatch). Access denied.",
      });
    }
    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res
        .status(401)
        .send({ message: "Your session/token has expired." });
    }
    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      return res.status(401).send({ message: "Token has expired." });
    }
  const assetResult = await queryRunner.query(
    `SELECT a.* FROM "asset" a WHERE a.id = $1 AND a.user_id = $2`,
    [assetId, authenticatedUserId]
  );
  
    if (assetResult.length === 0) {
      return res.status(404).send({ message: "Asset not found or access denied." });
    }
    const asset = assetResult[0];
    await queryRunner.query(
      `UPDATE "asset" SET name = $1 WHERE id = $2`,
      [name || asset.name, assetId]
    );
    // const asset = await Asset.findOne({
    //   where: {
    //     id: assetId,
    //     user: { id: user.id },
    //   },
    // });
    if (name) {
      asset.name = name;
    } else {
      return res
        .status(400)
        .send({ message: "No valid fields provided for update." });
    }
    return res.send({
      message: "Asset name updated successfully",
      
    });
  } catch (error) {
    console.error("Error in updating asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }finally{
    await queryRunner.release();
  }
};

const get_asset = async (req: express.Request, res: express.Response) => {
  const assetId = Number(req.params.assetId || req.params.id);
  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }
  const authenticatedUserId = (req as any).authenticatedUserId;
  if (!authenticatedUserId) {
    return res.status(401).send({ message: "Authentication token required." });
  }
  const queryRunner = AppDataSource.createQueryRunner();

  try {
        await queryRunner.connect();

        const sql = `SELECT a.* FROM "asset" a WHERE a.id = $1 AND a.user_id = $2 LIMIT 1`;
        const assetResult = await queryRunner.query(sql, [
          assetId,
          authenticatedUserId,
        ]);
        if (assetResult.length === 0) {
          return res
            .status(404)
            .send({ message: "Asset not found or access denied." });
        }
    // const asset = await Asset.findOne({
    //   where: {
    //     id: assetId,
    //   },
    // });

    // if (!asset) {
    //   return res
    //     .status(404)
    //     .send({ message: "Asset not found or you do not have access." });
    // }

    return res.status(200).send({ asset: assetResult[0] });
  } catch (error) {
    logger.error("Error in gettting asset:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const get_all_assets = async (req: express.Request, res: express.Response) => {
  const { og_cost, curr_cost, page = 1, limit = 10 } = req.query;

  const pageNum = Number(page) || 1;
  const pageLimit = Number(limit) || 10;
  const skip = (pageNum - 1) * pageLimit; 
  const authenticatedUserId = (req as any).authenticatedUserId;
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    let query= `SELECT a.* FROM "asset" a WHERE a.user_id = $1`;
     const params: any[] = [authenticatedUserId];
     let paramIndex = 2;
     if (og_cost && curr_cost) {
            query += ` AND a.current_cost BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
            params.push(Number(og_cost), Number(curr_cost));
          }
         

      const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
      const countResult = await queryRunner.query(countQuery, params);
      const total = parseInt(countResult[0].count);
      query += ` ORDER BY a.id ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(pageLimit, skip);

      const assets = await queryRunner.query(query, params);
      return res.status(200).send({
      count: assets.length,
      meta: {
        total_items: total,
        total_pages: Math.ceil(total / pageLimit),
        current_page: pageNum,
        per_page: pageLimit,
      },
      assets
    });
  
  } catch (error) {
    logger.error("Error in getting all assets via queryRunner:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const delete_asset = async (req: Request, res: Response) => {
  const assetId = Number(req.params.assetId);
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (isNaN(assetId)) {
    return res.status(400).send({ message: "Invalid asset ID" });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    const assetCheck = await queryRunner.query(
      `SELECT id FROM "asset" WHERE id = $1 AND "user_id" = $2 LIMIT 1`,
      [assetId, authenticatedUserId]
    );

    if (assetCheck.length === 0) {
      return res.status(404).send({
        message: "Asset not found or you do not have permission to delete it.",
      });
    }
    const transactionCheck = await queryRunner.query(
      `SELECT id FROM "transaction" WHERE "asset_id" = $1 LIMIT 1`,
      [assetId]
    );

    if (transactionCheck.length > 0) {
      return res.status(400).send({
        message: "Delete the transactions associated with this asset first.",
      });
    }
    await queryRunner.query(
      `DELETE FROM "asset" WHERE id = $1`,
      [assetId]
    );

    return res.status(200).send({
      message: "Asset deleted successfully.",
    });

  } catch (error) {
    logger.error("Error in delete_asset via QueryRunner:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};
export { create_asset, update_asset, get_asset, get_all_assets, delete_asset };
