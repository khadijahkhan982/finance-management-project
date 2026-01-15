import express from "express";
import { Request, Response, NextFunction } from "express";
import { Between } from "typeorm";
import { MoreThanOrEqual } from "typeorm";
import { Transaction } from "../entities/Transaction";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Asset } from "../entities/Asset";
import { TransactionType } from "../utils/enums";
import { decrypt_Token } from "../utils/authHelpers";
import { logger } from "../utils/logger";
import { AppDataSource } from "../index";



const create_transaction = async (req: Request, res: Response) => {
  const { amount, description, transaction_type, assetId, category_id } = req.body;
  const authHeader = req.headers.authorization;
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (!authenticatedUserId ) {
    return res.status(401).send({ message: "Authentication required." });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const userResult = await queryRunner.query(
      `SELECT id, token FROM "user" WHERE id = $1 LIMIT 1`,
      [authenticatedUserId]
    );
    const user = userResult[0];

    if (!user) {
      await queryRunner.rollbackTransaction();
      return res.status(404).send({ message: "User not found." });
    }


    const assetResult = await queryRunner.query(`SELECT * FROM "asset" WHERE id = $1`, [assetId]);
    const categoryResult = await queryRunner.query(`SELECT id FROM "category" WHERE id = $1`,
       [category_id]);

    if (assetResult.length === 0 || categoryResult.length === 0) {
      await queryRunner.rollbackTransaction();
      return res.status(404).send({ message: "Category or Asset not found." });
    }

    const asset = assetResult[0];
    const transactionAmount = Number(amount);
    const insertSql = `
      INSERT INTO "transaction" (amount, description, transaction_type, "user_id", "asset_id", "category_id") 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *`;
    
    const transactionResult = await queryRunner.query(insertSql, [
      transactionAmount,
      description,
      transaction_type,
      authenticatedUserId,
      assetId,
      category_id,
    ]);
    let newBalance = Number(asset.current_cost);
    if (transaction_type === 'deposit') {
      newBalance += transactionAmount;
    } else if (transaction_type === 'withdrawal') {
      newBalance -= transactionAmount;
    }

    await queryRunner.query(
      `UPDATE "asset" SET current_cost = $1 WHERE id = $2`,
      [newBalance, assetId]
    );

    await queryRunner.commitTransaction();

    return res.status(201).send({ 
      message: "Transaction successful", 
      transaction: transactionResult[0] 
    });

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error("Transaction Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const update_transaction = async (req: Request, res: Response) => {
  const transactionId = Number(req.params.id || req.params.transactionId);
  const { amount: newAmount, transaction_type: newType, description } = req.body;
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (isNaN(transactionId)) {
    return res.status(400).send({ message: "Invalid transaction ID format." });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const userResult = await queryRunner.query(
      `SELECT id, token FROM "user" WHERE id = $1 LIMIT 1`,
      [authenticatedUserId]
    );
    const user = userResult[0];


    const transactionResult = await queryRunner.query(
      `SELECT t.*, a.current_cost, a.id as "asset_id"
       FROM "transaction" t
       JOIN "asset" a ON t."asset_id" = a.id
       WHERE t.id = $1 AND t."user_id" = $2`,
      [transactionId, authenticatedUserId]
    );

    if (transactionResult.length === 0) {
      await queryRunner.rollbackTransaction();
      return res.status(404).send({ message: "Transaction not found or unauthorized." });
    }

    const transaction = transactionResult[0];
    let runningBalance = Number(transaction.current_cost);
    if (transaction.transaction_type === TransactionType.deposit) {
      runningBalance -= Number(transaction.amount);
    } else {
      runningBalance += Number(transaction.amount);
    }
    const finalAmount = newAmount !== undefined ? Number(newAmount) : Number(transaction.amount);
    const finalType = newType !== undefined ? newType : transaction.transaction_type;

    if (finalType === TransactionType.deposit) {
      runningBalance += finalAmount;
    } else if (finalType === TransactionType.withdrawal) {
      runningBalance -= finalAmount;
    } else {
      await queryRunner.rollbackTransaction();
      return res.status(400).send({ message: "Invalid new transaction type." });
    }
    await queryRunner.query(
      `UPDATE "transaction" 
       SET amount = $1, transaction_type = $2, description = $3 
       WHERE id = $4`,
      [finalAmount, finalType, description || transaction.description, transactionId]
    );
    await queryRunner.query(
      `UPDATE "asset" SET current_cost = $1 WHERE id = $2`,
      [runningBalance, transaction.asset_id]
    );
    await queryRunner.commitTransaction();

    return res.send({
      message: "Transaction updated and asset balance recalculated.",
      newBalance: runningBalance,
    });

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error("Update Transaction Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const get_transaction = async (req: Request, res: Response) => {
  const transactionId = Number(req.params.transactionId || req.params.id);
  const authenticatedUserId = (req as any).authenticatedUserId;
  if (isNaN(transactionId)) {
    return res.status(400).send({ message: "Invalid transaction ID." });
  }
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    const sql = `
      SELECT 
        t.*, 
        json_build_object('id', a.id, 'name', a.name) as asset,
        json_build_object('id', c.id, 'name', c.name) as category
      FROM "transaction" t
      LEFT JOIN "asset" a ON t."asset_id" = a.id
      LEFT JOIN "category" c ON t."category_id" = c.id
      WHERE t.id = $1 AND t."user_id" = $2
      LIMIT 1
    `;
    const result = await queryRunner.query(sql, [transactionId, authenticatedUserId]);
    if (result.length === 0) {
      return res.status(404).send({ message: "Transaction not found or unauthorized." });
    }
    return res.status(200).send({ transaction: result[0] });
  } catch (error) {
    logger.error("Error in getting transaction via QueryRunner:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const get_all_transactions = async (req: Request, res: Response) => {
  const {
    startDate,
    endDate,
    transaction_type,
    minAmount,
    maxAmount,
    page = 1,
    limit = 10,
  } = req.query;

  const authenticatedUserId = (req as any).authenticatedUserId;
  const pageNum = Number(page) || 1;
  const pageLimit = Number(limit) || 10;
  const offset = (pageNum - 1) * pageLimit;

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    let query = `
      SELECT t.*, 
             json_build_object('id', a.id, 'name', a.name) as asset,
             json_build_object('id', c.id, 'name', c.name) as category
      FROM "transaction" t
      LEFT JOIN "asset" a ON t."asset_id" = a.id
      LEFT JOIN "category" c ON t."category_id" = c.id
      WHERE t."user_id" = $1
    `;

    const params: any[] = [authenticatedUserId];
    let paramIndex = 2;

    if (startDate && endDate) {
      query += ` AND t.transaction_date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(new Date(startDate as string), new Date(endDate as string));
    }

    if (transaction_type) {
      query += ` AND t.transaction_type = $${paramIndex++}`;
      params.push(transaction_type);
    }

    if (minAmount) {
      query += ` AND t.amount >= $${paramIndex++}`;
      params.push(Number(minAmount));
    }

    if (maxAmount) {
      query += ` AND t.amount <= $${paramIndex++}`;
      params.push(Number(maxAmount));
    }

    const countQuery = `SELECT COUNT(*) FROM (${query}) as subquery`;
    const totalResult = await queryRunner.query(countQuery, params);
    const totalItems = parseInt(totalResult[0].count);
    query += ` ORDER BY t.id ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(pageLimit, offset);

    const transactions = await queryRunner.query(query, params);
    return res.status(200).send({
      count: transactions.length,
      transactions,
      meta: {
        total_items: totalItems,
        total_pages: Math.ceil(totalItems / pageLimit),
        current_page: pageNum,
        per_page: pageLimit,
      },
    });

  } catch (error) {
    logger.error("Error in get_all_transactions via QueryRunner:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const delete_transaction = async (req: Request, res: Response) => {
  const transactionId = Number(req.params.id || req.params.transactionId);
  const authenticatedUserId = (req as any).authenticatedUserId;

  if (isNaN(transactionId)) {
    return res.status(400).send({ message: "Invalid transaction ID." });
  }

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const transactionResult = await queryRunner.query(
      `SELECT t.amount, t.transaction_type, a.id as "asset_id", a.current_cost 
       FROM "transaction" t 
       JOIN "asset" a ON t."asset_id" = a.id 
       WHERE t.id = $1 AND t."user_id" = $2`,
      [transactionId, authenticatedUserId]
    );

    if (transactionResult.length === 0) {
      await queryRunner.rollbackTransaction();
      return res.status(404).send({ message: "Transaction not found or unauthorized." });
    }

    const { amount, transaction_type, asset_id, current_cost } = transactionResult[0];
    let newAssetCost = Number(current_cost);

    if (transaction_type === TransactionType.deposit) {
      newAssetCost -= Number(amount);
    } else if (transaction_type === TransactionType.withdrawal) {
    
      newAssetCost += Number(amount);
    }

    await queryRunner.query(
      `UPDATE "asset" SET current_cost = $1 WHERE id = $2`,
      [newAssetCost, asset_id]
    );

    await queryRunner.query(
      `DELETE FROM "transaction" WHERE id = $1`,
      [transactionId]
    );


    await queryRunner.commitTransaction();

    return res.status(200).send({
      message: "Transaction deleted and asset balance restored.",
      updated_asset_cost: newAssetCost,
    });

  } catch (err) {

    await queryRunner.rollbackTransaction();
    console.error("Delete Transaction Error:", err);
    return res.status(500).send({ message: "Internal Server Error" });
  } finally {

    await queryRunner.release();
  }
};
export {
  create_transaction,
  get_transaction,
  update_transaction,
  delete_transaction,
  get_all_transactions,
};
