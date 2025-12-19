import express from "express";
import { Transaction } from "../entities/Transaction";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Asset } from "../entities/Asset";
import { logger } from "../utils/logger";
import { Between } from "typeorm"; 
import { TransactionType } from "../utils/enums";
import { decrypt_Token } from "../utils/authHelpers";
import { MoreThanOrEqual } from "typeorm";


const router = express.Router();




const create_transaction = async (req: express.Request, res: express.Response) => {
    const { amount, description, transaction_type, assetId, category_id } = req.body;
    let token = "";

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }

    const authenticatedUserId = (req as any).authenticatedUserId;

    if (!authenticatedUserId || !token) {
        return res.status(401).send({ message: "Authentication required." });
    }

    try {
        const user = await User.getRepository().findOneBy({ id: authenticatedUserId });
        if (!user) return res.status(404).send({ message: "User not found." });

        try { decrypt_Token(token); } catch (e) { return res.status(400).send({ message: "Invalid token." }); }
        const sentToken = String(token).trim();
        const storedToken = user.token ? String(user.token).trim() : null;
        if (!storedToken || storedToken !== sentToken) return res.status(401).send({ message: "Session mismatch." });
        
        const category = await Category.findOne({ where: { id: category_id } });

const asset = await Asset.findOne({ where: { id: assetId } });
        if (!category || !asset) {
            return res.status(404).send({ message: "Category or Asset not found/unauthorized." });
        }

        const transaction = Transaction.create({
            amount: Number(amount),
            description,
            transaction_type,
            user,
            asset,
            category
        });

        if (transaction_type === TransactionType.deposit) {
            asset.current_cost = Number(asset.current_cost) + Number(amount);
        } else if (transaction_type === TransactionType.withdrawal) {
            asset.current_cost = Number(asset.current_cost) - Number(amount);
        }

        await transaction.save();
        await asset.save();

        return res.status(201).send({ message: "Transaction successful", transaction });
    } catch (err) {
        return res.status(500).send({ message: "Internal Server Error" });
    }
};

