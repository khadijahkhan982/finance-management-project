import { Transaction } from "../entities/Transaction";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Asset } from "../entities/Asset";
import { TransactionType } from "../utils/enums";
import { Request, Response} from "express";
import { queryRunnerFunc } from "../utils/query_runner";

interface AuthRequest extends Request {
  authenticatedUserId?: number;
}
const create_transaction = async (req: AuthRequest, res: Response) => {
  const { amount, description, transaction_type, assetId, category_id } = req.body;
  
  if (!amount || !transaction_type || !assetId || !category_id) {
    return res.status(400).send({ message: "Required properties missing." });
  }
  const authUserId = req.authenticatedUserId;
  try {
    const result = await queryRunnerFunc(async (manager) => {
      const [user, asset, category] = await Promise.all([
        manager.findOneBy(User, { id: authUserId }),
        manager.findOneBy(Asset, { id: assetId, user: { id: authUserId } }),
        manager.findOneBy(Category, { id: category_id })
      ]);
      if (!user || !asset || !category) {
        throw { status: 404, message: "User, Asset, or Category not found." };
      }

      const transactionAmount = Number(amount);
            if (transaction_type === TransactionType.deposit) {
        asset.current_cost = Number(asset.current_cost) + transactionAmount;
      } else if (transaction_type === TransactionType.withdrawal) {
        if (Number(asset.current_cost) < transactionAmount) {
          throw { status: 400, message: "Not enough balance." };
        }
        asset.current_cost = Number(asset.current_cost) - transactionAmount;
      }
      const transaction = manager.create(Transaction, {
        amount: transactionAmount,
        description,
        transaction_type,
        user,
        asset,
        category,
      });
      await manager.save([transaction, asset]);

      return {
        new_balance: asset.current_cost,
        transaction_id: transaction.id
      };
    });
    return res.status(201).json({
      success: true,
      message: "Transaction completed successfully",
      ...result
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    const message = err.message || "Internal Server Error";
    
    console.error("Transaction Error:", err);
    return res.status(statusCode).json({ message });
  }
};

const update_transaction = async (req: AuthRequest, res: Response) => {
  const transactionId = Number(req.params.id || req.params.transactionId);
  const authUserId = req.authenticatedUserId;
  const { amount, transaction_type, description } = req.body;

  if (isNaN(transactionId)) {
    return res.status(400).json({ message: "Invalid transaction ID." });
  }

  try {
    const result = await queryRunnerFunc(async (manager) => {
      
      const transaction = await manager.findOne(Transaction, {
        where: { id: transactionId, user: { id: authUserId } },
        relations: ["asset"],
      });

      if (!transaction || !transaction.asset) {
        throw { status: 404, message: "Transaction or Asset not found." };
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
        throw { 
          status: 400, 
          message: "Not enough balance for this update.",
          current_balance_before_update: oldAmount 
        };
      }
      await manager.save([asset, transaction]);

      return {
        new_balance: asset.current_cost,
        transaction
      };
    });

    return res.status(200).json({
      message: "Transaction updated and balance recalculated.",
      ...result
    });

  } catch (err: any) {
    const statusCode = err.status || 500;
    const message = err.message || "Internal Server Error";
    
    console.error("Update Transaction Error:", err);
    return res.status(statusCode).json({ message, ...err });
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





const delete_transaction = async (req: AuthRequest, res: Response) => {
  const transactionId = Number(req.params.id || req.params.transactionId);
  const authUserId = req.authenticatedUserId;

  if (isNaN(transactionId)) {
    return res.status(400).json({ message: "Invalid transaction ID format." });
  }

  try {
    const result = await queryRunnerFunc(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { id: transactionId, user: { id: authUserId } },
        relations: ["asset"],
      });

      if (!transaction || !transaction.asset) {
        throw { status: 404, message: "Transaction not found or unauthorized." };
      }

      const asset = transaction.asset;
      const amountToReverse = Number(transaction.amount);

      if (transaction.transaction_type === TransactionType.deposit) {
        asset.current_cost = Number(asset.current_cost) - amountToReverse;
      } else if (transaction.transaction_type === TransactionType.withdrawal) {
        asset.current_cost = Number(asset.current_cost) + amountToReverse;
      }

      if (asset.current_cost < 0) {
        throw { 
          status: 400, 
          message: "Can't delete this transaction because it would result in a negative balance." 
        };
      }

      await manager.save(asset);
      await manager.remove(transaction);
      return asset.current_cost;
    });
    return res.status(200).json({
      success: true,
      message: "Transaction deleted and asset balance restored.",
      updated_asset_cost: result,
    });

  } catch (err: any) {
    const statusCode = err.status || 500;
    const message = err.message || "Internal Server Error";
    
    console.error("Error in deleting transaction:", err);
    return res.status(statusCode).json({ message });
  } 
};
export {
  create_transaction,
  get_transaction,
  update_transaction,
  delete_transaction,
  get_all_transactions,
};
