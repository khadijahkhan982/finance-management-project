import express from "express"
import { create_transaction ,get_transaction,delete_transaction, update_transaction, get_all_transactions} from "../controllers/transactionController";
import { protect } from "../middleware/authMiddleware";


const router = express.Router()

router.post('/create-transaction', protect,create_transaction)
router.put('/update-transaction/:transactionId', protect, update_transaction)
router.delete('/delete-transaction/:transactionId', protect, delete_transaction);
router.get('/get-transaction/:transactionId', protect, get_transaction);
router.get('/get-all-transactions', protect, get_all_transactions);


export default router;