const update_transaction = async (req: express.Request, res: express.Response) => {
    const transactionId = Number(req.params.id || req.params.transactionId);
    const { amount: newAmount, transaction_type: newType, description } = req.body;
    let token = "";

    if (isNaN(transactionId)) {
        return res.status(400).send({ message: "Invalid transaction ID format." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }

    const authenticatedUserId = (req as any).authenticatedUserId;

    try {
        const user = await User.getRepository().findOneBy({ id: authenticatedUserId });
        if (!user) return res.status(404).send({ message: "User not found." });

        const sentToken = String(token).trim();
        const storedToken = user.token ? String(user.token).trim() : null;
        if (!storedToken || storedToken !== sentToken) {
            return res.status(401).send({ message: "Session mismatch." });
        }

        const transaction = await Transaction.findOne({
            where: { id: transactionId, user: { id: user.id } },
            relations: ["asset"]
        });

        if (!transaction || !transaction.asset) {
            return res.status(404).send({ message: "Transaction not found or unauthorized." });
        }

        const asset = transaction.asset;

       
        const oldAmount = Number(transaction.amount);
        if (transaction.transaction_type === TransactionType.deposit) {
            asset.current_cost = Number(asset.current_cost) - oldAmount;
        } else {
            asset.current_cost = Number(asset.current_cost) + oldAmount;
        }

        const finalAmount = newAmount !== undefined ? Number(newAmount) : oldAmount;
        const finalType = newType !== undefined ? newType : transaction.transaction_type;

        if (finalType === TransactionType.deposit) {
            asset.current_cost = Number(asset.current_cost) + finalAmount;
        } else if (finalType === TransactionType.withdrawal) {
            asset.current_cost = Number(asset.current_cost) - finalAmount;
        } else {
            return res.status(400).send({ message: "Invalid new transaction type." });
        }
        transaction.amount = finalAmount;
        transaction.transaction_type = finalType;
        if (description) transaction.description = description;

        await transaction.save();
        await asset.save();

        return res.send({ 
            message: "Transaction updated and asset balance recalculated.", 
            newBalance: asset.current_cost 
        });

    } catch (err) {
        console.error("Update Transaction Error:", err);
        return res.status(500).send({ message: "Internal Server Error" });
    }}



const get_transaction = async (req: express.Request, res: express.Response) => {
    const transactionId = Number(req.params.transactionId || req.params.id);
    let token = "";
    
    if (isNaN(transactionId)) {
        return res.status(400).send({ message: "Invalid transaction ID." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    
    const authenticatedUserId = (req as any).authenticatedUserId;
    if (!authenticatedUserId || !token) {
        return res.status(401).send({ message: "Authentication required." });
    }

    try {
        const user = await User.getRepository().findOneBy({ id: authenticatedUserId });
        if (!user) return res.status(404).send({ message: "User not found." });

        try {
            decrypt_Token(token);
        } catch (e) {
            return res.status(400).send({ message: "Invalid token." });
        }

        const sentToken = String(token).trim();
        const storedToken = user.token ? String(user.token).trim() : null;
        if (!storedToken || storedToken !== sentToken) {
            return res.status(401).send({ message: "Session mismatch." });
        }

        const transaction = await Transaction.findOne({
            where: { 
                id: transactionId, 
                user: { id: user.id } 
            },
            relations: ["asset", "category", "user"]
        });

        if (!transaction) {
            return res.status(404).send({ message: "Transaction not found or unauthorized." });
        }

        return res.status(200).send({ transaction });

    } catch (error) {
        logger.error("Error in getting transaction:", error);
        return res.status(500).send({ message: "Internal Server Error" });
    }
};




const get_all_transactions = async (req: express.Request, res: express.Response) => {
    let token = "";
    const { startDate, endDate, transaction_type, minAmount, maxAmount, page = 1, limit = 10 } = req.query;
    const p = Number(page) || 1;
    const l = Number(limit) || 10;
    const skip = (p - 1) * l;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    const authenticatedUserId = (req as any).authenticatedUserId;
    if (!authenticatedUserId || !token) {
        return res.status(401).send({ message: "Authentication required." });
    }

    try{
         const user = await User.getRepository().findOneBy({ id: authenticatedUserId });
        if (!user) return res.status(404).send({ message: "User not found." });
        try{
            decrypt_Token(token);
        }catch(e){
            return res.status(400).send({ message: "Invalid token." });
        }

        const sentToken = String(token).trim();
        const storedToken = user.token ? String(user.token).trim() : null;
        if (!storedToken || storedToken !== sentToken) {
            return res.status(401).send({ message: "Session mismatch." });
        }
        if (user.token_expires_at && user.token_expires_at < new Date()) {
            return res.status(401).send({ message: "Token has expired." });
        }
        let whereConditions: any = {
            user: { id: user.id }
        };

        if (startDate && endDate) {
             const start = new Date(startDate as string);
             const end = new Date(endDate as string);
             end.setHours(23, 59, 59, 999);
             whereConditions.transaction_date = Between(start, end);
        }
      if (minAmount && maxAmount) {
        whereConditions.amount = Between(Number(minAmount), Number(maxAmount));
    } else if (minAmount) {
        whereConditions.amount = MoreThanOrEqual(Number(minAmount));
        }
        if (transaction_type) {
            whereConditions.transaction_type = transaction_type;
        }
        const [transactions, total] = await Transaction.findAndCount({
            where: whereConditions,
            relations: ["asset", "category"],
           order: { id: "ASC" },
           take: l,   
            skip: skip 
        });
        return res.status(200).send({ count: transactions.length, transactions, meta: {
                total_items: total,
                total_pages: Math.ceil(total / l),
                current_page: p,
                per_page: l
            },});
    } catch (error){
        logger.error("Error in getting all transactions:", error);
        return res.status(500).send({ message: "Internal Server Error" });
    }
}



const delete_transaction = async (req: express.Request, res: express.Response) => {
    const transactionId = Number(req.params.id || req.params.transactionId);
    let token = "";

    if (isNaN(transactionId)) {
        return res.status(400).send({ message: "Invalid transaction ID." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }

    const authenticatedUserId = (req as any).authenticatedUserId;

    try {
        const user = await User.getRepository().findOneBy({ id: authenticatedUserId });
        if (!user) return res.status(404).send({ message: "User not found." });

        const sentToken = String(token).trim();
        if (user.token !== sentToken) return res.status(401).send({ message: "Session mismatch." });

        const transaction = await Transaction.findOne({
            where: { id: transactionId, user: { id: user.id } },
            relations: ["asset"]
        });

        if (!transaction || !transaction.asset) {
            return res.status(404).send({ message: "Transaction not found or unauthorized." });
        }

        const asset = transaction.asset;
        const amountToReverse = Number(transaction.amount);

        if (transaction.transaction_type === TransactionType.deposit) {
            asset.current_cost = Number(asset.current_cost) - amountToReverse;
        } else if (transaction.transaction_type === TransactionType.withdrawal) {
            asset.current_cost = Number(asset.current_cost) + amountToReverse;
        }

        await asset.save();
        await transaction.remove();

        return res.status(200).send({ 
            message: "Transaction deleted and asset balance restored.",
            updated_asset_cost: asset.current_cost
        });

    } catch (err) {
        console.error("Delete Transaction Error:", err);
        return res.status(500).send({ message: "Internal Server Error" });
    }
};
export {create_transaction,get_transaction, update_transaction, delete_transaction, get_all_transactions}