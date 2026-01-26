
import { Transaction } from "../entities/Transaction";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Asset } from "../entities/Asset";
import { TransactionType } from "../utils/enums";
import { Request, Response} from "express";
import { AppDataSource } from "../index";


interface AuthRequest extends Request {
  authenticatedUserId?: number;
}

const create_transaction = async (
req: AuthRequest, res: Response
) => {
  const { amount, description, transaction_type, assetId, category_id } =
    req.body;
  
    if(!amount || !transaction_type || !assetId || !category_id) {
      return res.status(400).send({ message: "Required properties haven't been added." });
    }
 const authUserId = req.authenticatedUserId; 

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
      const [user, asset, category] = await Promise.all([
      queryRunner.manager.findOneBy(User, { id: authUserId }),
      queryRunner.manager.findOneBy(Asset, { id: assetId, user: { id: authUserId } }),
      queryRunner.manager.findOneBy(Category, { id: category_id })
    ]);

    if (!user || !asset || !category) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: "User, Asset, or Category not found." });
    }
    const transaction = queryRunner.manager.create(Transaction, {
      amount: Number(amount),
      description,
      transaction_type,
      user,
      asset,
      category,
    });

    const transactionAmount = Number(amount);
    if (transaction_type === TransactionType.deposit) {
      asset.current_cost = Number(asset.current_cost) + transactionAmount;
    } else if (transaction_type === TransactionType.withdrawal) {
      if (Number(asset.current_cost) < transactionAmount) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({ message: "Not enough balance." });
      }
      asset.current_cost = Number(asset.current_cost) - transactionAmount;
    }
    await queryRunner.manager.save(transaction);
    await queryRunner.manager.save(asset);
    await queryRunner.commitTransaction();

    return res.status(201).json({
      success: true,
      message: "Transaction completed successfully",
      new_balance: asset.current_cost,
      transaction_id: transaction.id
    });

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error("Transaction Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};

const update_transaction = async (
req: AuthRequest, res: Response
) => {
  const transactionId = Number(req.params.id || req.params.transactionId);
  const authUserId = req.authenticatedUserId;
  const { amount, transaction_type, description } = req.body;

  if (isNaN(transactionId)) {
    return res.status(400).json({ message: "Invalid transaction ID." });
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const transaction = await queryRunner.manager.findOne(Transaction, {
      where: { id: transactionId, user: { id: authUserId } },
      relations: ["asset"],
    });

    if (!transaction || !transaction.asset) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: "Transaction not found." });
    }

    const asset = transaction.asset;
    const oldAmount = Number(transaction.amount);
    const oldType = transaction.transaction_type;

    if (oldType === TransactionType.deposit) {
      asset.current_cost = Number(asset.current_cost) - oldAmount;
    } else {
      asset.current_cost = Number(asset.current_cost) + oldAmount;
    }

    if (amount !== undefined) transaction.amount = Number(amount);
    if (transaction_type !== undefined) transaction.transaction_type = transaction_type;
    if (description !== undefined) transaction.description = description;

  const updatedAmount = Number(transaction.amount);
    if (transaction.transaction_type === TransactionType.deposit) {
      asset.current_cost = Number(asset.current_cost) + updatedAmount;
    } else {
      asset.current_cost = Number(asset.current_cost) - updatedAmount;
    }
    if (Number(asset.current_cost) < 0) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ 
        message: "Not enough balance",
        current_balance_before_update: oldAmount 
      });
    }

    await queryRunner.manager.save(asset);
    await queryRunner.manager.save(transaction);

    await queryRunner.commitTransaction();

    return res.status(200).json({
      message: "Transaction updated and balance recalculated.",
      new_balance: asset.current_cost,
      transaction
    });

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error("Error in updating transaction:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await queryRunner.release();
  }
};
const get_transaction = async (req: AuthRequest, res: Response) => {
  const transactionId = Number(req.params.transactionId || req.params.id);
    const authUserId = req.authenticatedUserId; 

  if (isNaN(transactionId)) {
    return res.status(400).send({ message: "Invalid transaction ID." });
  }

  try {
   const transaction = await Transaction.getRepository()
      .createQueryBuilder("transaction")
      .leftJoin("transaction.asset", "asset")
      .leftJoin("transaction.category", "category")
      .select([
        "transaction.id",
        "transaction.amount",
        "transaction.description",
        "transaction.transaction_type",
        "transaction.created_at",
        "asset.id",
        "asset.name",
        "category.id",
        "category.name",
        "category.type"
      ])
      .where("transaction.id = :id AND transaction.user_id = :user_id", { 
        id: transactionId, 
        user_id: authUserId 
      })
      .getOne();
    if (!transaction) {
      return res.status(404).json({ 
        message: "Transaction not found or you do not have permission to view it." 
      });
    }

    return res.status(200).json({ 
        success: true,
        transaction 
    });

  } catch (error) {
    console.error("Error in getting transaction:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
const get_all_transactions = async (
  req: AuthRequest, res: Response
) => {
  const {
    startDate,
    endDate,
    transaction_type,
    minAmount,
    maxAmount,
    page = 1,
    limit = 10,
    assetId
  } = req.query;
  const authUserId = req.authenticatedUserId;
  const pageNum = Math.max(1, Number(page));
  const pageLimit = Math.max(1, Math.min(Number(limit), 100));
  const skip = (pageNum - 1) * pageLimit;

  try {
    const query = Transaction.getRepository()
      .createQueryBuilder("transaction")
      .leftJoin("transaction.asset", "asset")
      .leftJoin("transaction.category", "category")
      .where("transaction.user_id = :user_id", { user_id: authUserId });

    if (startDate && endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      query.andWhere("transaction.created_at BETWEEN :start AND :end", {
        start: new Date(startDate as string),
        end: end,
      });
    } else if (startDate) {
      query.andWhere("transaction.created_at >= :start", { start: new Date(startDate as string) });
    }
    if (minAmount && maxAmount) {
      query.andWhere("transaction.amount BETWEEN :min AND :max", {
        min: Number(minAmount),
        max: Number(maxAmount),
      });
    } else if (minAmount) {
      query.andWhere("transaction.amount >= :min", { min: Number(minAmount) });
    }

    if (transaction_type) {
      query.andWhere("transaction.transaction_type = :type", { type: transaction_type });
    }

    if (assetId) {
      query.andWhere("asset.id = :assetId", { assetId: Number(assetId) });
    }
    query
      .select([
        "transaction.id",
        "transaction.amount",
        "transaction.description",
        "transaction.transaction_type",
        "transaction.created_at",
        "asset.id",
        "asset.name",
        "category.id",
        "category.name"
      ])
      .orderBy("transaction.created_at", "DESC") 
      .skip(skip)
      .take(pageLimit);
    const [transactions, total] = await query.getManyAndCount();

    return res.status(200).json({
      success: true,
      meta: {
        total_items: total,
        total_pages: Math.ceil(total / pageLimit),
        current_page: pageNum,
        per_page: pageLimit,
        item_count: transactions.length
      },
      transactions,
    });

  } catch (error) {
    console.error("Error getting all transactions:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};





const delete_transaction = async (
  req: AuthRequest, res: Response
) => {
  const transactionId = Number(req.params.id || req.params.transactionId);
  const authUserId = req.authenticatedUserId;

  if (isNaN(transactionId)) {
    return res.status(400).json({ message: "Invalid transaction ID format." });
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const transaction = await queryRunner.manager.findOne(Transaction, {
      where: { id: transactionId, user: { id: authUserId } },
      relations: ["asset"],
    });

    if (!transaction || !transaction.asset) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ message: "Transaction not found or unauthorized." });
    }

    const asset = transaction.asset;
    const amountToReverse = Number(transaction.amount);
    if (transaction.transaction_type === TransactionType.deposit) {
      asset.current_cost = Number(asset.current_cost) - amountToReverse;
    } else if (transaction.transaction_type === TransactionType.withdrawal) {
      asset.current_cost = Number(asset.current_cost) + amountToReverse;
    }
    if (asset.current_cost < 0) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({ 
        message: "Can't delete this transaction because it would become a negative value." 
      });
    }
    await queryRunner.manager.save(asset);
    await queryRunner.manager.remove(transaction);

    await queryRunner.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Transaction deleted and asset balance restored.",
      updated_asset_cost: asset.current_cost,
    });

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error(" Error in deleting transaction:", err);
    return res.status(500).json({ message: "Internal Server Error" });
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
